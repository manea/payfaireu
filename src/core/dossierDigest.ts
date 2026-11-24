import type { Locale, PayFairAssessmentInput, PayFairAssessmentResult } from './types.ts';

function canonicalSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalSort((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(n: number, bits: number): number {
  return (n >>> bits) | (n << (32 - bits));
}

function pureSha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;

  const dv = new DataView(buf.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      W[t] = dv.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const w15 = W[t - 15] ?? 0;
      const w2 = W[t - 2] ?? 0;
      const w16 = W[t - 16] ?? 0;
      const w7 = W[t - 7] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[t] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = H[0] ?? 0;
    let b = H[1] ?? 0;
    let c = H[2] ?? 0;
    let d = H[3] ?? 0;
    let e = H[4] ?? 0;
    let f = H[5] ?? 0;
    let g = H[6] ?? 0;
    let h = H[7] ?? 0;

    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (K[t] ?? 0) + (W[t] ?? 0)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = ((H[0] ?? 0) + a) >>> 0;
    H[1] = ((H[1] ?? 0) + b) >>> 0;
    H[2] = ((H[2] ?? 0) + c) >>> 0;
    H[3] = ((H[3] ?? 0) + d) >>> 0;
    H[4] = ((H[4] ?? 0) + e) >>> 0;
    H[5] = ((H[5] ?? 0) + f) >>> 0;
    H[6] = ((H[6] ?? 0) + g) >>> 0;
    H[7] = ((H[7] ?? 0) + h) >>> 0;
  }

  return Array.from(H)
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

export async function sha256Hex(payload: unknown): Promise<string> {
  const canonical = JSON.stringify(canonicalSort(payload));
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const bytes = new TextEncoder().encode(canonical);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return pureSha256Hex(canonical);
}

export function sha256SyncHex(payload: unknown): string {
  return pureSha256Hex(JSON.stringify(canonicalSort(payload)));
}

export function buildCanonicalDigestPayload(
  input: PayFairAssessmentInput,
  result: PayFairAssessmentResult,
): Record<string, unknown> {
  return {
    schema: 'payfaireu.directive2023_970.v1',
    employerName: input.employerName,
    memberStateIso: input.memberStateIso,
    headcountDeclared: input.headcountDeclared,
    reportingYear: input.reportingYear,
    reportingFrequency: result.reportingObligation.frequency,
    workerCount: result.metrics.workerCount,
    meanPayGapPct: result.metrics.meanPayGapPct,
    medianPayGapPct: result.metrics.medianPayGapPct,
    anyJointPayAssessmentTriggered: result.metrics.anyJointPayAssessmentTriggered,
    tier: result.tier,
  };
}

export async function computePayFairDigest(
  input: PayFairAssessmentInput,
  result: PayFairAssessmentResult,
): Promise<string> {
  return sha256Hex(buildCanonicalDigestPayload(input, result));
}

export function buildJointAssessmentNotice(
  input: PayFairAssessmentInput,
  result: PayFairAssessmentResult,
  locale: Locale,
): string {
  const cats = result.metrics.triggeredCategories;
  if (locale === 'ar') {
    if (cats.length === 0) {
      return `لا ينطبق التقييم المشترك للأجور (المادة 10) حالياً على منشأة ${input.employerName}؛ لم تستوفِ أي فئة وظيفية الشروط الثلاثة (>= 5% وبلا تبرير موضوعي وعدم التصحيح خلال 6 أشهر).`;
    }
    return `إشعار بدء التقييم المشترك للأجور (Directive (EU) 2023/970 — المادة 10) — ${input.employerName}

تم رصد فجوة متوسط أجر تساوي أو تتجاوز 5% دون تبرير موضوعي محايد أو تصحيح خلال 6 أشهر في الفئات التالية: ${cats.join('، ')}.
الخطوات الإلزامية بالتعاون مع ممثلي العمال:
1. تحليل مفصّل لنسبة النساء والرجال وبنية الأجر الأساسي والمتغيّر في الفئات المتأثرة.
2. فحص معايير التقييم والتصنيف الوظيفي للتأكد من خلوها من التمييز غير المباشر.
3. وضع خطة عمل تصحيحية بجدول زمني محدد ومشاركة النتائج مع العمال وهيئة المساواة الوطنية.`;
  }

  if (cats.length === 0) {
    return `No Article 10 Joint Pay Assessment triggered for ${input.employerName}: zero worker categories meet all three cumulative triggers (>= 5.0% mean gap, unjustified by objective gender-neutral criteria, unremedied within 6 months).`;
  }

  return `Article 10 Joint Pay Assessment Trigger Notice (Directive (EU) 2023/970) — ${input.employerName}

Triggered worker category(ies): ${cats.join(', ')}

Mandatory Joint Steps with Worker Representatives:
1. Analyse female/male composition and base vs complementary/variable pay differences in triggered categories.
2. Audit job evaluation and classification systems against objective, gender-neutral criteria.
3. Implement a binding remediation action plan with timelines and communicate results to employees and equality bodies.`;
}

export function buildPayFairBriefMarkdown(
  input: PayFairAssessmentInput,
  result: PayFairAssessmentResult,
  locale: Locale,
  sha256: string,
  dossierCode = 'DRAFT',
): string {
  const code = dossierCode || 'DRAFT';
  const catRows = result.metrics.categories
    .map(
      (c) =>
        `| ${c.category} | ${c.totalCount} (${c.femaleCount}F/${c.maleCount}M) | ${c.baseGapPct ?? 'N/A'}% | ${c.variableGapPct ?? 'N/A'}% | ${c.totalMeanGapPct ?? 'N/A'}% | ${c.triggersJointPayAssessment ? 'ART10_TRIGGER' : 'OK'} |`,
    )
    .join('\n');

  if (locale === 'ar') {
    return `# موجز جاهزية شفافية الأجور الأوروبية EU Pay Transparency — ${code}

- **رقم الملف**: \`${code}\`
- **صاحب العمل**: ${input.employerName} (${input.memberStateIso} · الموظفون المصرّح بهم: ${input.headcountDeclared})
- **جدول التبليغ (المادة 9)**: \`${result.reportingObligation.frequency}\` (أول استحقاق: \`${result.reportingObligation.firstReportDue ?? 'غير ملزم أوروبياً'}\`)
- **موعد التحويل الوطني (المادة 34)**: \`${result.transpositionDeadline}\`
- **فجوة الأجر الإجمالي (المتوسط / الوسيط)**: \`${result.metrics.meanPayGapPct ?? 'N/A'}%\` / \`${result.metrics.medianPayGapPct ?? 'N/A'}%\`
- **فجوة المتغيّر (المتوسط / الوسيط)**: \`${result.metrics.meanVariableGapPct ?? 'N/A'}%\` / \`${result.metrics.medianVariableGapPct ?? 'N/A'}%\`
- **التقييم والدرجة**: **${result.readinessScore}/100** (\`${result.tier}\`)
- **ختم SHA-256**: \`${sha256}\`

| الفئة الوظيفية | العدد (F/M) | فجوة الأساسي | فجوة المتغيّر | الفجوة الإجمالية | محفز مـ 10 |
| :--- | :---: | :---: | :---: | :---: | :---: |
${catRows}

---
> **إخلاء قانوني**: ${result.disclaimerAr}`;
  }

  return `# EU Pay Transparency Directive ((EU) 2023/970) Dossier — ${code}

- **Dossier Code**: \`${code}\`
- **Employer**: ${input.employerName} (${input.memberStateIso} · Headcount: ${input.headcountDeclared})
- **Art. 9 Reporting Tier**: \`${result.reportingObligation.frequency}\` (First report due: \`${result.reportingObligation.firstReportDue ?? 'Voluntary <100'}\`)
- **Transposition Deadline (Art. 34)**: \`${result.transpositionDeadline}\`
- **Total Gender Pay Gap (Mean / Median)**: \`${result.metrics.meanPayGapPct ?? 'N/A'}%\` / \`${result.metrics.medianPayGapPct ?? 'N/A'}%\`
- **Variable Pay Gap (Mean / Median)**: \`${result.metrics.meanVariableGapPct ?? 'N/A'}%\` / \`${result.metrics.medianVariableGapPct ?? 'N/A'}%\`
- **Readiness Score & Tier**: **${result.readinessScore}/100** (\`${result.tier}\`)
- **Canonical SHA-256 Seal**: \`${sha256}\`

| Category | Workers (F/M) | Base Gap | Variable Gap | Total Gap | Art. 10 Trigger |
| :--- | :---: | :---: | :---: | :---: | :---: |
${catRows}

---
> **Legal Disclaimer**: ${result.disclaimerEn}`;
}
