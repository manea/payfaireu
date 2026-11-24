import { auditArticle5JobAd, computeArticle7Deadline } from './jobAdAndArt7.ts';
import {
  EU_PAY_TRANSPARENCY_TRANSPOSITION_DATE,
  classifyReportingObligation,
  computeArticle9Metrics,
} from './payGapEngine.ts';
import type {
  PayFairAssessmentInput,
  PayFairAssessmentResult,
  PayFairReadinessCheck,
  ReadinessTier,
} from './types.ts';

export function assessPayFairEu(input: PayFairAssessmentInput): PayFairAssessmentResult {
  const reportingObligation = classifyReportingObligation(input.headcountDeclared);
  const metrics = computeArticle9Metrics(input.workers, input.categoryJustifications);
  const jobAdAudit = auditArticle5JobAd(input.jobAd);
  const article7Clock = computeArticle7Deadline(
    input.art7SampleRequestDate,
    input.employerName || 'Employer',
    metrics,
    input.jobAd.category,
  );

  const missingDataCohort =
    metrics.workerCount === 0 || metrics.femaleCount === 0 || metrics.maleCount === 0;

  const checks: PayFairReadinessCheck[] = [
    {
      id: 'art5-job-posting',
      passed: jobAdAudit.passed,
      severity: 'blocker',
      articleRef: 'Directive (EU) 2023/970 Art. 5',
      titleEn: 'Pre-Employment Pay Range Disclosed & Salary History Ban Honored',
      titleAr: 'إفصاح نطاق الأجر قبل التوظيف وحظر سؤال الراتب السابق (مـ 5)',
      detailEn: jobAdAudit.passed
        ? 'Job ad specifies a valid transparent pay band without salary-history requests or gendered language.'
        : `${jobAdAudit.issues.length} Article 5 finding(s) detected in vacancy announcement.`,
      detailAr: jobAdAudit.passed
        ? 'إعلان الوظيفة يلتزم بالنطاق الأجري الصريح وخالٍ من سؤال الراتب السابق والمسميات الجندرية.'
        : `رُصد ${jobAdAudit.issues.length} ملاحظة مخالفة للمادة 5 في إعلان الوظيفة.`,
    },
    {
      id: 'art6-progression-criteria',
      passed: input.hasObjectivePayCriteriaArt6,
      severity: 'blocker',
      articleRef: 'Art. 6 & Art. 4',
      titleEn: 'Objective, Gender-Neutral Pay Setting & Progression Criteria Established',
      titleAr: 'معايير موضوعية ومحايدة جنسياً لتحديد الأجر والتدرج (مـ 4 و6)',
      detailEn: input.hasObjectivePayCriteriaArt6
        ? 'Accessible objective pay-progression policy recorded.'
        : 'Employers must define and make accessible objective, gender-neutral pay criteria.',
      detailAr: input.hasObjectivePayCriteriaArt6
        ? 'سياسة معايير التدرج وتحديد الأجر الموضوعية موثّقة ومتاحة للعمال.'
        : 'يجب توثيق معايير التدرج الأجري المحايدة وإتاحتها للموظفين بسهولة.',
    },
    {
      id: 'art7-info-workflow',
      passed: input.hasArt7WorkflowReady,
      severity: 'warning',
      articleRef: 'Art. 7(1)–(5)',
      titleEn: 'Article 7 Employee Pay Information Workflow Ready (<= 2 Months SLA)',
      titleAr: 'مسار الرد على طلبات المعلومات الفردية خلال شهرين جاهز (مـ 7)',
      detailEn: input.hasArt7WorkflowReady
        ? `Written category pay-level template responds before ${article7Clock.dueDateIso}.`
        : `Enable written response workflow before ${article7Clock.dueDateIso} deadline.`,
      detailAr: input.hasArt7WorkflowReady
        ? `نموذج الرد الكتابي يغطي المهلة قبل ${article7Clock.dueDateIso}.`
        : `فعّل مسار الرد الكتابي الملتزم بمهلة شهرين (${article7Clock.dueDateIso}).`,
    },
    {
      id: 'art9-reporting-dataset',
      passed: !missingDataCohort,
      severity: 'blocker',
      articleRef: 'Art. 9(1)(a)–(g)',
      titleEn: 'Article 9 Gender Pay Gap & Quartile Dataset Complete',
      titleAr: 'اكتمال بيانات مؤشرات المادة 9 السبعة والشرائح الرُبعية Q1–Q4',
      detailEn: !missingDataCohort
        ? `${metrics.workerCount} FTE-normalized records analyzed (Mean gap: ${metrics.meanPayGapPct ?? 'N/A'}%, Median: ${metrics.medianPayGapPct ?? 'N/A'}%).`
        : 'Both female and male worker pay rows are required to compute Article 9 gaps.',
      detailAr: !missingDataCohort
        ? `تم تحليل ${metrics.workerCount} سجلاً مطبعاً لـ FTE (فجوة المتوسط: ${metrics.meanPayGapPct ?? 'N/A'}% · الوسيط: ${metrics.medianPayGapPct ?? 'N/A'}%).`
        : 'يلزم إدخال بيانات إناث وذكور لحساب فجوات المادة 9.',
    },
    {
      id: 'art10-joint-assessment-trigger',
      passed: !metrics.anyJointPayAssessmentTriggered,
      severity: 'blocker',
      articleRef: 'Art. 10(1)',
      titleEn: 'No Unjustified >= 5% Category Gap Triggering Joint Pay Assessment',
      titleAr: 'عدم تفعيل محفّز التقييم المشترك >= 5% دون تبرير أو معالجة (مـ 10)',
      detailEn: !metrics.anyJointPayAssessmentTriggered
        ? 'No worker category meets all 3 cumulative Art. 10 trigger criteria (>= 5%, unjustified, unremedied within 6 months).'
        : `Art. 10 Joint Pay Assessment triggered in ${metrics.triggeredCategories.length} category(ies): ${metrics.triggeredCategories.join(', ')}.`,
      detailAr: !metrics.anyJointPayAssessmentTriggered
        ? 'لا توجد فئة وظيفية تستوفي شروط محفز التقييم المشترك الثلاثة (>= 5% بلا تبرير أو تصحيح خلال 6 أشهر).'
        : `تفعّل التقييم المشترك (المادة 10) في ${metrics.triggeredCategories.length} فئة: ${metrics.triggeredCategories.join('، ')}.`,
    },
    {
      id: 'gdpr-small-cell-privacy',
      passed: metrics.smallSampleCategoriesCount === 0,
      severity: 'warning',
      articleRef: 'Art. 7(5), Art. 12 & GDPR',
      titleEn: 'Small-Cohort Cell Privacy Guard (>= 3 Workers per Sex in Categories)',
      titleAr: 'حماية خصوصية الخلايا الصغيرة (3 موظفين فأكثر لكل جنس بالفئة)',
      detailEn:
        metrics.smallSampleCategoriesCount === 0
          ? 'All worker categories meet >= 3 per sex k-anonymity floor.'
          : `${metrics.smallSampleCategoriesCount} category(ies) hold < 3 workers in one sex cohort — redact public/employee disclosure.`,
      detailAr:
        metrics.smallSampleCategoriesCount === 0
          ? 'جميع الفئات الوظيفية تضم 3 موظفين على الأقل لكل جنس.'
          : `${metrics.smallSampleCategoriesCount} فئة تضم أقل من 3 موظفين لأحد الجنسين — احجب التفاصيل الفردية.`,
    },
  ];

  const blockersCount = checks.filter((c) => !c.passed && c.severity === 'blocker').length;
  const warningsCount = checks.filter((c) => !c.passed && c.severity === 'warning').length;

  let score = 100;
  score -= blockersCount * 25;
  score -= warningsCount * 10;
  score = Math.max(0, Math.min(100, score));

  const tier: ReadinessTier =
    blockersCount > 0 ? 'blocked' : warningsCount > 0 ? 'conditional' : 'ready';

  return {
    reportingObligation,
    transpositionDeadline: EU_PAY_TRANSPARENCY_TRANSPOSITION_DATE,
    metrics,
    jobAdAudit,
    article7Clock,
    readinessScore: score,
    tier,
    blockersCount,
    warningsCount,
    checks,
    disclaimerEn:
      'Statistical & HR pre-flight analyzer only under Directive (EU) 2023/970. Does NOT constitute labour law counsel, certified payroll auditing, or an official national equality body filing.',
    disclaimerAr:
      'أداة تحليل إحصائية ومساعدة للجاهزية فقط وفق التوجيه الأوروبي (EU) 2023/970؛ لا تُعد استشارة قانونية عمالية ولا بديلاً عن التدقيق الرسمي أو التقديم لهيئة المساواة الوطنية.',
  };
}
