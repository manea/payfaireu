import type { Article9Metrics, Locale } from '../core/types.ts';
import { getLabels, isolateLtr } from '../lib/i18n.ts';

interface Props {
  metrics: Article9Metrics;
  locale: Locale;
}

export function PayFairGapCharts({ metrics, locale }: Props) {
  const t = getLabels(locale);
  const maxAbsGap = Math.max(
    12,
    ...metrics.categories.map((c) => Math.abs(c.totalMeanGapPct ?? 0)),
  );
  const scaleBound = Math.ceil(maxAbsGap / 5) * 5;
  const catRowHeight = 36;
  const catSvgHeight = Math.max(110, metrics.categories.length * catRowHeight + 36);

  const axisLeft = 185;
  const axisRight = 465;
  const axisMid = (axisLeft + axisRight) / 2;
  const halfSpan = (axisRight - axisLeft) / 2;
  const xForGap = (pct: number) => axisMid + (pct / scaleBound) * halfSpan;
  const fivePosX = xForGap(5);
  const fiveNegX = xForGap(-5);

  return (
    <div className="payfair-card rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{t.chartsTitle}</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-female)]" />
            {t.femaleLegend}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--chart-male)]" />
            {t.maleLegend}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Q1..Q4 Stacked Composition SVG */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs font-semibold mb-2">{t.quartileChartTitle}</div>
          <div dir="ltr" className="w-full">
            <svg
              data-testid="quartile-svg-chart"
              viewBox="0 0 490 185"
              className="w-full h-auto block"
              role="img"
              aria-label={t.quartileChartTitle}
            >
              {metrics.quartiles.map((q, idx) => {
                const y = 16 + idx * 41;
                const barX = 86;
                const barW = 248;
                const fW = (Math.max(0, Math.min(100, q.femalePct)) / 100) * barW;
                const mW = barW - fW;
                return (
                  <g key={q.quartile}>
                    <text
                      x={6}
                      y={y + 15}
                      fontSize="12"
                      fontWeight="700"
                      fill="var(--text-primary)"
                    >
                      {q.quartile} ({q.count})
                    </text>
                    <rect
                      x={barX}
                      y={y}
                      width={barW}
                      height={22}
                      rx={6}
                      fill="var(--bg-surface)"
                      stroke="var(--border-subtle)"
                    />
                    {q.count > 0 && (
                      <>
                        <rect
                          x={barX}
                          y={y}
                          width={fW}
                          height={22}
                          rx={fW >= barW - 1 ? 6 : 0}
                          fill="var(--chart-female)"
                        />
                        <rect
                          x={barX + fW}
                          y={y}
                          width={mW}
                          height={22}
                          fill="var(--chart-male)"
                          opacity="0.9"
                        />
                      </>
                    )}
                    <text
                      x={344}
                      y={y + 15}
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                      fill="var(--text-primary)"
                    >
                      {q.femalePct}%F / {q.malePct}%M
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[var(--text-secondary)] num-tabular">
            {metrics.quartiles.map((q) => (
              <div key={q.quartile} className="rounded-lg bg-[var(--bg-surface)] px-2 py-1 border border-[var(--border-subtle)]">
                <div className="font-bold text-[var(--text-primary)]">{q.quartile}</div>
                <div>{isolateLtr(`${q.minPayEur.toLocaleString()}–${q.maxPayEur.toLocaleString()} €`)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Art. 9(1)(g) Category Mean Pay Gap Diverging SVG */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs font-semibold mb-2">{t.categoryGapChartTitle}</div>
          {metrics.categories.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
              —
            </div>
          ) : (
            <div dir="ltr" className="w-full">
              <svg
                data-testid="category-gap-svg-chart"
                viewBox={`0 0 560 ${catSvgHeight}`}
                className="w-full h-auto block"
                role="img"
                aria-label={t.categoryGapChartTitle}
              >
                {/* Statutory +/- 5% threshold markers */}
                <line
                  x1={fiveNegX}
                  y1={12}
                  x2={fiveNegX}
                  y2={catSvgHeight - 20}
                  stroke="var(--accent-amber)"
                  strokeDasharray="4 3"
                  strokeWidth="1.5"
                />
                <line
                  x1={axisMid}
                  y1={12}
                  x2={axisMid}
                  y2={catSvgHeight - 20}
                  stroke="var(--border-strong)"
                  strokeWidth="1.5"
                />
                <line
                  x1={fivePosX}
                  y1={12}
                  x2={fivePosX}
                  y2={catSvgHeight - 20}
                  stroke="var(--accent-amber)"
                  strokeDasharray="4 3"
                  strokeWidth="1.5"
                />

                {metrics.categories.map((cat, idx) => {
                  const y = 16 + idx * catRowHeight;
                  const gap = cat.totalMeanGapPct ?? 0;
                  const xVal = xForGap(Math.max(-scaleBound, Math.min(scaleBound, gap)));
                  const barStart = Math.min(axisMid, xVal);
                  const barLen = Math.max(4, Math.abs(xVal - axisMid));
                  const barFill = cat.triggersJointPayAssessment
                    ? 'var(--accent-crimson)'
                    : cat.exceedsFivePercent
                      ? 'var(--accent-amber)'
                      : 'var(--accent-teal)';
                  const label =
                    cat.category.length > 21 ? `${cat.category.slice(0, 19)}..` : cat.category;

                  return (
                    <g key={cat.category}>
                      <text
                        x={6}
                        y={y + 15}
                        fontSize="11.5"
                        fontWeight="600"
                        fill="var(--text-primary)"
                      >
                        {label}
                      </text>
                      <rect
                        x={barStart}
                        y={y + 3}
                        width={barLen}
                        height={16}
                        rx={4}
                        fill={barFill}
                      />
                      <text
                        x={476}
                        y={y + 15}
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                        fill={barFill}
                      >
                        {cat.totalMeanGapPct !== null ? `${cat.totalMeanGapPct}%` : 'N/A'}
                      </text>
                    </g>
                  );
                })}

                <text x={fiveNegX} y={catSvgHeight - 4} textAnchor="middle" fontSize="10" fill="var(--accent-amber)">
                  -5%
                </text>
                <text x={axisMid} y={catSvgHeight - 4} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
                  0%
                </text>
                <text x={fivePosX} y={catSvgHeight - 4} textAnchor="middle" fontSize="10" fill="var(--accent-amber)">
                  +5% (Art. 10)
                </text>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
