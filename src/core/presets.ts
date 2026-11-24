import type { PayFairAssessmentInput, WorkerPayRow } from './types.ts';

export interface PayFairPreset {
  id: string;
  labelEn: string;
  labelAr: string;
  summaryEn: string;
  summaryAr: string;
  data: PayFairAssessmentInput;
}

const BALANCED_TECH_WORKERS: WorkerPayRow[] = [
  { id: 'T-01', category: 'Software Engineering L2', sex: 'female', basePayAnnualEur: 68500, variablePayAnnualEur: 4800, fteRatio: 1 },
  { id: 'T-02', category: 'Software Engineering L2', sex: 'female', basePayAnnualEur: 67200, variablePayAnnualEur: 4500, fteRatio: 1 },
  { id: 'T-03', category: 'Software Engineering L2', sex: 'female', basePayAnnualEur: 54400, variablePayAnnualEur: 3600, fteRatio: 0.8 },
  { id: 'T-04', category: 'Software Engineering L2', sex: 'male', basePayAnnualEur: 69000, variablePayAnnualEur: 4700, fteRatio: 1 },
  { id: 'T-05', category: 'Software Engineering L2', sex: 'male', basePayAnnualEur: 68200, variablePayAnnualEur: 4600, fteRatio: 1 },
  { id: 'T-06', category: 'Software Engineering L2', sex: 'male', basePayAnnualEur: 68800, variablePayAnnualEur: 4500, fteRatio: 1 },
  { id: 'P-01', category: 'Product Operations', sex: 'female', basePayAnnualEur: 52500, variablePayAnnualEur: 2400, fteRatio: 1 },
  { id: 'P-02', category: 'Product Operations', sex: 'female', basePayAnnualEur: 53000, variablePayAnnualEur: 2600, fteRatio: 1 },
  { id: 'P-03', category: 'Product Operations', sex: 'female', basePayAnnualEur: 52000, variablePayAnnualEur: 2500, fteRatio: 1 },
  { id: 'P-04', category: 'Product Operations', sex: 'male', basePayAnnualEur: 52800, variablePayAnnualEur: 2550, fteRatio: 1 },
  { id: 'P-05', category: 'Product Operations', sex: 'male', basePayAnnualEur: 53100, variablePayAnnualEur: 2450, fteRatio: 1 },
  { id: 'P-06', category: 'Product Operations', sex: 'male', basePayAnnualEur: 52600, variablePayAnnualEur: 2500, fteRatio: 1 },
];

const CONDITIONAL_JUSTIFIED_WORKERS: WorkerPayRow[] = [
  { id: 'M-01', category: 'Supply Chain Planners', sex: 'female', basePayAnnualEur: 46000, variablePayAnnualEur: 2000, fteRatio: 1 },
  { id: 'M-02', category: 'Supply Chain Planners', sex: 'female', basePayAnnualEur: 47000, variablePayAnnualEur: 2000, fteRatio: 1 },
  { id: 'M-03', category: 'Supply Chain Planners', sex: 'male', basePayAnnualEur: 51500, variablePayAnnualEur: 3500, fteRatio: 1 },
  { id: 'M-04', category: 'Supply Chain Planners', sex: 'male', basePayAnnualEur: 52000, variablePayAnnualEur: 3500, fteRatio: 1 },
  { id: 'M-05', category: 'Supply Chain Planners', sex: 'male', basePayAnnualEur: 51000, variablePayAnnualEur: 3000, fteRatio: 1 },
];

const BLOCKED_ENTERPRISE_WORKERS: WorkerPayRow[] = [
  { id: 'E-01', category: 'Enterprise Sales', sex: 'female', basePayAnnualEur: 56000, variablePayAnnualEur: 6000, fteRatio: 1 },
  { id: 'E-02', category: 'Enterprise Sales', sex: 'female', basePayAnnualEur: 57000, variablePayAnnualEur: 6500, fteRatio: 1 },
  { id: 'E-03', category: 'Enterprise Sales', sex: 'female', basePayAnnualEur: 55000, variablePayAnnualEur: 5500, fteRatio: 1 },
  { id: 'E-04', category: 'Enterprise Sales', sex: 'male', basePayAnnualEur: 66000, variablePayAnnualEur: 12000, fteRatio: 1 },
  { id: 'E-05', category: 'Enterprise Sales', sex: 'male', basePayAnnualEur: 68000, variablePayAnnualEur: 13000, fteRatio: 1 },
  { id: 'E-06', category: 'Enterprise Sales', sex: 'male', basePayAnnualEur: 67000, variablePayAnnualEur: 12500, fteRatio: 1 },
  { id: 'F-01', category: 'Finance Controlling', sex: 'female', basePayAnnualEur: 59000, variablePayAnnualEur: 3000, fteRatio: 1 },
  { id: 'F-02', category: 'Finance Controlling', sex: 'female', basePayAnnualEur: 60000, variablePayAnnualEur: 3200, fteRatio: 1 },
  { id: 'F-03', category: 'Finance Controlling', sex: 'female', basePayAnnualEur: 59500, variablePayAnnualEur: 3100, fteRatio: 1 },
  { id: 'F-04', category: 'Finance Controlling', sex: 'male', basePayAnnualEur: 60100, variablePayAnnualEur: 3150, fteRatio: 1 },
  { id: 'F-05', category: 'Finance Controlling', sex: 'male', basePayAnnualEur: 59800, variablePayAnnualEur: 3100, fteRatio: 1 },
  { id: 'F-06', category: 'Finance Controlling', sex: 'male', basePayAnnualEur: 60200, variablePayAnnualEur: 3200, fteRatio: 1 },
];

export const PAYFAIR_PRESETS: PayFairPreset[] = [
  {
    id: 'preset-nordic-tech-ready',
    labelEn: 'Helsinki SaaS GmbH (320 staff · Ready Annual 2027)',
    labelAr: 'شركة تقنية في هلسنكي (320 موظفاً · جاهز لتقرير 2027 السنوي)',
    summaryEn: 'Gap < 1% across FTE-adjusted Engineering & Product Ops, transparent Art. 5 range, and GDPR k-anonymity clean.',
    summaryAr: 'فجوة أقل من 1% بعد تطبيع FTE عبر الفئات، إعلان وظيفة مطابق للمادة 5، وحماية الخصوصية مكتملة.',
    data: {
      title: 'Nordic Cloud Systems Oy — 2026 Pay Transparency Audit',
      employerName: 'Nordic Cloud Systems Oy',
      memberStateIso: 'FI',
      headcountDeclared: 320,
      reportingYear: 2026,
      hasObjectivePayCriteriaArt6: true,
      hasArt7WorkflowReady: true,
      art7SampleRequestDate: '2026-08-15',
      jobAd: {
        roleTitle: 'Senior Backend Engineer',
        category: 'Software Engineering L2',
        currency: 'EUR',
        payMin: 66000,
        payMax: 75000,
        payPeriod: 'annual',
        jobAdText: 'Starting annual gross base salary EUR 66,000–75,000 based on technical architecture depth and seniority.',
        asksSalaryHistory: false,
      },
      categoryJustifications: [],
      workers: BALANCED_TECH_WORKERS,
    },
  },
  {
    id: 'preset-midsize-justified-conditional',
    labelEn: 'Lyon Logistics SAS (175 staff · Triennial · Objective Justification)',
    labelAr: 'شركة لوجستية في ليون (175 موظفاً · كل 3 سنوات · تبرير موضوعي)',
    summaryEn: 'Category gap > 5% justified via verifiable senior tenure criteria; triggers GDPR small-cohort (< 3 females) redaction warning.',
    summaryAr: 'فجوة فئة التخطيط مبررة بأقدمية موثّقة (لا يتفعّل مـ 10)، مع تنبيه خصوصية الخلية الصغيرة (< 3 إناث).',
    data: {
      title: 'Rhone Supply Chain SAS — Triennial Art. 9 Cycle',
      employerName: 'Rhone Supply Chain SAS',
      memberStateIso: 'FR',
      headcountDeclared: 175,
      reportingYear: 2026,
      hasObjectivePayCriteriaArt6: true,
      hasArt7WorkflowReady: true,
      art7SampleRequestDate: '2026-12-31',
      jobAd: {
        roleTitle: 'Logistics Network Planner',
        category: 'Supply Chain Planners',
        currency: 'EUR',
        payMin: 46000,
        payMax: 54000,
        payPeriod: 'annual',
        jobAdText: 'Starting range EUR 46,000–54,000 aligned with European logistics band benchmarks.',
        asksSalaryHistory: false,
      },
      categoryJustifications: [
        {
          category: 'Supply Chain Planners',
          justifiedByObjectiveCriteria: true,
          justificationNote: 'Audited objective APICS certification & +7 years senior shift responsibility differential.',
          remediedWithin6Months: false,
        },
      ],
      workers: CONDITIONAL_JUSTIFIED_WORKERS,
    },
  },
  {
    id: 'preset-enterprise-art10-blocked',
    labelEn: 'Frankfurt Enterprise AG (410 staff · Blocked · Art. 10 Trigger)',
    labelAr: 'مؤسسة في فرانكفورت (410 موظفين · محظور · تفعيل المادة 10)',
    summaryEn: 'Unjustified 21%+ Enterprise Sales gap triggers Art. 10 Joint Pay Assessment, plus banned salary-history question under Art. 5.',
    summaryAr: 'فجوة تتجاوز 21% في المبيعات دون تبرير تفعّل التقييم المشترك مـ 10، مع سؤال راتب سابق محظور مـ 5.',
    data: {
      title: 'Rheinland Commercial AG — Pre-Audit Remediation Needed',
      employerName: 'Rheinland Commercial AG',
      memberStateIso: 'DE',
      headcountDeclared: 410,
      reportingYear: 2026,
      hasObjectivePayCriteriaArt6: false,
      hasArt7WorkflowReady: false,
      art7SampleRequestDate: '2026-09-10',
      jobAd: {
        roleTitle: 'Account Salesman (Commercial)',
        category: 'Enterprise Sales',
        currency: 'EUR',
        payMin: 0,
        payMax: 0,
        payPeriod: 'annual',
        jobAdText: 'Competitive salary commensurate with your previous salary history.',
        asksSalaryHistory: true,
      },
      categoryJustifications: [
        {
          category: 'Enterprise Sales',
          justifiedByObjectiveCriteria: false,
          justificationNote: '',
          remediedWithin6Months: false,
        },
      ],
      workers: BLOCKED_ENTERPRISE_WORKERS,
    },
  },
];

export const SAMPLE_PAYROLL_CSV = [
  'worker_id,category,sex,base_pay_eur,variable_pay_eur,fte_ratio',
  'EMP-01,Software Engineering L2,F,68500,4800,1.0',
  'EMP-02,Software Engineering L2,Female,54400,3600,0.8',
  'EMP-03,Software Engineering L2,Female,67800,4600,1.0',
  'EMP-04,Software Engineering L2,M,69000,4700,1.0',
  'EMP-05,Software Engineering L2,Male,68200,4600,1.0',
  'EMP-06,Software Engineering L2,Male,68800,4500,1.0',
  'EMP-07,Enterprise Sales,F,56000,6000,1.0',
  'EMP-08,Enterprise Sales,F,57000,6500,1.0',
  'EMP-09,Enterprise Sales,F,55000,5500,1.0',
  'EMP-10,Enterprise Sales,M,66000,12000,1.0',
  'EMP-11,Enterprise Sales,M,68000,13000,1.0',
  'EMP-12,Enterprise Sales,M,67000,12500,1.0',
  'EMP-13,Finance Controlling,F,59500,3100,1.0',
  'EMP-14,Finance Controlling,F,60000,3200,1.0',
  'EMP-15,Finance Controlling,M,59800,3100,1.0',
  'EMP-16,Finance Controlling,M,60200,3200,1.0',
].join('\n');
