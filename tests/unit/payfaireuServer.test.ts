import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computePayFairDigest } from '../../src/core/dossierDigest.ts';
import { PAYFAIR_PRESETS, SAMPLE_PAYROLL_CSV } from '../../src/core/presets.ts';
import type { PayFairAssessmentInput, PayFairAssessmentResult } from '../../src/core/types.ts';
import { createPayFairEuServer } from '../../server/app.mjs';

interface StartedServer {
  baseUrl: string;
  closeAll: () => Promise<void>;
  tempDir: string;
}

const cleanups: Array<() => Promise<void>> = [];

async function startTempServer(options: {
  basePath?: string;
  maxMutationsPerMinute?: number;
  maxJsonBodyBytes?: number;
  withFakeDist?: boolean;
} = {}): Promise<StartedServer> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payfaireu-test-'));
  const dataDir = path.join(tempDir, 'data');
  const distDir = path.join(tempDir, 'dist');
  if (options.withFakeDist) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><html><head><script src="/assets/main.js"></script></head><body>PAYFAIREU_SPA</body></html>',
      'utf8',
    );
  }

  const { handler, close } = createPayFairEuServer({
    dataDir,
    distDir: options.withFakeDist ? distDir : '',
    basePath: options.basePath ?? '',
    maxMutationsPerMinute: options.maxMutationsPerMinute ?? 120,
    maxJsonBodyBytes: options.maxJsonBodyBytes ?? 5 * 1024 * 1024,
  });

  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const prefix = options.basePath ? options.basePath.replace(/\/+$/, '') : '';
  const baseUrl = `http://127.0.0.1:${port}${prefix}`;

  const closeAll = async (): Promise<void> => {
    close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
  cleanups.push(closeAll);
  return { baseUrl, closeAll, tempDir };
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

describe('PayFairEU Phase 2 SQLite WAL server', () => {
  it('serves health, SPA BASE_PATH injection, presets, tier classification, Art. 5 XSS-safe job-ad audit, Art. 7 clock with GDPR guard, batch CSV & assess', async () => {
    const srv = await startTempServer({ basePath: '/payfaireu', withFakeDist: true });

    const healthRes = await fetch(`${srv.baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as Record<string, unknown>;
    expect(health.ok).toBe(true);
    expect(health.service).toBe('payfaireu');
    expect(health.basePath).toBe('/payfaireu');

    const htmlRes = await fetch(`${srv.baseUrl}/`);
    expect(htmlRes.status).toBe(200);
    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('window.__PAYFAIREU_BASE__="/payfaireu"');
    expect(htmlText).toContain('src="/payfaireu/assets/main.js"');

    const presetsRes = await fetch(`${srv.baseUrl}/api/presets`);
    expect(presetsRes.status).toBe(200);
    const presetsJson = (await presetsRes.json()) as {
      presets: unknown[];
      samplePayrollCsv: string;
    };
    expect(presetsJson.presets).toHaveLength(3);
    expect(presetsJson.samplePayrollCsv).toContain('Software Engineering L2');

    const tierRes = await fetch(`${srv.baseUrl}/api/classify-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headcountDeclared: 140 }),
    });
    expect(tierRes.status).toBe(200);
    const tierJson = (await tierRes.json()) as {
      obligation: { frequency: string; firstReportDue: string | null };
    };
    expect(tierJson.obligation.frequency).toBe('triennial_2031');
    expect(tierJson.obligation.firstReportDue).toBe('2031-06-07');

    const jobAdRes = await fetch(`${srv.baseUrl}/api/audit-job-ad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roleTitle: '<script>alert(1)</script> Account Lead',
        payMin: 0,
        payMax: 0,
        jobAdText: 'Competitive salary for top salesman; provide previous salary.',
        asksSalaryHistory: true,
      }),
    });
    expect(jobAdRes.status).toBe(200);
    const jobAdJson = (await jobAdRes.json()) as {
      audit: { passed: boolean; htmlSnippet: string; issues: Array<{ code: string }> };
    };
    expect(jobAdJson.audit.passed).toBe(false);
    expect(jobAdJson.audit.issues.map((i) => i.code)).toContain('ART5_SALARY_HISTORY_BANNED');
    expect(jobAdJson.audit.htmlSnippet).not.toContain('<script>');
    expect(jobAdJson.audit.htmlSnippet).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');

    const clockRes = await fetch(`${srv.baseUrl}/api/art7-clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestDateIso: '2026-12-31',
        employerName: 'Rhone Supply Chain SAS',
        presetKey: PAYFAIR_PRESETS[1]!.id,
        requestedCategory: 'Supply Chain Planners',
      }),
    });
    expect(clockRes.status).toBe(200);
    const clockJson = (await clockRes.json()) as {
      clock: { dueDateIso: string; letterEn: string };
    };
    expect(clockJson.clock.dueDateIso).toBe('2027-02-28');
    expect(clockJson.clock.letterEn).toContain('GDPR k-anonymity guard');

    const emptyBatch = await fetch(`${srv.baseUrl}/api/batch-payroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: '   ' }),
    });
    expect(emptyBatch.status).toBe(400);

    const batchRes = await fetch(`${srv.baseUrl}/api/batch-payroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: SAMPLE_PAYROLL_CSV }),
    });
    expect(batchRes.status).toBe(200);
    const batchJson = (await batchRes.json()) as {
      parsedWorkersCount: number;
      metrics: { triggeredCategories: string[] };
      categoryGapCsv: string;
    };
    expect(batchJson.parsedWorkersCount).toBe(16);
    expect(batchJson.metrics.triggeredCategories).toEqual(['Enterprise Sales']);
    expect(batchJson.categoryGapCsv.charCodeAt(0)).toBe(0xfeff);

    const assessRes = await fetch(`${srv.baseUrl}/api/assess-payfaireu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetKey: PAYFAIR_PRESETS[0]!.id }),
    });
    expect(assessRes.status).toBe(200);
    const assessJson = (await assessRes.json()) as {
      result: PayFairAssessmentResult;
      sha256Digest: string;
      art10NoticeEn: string;
    };
    expect(assessJson.result.tier).toBe('ready');
    expect(assessJson.sha256Digest).toMatch(/^[a-f0-9]{64}$/);
    expect(assessJson.art10NoticeEn).toContain('No Article 10 Joint Pay Assessment');
  });

  it('persists profiles & dossiers, assigns atomic PAYF-YYYY-0001 with exact SHA-256, enforces 409 lock, and exports BOM CSV, HTML snippet, MD & summary', async () => {
    const srv = await startTempServer();

    const profCreate = await fetch(`${srv.baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employerName: 'Munich Precision AG',
        memberStateIso: 'DE',
        headcountDeclared: 310,
        reportingYear: 2026,
        hasObjectivePayCriteriaArt6: true,
        hasArt7WorkflowReady: true,
      }),
    });
    expect(profCreate.status).toBe(201);
    const profCreated = (await profCreate.json()) as { profile: { id: string } };

    const createRes = await fetch(`${srv.baseUrl}/api/dossiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetKey: PAYFAIR_PRESETS[2]!.id,
        slug: 'munich-precision-2026',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      dossier: { id: string; slug: string; result: PayFairAssessmentResult };
      status: string;
    };
    expect(created.status).toBe('draft');
    expect(created.dossier.result.metrics.anyJointPayAssessmentTriggered).toBe(true);

    // Patch dossier with negative gap & formula-injection category + <script> in jobAd roleTitle
    const patchRes = await fetch(`${srv.baseUrl}/api/dossiers/${created.dossier.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employerName: 'Munich Precision AG',
        jobAd: {
          roleTitle: '<script>xss()</script> Controller',
          category: '=CMD("bad")',
          currency: 'EUR',
          payMin: 50000,
          payMax: 65000,
          payPeriod: 'annual',
          jobAdText: 'Starting annual gross EUR 50,000-65,000.',
          asksSalaryHistory: false,
        },
        workers: [
          { id: '1', category: '=CMD("bad")', sex: 'female', basePayAnnualEur: 55000, variablePayAnnualEur: 0, fteRatio: 1 },
          { id: '2', category: '=CMD("bad")', sex: 'female', basePayAnnualEur: 55000, variablePayAnnualEur: 0, fteRatio: 1 },
          { id: '3', category: '=CMD("bad")', sex: 'female', basePayAnnualEur: 55000, variablePayAnnualEur: 0, fteRatio: 1 },
          { id: '4', category: '=CMD("bad")', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
          { id: '5', category: '=CMD("bad")', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
          { id: '6', category: '=CMD("bad")', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
        ],
      }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      dossier: { result: PayFairAssessmentResult };
    };
    expect(patched.dossier.result.metrics.categories[0]?.totalMeanGapPct).toBe(-10);

    const finRes = await fetch(`${srv.baseUrl}/api/dossiers/${created.dossier.id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'board-auditor' }),
    });
    expect(finRes.status).toBe(200);
    const finalized = (await finRes.json()) as {
      dossier: {
        id: string;
        dossierCode: string;
        sha256Digest: string;
        input: PayFairAssessmentInput;
        result: PayFairAssessmentResult;
      };
      status: string;
    };
    const currentYear = new Date().getUTCFullYear();
    expect(finalized.status).toBe('locked');
    expect(finalized.dossier.dossierCode).toBe(`PAYF-${currentYear}-0001`);

    const browserDigest = await computePayFairDigest(finalized.dossier.input, finalized.dossier.result);
    expect(finalized.dossier.sha256Digest).toBe(browserDigest);

    // 409 immutability guards
    const lockedPatch = await fetch(`${srv.baseUrl}/api/dossiers/${created.dossier.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employerName: 'Tamper Attempt' }),
    });
    expect(lockedPatch.status).toBe(409);

    const lockedDel = await fetch(`${srv.baseUrl}/api/dossiers/${created.dossier.id}`, {
      method: 'DELETE',
    });
    expect(lockedDel.status).toBe(409);

    const lockedRepeat = await fetch(`${srv.baseUrl}/api/dossiers/${created.dossier.id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(lockedRepeat.status).toBe(409);

    // Exports
    const csvRes = await fetch(
      `${srv.baseUrl}/api/dossiers/${finalized.dossier.dossierCode}/export.csv`,
    );
    expect(csvRes.status).toBe(200);
    const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
    expect(csvBytes[0]).toBe(0xef);
    expect(csvBytes[1]).toBe(0xbb);
    expect(csvBytes[2]).toBe(0xbf);
    const csvText = Buffer.from(csvBytes).toString('utf8');
    expect(csvText).toContain("'=CMD");
    expect(csvText).toContain(',-10,');

    const snippetRes = await fetch(
      `${srv.baseUrl}/api/dossiers/${finalized.dossier.dossierCode}/job-ad-snippet.html`,
    );
    expect(snippetRes.status).toBe(200);
    const snippetHtml = await snippetRes.text();
    expect(snippetHtml).not.toContain('<script>');
    expect(snippetHtml).toContain('&lt;script&gt;xss()&lt;/script&gt; Controller');

    const mdRes = await fetch(
      `${srv.baseUrl}/api/dossiers/${created.dossier.id}/dossier.md?locale=ar`,
    );
    expect(mdRes.status).toBe(200);
    expect(await mdRes.text()).toContain(finalized.dossier.sha256Digest);

    const noticeRes = await fetch(
      `${srv.baseUrl}/api/dossiers/${created.dossier.id}/art10-notice.md?locale=en`,
    );
    expect(noticeRes.status).toBe(200);
    expect(await noticeRes.text()).toContain('Article 10 Joint Pay Assessment');

    const summaryRes = await fetch(
      `${srv.baseUrl}/api/dossiers/${finalized.dossier.dossierCode}/summary?locale=ar`,
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = (await summaryRes.json()) as {
      summaryText: string;
      dossierCode: string;
      anyJointPayAssessmentTriggered: boolean;
    };
    expect(summaryJson.dossierCode).toBe(finalized.dossier.dossierCode);
    expect(summaryJson.anyJointPayAssessmentTriggered).toBe(true);
    expect(summaryJson.summaryText.length).toBeGreaterThan(20);

    const pubRes = await fetch(
      `${srv.baseUrl}/api/public/reports/${finalized.dossier.dossierCode}`,
    );
    expect(pubRes.status).toBe(200);
    const pubJson = (await pubRes.json()) as {
      viewCount: number;
      markdownEn: string;
      art10NoticeAr: string;
    };
    expect(pubJson.viewCount).toBe(1);
    expect(pubJson.markdownEn).toContain(finalized.dossier.dossierCode);
    expect(pubJson.art10NoticeAr).toContain('المادة 10');

    const dupRes = await fetch(`${srv.baseUrl}/api/dossiers/${created.dossier.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(dupRes.status).toBe(201);
    const dupJson = (await dupRes.json()) as {
      status: string;
      dossier: { id: string; dossierCode: string };
    };
    expect(dupJson.status).toBe('draft');
    expect(dupJson.dossier.dossierCode).toBe('');

    const delDraftRes = await fetch(`${srv.baseUrl}/api/dossiers/${dupJson.dossier.id}`, {
      method: 'DELETE',
    });
    expect(delDraftRes.status).toBe(200);

    const delProfRes = await fetch(`${srv.baseUrl}/api/profiles/${profCreated.profile.id}`, {
      method: 'DELETE',
    });
    expect(delProfRes.status).toBe(200);
  });

  it('enforces 413 payload limit and 429 mutation rate limit', async () => {
    const srvSize = await startTempServer({ maxJsonBodyBytes: 256 });
    const hugeRes = await fetch(`${srvSize.baseUrl}/api/classify-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headcountDeclared: 250, padding: 'x'.repeat(400) }),
    });
    expect(hugeRes.status).toBe(413);

    const srvRate = await startTempServer({ maxMutationsPerMinute: 2 });
    const r1 = await fetch(`${srvRate.baseUrl}/api/classify-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headcountDeclared: 260 }),
    });
    const r2 = await fetch(`${srvRate.baseUrl}/api/classify-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headcountDeclared: 170 }),
    });
    const r3 = await fetch(`${srvRate.baseUrl}/api/classify-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headcountDeclared: 110 }),
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });
});
