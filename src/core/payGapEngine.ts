import type {
  Article9Metrics,
  CategoryGapResult,
  CategoryJustification,
  QuartileBandStat,
  ReportingObligation,
  WorkerPayRow,
} from './types.ts';

export const EU_PAY_TRANSPARENCY_TRANSPOSITION_DATE = '2026-06-07';
export const ART10_TRIGGER_GAP_PCT = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function classifyReportingObligation(headcountDeclared: number): ReportingObligation {
  const hc = Math.max(0, Math.floor(Number(headcountDeclared) || 0));
  if (hc >= 250) {
    return {
      tier: 'large_250_plus',
      frequency: 'annual',
      firstReportDue: '2027-06-07',
      cycleYears: 1,
    };
  }
  if (hc >= 150) {
    return {
      tier: 'medium_150_249',
      frequency: 'triennial_2027',
      firstReportDue: '2027-06-07',
      cycleYears: 3,
    };
  }
  if (hc >= 100) {
    return {
      tier: 'medium_100_149',
      frequency: 'triennial_2031',
      firstReportDue: '2031-06-07',
      cycleYears: 3,
    };
  }
  return {
    tier: 'small_under_100',
    frequency: 'voluntary_under_100',
    firstReportDue: null,
    cycleYears: null,
  };
}

export function computeGapPct(maleVal: number, femaleVal: number): number | null {
  if (!Number.isFinite(maleVal) || !Number.isFinite(femaleVal) || maleVal <= 0 || femaleVal <= 0) {
    return null;
  }
  return round2(((maleVal - femaleVal) / maleVal) * 100);
}

export function computeMean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((acc, v) => acc + v, 0);
  return round2(total / values.length);
}

export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return round2(sorted[mid]!);
  }
  return round2(((sorted[mid - 1]! + sorted[mid]!) / 2));
}

interface NormalizedWorker {
  id: string;
  category: string;
  sex: 'female' | 'male';
  fteBase: number;
  fteVar: number;
  fteTotal: number;
}

function normalizeWorkers(workers: WorkerPayRow[]): NormalizedWorker[] {
  return workers.map((w) => {
    const fte = Math.max(0.1, Math.min(1, Number(w.fteRatio) || 1));
    const base = Math.max(0, Number(w.basePayAnnualEur) || 0) / fte;
    const variable = Math.max(0, Number(w.variablePayAnnualEur) || 0) / fte;
    return {
      id: w.id,
      category: (w.category || 'Uncategorized').trim() || 'Uncategorized',
      sex: w.sex === 'female' ? 'female' : 'male',
      fteBase: base,
      fteVar: variable,
      fteTotal: base + variable,
    };
  });
}

function computeQuartileBands(norm: NormalizedWorker[]): QuartileBandStat[] {
  const labels: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'> = ['Q1', 'Q2', 'Q3', 'Q4'];
  if (norm.length === 0) {
    return labels.map((quartile) => ({
      quartile,
      count: 0,
      minPayEur: 0,
      maxPayEur: 0,
      femalePct: 0,
      malePct: 0,
    }));
  }

  const sorted = [...norm].sort((a, b) => a.fteTotal - b.fteTotal || a.id.localeCompare(b.id));
  const buckets: NormalizedWorker[][] = [[], [], [], []];
  const n = sorted.length;

  sorted.forEach((w, idx) => {
    const qIdx = Math.min(3, Math.floor((idx * 4) / n));
    buckets[qIdx]!.push(w);
  });

  return labels.map((quartile, i) => {
    const grp = buckets[i]!;
    if (grp.length === 0) {
      return { quartile, count: 0, minPayEur: 0, maxPayEur: 0, femalePct: 0, malePct: 0 };
    }
    const fCount = grp.filter((w) => w.sex === 'female').length;
    const mCount = grp.length - fCount;
    return {
      quartile,
      count: grp.length,
      minPayEur: round2(grp[0]!.fteTotal),
      maxPayEur: round2(grp[grp.length - 1]!.fteTotal),
      femalePct: round2((fCount / grp.length) * 100),
      malePct: round2((mCount / grp.length) * 100),
    };
  });
}

export function computeArticle9Metrics(
  workers: WorkerPayRow[],
  justifications: CategoryJustification[] = [],
): Article9Metrics {
  const norm = normalizeWorkers(workers);
  const females = norm.filter((w) => w.sex === 'female');
  const males = norm.filter((w) => w.sex === 'male');

  const fMeanTotal = computeMean(females.map((w) => w.fteTotal));
  const mMeanTotal = computeMean(males.map((w) => w.fteTotal));
  const meanPayGapPct =
    fMeanTotal !== null && mMeanTotal !== null ? computeGapPct(mMeanTotal, fMeanTotal) : null;

  const fMedianTotal = computeMedian(females.map((w) => w.fteTotal));
  const mMedianTotal = computeMedian(males.map((w) => w.fteTotal));
  const medianPayGapPct =
    fMedianTotal !== null && mMedianTotal !== null
      ? computeGapPct(mMedianTotal, fMedianTotal)
      : null;

  const femalesWithVar = females.filter((w) => w.fteVar > 0);
  const malesWithVar = males.filter((w) => w.fteVar > 0);

  const fMeanVar = computeMean(femalesWithVar.map((w) => w.fteVar));
  const mMeanVar = computeMean(malesWithVar.map((w) => w.fteVar));
  const meanVariableGapPct =
    fMeanVar !== null && mMeanVar !== null ? computeGapPct(mMeanVar, fMeanVar) : null;

  const fMedianVar = computeMedian(femalesWithVar.map((w) => w.fteVar));
  const mMedianVar = computeMedian(malesWithVar.map((w) => w.fteVar));
  const medianVariableGapPct =
    fMedianVar !== null && mMedianVar !== null ? computeGapPct(mMedianVar, fMedianVar) : null;

  const femaleReceivingVariablePct =
    females.length > 0 ? round2((femalesWithVar.length / females.length) * 100) : 0;
  const maleReceivingVariablePct =
    males.length > 0 ? round2((malesWithVar.length / males.length) * 100) : 0;

  const justByCat = new Map<string, CategoryJustification>();
  for (const j of justifications) {
    justByCat.set(j.category.trim().toLowerCase(), j);
  }

  const byCategory = new Map<string, NormalizedWorker[]>();
  for (const w of norm) {
    const existing = byCategory.get(w.category);
    if (existing) existing.push(w);
    else byCategory.set(w.category, [w]);
  }

  const categories: CategoryGapResult[] = [];
  for (const [category, rows] of byCategory.entries()) {
    const catF = rows.filter((r) => r.sex === 'female');
    const catM = rows.filter((r) => r.sex === 'male');

    const fBase = computeMean(catF.map((r) => r.fteBase));
    const mBase = computeMean(catM.map((r) => r.fteBase));
    const baseGapPct = fBase !== null && mBase !== null ? computeGapPct(mBase, fBase) : null;

    const catFVarRows = catF.filter((r) => r.fteVar > 0);
    const catMVarRows = catM.filter((r) => r.fteVar > 0);
    const fVar = computeMean(catFVarRows.map((r) => r.fteVar));
    const mVar = computeMean(catMVarRows.map((r) => r.fteVar));
    const variableGapPct = fVar !== null && mVar !== null ? computeGapPct(mVar, fVar) : null;

    const fTot = computeMean(catF.map((r) => r.fteTotal));
    const mTot = computeMean(catM.map((r) => r.fteTotal));
    const totalMeanGapPct = fTot !== null && mTot !== null ? computeGapPct(mTot, fTot) : null;

    const exceedsFivePercent =
      totalMeanGapPct !== null && Math.abs(totalMeanGapPct) >= ART10_TRIGGER_GAP_PCT;

    const just = justByCat.get(category.toLowerCase());
    const justifiedByObjectiveCriteria = Boolean(just?.justifiedByObjectiveCriteria);
    const remediedWithin6Months = Boolean(just?.remediedWithin6Months);
    const justificationNote = just?.justificationNote ?? '';

    const triggersJointPayAssessment =
      exceedsFivePercent && !justifiedByObjectiveCriteria && !remediedWithin6Months;

    categories.push({
      category,
      totalCount: rows.length,
      femaleCount: catF.length,
      maleCount: catM.length,
      femaleMeanBaseEur: fBase,
      maleMeanBaseEur: mBase,
      femaleMeanVarEur: fVar,
      maleMeanVarEur: mVar,
      baseGapPct,
      variableGapPct,
      totalMeanGapPct,
      exceedsFivePercent,
      justifiedByObjectiveCriteria,
      remediedWithin6Months,
      justificationNote,
      triggersJointPayAssessment,
      smallSamplePrivacyWarning: catF.length < 3 || catM.length < 3,
    });
  }

  const triggeredCategories = categories
    .filter((c) => c.triggersJointPayAssessment)
    .map((c) => c.category);
  const smallSampleCategoriesCount = categories.filter((c) => c.smallSamplePrivacyWarning).length;

  return {
    workerCount: norm.length,
    femaleCount: females.length,
    maleCount: males.length,
    meanPayGapPct,
    medianPayGapPct,
    meanVariableGapPct,
    medianVariableGapPct,
    femaleReceivingVariablePct,
    maleReceivingVariablePct,
    quartiles: computeQuartileBands(norm),
    categories,
    anyJointPayAssessmentTriggered: triggeredCategories.length > 0,
    triggeredCategories,
    smallSampleCategoriesCount,
  };
}
