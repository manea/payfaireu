import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCanonicalDigestPayload,
  buildJointAssessmentNotice,
  buildPayFairBriefMarkdown,
  sha256SyncHex,
} from '../src/core/dossierDigest.ts';
import { auditArticle5JobAd, computeArticle7Deadline } from '../src/core/jobAdAndArt7.ts';
import { classifyReportingObligation, computeArticle9Metrics } from '../src/core/payGapEngine.ts';
import { exportCategoryGapCsv, parsePayrollCsv } from '../src/core/payrollCsvParser.ts';
import { PAYFAIR_PRESETS, SAMPLE_PAYROLL_CSV } from '../src/core/presets.ts';
import { assessPayFairEu } from '../src/core/readinessAssessor.ts';
import { openPayFairDatabase, slugify } from './db.mjs';

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
let APP_VERSION = '0.2.0';
try {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.resolve(__serverDir, '../package.json'), 'utf8'),
  );
  if (typeof pkgJson.version === 'string' && pkgJson.version.trim()) {
    APP_VERSION = pkgJson.version.trim();
  }
} catch {
  // fallback version
}

const VALID_PAY_PERIODS = new Set(['annual', 'monthly', 'hourly']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendAttachment(res, contentType, filename, content) {
  const safeName = String(filename || 'download').replace(/[\r\n"\\/]/g, '') || 'download';
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buf.byteLength,
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(buf);
}

async function readJsonBody(req, maxJsonBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxJsonBodyBytes) {
      const err = new Error(`JSON payload exceeds ${maxJsonBodyBytes} byte limit`);
      err.statusCode = 413;
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Invalid JSON payload');
    err.statusCode = 400;
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function normalizeBasePath(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return '';
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  return trimmed.replace(/\/+$/, '');
}

function resolveBaseUrl(req, normalizedAppOrigin, normalizedBasePath = '') {
  if (normalizedAppOrigin) return normalizedAppOrigin;
  const protoHeader = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = protoHeader || (req.socket?.encrypted ? 'https' : 'http');
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:4211')
    .split(',')[0]
    .trim();
  return `${proto}://${hostHeader}${normalizedBasePath}`;
}

function pickStr(srcVal, fallbackVal) {
  if (srcVal === undefined || srcVal === null) return String(fallbackVal ?? '').trim();
  return String(srcVal).trim();
}

function pickBool(srcVal, fallbackVal) {
  return srcVal !== undefined ? Boolean(srcVal) : Boolean(fallbackVal);
}

function pickNonNeg(srcVal, fallbackVal) {
  if (srcVal === undefined || srcVal === null || srcVal === '') return fallbackVal;
  const n = Number(srcVal);
  return Number.isFinite(n) ? Math.max(0, n) : fallbackVal;
}

function sanitizeJobAd(srcJobAd, fallbackJobAd) {
  const fb = fallbackJobAd;
  const s = srcJobAd && typeof srcJobAd === 'object' ? srcJobAd : {};
  return {
    roleTitle: pickStr(s.roleTitle, fb.roleTitle),
    category: pickStr(s.category, fb.category),
    currency: pickStr(s.currency, fb.currency).toUpperCase() || 'EUR',
    payMin: pickNonNeg(s.payMin, fb.payMin),
    payMax: pickNonNeg(s.payMax, fb.payMax),
    payPeriod: VALID_PAY_PERIODS.has(String(s.payPeriod)) ? String(s.payPeriod) : fb.payPeriod,
    jobAdText: typeof s.jobAdText === 'string' ? s.jobAdText : fb.jobAdText,
    asksSalaryHistory: pickBool(s.asksSalaryHistory, fb.asksSalaryHistory),
  };
}

function sanitizeCategoryJustifications(rawList, fallbackList) {
  if (!Array.isArray(rawList)) return fallbackList;
  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      category: pickStr(item.category, 'General Category') || 'General Category',
      justifiedByObjectiveCriteria: Boolean(item.justifiedByObjectiveCriteria),
      justificationNote: pickStr(item.justificationNote, ''),
      remediedWithin6Months: Boolean(item.remediedWithin6Months),
    }));
}

function sanitizeWorkers(rawList, fallbackList) {
  if (!Array.isArray(rawList)) return fallbackList;
  return rawList
    .filter((row) => row && typeof row === 'object')
    .map((row, idx) => {
      const fteRaw = Number(row.fteRatio);
      const fteRatio = Number.isFinite(fteRaw) ? Math.max(0.1, Math.min(1, fteRaw)) : 1;
      const baseRaw = Number(row.basePayAnnualEur);
      const varRaw = Number(row.variablePayAnnualEur);
      return {
        id: pickStr(row.id, `W-${String(idx + 1).padStart(3, '0')}`),
        category: pickStr(row.category, 'General Category') || 'General Category',
        sex: String(row.sex).trim().toLowerCase() === 'female' ? 'female' : 'male',
        basePayAnnualEur: Number.isFinite(baseRaw) ? Math.max(0, baseRaw) : 0,
        variablePayAnnualEur: Number.isFinite(varRaw) ? Math.max(0, varRaw) : 0,
        fteRatio,
      };
    });
}

function mergeAssessmentInput(patchInput, baseInput) {
  const fb = baseInput || PAYFAIR_PRESETS[0].data;
  const src = patchInput && typeof patchInput === 'object' ? patchInput : {};
  const rawYear = Number(src.reportingYear);

  return {
    title: pickStr(src.title, fb.title),
    employerName: pickStr(src.employerName, fb.employerName),
    memberStateIso:
      pickStr(src.memberStateIso, fb.memberStateIso).toUpperCase().slice(0, 2) || fb.memberStateIso,
    headcountDeclared: Math.floor(pickNonNeg(src.headcountDeclared, fb.headcountDeclared)),
    reportingYear:
      Number.isFinite(rawYear) && rawYear >= 2024 && rawYear <= 2100
        ? Math.floor(rawYear)
        : fb.reportingYear,
    hasObjectivePayCriteriaArt6: pickBool(
      src.hasObjectivePayCriteriaArt6,
      fb.hasObjectivePayCriteriaArt6,
    ),
    hasArt7WorkflowReady: pickBool(src.hasArt7WorkflowReady, fb.hasArt7WorkflowReady),
    art7SampleRequestDate: pickStr(src.art7SampleRequestDate, fb.art7SampleRequestDate),
    jobAd: sanitizeJobAd(src.jobAd, fb.jobAd),
    categoryJustifications: sanitizeCategoryJustifications(
      src.categoryJustifications,
      fb.categoryJustifications,
    ),
    workers: sanitizeWorkers(src.workers, fb.workers),
  };
}

function buildExecutiveSummaryText(dossier, locale = 'en') {
  const code = dossier.dossierCode || 'DRAFT';
  const { input, result } = dossier;
  const m = result.metrics;

  if (locale === 'ar') {
    return [
      `ملخص جاهزية شفافية الأجور الأوروبية Directive (EU) 2023/970 — ${code}`,
      `صاحب العمل: ${input.employerName} (${input.memberStateIso} · ${input.headcountDeclared} موظفاً) · جدول التبليغ: ${result.reportingObligation.frequency}`,
      `التحويل الوطني (Art. 34): ${result.transpositionDeadline} | الجاهزية: ${result.readinessScore}/100 (${result.tier})`,
      `فجوة المتوسط (FTE): ${m.meanPayGapPct ?? 'N/A'}% · الوسيط: ${m.medianPayGapPct ?? 'N/A'}% | محفز المادة 10: ${m.anyJointPayAssessmentTriggered ? `نعم (${m.triggeredCategories.join('، ')})` : 'لا'}`,
      `مهلة الرد للمادة 7: ${result.article7Clock.dueDateIso} | تنبيه الخلايا الصغيرة GDPR: ${m.smallSampleCategoriesCount}`,
      result.disclaimerAr,
    ].join('\n');
  }

  return [
    `EU Pay Transparency Directive (EU) 2023/970 Executive Summary — ${code}`,
    `Employer: ${input.employerName} (${input.memberStateIso} · ${input.headcountDeclared} staff) · Schedule: ${result.reportingObligation.frequency}`,
    `National Transposition (Art. 34): ${result.transpositionDeadline} | Readiness: ${result.readinessScore}/100 (${result.tier})`,
    `Mean FTE Gap: ${m.meanPayGapPct ?? 'N/A'}% · Median: ${m.medianPayGapPct ?? 'N/A'}% | Art. 10 Triggered: ${m.anyJointPayAssessmentTriggered ? `YES (${m.triggeredCategories.join(', ')})` : 'NO'}`,
    `Art. 7 SLA Due Date: ${result.article7Clock.dueDateIso} | Small-Cell Privacy Warnings: ${m.smallSampleCategoriesCount}`,
    result.disclaimerEn,
  ].join('\n');
}

function serveStaticAsset(res, pathname, resolvedDist, method = 'GET', normalizedBasePath = '') {
  if (!resolvedDist || !fs.existsSync(resolvedDist)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(pathname || '/');
  } catch {
    sendJson(res, 400, { error: 'Malformed path' });
    return;
  }

  const cleanRel = decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(resolvedDist, cleanRel || 'index.html');
  if (candidate !== resolvedDist && !candidate.startsWith(resolvedDist + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let fileToServe = null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    fileToServe = candidate;
  } else {
    const indexFallback = path.join(resolvedDist, 'index.html');
    if (fs.existsSync(indexFallback) && fs.statSync(indexFallback).isFile()) {
      fileToServe = indexFallback;
    }
  }

  if (!fileToServe) {
    sendJson(res, 404, { error: 'Static asset not found' });
    return;
  }

  const ext = path.extname(fileToServe).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

  if (ext === '.html' && normalizedBasePath) {
    let html = fs.readFileSync(fileToServe, 'utf8');
    html = html
      .replaceAll('href="/', `href="${normalizedBasePath}/`)
      .replaceAll('src="/', `src="${normalizedBasePath}/`);
    const baseScript = `<script>window.__PAYFAIREU_BASE__=${JSON.stringify(normalizedBasePath)};</script>`;
    html = html.includes('</head>') ? html.replace('</head>', `${baseScript}</head>`) : `${baseScript}${html}`;
    const bodyBuf = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': bodyBuf.byteLength,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(bodyBuf);
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    ...SECURITY_HEADERS,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(fileToServe).pipe(res);
}

export function createPayFairEuServer({
  dataDir,
  distDir = '',
  appOrigin = '',
  basePath = '',
  maxMutationsPerMinute = 120,
  maxJsonBodyBytes = 5 * 1024 * 1024,
}) {
  const db = openPayFairDatabase(dataDir);
  const resolvedDist = distDir ? path.resolve(distDir) : null;
  const normalizedAppOrigin = String(appOrigin || '').replace(/\/+$/, '');
  const normalizedBasePath = normalizeBasePath(basePath);
  const rateBuckets = new Map();

  function checkRateLimit(req, method) {
    if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
      return true;
    }
    const now = Date.now();
    const ip =
      String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1')
        .split(',')[0]
        .trim() || '127.0.0.1';
    const windowMs = 60_000;
    const prev = rateBuckets.get(ip) || [];
    const recent = prev.filter((ts) => now - ts < windowMs);
    if (recent.length >= maxMutationsPerMinute) {
      rateBuckets.set(ip, recent);
      return false;
    }
    recent.push(now);
    rateBuckets.set(ip, recent);
    return true;
  }

  function buildPublicReportUrl(req, slugOrCode) {
    return `${resolveBaseUrl(req, normalizedAppOrigin, normalizedBasePath)}/r/${encodeURIComponent(slugOrCode)}`;
  }

  function findStoredDossier(id) {
    return db.getDossierById(id) || db.getDossierBySlugOrCode(id);
  }

  function computeDigestSync(input, result) {
    return sha256SyncHex(buildCanonicalDigestPayload(input, result));
  }

  async function handleApiRequest(req, res, method, pathname, searchParams) {
    if (!checkRateLimit(req, method)) {
      return sendJson(res, 429, {
        error: 'Too many write requests; please slow down and try again shortly.',
        code: 'RATE_LIMITED',
      });
    }

    // 1. Health & Presets
    if (method === 'GET' && pathname === '/api/health') {
      const stats = db.getStats();
      return sendJson(res, 200, {
        ok: true,
        service: 'payfaireu',
        version: APP_VERSION,
        basePath: normalizedBasePath || '/',
        ...stats,
        timestamp: new Date().toISOString(),
      });
    }

    if (method === 'GET' && pathname === '/api/presets') {
      return sendJson(res, 200, {
        presets: PAYFAIR_PRESETS,
        samplePayrollCsv: SAMPLE_PAYROLL_CSV,
      });
    }

    // 2. Stateless Analyzers & Compliance Evaluators
    if (method === 'POST' && pathname === '/api/classify-tier') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const headcount = Number(body?.headcountDeclared ?? body?.headcount ?? 0);
      return sendJson(res, 200, {
        obligation: classifyReportingObligation(headcount),
      });
    }

    if (method === 'POST' && pathname === '/api/audit-job-ad') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const jobAdSource = body?.jobAd && typeof body.jobAd === 'object' ? body.jobAd : body;
      const sanitized = sanitizeJobAd(jobAdSource, PAYFAIR_PRESETS[0].data.jobAd);
      return sendJson(res, 200, {
        jobAd: sanitized,
        audit: auditArticle5JobAd(sanitized),
      });
    }

    if (method === 'POST' && pathname === '/api/art7-clock') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const requestDate = String(body?.requestDateIso ?? body?.requestDate ?? '2026-09-01');
      const employerName = String(body?.employerName || 'Employer').trim() || 'Employer';
      const requestedCategory = String(body?.requestedCategory ?? body?.category ?? '');

      let metrics;
      if (Array.isArray(body?.workers)) {
        metrics = computeArticle9Metrics(
          sanitizeWorkers(body.workers, []),
          sanitizeCategoryJustifications(body.categoryJustifications, []),
        );
      } else if (body?.presetKey) {
        const preset = PAYFAIR_PRESETS.find((p) => p.id === body.presetKey);
        if (preset) {
          metrics = computeArticle9Metrics(preset.data.workers, preset.data.categoryJustifications);
        }
      }

      return sendJson(res, 200, {
        clock: computeArticle7Deadline(requestDate, employerName, metrics, requestedCategory),
      });
    }

    if (method === 'POST' && pathname === '/api/batch-payroll') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const csvText = String(body?.csv ?? body?.csvText ?? '');
      if (!csvText.trim()) {
        return sendJson(res, 400, { error: 'Payroll CSV payload is required', code: 'EMPTY_CSV' });
      }
      const justifications = sanitizeCategoryJustifications(body?.categoryJustifications, []);
      const summary = parsePayrollCsv(csvText, justifications);
      return sendJson(res, 200, {
        ...summary,
        categoryGapCsv: exportCategoryGapCsv(summary.metrics, { withBom: true }),
      });
    }

    if (method === 'POST' && pathname === '/api/assess-payfaireu') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const basePreset =
        PAYFAIR_PRESETS.find((p) => p.id === body?.presetKey) || PAYFAIR_PRESETS[0];
      const inputSource = body?.input && typeof body.input === 'object' ? body.input : body;
      const input = mergeAssessmentInput(inputSource, basePreset.data);
      const result = assessPayFairEu(input);
      return sendJson(res, 200, {
        presetKey: basePreset.id,
        input,
        result,
        sha256Digest: computeDigestSync(input, result),
        art10NoticeEn: buildJointAssessmentNotice(input, result, 'en'),
        art10NoticeAr: buildJointAssessmentNotice(input, result, 'ar'),
      });
    }

    // 3. Employer Profiles CRUD
    if (method === 'GET' && pathname === '/api/profiles') {
      return sendJson(res, 200, { profiles: db.listProfiles() });
    }

    if (method === 'POST' && pathname === '/api/profiles') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const profile = db.saveProfile(body || {});
      return sendJson(res, 201, { profile });
    }

    const profDeleteMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (method === 'DELETE' && profDeleteMatch) {
      const id = decodeURIComponent(profDeleteMatch[1] || '');
      const del = db.deleteProfile(id);
      if (!del.deleted) return sendJson(res, 404, { error: 'Employer profile not found' });
      return sendJson(res, 200, { deleted: true });
    }

    // 4. Dossiers List & Create
    if (method === 'GET' && pathname === '/api/dossiers') {
      return sendJson(res, 200, { dossiers: db.listDossiers() });
    }

    if (method === 'POST' && pathname === '/api/dossiers') {
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const basePreset =
        PAYFAIR_PRESETS.find((p) => p.id === body?.presetKey) || PAYFAIR_PRESETS[0];
      const nowIso = new Date().toISOString();
      const actor = String(body?.actor || 'payfair-coordinator').trim() || 'payfair-coordinator';
      const inputSource = body?.input && typeof body.input === 'object' ? body.input : body;
      const input = mergeAssessmentInput(inputSource, basePreset.data);
      const result = assessPayFairEu(input);

      const bundle = db.createDossier(
        {
          presetKey: basePreset.id,
          slug:
            typeof body?.slug === 'string'
              ? body.slug
              : typeof body?.publicSlug === 'string'
                ? body.publicSlug
                : undefined,
          localeDefault: body?.localeDefault === 'ar' ? 'ar' : 'en',
          input,
          result,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        actor,
      );

      return sendJson(res, 201, {
        ...bundle,
        publicReportUrl: buildPublicReportUrl(req, bundle.dossier.slug),
      });
    }

    // 5. Dossier Actions: Duplicate & Finalize / Lock
    const dupMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/duplicate$/);
    if (method === 'POST' && dupMatch) {
      const id = decodeURIComponent(dupMatch[1] || '');
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const actor = String(body?.actor || 'payfair-coordinator').trim() || 'payfair-coordinator';
      const cloned = db.duplicateDossier(id, actor);
      if (!cloned) return sendJson(res, 404, { error: 'Dossier not found' });
      return sendJson(res, 201, {
        ...cloned,
        publicReportUrl: buildPublicReportUrl(req, cloned.dossier.slug),
      });
    }

    const finalizeMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/(finalize|lock)$/);
    if (method === 'POST' && finalizeMatch) {
      const id = decodeURIComponent(finalizeMatch[1] || '');
      const body = await readJsonBody(req, maxJsonBodyBytes);
      const actor = String(body?.actor || 'payfair-coordinator').trim() || 'payfair-coordinator';
      const lockedBundle = db.finalizeDossier(id, computeDigestSync, actor);
      if (!lockedBundle) return sendJson(res, 404, { error: 'Dossier not found' });
      return sendJson(res, 200, {
        ...lockedBundle,
        publicReportUrl: buildPublicReportUrl(
          req,
          lockedBundle.dossier.dossierCode || lockedBundle.dossier.slug,
        ),
      });
    }

    // 6. Per-Dossier Markdown, Art. 10 Notice, Job Ad HTML Snippet, BOM CSV & Summary
    const mdMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/dossier\.md$/);
    if (method === 'GET' && mdMatch) {
      const bundle = findStoredDossier(decodeURIComponent(mdMatch[1] || ''));
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const locale = searchParams.get('locale') === 'ar' ? 'ar' : 'en';
      const d = bundle.dossier;
      const digest = d.sha256Digest || computeDigestSync(d.input, d.result);
      const fname = slugify(d.dossierCode || d.slug || d.id, 'payfaireu');
      return sendAttachment(
        res,
        'text/markdown; charset=utf-8',
        `payfaireu-${fname}-${locale}.md`,
        buildPayFairBriefMarkdown(d.input, d.result, locale, digest, d.dossierCode || 'DRAFT'),
      );
    }

    const noticeMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/art10-notice\.md$/);
    if (method === 'GET' && noticeMatch) {
      const bundle = findStoredDossier(decodeURIComponent(noticeMatch[1] || ''));
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const locale = searchParams.get('locale') === 'ar' ? 'ar' : 'en';
      const d = bundle.dossier;
      const fname = slugify(d.dossierCode || d.slug || d.id, 'payfaireu');
      return sendAttachment(
        res,
        'text/markdown; charset=utf-8',
        `payfaireu-art10-notice-${fname}-${locale}.md`,
        buildJointAssessmentNotice(d.input, d.result, locale),
      );
    }

    const snippetMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/job-ad-snippet\.html$/);
    if (method === 'GET' && snippetMatch) {
      const bundle = findStoredDossier(decodeURIComponent(snippetMatch[1] || ''));
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const d = bundle.dossier;
      const fname = slugify(d.dossierCode || d.slug || d.id, 'payfaireu');
      return sendAttachment(
        res,
        'text/html; charset=utf-8',
        `payfaireu-art5-job-ad-${fname}.html`,
        d.result.jobAdAudit?.htmlSnippet || '',
      );
    }

    const csvMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/export\.csv$/);
    if (method === 'GET' && csvMatch) {
      const bundle = findStoredDossier(decodeURIComponent(csvMatch[1] || ''));
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const d = bundle.dossier;
      const fname = slugify(d.dossierCode || d.slug || d.id, 'payfaireu');
      return sendAttachment(
        res,
        'text/csv; charset=utf-8',
        `payfaireu-${fname}.csv`,
        exportCategoryGapCsv(d.result.metrics, { withBom: true }),
      );
    }

    const summaryMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/summary$/);
    if (method === 'GET' && summaryMatch) {
      const bundle = findStoredDossier(decodeURIComponent(summaryMatch[1] || ''));
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const locale = searchParams.get('locale') === 'ar' ? 'ar' : 'en';
      const d = bundle.dossier;
      return sendJson(res, 200, {
        locale,
        dossierCode: d.dossierCode || null,
        status: bundle.status,
        tier: d.result.tier,
        readinessScore: d.result.readinessScore,
        transpositionDeadline: d.result.transpositionDeadline,
        reportingObligation: d.result.reportingObligation,
        workerCount: d.result.metrics.workerCount,
        meanPayGapPct: d.result.metrics.meanPayGapPct,
        medianPayGapPct: d.result.metrics.medianPayGapPct,
        anyJointPayAssessmentTriggered: d.result.metrics.anyJointPayAssessmentTriggered,
        triggeredCategories: d.result.metrics.triggeredCategories,
        smallSampleCategoriesCount: d.result.metrics.smallSampleCategoriesCount,
        art7DueDateIso: d.result.article7Clock.dueDateIso,
        summaryText: buildExecutiveSummaryText(d, locale),
        disclaimer: locale === 'ar' ? d.result.disclaimerAr : d.result.disclaimerEn,
      });
    }

    // 7. Single Dossier Read, Update & Delete
    const dossierMatch = pathname.match(/^\/api\/dossiers\/([^/]+)$/);
    if (dossierMatch) {
      const id = decodeURIComponent(dossierMatch[1] || '');
      if (method === 'GET') {
        const bundle = findStoredDossier(id);
        if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
        return sendJson(res, 200, {
          ...bundle,
          publicReportUrl: buildPublicReportUrl(
            req,
            bundle.dossier.dossierCode || bundle.dossier.slug,
          ),
        });
      }
      if (method === 'PATCH') {
        const patch = await readJsonBody(req, maxJsonBodyBytes);
        const nowIso = new Date().toISOString();

        const updated = db.updateDossier(
          id,
          (current) => {
            const inputSource = patch?.input && typeof patch.input === 'object' ? patch.input : patch;
            const input = mergeAssessmentInput(inputSource, current.input);
            const result = assessPayFairEu(input);

            const requestedSlug =
              typeof patch?.slug === 'string' && patch.slug.trim()
                ? patch.slug.trim()
                : typeof patch?.publicSlug === 'string' && patch.publicSlug.trim()
                  ? patch.publicSlug.trim()
                  : current.slug;

            return {
              ...current,
              slug: requestedSlug,
              localeDefault:
                patch?.localeDefault === 'ar'
                  ? 'ar'
                  : patch?.localeDefault === 'en'
                    ? 'en'
                    : current.localeDefault,
              input,
              result,
              updatedAt: nowIso,
            };
          },
          String(patch?.actor || 'payfair-coordinator').trim() || 'payfair-coordinator',
        );

        if (!updated) return sendJson(res, 404, { error: 'Dossier not found' });
        return sendJson(res, 200, {
          ...updated,
          publicReportUrl: buildPublicReportUrl(req, updated.dossier.slug),
        });
      }
      if (method === 'DELETE') {
        const del = db.deleteDossier(id);
        if (!del.deleted) return sendJson(res, 404, { error: 'Dossier not found' });
        return sendJson(res, 200, { deleted: true, id: del.id });
      }
    }

    // 8. Public Shareable Report (/api/public/reports/:slugOrCode)
    const pubMatch = pathname.match(/^\/api\/public\/reports\/([^/]+)$/);
    if (method === 'GET' && pubMatch) {
      const slugOrCode = decodeURIComponent(pubMatch[1] || '');
      const bundle = db.getDossierBySlugOrCode(slugOrCode, { incrementView: true });
      if (!bundle) return sendJson(res, 404, { error: 'PayFairEU readiness dossier not found' });
      const d = bundle.dossier;
      const digest = d.sha256Digest || computeDigestSync(d.input, d.result);

      return sendJson(res, 200, {
        ...bundle,
        markdownEn: buildPayFairBriefMarkdown(
          d.input,
          d.result,
          'en',
          digest,
          d.dossierCode || 'DRAFT',
        ),
        markdownAr: buildPayFairBriefMarkdown(
          d.input,
          d.result,
          'ar',
          digest,
          d.dossierCode || 'DRAFT',
        ),
        art10NoticeEn: buildJointAssessmentNotice(d.input, d.result, 'en'),
        art10NoticeAr: buildJointAssessmentNotice(d.input, d.result, 'ar'),
        publicReportUrl: buildPublicReportUrl(req, d.dossierCode || d.slug),
      });
    }

    return sendJson(res, 404, { error: 'API endpoint not found' });
  }

  async function handler(req, res) {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      let pathname = parsedUrl.pathname;
      if (
        normalizedBasePath &&
        (pathname === normalizedBasePath || pathname.startsWith(`${normalizedBasePath}/`))
      ) {
        pathname = pathname.slice(normalizedBasePath.length) || '/';
      }
      const method = String(req.method || 'GET').toUpperCase();

      if (pathname.startsWith('/api/')) {
        await handleApiRequest(req, res, method, pathname, parsedUrl.searchParams);
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      serveStaticAsset(res, pathname, resolvedDist, method, normalizedBasePath);
    } catch (err) {
      const statusCode = err?.statusCode || 500;
      const payload = {
        error: err?.message || 'Internal server error',
        ...(err?.code ? { code: err.code } : {}),
      };
      if (!res.headersSent) {
        sendJson(res, statusCode, payload);
      } else {
        res.end();
      }
    }
  }

  return {
    handler,
    close: () => db.close(),
  };
}
