import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Lock,
  Printer,
  Share2,
} from 'lucide-react';
import { buildJointAssessmentNotice, computePayFairDigest } from '../core/dossierDigest.ts';
import type { Locale } from '../core/types.ts';
import {
  downloadArt10NoticeMarkdown,
  downloadDossierCategoryCsv,
  downloadDossierMarkdown,
  downloadJobAdHtmlSnippet,
  type UiPayFairDossier,
} from '../lib/api.ts';
import { getLabels, isolateLtr } from '../lib/i18n.ts';

interface Props {
  dossier: UiPayFairDossier;
  locale: Locale;
  publicShareUrl: string;
}

export function DossierPreviewAndPrint({ dossier, locale, publicShareUrl }: Props) {
  const t = getLabels(locale);
  const { input, result } = dossier;
  const [liveDigest, setLiveDigest] = useState(dossier.sha256Digest || '');
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (dossier.sha256Digest) {
      setLiveDigest(dossier.sha256Digest);
      return;
    }
    computePayFairDigest(dossier.input, dossier.result)
      .then((hex) => {
        if (!cancelled) setLiveDigest(hex);
      })
      .catch(() => {
        // ignore digest errors
      });
    return () => {
      cancelled = true;
    };
  }, [dossier]);

  async function handleCopyShare() {
    try {
      await navigator.clipboard.writeText(publicShareUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  }

  const m = result.metrics;

  return (
    <div className="space-y-5">
      {/* Export & Action Toolbar (hidden in A4 Print) */}
      <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--accent-primary)]" />
            {t.dossierTitle}
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span
              data-testid="sealed-dossier-code"
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold ${
                dossier.status === 'locked'
                  ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                  : 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
              }`}
            >
              {dossier.status === 'locked' && <Lock className="h-3 w-3" />}
              {dossier.dossierCode
                ? isolateLtr(`${dossier.dossierCode} · ${t.sealedBadge}`)
                : t.draftBadge}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="print-pdf-btn"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] px-3.5 py-2 text-xs font-semibold hover:opacity-95"
          >
            <Printer className="h-3.5 w-3.5" />
            {t.printBtn}
          </button>

          <button
            type="button"
            onClick={() => void downloadDossierMarkdown(dossier, locale)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
          >
            <Download className="h-3.5 w-3.5" />
            {t.downloadDossierMd}
          </button>

          <button
            type="button"
            data-testid="export-dossier-csv-btn"
            onClick={() => downloadDossierCategoryCsv(dossier)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
          >
            <Download className="h-3.5 w-3.5" />
            {t.downloadDossierCsv}
          </button>

          <button
            type="button"
            onClick={() => downloadArt10NoticeMarkdown(dossier, locale)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
          >
            <Download className="h-3.5 w-3.5" />
            {t.downloadArt10Btn}
          </button>

          <button
            type="button"
            onClick={() => downloadJobAdHtmlSnippet(dossier)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
          >
            <Download className="h-3.5 w-3.5" />
            {t.downloadSnippetBtn}
          </button>

          <button
            type="button"
            onClick={() => void handleCopyShare()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
          >
            {copiedUrl ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {copiedUrl ? t.copiedBtn : t.copyPublicUrl}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold">SHA-256:</span>
          <code className="payfair-mono break-all bg-[var(--bg-elevated)] px-2 py-0.5 rounded-md">
            {liveDigest || '...'}
          </code>
        </div>
      </div>

      {/* A4 Printable Compliance Report Sheet */}
      <article className="payfair-card rounded-2xl p-6 sm:p-8 space-y-6">
        <header className="border-b border-[var(--border-subtle)] pb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
              Directive (EU) 2023/970 · PayFairEU Readiness Dossier
            </div>
            <h1 className="text-xl font-extrabold mt-1">{input.title}</h1>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {input.employerName} · {isolateLtr(`${input.memberStateIso} · ${input.headcountDeclared} staff · Year ${input.reportingYear}`)}
            </p>
          </div>

          <div className="text-end space-y-1 text-xs num-tabular">
            <div className="text-lg font-extrabold payfair-mono text-[var(--accent-primary)]">
              {isolateLtr(dossier.dossierCode || 'DRAFT')}
            </div>
            <div>
              Score: <strong>{isolateLtr(`${result.readinessScore}/100`)}</strong> ({t.tierLabels[result.tier]})
            </div>
            <div className="text-[var(--text-secondary)]">
              {t.frequencyLabels[result.reportingObligation.frequency]}
            </div>
          </div>
        </header>

        {/* Article 9(1)(a)–(e) Summary Metrics */}
        <section className="print-avoid-break space-y-2.5">
          <h3 className="text-sm font-bold">Article 9(1)(a)–(e) FTE Pay Equity Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs num-tabular">
            <div className="rounded-xl border border-[var(--border-subtle)] p-2.5">
              <div className="text-[var(--text-secondary)]">{t.art7MetricCards.meanPayGap}</div>
              <div className="text-base font-bold payfair-mono mt-1">
                {isolateLtr(`${m.meanPayGapPct ?? 'N/A'}%`)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-2.5">
              <div className="text-[var(--text-secondary)]">{t.art7MetricCards.meanVarGap}</div>
              <div className="text-base font-bold payfair-mono mt-1">
                {isolateLtr(`${m.meanVariableGapPct ?? 'N/A'}%`)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-2.5">
              <div className="text-[var(--text-secondary)]">{t.art7MetricCards.medianPayGap}</div>
              <div className="text-base font-bold payfair-mono mt-1">
                {isolateLtr(`${m.medianPayGapPct ?? 'N/A'}%`)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-2.5">
              <div className="text-[var(--text-secondary)]">{t.art7MetricCards.medianVarGap}</div>
              <div className="text-base font-bold payfair-mono mt-1">
                {isolateLtr(`${m.medianVariableGapPct ?? 'N/A'}%`)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-2.5">
              <div className="text-[var(--text-secondary)]">{t.art7MetricCards.varRecipients}</div>
              <div className="text-base font-bold payfair-mono mt-1">
                {isolateLtr(`${m.femaleReceivingVariablePct}% / ${m.maleReceivingVariablePct}%`)}
              </div>
            </div>
          </div>
        </section>

        {/* Article 9(1)(f) Quartiles Table */}
        <section className="print-avoid-break space-y-2">
          <h3 className="text-sm font-bold">Article 9(1)(f) Quartile Pay Distribution</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse num-tabular">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.quartile}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.workersCount}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.bandRange}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.fPct}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.mPct}</th>
                </tr>
              </thead>
              <tbody>
                {m.quartiles.map((q) => (
                  <tr key={q.quartile} className="border-b border-[var(--border-subtle)]/60">
                    <td className="py-1.5 px-2 font-bold">{q.quartile}</td>
                    <td className="py-1.5 px-2">{q.count}</td>
                    <td className="py-1.5 px-2 payfair-mono">
                      {isolateLtr(`${q.minPayEur.toLocaleString()}–${q.maxPayEur.toLocaleString()}`)}
                    </td>
                    <td className="py-1.5 px-2 payfair-mono">{isolateLtr(`${q.femalePct}%`)}</td>
                    <td className="py-1.5 px-2 payfair-mono">{isolateLtr(`${q.malePct}%`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Article 9(1)(g) & Article 10 Category Breakdown */}
        <section className="print-avoid-break space-y-2">
          <h3 className="text-sm font-bold">Article 9(1)(g) & Article 10 Category Gaps</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse num-tabular">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.category}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.workersCount}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.baseGap}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.varGap}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.totalGap}</th>
                  <th className="py-1.5 px-2 text-start">{t.tableHeaders.art10Status}</th>
                </tr>
              </thead>
              <tbody>
                {m.categories.map((c) => (
                  <tr key={c.category} className="border-b border-[var(--border-subtle)]/60">
                    <td className="py-1.5 px-2 font-semibold">{c.category}</td>
                    <td className="py-1.5 px-2">
                      {isolateLtr(`${c.totalCount} (${c.femaleCount}F/${c.maleCount}M)`)}
                    </td>
                    <td className="py-1.5 px-2 payfair-mono">{isolateLtr(`${c.baseGapPct ?? 'N/A'}%`)}</td>
                    <td className="py-1.5 px-2 payfair-mono">{isolateLtr(`${c.variableGapPct ?? 'N/A'}%`)}</td>
                    <td className="py-1.5 px-2 payfair-mono font-bold">
                      {isolateLtr(`${c.totalMeanGapPct ?? 'N/A'}%`)}
                    </td>
                    <td className="py-1.5 px-2 font-semibold">
                      {c.triggersJointPayAssessment ? 'ART10_TRIGGER' : 'OK'}
                      {c.smallSamplePrivacyWarning ? ' (GDPR <3)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Article 10 Notice & Checks */}
        <section className="print-avoid-break space-y-2">
          <h3 className="text-sm font-bold">{t.art10NoticeSection}</h3>
          <pre className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs whitespace-pre-wrap font-sans">
            {buildJointAssessmentNotice(input, result, locale)}
          </pre>
        </section>

        <footer className="border-t border-[var(--border-subtle)] pt-3 text-[11px] text-[var(--text-secondary)] space-y-1">
          <div className="font-semibold">
            {locale === 'ar' ? result.disclaimerAr : result.disclaimerEn}
          </div>
          <div className="payfair-mono break-all">
            {isolateLtr(`SHA-256: ${liveDigest || 'PENDING'} · URL: ${publicShareUrl}`)}
          </div>
        </footer>
      </article>
    </div>
  );
}
