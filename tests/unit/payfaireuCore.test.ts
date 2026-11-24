import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addTwoCalendarMonthsIso,
  auditArticle5JobAd,
  computeArticle7Deadline,
} from '../../src/core/jobAdAndArt7.ts';
import {
  buildCanonicalDigestPayload,
  buildJointAssessmentNotice,
  buildPayFairBriefMarkdown,
  computePayFairDigest,
  sha256SyncHex,
} from '../../src/core/dossierDigest.ts';
import {
  classifyReportingObligation,
  computeArticle9Metrics,
} from '../../src/core/payGapEngine.ts';
import { exportCategoryGapCsv, parsePayrollCsv } from '../../src/core/payrollCsvParser.ts';
import { PAYFAIR_PRESETS, SAMPLE_PAYROLL_CSV } from '../../src/core/presets.ts';
import { assessPayFairEu } from '../../src/core/readinessAssessor.ts';
import type { WorkerPayRow } from '../../src/core/types.ts';

describe('PayFairEU Core Engine — Directive (EU) 2023/970', () => {
  it('classifies employer headcount tiers and statutory first deadlines accurately', () => {
    expect(classifyReportingObligation(250)).toEqual({
      tier: 'large_250_plus',
      frequency: 'annual',
      firstReportDue: '2027-06-07',
      cycleYears: 1,
    });
    expect(classifyReportingObligation(249)).toEqual({
      tier: 'medium_150_249',
      frequency: 'triennial_2027',
      firstReportDue: '2027-06-07',
      cycleYears: 3,
    });
    expect(classifyReportingObligation(150).frequency).toBe('triennial_2027');
    expect(classifyReportingObligation(149)).toEqual({
      tier: 'medium_100_149',
      frequency: 'triennial_2031',
      firstReportDue: '2031-06-07',
      cycleYears: 3,
    });
    expect(classifyReportingObligation(100).firstReportDue).toBe('2031-06-07');
    expect(classifyReportingObligation(99)).toEqual({
      tier: 'small_under_100',
      frequency: 'voluntary_under_100',
      firstReportDue: null,
      cycleYears: null,
    });
  });

  it('normalizes part-time pay to 1.0 FTE and computes Article 9 metrics & Q1..Q4 quartile coverage', () => {
    const fteWorkers: WorkerPayRow[] = [
      { id: 'F-PT', category: 'Analysts', sex: 'female', basePayAnnualEur: 30000, variablePayAnnualEur: 0, fteRatio: 0.5 },
      { id: 'M-FT', category: 'Analysts', sex: 'male', basePayAnnualEur: 60000, variablePayAnnualEur: 0, fteRatio: 1.0 },
    ];
    const eqMetrics = computeArticle9Metrics(fteWorkers);
    expect(eqMetrics.categories[0]?.femaleMeanBaseEur).toBe(60000);
    expect(eqMetrics.categories[0]?.maleMeanBaseEur).toBe(60000);
    expect(eqMetrics.meanPayGapPct).toBe(0);
    expect(eqMetrics.medianPayGapPct).toBe(0);

    const cohortWorkers: WorkerPayRow[] = [
      { id: 'W1', category: 'Ops', sex: 'female', basePayAnnualEur: 40000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'W2', category: 'Ops', sex: 'female', basePayAnnualEur: 42000, variablePayAnnualEur: 2000, fteRatio: 1 },
      { id: 'W3', category: 'Ops', sex: 'female', basePayAnnualEur: 46000, variablePayAnnualEur: 3000, fteRatio: 1 },
      { id: 'W4', category: 'Ops', sex: 'female', basePayAnnualEur: 48000, variablePayAnnualEur: 3000, fteRatio: 1 },
      { id: 'W5', category: 'Ops', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 5000, fteRatio: 1 },
      { id: 'W6', category: 'Ops', sex: 'male', basePayAnnualEur: 54000, variablePayAnnualEur: 6000, fteRatio: 1 },
      { id: 'W7', category: 'Ops', sex: 'male', basePayAnnualEur: 58000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'W8', category: 'Ops', sex: 'male', basePayAnnualEur: 62000, variablePayAnnualEur: 7000, fteRatio: 1 },
    ];
    const m = computeArticle9Metrics(cohortWorkers);
    expect(m.workerCount).toBe(8);
    expect(m.femaleCount).toBe(4);
    expect(m.maleCount).toBe(4);
    expect(m.femaleReceivingVariablePct).toBe(75);
    expect(m.maleReceivingVariablePct).toBe(75);
    expect(m.meanPayGapPct).toBeGreaterThan(20);
    expect(m.medianPayGapPct).toBeGreaterThan(15);
    expect(m.meanVariableGapPct).toBeCloseTo(55.56, 1);
    expect(m.medianVariableGapPct).toBe(50);

    const totalQuartileWorkers = m.quartiles.reduce((sum, q) => sum + q.count, 0);
    expect(totalQuartileWorkers).toBe(m.workerCount);
    expect(m.quartiles.map((q) => q.quartile)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    for (const q of m.quartiles) {
      expect(q.femalePct + q.malePct).toBeCloseTo(100, 1);
    }
  });

  it('enforces Article 10 3-part cumulative trigger (>=5% + unjustified + unremedied) & GDPR <3 small-cell guard', () => {
    const workers: WorkerPayRow[] = [
      { id: 'S1', category: 'Sales', sex: 'female', basePayAnnualEur: 45000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'S2', category: 'Sales', sex: 'female', basePayAnnualEur: 45000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'S3', category: 'Sales', sex: 'female', basePayAnnualEur: 45000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'S4', category: 'Sales', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'S5', category: 'Sales', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'S6', category: 'Sales', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'N1', category: 'SmallTeam', sex: 'female', basePayAnnualEur: 48000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'N2', category: 'SmallTeam', sex: 'female', basePayAnnualEur: 48000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'N3', category: 'SmallTeam', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'N4', category: 'SmallTeam', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: 'N5', category: 'SmallTeam', sex: 'male', basePayAnnualEur: 50000, variablePayAnnualEur: 0, fteRatio: 1 },
    ];

    const untriggeredBecauseSmall = computeArticle9Metrics(workers);
    const sales = untriggeredBecauseSmall.categories.find((c) => c.category === 'Sales')!;
    const small = untriggeredBecauseSmall.categories.find((c) => c.category === 'SmallTeam')!;
    expect(sales.totalMeanGapPct).toBe(10);
    expect(sales.exceedsFivePercent).toBe(true);
    expect(sales.triggersJointPayAssessment).toBe(true);
    expect(sales.smallSamplePrivacyWarning).toBe(false);
    expect(small.totalMeanGapPct).toBe(4);
    expect(small.exceedsFivePercent).toBe(false);
    expect(small.triggersJointPayAssessment).toBe(false);
    expect(small.smallSamplePrivacyWarning).toBe(true);

    const justifiedMetrics = computeArticle9Metrics(workers, [
      {
        category: 'Sales',
        justifiedByObjectiveCriteria: true,
        justificationNote: 'Enterprise quota tier difference',
        remediedWithin6Months: false,
      },
    ]);
    expect(justifiedMetrics.anyJointPayAssessmentTriggered).toBe(false);
    expect(justifiedMetrics.categories.find((c) => c.category === 'Sales')?.exceedsFivePercent).toBe(true);

    const remediedMetrics = computeArticle9Metrics(workers, [
      {
        category: 'Sales',
        justifiedByObjectiveCriteria: false,
        justificationNote: '',
        remediedWithin6Months: true,
      },
    ]);
    expect(remediedMetrics.anyJointPayAssessmentTriggered).toBe(false);
  });

  it('audits Article 5 job ads cleanly, escapes HTML/XSS in snippet, and computes clamped Article 7 deadlines with GDPR suppression', () => {
    const clean = auditArticle5JobAd({
      roleTitle: 'Staff Product Designer',
      category: 'Design',
      currency: 'EUR',
      payMin: 62000,
      payMax: 74000,
      payPeriod: 'annual',
      jobAdText: 'Starting annual pay EUR 62,000-74,000 depending on scope.',
      asksSalaryHistory: false,
    });
    expect(clean.passed).toBe(true);
    expect(clean.issues).toHaveLength(0);
    expect(clean.snippetEn).toContain('62,000');

    const unsafe = auditArticle5JobAd({
      roleTitle: '<script>alert(1)</script> Lead',
      category: 'Sales',
      currency: 'EUR',
      payMin: 0,
      payMax: 0,
      payPeriod: 'annual',
      jobAdText: 'Experienced salesman wanted. Competitive salary subject to previous salary proof.',
      asksSalaryHistory: true,
    });
    expect(unsafe.passed).toBe(false);
    const codes = unsafe.issues.map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'ART5_MISSING_OR_INVALID_RANGE',
        'ART5_SALARY_HISTORY_BANNED',
        'ART5_TEXT_SALARY_HISTORY_PHRASE',
        'ART5_VAGUE_PAY_PHRASE',
        'ART5_GENDERED_TITLE',
      ]),
    );
    expect(unsafe.htmlSnippet).not.toContain('<script>');
    expect(unsafe.htmlSnippet).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Lead');

    expect(addTwoCalendarMonthsIso('2026-12-31')).toEqual({
      normalizedRequestIso: '2026-12-31',
      dueDateIso: '2027-02-28',
    });

    const smallMetrics = computeArticle9Metrics([
      { id: '1', category: 'Legal', sex: 'female', basePayAnnualEur: 60000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: '2', category: 'Legal', sex: 'female', basePayAnnualEur: 62000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: '3', category: 'Legal', sex: 'male', basePayAnnualEur: 63000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: '4', category: 'Legal', sex: 'male', basePayAnnualEur: 64000, variablePayAnnualEur: 0, fteRatio: 1 },
      { id: '5', category: 'Legal', sex: 'male', basePayAnnualEur: 65000, variablePayAnnualEur: 0, fteRatio: 1 },
    ]);
    const redactedClock = computeArticle7Deadline('2026-12-31', 'Acme BV', smallMetrics, 'Legal');
    expect(redactedClock.dueDateIso).toBe('2027-02-28');
    expect(redactedClock.letterEn).toContain('GDPR k-anonymity guard');
    expect(redactedClock.letterEn).not.toContain('Female EUR');
    expect(redactedClock.letterAr).toContain('2027-02-28');
  });

  it('parses CSV payrolls, exports UTF-8 BOM + formula-safe CSV leaving negative numbers raw, and verifies SHA-256 + 3 presets', async () => {
    const parsedSample = parsePayrollCsv(SAMPLE_PAYROLL_CSV);
    expect(parsedSample.totalInputRows).toBe(16);
    expect(parsedSample.parsedWorkersCount).toBe(16);
    expect(parsedSample.invalidRowsCount).toBe(0);
    expect(parsedSample.metrics.triggeredCategories).toEqual(['Enterprise Sales']);

    const csvWithBadRows = [
      'id,category,sex,base_pay,variable_pay,fte',
      'X1,"=CMD|""/C calc""!A0",female,55000,0,1',
      'X2,"=CMD|""/C calc""!A0",female,55000,0,1',
      'X3,"=CMD|""/C calc""!A0",female,55000,0,1',
      'X4,"=CMD|""/C calc""!A0",male,50000,0,1',
      'X5,"=CMD|""/C calc""!A0",male,50000,0,1',
      'X6,"=CMD|""/C calc""!A0",male,50000,0,1',
      'BAD1,Ops,other,50000,0,1.5',
    ].join('\n');

    const badSummary = parsePayrollCsv(csvWithBadRows);
    expect(badSummary.invalidRowsCount).toBe(1);
    expect(badSummary.metrics.categories[0]?.totalMeanGapPct).toBe(-10);

    const exportedCsv = exportCategoryGapCsv(badSummary.metrics, { withBom: true });
    const bytes = Buffer.from(exportedCsv, 'utf8');
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    expect(exportedCsv).toContain('"\'=CMD|""/C calc""!A0"');
    expect(exportedCsv).toContain(',-10,');

    const results = PAYFAIR_PRESETS.map((p) => assessPayFairEu(p.data));
    expect(results[0]?.tier).toBe('ready');
    expect(results[0]?.metrics.anyJointPayAssessmentTriggered).toBe(false);
    expect(results[1]?.tier).toBe('conditional');
    expect(results[1]?.warningsCount).toBe(1);
    expect(results[1]?.article7Clock.dueDateIso).toBe('2027-02-28');
    expect(results[2]?.tier).toBe('blocked');
    expect(results[2]?.metrics.triggeredCategories).toContain('Enterprise Sales');

    const preset0 = PAYFAIR_PRESETS[0]!;
    const res0 = results[0]!;
    const digest = await computePayFairDigest(preset0.data, res0);
    const syncDigest = sha256SyncHex(buildCanonicalDigestPayload(preset0.data, res0));
    const nodeDigest = createHash('sha256').update('{"a":1,"b":2}').digest('hex');
    expect(sha256SyncHex({ b: 2, a: 1 })).toBe(nodeDigest);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(syncDigest);

    const noticeAr = buildJointAssessmentNotice(PAYFAIR_PRESETS[2]!.data, results[2]!, 'ar');
    expect(noticeAr).toContain('Enterprise Sales');
    const mdEn = buildPayFairBriefMarkdown(preset0.data, res0, 'en', digest, 'PAYF-2026-0001');
    expect(mdEn).toContain('PAYF-2026-0001');
    expect(mdEn).toContain(digest);
  });
});
