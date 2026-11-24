export type Locale = 'en' | 'ar';

export type WorkerSex = 'female' | 'male';

export type ReadinessTier = 'ready' | 'conditional' | 'blocked';

export type ReportingTier =
  | 'large_250_plus'
  | 'medium_150_249'
  | 'medium_100_149'
  | 'small_under_100';

export type ReportingFrequency =
  | 'annual'
  | 'triennial_2027'
  | 'triennial_2031'
  | 'voluntary_under_100';

export interface ReportingObligation {
  tier: ReportingTier;
  frequency: ReportingFrequency;
  firstReportDue: '2027-06-07' | '2031-06-07' | null;
  cycleYears: 1 | 3 | null;
}

export interface WorkerPayRow {
  id: string;
  category: string;
  sex: WorkerSex;
  basePayAnnualEur: number;
  variablePayAnnualEur: number;
  fteRatio: number;
}

export interface CategoryJustification {
  category: string;
  justifiedByObjectiveCriteria: boolean;
  justificationNote: string;
  remediedWithin6Months: boolean;
}

export interface JobAdCheckInput {
  roleTitle: string;
  category: string;
  currency: string;
  payMin: number;
  payMax: number;
  payPeriod: 'annual' | 'monthly' | 'hourly';
  jobAdText: string;
  asksSalaryHistory: boolean;
}

export interface PayFairAssessmentInput {
  title: string;
  employerName: string;
  memberStateIso: string;
  headcountDeclared: number;
  reportingYear: number;
  hasObjectivePayCriteriaArt6: boolean;
  hasArt7WorkflowReady: boolean;
  art7SampleRequestDate: string;
  jobAd: JobAdCheckInput;
  categoryJustifications: CategoryJustification[];
  workers: WorkerPayRow[];
}

export interface QuartileBandStat {
  quartile: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  count: number;
  minPayEur: number;
  maxPayEur: number;
  femalePct: number;
  malePct: number;
}

export interface CategoryGapResult {
  category: string;
  totalCount: number;
  femaleCount: number;
  maleCount: number;
  femaleMeanBaseEur: number | null;
  maleMeanBaseEur: number | null;
  femaleMeanVarEur: number | null;
  maleMeanVarEur: number | null;
  baseGapPct: number | null;
  variableGapPct: number | null;
  totalMeanGapPct: number | null;
  exceedsFivePercent: boolean;
  justifiedByObjectiveCriteria: boolean;
  remediedWithin6Months: boolean;
  justificationNote: string;
  triggersJointPayAssessment: boolean;
  smallSamplePrivacyWarning: boolean;
}

export interface Article9Metrics {
  workerCount: number;
  femaleCount: number;
  maleCount: number;
  meanPayGapPct: number | null;
  medianPayGapPct: number | null;
  meanVariableGapPct: number | null;
  medianVariableGapPct: number | null;
  femaleReceivingVariablePct: number;
  maleReceivingVariablePct: number;
  quartiles: QuartileBandStat[];
  categories: CategoryGapResult[];
  anyJointPayAssessmentTriggered: boolean;
  triggeredCategories: string[];
  smallSampleCategoriesCount: number;
}

export interface JobAdIssue {
  code: string;
  severity: 'error' | 'warning';
  messageEn: string;
  messageAr: string;
}

export interface JobAdCheckResult {
  passed: boolean;
  issues: JobAdIssue[];
  snippetEn: string;
  snippetAr: string;
  htmlSnippet: string;
}

export interface Article7ClockResult {
  requestDateIso: string;
  dueDateIso: string;
  maxDaysWindowLabelEn: string;
  maxDaysWindowLabelAr: string;
  letterEn: string;
  letterAr: string;
}

export interface PayFairReadinessCheck {
  id: string;
  passed: boolean;
  severity: 'blocker' | 'warning' | 'info';
  articleRef: string;
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
}

export interface PayFairAssessmentResult {
  reportingObligation: ReportingObligation;
  transpositionDeadline: '2026-06-07';
  metrics: Article9Metrics;
  jobAdAudit: JobAdCheckResult;
  article7Clock: Article7ClockResult;
  readinessScore: number;
  tier: ReadinessTier;
  blockersCount: number;
  warningsCount: number;
  checks: PayFairReadinessCheck[];
  disclaimerEn: string;
  disclaimerAr: string;
}

export interface BatchPayrollCsvSummary {
  totalInputRows: number;
  parsedWorkersCount: number;
  invalidRowsCount: number;
  invalidNotes: string[];
  workers: WorkerPayRow[];
  metrics: Article9Metrics;
}
