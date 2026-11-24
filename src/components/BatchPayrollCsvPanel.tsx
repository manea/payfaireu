import { useState, type ChangeEvent } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Play, Upload } from 'lucide-react';
import { SAMPLE_PAYROLL_CSV } from '../core/presets.ts';
import type {
  BatchPayrollCsvSummary,
  CategoryJustification,
  Locale,
  WorkerPayRow,
} from '../core/types.ts';
import { downloadBatchCategoryGapCsvFile, runBatchPayrollCsvAudit } from '../lib/api.ts';
import { getLabels, isolateLtr } from '../lib/i18n.ts';

interface Props {
  locale: Locale;
  locked: boolean;
  justifications: CategoryJustification[];
  onApplyWorkers: (workers: WorkerPayRow[]) => void;
}

export function BatchPayrollCsvPanel({ locale, locked, justifications, onApplyWorkers }: Props) {
  const t = getLabels(locale);
  const [csvText, setCsvText] = useState<string>(SAMPLE_PAYROLL_CSV);
  const [summary, setSummary] = useState<BatchPayrollCsvSummary>(() =>
    runBatchPayrollCsvAudit(SAMPLE_PAYROLL_CSV, justifications),
  );
  const [appliedBanner, setAppliedBanner] = useState(false);

  function handleRun() {
    setSummary(runBatchPayrollCsvAudit(csvText, justifications));
    setAppliedBanner(false);
  }

  function handleLoadSample() {
    setCsvText(SAMPLE_PAYROLL_CSV);
    setSummary(runBatchPayrollCsvAudit(SAMPLE_PAYROLL_CSV, justifications));
    setAppliedBanner(false);
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setCsvText(content);
      setSummary(runBatchPayrollCsvAudit(content, justifications));
      setAppliedBanner(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleApply() {
    if (locked || summary.workers.length === 0) return;
    onApplyWorkers(summary.workers);
    setAppliedBanner(true);
  }

  return (
    <div className="space-y-5">
      <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[var(--accent-primary)]" />
              {t.batchTitle}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{t.batchDesc}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSample}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-soft)]"
          >
            {t.loadSampleCsv}
          </button>

          <label className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold cursor-pointer hover:bg-[var(--bg-elevated)]">
            <Upload className="h-3.5 w-3.5" />
            {t.uploadCsvBtn}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
          </label>

          <button
            type="button"
            data-testid="run-batch-csv-btn"
            onClick={handleRun}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] px-3.5 py-1.5 text-xs font-semibold hover:opacity-95"
          >
            <Play className="h-3.5 w-3.5" />
            {t.runCsvBtn}
          </button>

          {!locked && summary.workers.length > 0 && (
            <button
              type="button"
              data-testid="apply-csv-workers-btn"
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] text-[var(--accent-teal-fg)] px-3.5 py-1.5 text-xs font-semibold hover:opacity-95"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t.applyCsvToDossierBtn}
            </button>
          )}

          <button
            type="button"
            onClick={() => downloadBatchCategoryGapCsvFile(summary)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
          >
            <Download className="h-3.5 w-3.5" />
            {t.exportCsvBtn}
          </button>
        </div>

        {appliedBanner && (
          <div className="rounded-xl bg-[var(--accent-teal-soft)] text-[var(--accent-teal)] px-3 py-2 text-xs font-semibold">
            {t.appliedCsvMsg}
          </div>
        )}

        <textarea
          rows={7}
          dir="ltr"
          className="payfair-input payfair-mono text-xs"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />

        {/* Batch KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs num-tabular">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <div className="text-[var(--text-secondary)]">{t.batchKpis.inputRows}</div>
            <div className="text-base font-bold mt-0.5">{summary.totalInputRows}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <div className="text-[var(--text-secondary)]">{t.batchKpis.parsedWorkers}</div>
            <div className="text-base font-bold mt-0.5 text-[var(--accent-teal)]">
              {summary.parsedWorkersCount}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <div className="text-[var(--text-secondary)]">{t.batchKpis.invalidRows}</div>
            <div className="text-base font-bold mt-0.5">{summary.invalidRowsCount}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <div className="text-[var(--text-secondary)]">{t.batchKpis.meanGap}</div>
            <div className="text-base font-bold mt-0.5 payfair-mono">
              {isolateLtr(`${summary.metrics.meanPayGapPct ?? 'N/A'}%`)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <div className="text-[var(--text-secondary)]">{t.batchKpis.triggeredCats}</div>
            <div className="text-base font-bold mt-0.5 text-[var(--accent-crimson)]">
              {summary.metrics.triggeredCategories.length}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <div className="text-[var(--text-secondary)]">{t.batchKpis.smallCells}</div>
            <div className="text-base font-bold mt-0.5 text-[var(--accent-amber)]">
              {summary.metrics.smallSampleCategoriesCount}
            </div>
          </div>
        </div>

        {summary.invalidNotes.length > 0 && (
          <div className="rounded-xl bg-[var(--accent-amber-soft)] p-3 text-xs text-[var(--accent-amber)] space-y-1">
            <div className="font-bold">{t.invalidRowsTitle}</div>
            {summary.invalidNotes.map((note, idx) => (
              <div key={idx} className="payfair-mono">
                {note}
              </div>
            ))}
          </div>
        )}

        {/* Parsed Category Breakdown */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="py-2 px-2 text-start">{t.tableHeaders.category}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.workersCount}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.baseGap}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.varGap}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.totalGap}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.art10Status}</th>
              </tr>
            </thead>
            <tbody>
              {summary.metrics.categories.map((cat) => (
                <tr key={cat.category} className="border-b border-[var(--border-subtle)]/70">
                  <td className="py-2 px-2 font-semibold">{cat.category}</td>
                  <td className="py-2 px-2 num-tabular">
                    {isolateLtr(`${cat.totalCount} (${cat.femaleCount}F/${cat.maleCount}M)`)}
                  </td>
                  <td className="py-2 px-2 payfair-mono num-tabular">
                    {isolateLtr(`${cat.baseGapPct ?? 'N/A'}%`)}
                  </td>
                  <td className="py-2 px-2 payfair-mono num-tabular">
                    {isolateLtr(`${cat.variableGapPct ?? 'N/A'}%`)}
                  </td>
                  <td className="py-2 px-2 payfair-mono num-tabular font-bold">
                    {isolateLtr(`${cat.totalMeanGapPct ?? 'N/A'}%`)}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 font-semibold ${
                        cat.triggersJointPayAssessment
                          ? 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]'
                          : 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                      }`}
                    >
                      {cat.triggersJointPayAssessment ? 'ART10_TRIGGER' : 'OK'}
                    </span>
                    {cat.smallSamplePrivacyWarning && (
                      <span className="ms-1.5 rounded-full px-2 py-0.5 font-semibold bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]">
                        {isolateLtr('GDPR <3')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
