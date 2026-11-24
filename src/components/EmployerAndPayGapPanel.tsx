import { Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import type {
  CategoryJustification,
  Locale,
  PayFairAssessmentInput,
  PayFairAssessmentResult,
  WorkerPayRow,
  WorkerSex,
} from '../core/types.ts';
import { EU_MEMBER_STATES, getLabels, isolateLtr } from '../lib/i18n.ts';
import { PayFairGapCharts } from './PayFairGapCharts.tsx';

interface Props {
  input: PayFairAssessmentInput;
  result: PayFairAssessmentResult;
  locale: Locale;
  locked: boolean;
  onChange: (next: PayFairAssessmentInput) => void;
}

export function EmployerAndPayGapPanel({ input, result, locale, locked, onChange }: Props) {
  const t = getLabels(locale);

  function setField<K extends keyof PayFairAssessmentInput>(
    key: K,
    val: PayFairAssessmentInput[K],
  ) {
    onChange({ ...input, [key]: val });
  }

  function updateWorker(idx: number, patch: Partial<WorkerPayRow>) {
    const nextWorkers = input.workers.map((w, i) => (i === idx ? { ...w, ...patch } : w));
    onChange({ ...input, workers: nextWorkers });
  }

  function addWorker() {
    const fallbackCat = result.metrics.categories[0]?.category || input.jobAd.category || 'Engineering';
    const nextIdx = input.workers.length + 1;
    const nextRow: WorkerPayRow = {
      id: `W-${String(nextIdx).padStart(2, '0')}`,
      category: fallbackCat,
      sex: nextIdx % 2 === 0 ? 'male' : 'female',
      basePayAnnualEur: 55000,
      variablePayAnnualEur: 2500,
      fteRatio: 1,
    };
    onChange({ ...input, workers: [...input.workers, nextRow] });
  }

  function removeWorker(idx: number) {
    onChange({ ...input, workers: input.workers.filter((_, i) => i !== idx) });
  }

  function upsertJustification(category: string, patch: Partial<CategoryJustification>) {
    const existsIdx = input.categoryJustifications.findIndex(
      (j) => j.category.trim().toLowerCase() === category.trim().toLowerCase(),
    );
    const current: CategoryJustification =
      existsIdx >= 0
        ? input.categoryJustifications[existsIdx]!
        : {
            category,
            justifiedByObjectiveCriteria: false,
            justificationNote: '',
            remediedWithin6Months: false,
          };
    const merged = { ...current, ...patch, category };
    const nextList =
      existsIdx >= 0
        ? input.categoryJustifications.map((j, i) => (i === existsIdx ? merged : j))
        : [...input.categoryJustifications, merged];
    onChange({ ...input, categoryJustifications: nextList });
  }

  return (
    <div className="space-y-5">
      {/* Employer Metadata Card */}
      <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--accent-primary)]" />
            {t.employerSection}
          </h2>
          <span className="rounded-full px-3 py-1 text-xs font-semibold bg-[var(--bg-soft)] text-[var(--accent-primary)] num-tabular">
            {t.frequencyLabels[result.reportingObligation.frequency]}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.employerNameLabel}
            </label>
            <input
              type="text"
              className="payfair-input"
              disabled={locked}
              value={input.employerName}
              onChange={(e) => setField('employerName', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.dossierTitleLabel}
            </label>
            <input
              type="text"
              className="payfair-input"
              disabled={locked}
              value={input.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.memberStateLabel}
            </label>
            <select
              className="payfair-input"
              disabled={locked}
              value={input.memberStateIso}
              onChange={(e) => setField('memberStateIso', e.target.value)}
            >
              {EU_MEMBER_STATES.map((ms) => (
                <option key={ms.code} value={ms.code}>
                  {locale === 'ar' ? ms.ar : ms.en}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.headcountLabel}
            </label>
            <input
              type="number"
              min={1}
              className="payfair-input num-tabular"
              disabled={locked}
              value={input.headcountDeclared}
              onChange={(e) => setField('headcountDeclared', Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.reportingYearLabel}
            </label>
            <input
              type="number"
              min={2024}
              max={2035}
              className="payfair-input num-tabular"
              disabled={locked}
              value={input.reportingYear}
              onChange={(e) =>
                setField('reportingYear', Math.max(2024, Math.min(2035, Number(e.target.value) || 2026)))
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t.firstDueLabel}
            </label>
            <div className="payfair-input bg-[var(--bg-elevated)] font-semibold payfair-mono num-tabular">
              {isolateLtr(result.reportingObligation.firstReportDue ?? 'Voluntary (<100)')}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2.5 pt-1 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--accent-primary)]"
            disabled={locked}
            checked={input.hasObjectivePayCriteriaArt6}
            onChange={(e) => setField('hasObjectivePayCriteriaArt6', e.target.checked)}
          />
          <span>{t.art6PolicyLabel}</span>
        </label>
      </div>

      {/* Article 9 Interactive SVG Visuals */}
      <PayFairGapCharts metrics={result.metrics} locale={locale} />

      {/* Category Justifications & Art. 10 Remediation Matrix */}
      <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-3.5">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[var(--accent-amber)]" />
          {t.justificationsSection}
        </h3>

        <div className="space-y-3">
          {result.metrics.categories.map((cat) => {
            const gapVal = cat.totalMeanGapPct;
            const badgeTone = cat.triggersJointPayAssessment
              ? 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]'
              : cat.exceedsFivePercent
                ? 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                : 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]';

            return (
              <div
                key={cat.category}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-sm">{cat.category}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs num-tabular">
                    <span className="rounded-md bg-[var(--bg-surface)] px-2 py-0.5 border border-[var(--border-subtle)]">
                      {isolateLtr(`${cat.femaleCount}F / ${cat.maleCount}M`)}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${badgeTone}`}>
                      {isolateLtr(gapVal !== null ? `${gapVal}%` : 'N/A')} ·{' '}
                      {cat.triggersJointPayAssessment ? t.art10TriggeredYes : t.art10TriggeredNo}
                    </span>
                    {cat.smallSamplePrivacyWarning && (
                      <span className="rounded-full px-2 py-0.5 font-semibold bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]">
                        {isolateLtr('GDPR < 3')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      data-testid={`justified-${cat.category.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent-primary)]"
                      disabled={locked}
                      checked={cat.justifiedByObjectiveCriteria}
                      onChange={(e) =>
                        upsertJustification(cat.category, {
                          justifiedByObjectiveCriteria: e.target.checked,
                        })
                      }
                    />
                    <span>{t.justifiedCheckbox}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      data-testid={`remedied-${cat.category.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent-primary)]"
                      disabled={locked}
                      checked={cat.remediedWithin6Months}
                      onChange={(e) =>
                        upsertJustification(cat.category, {
                          remediedWithin6Months: e.target.checked,
                        })
                      }
                    />
                    <span>{t.remediedCheckbox}</span>
                  </label>
                </div>

                <input
                  type="text"
                  className="payfair-input text-xs"
                  disabled={locked}
                  placeholder={t.justificationNotePlaceholder}
                  value={cat.justificationNote}
                  onChange={(e) =>
                    upsertJustification(cat.category, { justificationNote: e.target.value })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Workforce Roster Editor */}
      <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {t.workerRosterTitle} ({isolateLtr(`${input.workers.length}`)})
          </h3>
          {!locked && (
            <button
              type="button"
              onClick={addWorker}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] hover:opacity-95 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.addWorkerBtn}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="py-2 px-2 text-start">{t.tableHeaders.id}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.category}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.sex}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.basePay}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.varPay}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.fte}</th>
                <th className="py-2 px-2 text-start">{t.tableHeaders.fteTotal}</th>
                {!locked && <th className="py-2 px-2 text-start">{t.tableHeaders.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {input.workers.map((w, idx) => {
                const fte = Math.max(0.1, Math.min(1, Number(w.fteRatio) || 1));
                const fteTotal = Math.round((w.basePayAnnualEur + w.variablePayAnnualEur) / fte);
                return (
                  <tr
                    key={`${w.id}-${idx}`}
                    className="border-b border-[var(--border-subtle)]/70 hover:bg-[var(--bg-elevated)]/60"
                  >
                    <td className="py-1.5 px-1.5 min-w-[74px]">
                      <input
                        type="text"
                        className="payfair-input text-xs py-1 px-2 payfair-mono"
                        disabled={locked}
                        value={w.id}
                        onChange={(e) => updateWorker(idx, { id: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 px-1.5 min-w-[160px]">
                      <input
                        type="text"
                        className="payfair-input text-xs py-1 px-2"
                        disabled={locked}
                        value={w.category}
                        onChange={(e) => updateWorker(idx, { category: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 px-1.5 min-w-[92px]">
                      <select
                        className="payfair-input text-xs py-1 px-2"
                        disabled={locked}
                        value={w.sex}
                        onChange={(e) => updateWorker(idx, { sex: e.target.value as WorkerSex })}
                      >
                        <option value="female">{t.sexLabels.female}</option>
                        <option value="male">{t.sexLabels.male}</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-1.5 min-w-[98px]">
                      <input
                        type="number"
                        min={0}
                        className="payfair-input text-xs py-1 px-2 num-tabular"
                        disabled={locked}
                        value={w.basePayAnnualEur}
                        onChange={(e) =>
                          updateWorker(idx, { basePayAnnualEur: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-1.5 min-w-[92px]">
                      <input
                        type="number"
                        min={0}
                        className="payfair-input text-xs py-1 px-2 num-tabular"
                        disabled={locked}
                        value={w.variablePayAnnualEur}
                        onChange={(e) =>
                          updateWorker(idx, { variablePayAnnualEur: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-1.5 min-w-[68px]">
                      <input
                        type="number"
                        min={0.1}
                        max={1}
                        step={0.1}
                        className="payfair-input text-xs py-1 px-2 num-tabular"
                        disabled={locked}
                        value={w.fteRatio}
                        onChange={(e) =>
                          updateWorker(idx, {
                            fteRatio: Math.max(0.1, Math.min(1, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-2 payfair-mono num-tabular font-semibold">
                      {isolateLtr(`${fteTotal.toLocaleString()} €`)}
                    </td>
                    {!locked && (
                      <td className="py-1.5 px-2">
                        <button
                          type="button"
                          aria-label={t.removeBtn}
                          onClick={() => removeWorker(idx)}
                          className="rounded-lg p-1.5 text-[var(--accent-crimson)] hover:bg-[var(--accent-crimson-soft)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
