import type {
  Article7ClockResult,
  Article9Metrics,
  JobAdCheckInput,
  JobAdCheckResult,
  JobAdIssue,
} from './types.ts';

export function escapeHtml(str: string): string {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function auditArticle5JobAd(jobAd: JobAdCheckInput): JobAdCheckResult {
  const issues: JobAdIssue[] = [];
  const roleTitle = (jobAd.roleTitle || '').trim() || 'Open Position';
  const currency = (jobAd.currency || 'EUR').trim().toUpperCase() || 'EUR';
  const payMin = Number(jobAd.payMin) || 0;
  const payMax = Number(jobAd.payMax) || 0;
  const text = jobAd.jobAdText || '';

  if (payMin <= 0 || payMax < payMin) {
    issues.push({
      code: 'ART5_MISSING_OR_INVALID_RANGE',
      severity: 'error',
      messageEn:
        'Article 5(1) requires disclosing an initial pay level or range (min > 0 and max >= min) before interview.',
      messageAr:
        'المادة 5(1) تشترط الإفصاح عن الأجر الأولي أو النطاق الأجري (حد أدنى > 0 وأقصى >= الأدنى) قبل المقابلة.',
    });
  }

  if (jobAd.asksSalaryHistory) {
    issues.push({
      code: 'ART5_SALARY_HISTORY_BANNED',
      severity: 'error',
      messageEn:
        'Article 5(2) strictly prohibits asking applicants about current or prior remuneration history.',
      messageAr:
        'المادة 5(2) تحظر تماماً سؤال المتقدمين عن رواتبهم الحالية أو السابقة.',
    });
  }

  if (/previous salary|salary history|current salary|current compensation|last salary|الراتب السابق|راتبك الحالي/i.test(text)) {
    issues.push({
      code: 'ART5_TEXT_SALARY_HISTORY_PHRASE',
      severity: 'error',
      messageEn:
        'Job ad text contains a prohibited salary-history request phrase (Article 5(2)).',
      messageAr:
        'يتضمن نص الإعلان عبارة محظورة تطلب كشف الراتب السابق أو الحالي (المادة 5(2)).',
    });
  }

  if (/competitive salary|salary commensurate|negotiable salary|market rate salary|راتب تنافسي|حسب الكفاءة/i.test(text)) {
    issues.push({
      code: 'ART5_VAGUE_PAY_PHRASE',
      severity: 'warning',
      messageEn:
        'Replace vague wording ("competitive / commensurate salary") with explicit pay numbers.',
      messageAr:
        'استبدل العبارات المبهمة ("راتب تنافسي") بأرقام نطاق الأجر الصريحة.',
    });
  }

  if (/\b(salesman|saleswoman|chairman|chairwoman|waitress|businessman|businesswoman|manpower)\b|he\/she\s+only/i.test(text)) {
    issues.push({
      code: 'ART5_GENDERED_TITLE',
      severity: 'error',
      messageEn:
        'Article 5(3) requires job vacancy notices and job titles to be gender-neutral.',
      messageAr:
        'المادة 5(3) تلزم بأن تكون المسميات الوظيفية ونصوص الإعلان محايدة جنسياً.',
    });
  }

  const periodLabelsEn: Record<JobAdCheckInput['payPeriod'], string> = {
    annual: 'per year (gross)',
    monthly: 'per month (gross)',
    hourly: 'per hour (gross)',
  };
  const periodLabelsAr: Record<JobAdCheckInput['payPeriod'], string> = {
    annual: 'سنوياً (إجمالي)',
    monthly: 'شهرياً (إجمالي)',
    hourly: 'في الساعة (إجمالي)',
  };

  const rangeStr =
    payMin > 0 && payMax >= payMin
      ? `${payMin.toLocaleString('en-US')}–${payMax.toLocaleString('en-US')} ${currency}`
      : `[TBD MIN–MAX ${currency}]`;

  const snippetEn = `Pay Transparency Notice (Directive (EU) 2023/970 Art. 5): For the role "${roleTitle}", the objective starting pay range is ${rangeStr} ${periodLabelsEn[jobAd.payPeriod]}, determined strictly by experience and role scope. We never request salary history.`;
  const snippetAr = `إشعار شفافية الأجر (التوجيه الأوروبي 2023/970 مـ 5): لوظيفة «${roleTitle}»، يتراوح الأجر الابتدائي المحدد موضوعياً بين ${rangeStr} ${periodLabelsAr[jobAd.payPeriod]} وفق الخبرة ونطاق العمل، ولا نطلب أي إفصاح عن الراتب السابق.`;

  const htmlSnippet = `<section data-payfaireu-art5="true" style="border:1px solid #cbd5e1;padding:12px 16px;border-radius:8px;font-family:sans-serif">
  <strong>${escapeHtml(roleTitle)} — Transparent Pay Band</strong>
  <p>Starting compensation: <strong>${escapeHtml(rangeStr)}</strong> (${escapeHtml(periodLabelsEn[jobAd.payPeriod])}). Compensation decisions follow objective, gender-neutral criteria under Directive (EU) 2023/970. Prior salary history is not requested.</p>
</section>`;

  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    passed: !hasErrors,
    issues,
    snippetEn,
    snippetAr,
    htmlSnippet,
  };
}

export function addTwoCalendarMonthsIso(requestDateIso: string): {
  normalizedRequestIso: string;
  dueDateIso: string;
} {
  const m = String(requestDateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const d = m ? Number(m[3]) : now.getUTCDate();

  const normalizedRequestIso = `${String(y).padStart(4, '0')}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const totalMonths = mo + 2;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(d, maxDayInTargetMonth);

  const dueDateIso = `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  return { normalizedRequestIso, dueDateIso };
}

export function computeArticle7Deadline(
  requestDateIso: string,
  employerName = 'Employer',
  metrics?: Article9Metrics,
  requestedCategory = '',
): Article7ClockResult {
  const { normalizedRequestIso, dueDateIso } = addTwoCalendarMonthsIso(requestDateIso);

  const catObj =
    metrics?.categories.find(
      (c) => c.category.toLowerCase() === requestedCategory.trim().toLowerCase(),
    ) || metrics?.categories[0];

  let payBreakdownEn = '- No workforce category loaded yet.';
  let payBreakdownAr = '- لم تُدرج فئة وظيفية للعرض بعد.';

  if (catObj) {
    if (catObj.smallSamplePrivacyWarning) {
      payBreakdownEn = `- Category "${catObj.category}": Exact sex-disaggregated averages suppressed under GDPR k-anonymity guard (< 3 workers per sex cohort); consult Member State equality body proxy channel under Art. 7(5).`;
      payBreakdownAr = `- الفئة "${catObj.category}": تم حجب المتوسطات المفصّلة حسب الجنس امتثالاً لحماية الخصوصية (< 3 موظفين في أحد الجنسين) وتُقدّم عند الاقتضاء عبر هيئة المساواة أو ممثلي العمال (مـ 7/5).`;
    } else {
      payBreakdownEn = `- Category "${catObj.category}" FTE Mean Base Pay: Female EUR ${catObj.femaleMeanBaseEur?.toLocaleString('en-US') ?? 'N/A'} | Male EUR ${catObj.maleMeanBaseEur?.toLocaleString('en-US') ?? 'N/A'} (Total Mean Gap: ${catObj.totalMeanGapPct !== null ? `${catObj.totalMeanGapPct}%` : 'N/A'}).`;
      payBreakdownAr = `- الفئة "${catObj.category}" — متوسط الأجر الأساسي المعادل بدوام كامل (FTE): الإناث EUR ${catObj.femaleMeanBaseEur?.toLocaleString('en-US') ?? 'N/A'} | الذكور EUR ${catObj.maleMeanBaseEur?.toLocaleString('en-US') ?? 'N/A'} (فجوة المتوسط الإجمالي: ${catObj.totalMeanGapPct !== null ? `${catObj.totalMeanGapPct}%` : 'N/A'}).`;
    }
  }

  const letterEn = `Subject: Article 7 Pay Information Response — Due ${dueDateIso} (Request ${normalizedRequestIso})

Dear Colleague,

In accordance with Article 7 of Directive (EU) 2023/970, ${employerName} provides written information on your individual pay level and average pay levels broken down by sex for workers performing the same work or work of equal value, within the statutory 2-month window ending ${dueDateIso}:

${payBreakdownEn}

Reminder: Under Article 7(5), no contractual pay-secrecy clause restricts you from disclosing your remuneration for the purpose of enforcing equal pay rights.`;

  const letterAr = `الموضوع: رد حق الموظف في المعلومات الأجرية (المادة 7 — الموعد الأقصى ${dueDateIso} عن طلب ${normalizedRequestIso})

تحية طيبة وبعد،

تنفيذاً للمادة 7 من التوجيه الأوروبي (EU) 2023/970، يزوّدكم (${employerName}) كتابياً بمستوى أجركم الفردي ومتوسطات الأجور المصنّفة حسب الجنس للفئة المماثلة أو ذات القيمة المتساوية خلال المهلة القانونية البالغة شهرين (حد أقصى ${dueDateIso}):

${payBreakdownAr}

تنويه: وفق المادة 7(5)، لا يجوز تقييد العامل بأي شرط سرية أجر يحول دون إنفاذ حقوق المساواة في الأجر.`;

  return {
    requestDateIso: normalizedRequestIso,
    dueDateIso,
    maxDaysWindowLabelEn: 'Max 2 calendar months from written request (Art. 7(4))',
    maxDaysWindowLabelAr: 'مهلة قصوى شهران تقويميان من تاريخ الطلب الكتابي (المادة 7/4)',
    letterEn,
    letterAr,
  };
}
