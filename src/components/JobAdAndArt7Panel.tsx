import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileCode2,
} from 'lucide-react';
import { buildJointAssessmentNotice } from '../core/dossierDigest.ts';
import type { JobAdCheckInput, Locale, PayFairAssessmentInput } from '../core/types.ts';
import {
  downloadArt10NoticeMarkdown,
  downloadArt7DraftMarkdown,
  downloadJobAdHtmlSnippet,
  type UiPayFairDossier,
} from '../lib/api.ts';
import { getLabels, isolateLtr } from '../lib/i18n.ts';

interface Props {
  dossier: UiPayFairDossier;
  locale: Locale;
  locked: boolean;
  onChange: (next: PayFairAssessmentInput) => void;
}

export function JobAdAndArt7Panel({ dossier, locale, locked, onChange }: Props) {
  const t = getLabels(locale);
  const { input, result } = dossier;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function updateJobAd(patch: Partial<JobAdCheckInput>) {
    onChange({
      ...input,
      jobAd: { ...input.jobAd, ...patch },
    });
  }

  async function handleCopy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      // ignore clipboard restrictions
    }
  }

  const art7Letter = locale === 'ar' ? result.article7Clock.letterAr : result.article7Clock.letterEn;
  const art10Notice = buildJointAssessmentNotice(input, result, locale);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Article 5 Job Ad Transparency & XSS-Safe HTML Generator */}
        <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-[var(--accent-primary)]" />
              {t.jobAdSection}
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                result.jobAdAudit.passed
                  ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                  : 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]'
              }`}
            >
              {result.jobAdAudit.passed ? 'Art. 5 OK' : `${result.jobAdAudit.issues.length} Issue(s)`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.roleTitleLabel}
              </label>
              <input
                type="text"
                className="payfair-input"
                disabled={locked}
                value={input.jobAd.roleTitle}
                onChange={(e) => updateJobAd({ roleTitle: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.categoryLabel}
              </label>
              <input
                type="text"
                className="payfair-input"
                disabled={locked}
                value={input.jobAd.category}
                onChange={(e) => updateJobAd({ category: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.payMinLabel}
              </label>
              <input
                type="number"
                min={0}
                className="payfair-input num-tabular"
                disabled={locked}
                value={input.jobAd.payMin}
                onChange={(e) => updateJobAd({ payMin: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.payMaxLabel}
              </label>
              <input
                type="number"
                min={0}
                className="payfair-input num-tabular"
                disabled={locked}
                value={input.jobAd.payMax}
                onChange={(e) => updateJobAd({ payMax: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.currencyLabel}
              </label>
              <input
                type="text"
                maxLength={6}
                className="payfair-input payfair-mono"
                disabled={locked}
                value={input.jobAd.currency}
                onChange={(e) => updateJobAd({ currency: e.target.value.toUpperCase() })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.payPeriodLabel}
              </label>
              <select
                className="payfair-input"
                disabled={locked}
                value={input.jobAd.payPeriod}
                onChange={(e) =>
                  updateJobAd({ payPeriod: e.target.value as JobAdCheckInput['payPeriod'] })
                }
              >
                <option value="annual">{t.periodLabels.annual}</option>
                <option value="monthly">{t.periodLabels.monthly}</option>
                <option value="hourly">{t.periodLabels.hourly}</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-[var(--accent-crimson)] font-semibold cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--accent-crimson)]"
              disabled={locked}
              checked={input.jobAd.asksSalaryHistory}
              onChange={(e) => updateJobAd({ asksSalaryHistory: e.target.checked })}
            />
            <span>{t.asksSalaryHistoryLabel}</span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.jobAdTextLabel}
            </label>
            <textarea
              rows={3}
              className="payfair-input"
              disabled={locked}
              value={input.jobAd.jobAdText}
              onChange={(e) => updateJobAd({ jobAdText: e.target.value })}
            />
          </div>

          {result.jobAdAudit.issues.length === 0 ? (
            <div className="rounded-xl bg-[var(--accent-teal-soft)] px-3 py-2 text-xs text-[var(--accent-teal)] flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t.jobAdPassedLabel}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {result.jobAdAudit.issues.map((issue) => (
                <li
                  key={issue.code}
                  className={`rounded-xl px-3 py-2 text-xs flex items-start gap-2 ${
                    issue.severity === 'error'
                      ? 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]'
                      : 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="payfair-mono font-bold me-1.5">{issue.code}:</span>
                    {locale === 'ar' ? issue.messageAr : issue.messageEn}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {t.htmlSnippetLabel}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy('html', result.jobAdAudit.htmlSnippet)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
                >
                  {copiedId === 'html' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === 'html' ? t.copiedBtn : t.copyBtn}
                </button>
                <button
                  type="button"
                  onClick={() => downloadJobAdHtmlSnippet(dossier)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.downloadSnippetBtn}
                </button>
              </div>
            </div>
            <pre
              data-testid="art5-html-snippet"
              dir="ltr"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[11px] payfair-mono overflow-x-auto whitespace-pre-wrap"
            >
              {result.jobAdAudit.htmlSnippet}
            </pre>
          </div>
        </div>

        {/* Article 7 Employee Pay Information SLA Clock (<= 2 Months) & GDPR Guard */}
        <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[var(--accent-primary)]" />
              {t.art7Section}
            </h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--bg-soft)] text-[var(--accent-primary)] payfair-mono num-tabular">
              {isolateLtr(`SLA -> ${result.article7Clock.dueDateIso}`)}
            </span>
          </div>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent-primary)]"
              disabled={locked}
              checked={input.hasArt7WorkflowReady}
              onChange={(e) => onChange({ ...input, hasArt7WorkflowReady: e.target.checked })}
            />
            <span>{t.art7WorkflowLabel}</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.art7RequestDateLabel}
              </label>
              <input
                type="date"
                className="payfair-input num-tabular"
                disabled={locked}
                value={input.art7SampleRequestDate}
                onChange={(e) => onChange({ ...input, art7SampleRequestDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t.art7DueDateLabel}
              </label>
              <div
                data-testid="art7-due-date"
                className="payfair-input bg-[var(--bg-elevated)] font-bold payfair-mono num-tabular text-[var(--accent-primary)]"
              >
                {isolateLtr(result.article7Clock.dueDateIso)}
              </div>
            </div>
          </div>

          {!locked && (
            <button
              type="button"
              onClick={() => onChange({ ...input, art7SampleRequestDate: '2026-12-31' })}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-soft)] transition"
            >
              {t.art7DemoClampBtn}
            </button>
          )}

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {t.art7LetterLabel}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy('art7', art7Letter)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
                >
                  {copiedId === 'art7' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === 'art7' ? t.copiedBtn : t.copyBtn}
                </button>
                <button
                  type="button"
                  onClick={() => downloadArt7DraftMarkdown(dossier, locale)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.downloadArt7Btn}
                </button>
              </div>
            </div>
            <pre className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs leading-relaxed whitespace-pre-wrap font-sans">
              {art7Letter}
            </pre>
          </div>
        </div>
      </div>

      {/* Bottom: 6-Point Readiness Checklist + Art. 10 Joint Assessment Notice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[var(--accent-primary)]" />
            {t.checklistSection}
          </h3>
          <div className="space-y-2">
            {result.checks.map((chk) => (
              <div
                key={chk.id}
                className={`rounded-xl border p-3 text-xs ${
                  chk.passed
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                    : chk.severity === 'blocker'
                      ? 'border-[var(--accent-crimson)]/40 bg-[var(--accent-crimson-soft)]'
                      : 'border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold mb-1">
                  <span>{locale === 'ar' ? chk.titleAr : chk.titleEn}</span>
                  <span className="payfair-mono text-[11px]">{isolateLtr(chk.articleRef)}</span>
                </div>
                <div className="text-[var(--text-secondary)]">
                  {locale === 'ar' ? chk.detailAr : chk.detailEn}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">{t.art10NoticeSection}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy('art10', art10Notice)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
              >
                {copiedId === 'art10' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedId === 'art10' ? t.copiedBtn : t.copyBtn}
              </button>
              <button
                type="button"
                onClick={() => downloadArt10NoticeMarkdown(dossier, locale)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
              >
                <Download className="h-3.5 w-3.5" />
                {t.downloadArt10Btn}
              </button>
            </div>
          </div>
          <pre className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs leading-relaxed whitespace-pre-wrap font-sans">
            {art10Notice}
          </pre>
        </div>
      </div>
    </div>
  );
}
