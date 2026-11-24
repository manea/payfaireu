import { computeArticle9Metrics } from './payGapEngine.ts';
import type {
  Article9Metrics,
  BatchPayrollCsvSummary,
  CategoryJustification,
  WorkerPayRow,
  WorkerSex,
} from './types.ts';

export function parseCsvRows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i] ?? '';
    const next = clean[i + 1] ?? '';

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseSex(raw: string): WorkerSex | null {
  const s = raw.trim().toLowerCase();
  if (s === 'f' || s === 'female' || s === 'w' || s === 'woman' || s === 'أنثى' || s === 'انثى') {
    return 'female';
  }
  if (s === 'm' || s === 'male' || s === 'man' || s === 'ذكر') {
    return 'male';
  }
  return null;
}

export function parsePayrollCsv(
  csvText: string,
  justifications: CategoryJustification[] = [],
): BatchPayrollCsvSummary {
  const parsed = parseCsvRows(csvText);
  if (parsed.length < 2) {
    return {
      totalInputRows: 0,
      parsedWorkersCount: 0,
      invalidRowsCount: 0,
      invalidNotes: [],
      workers: [],
      metrics: computeArticle9Metrics([], justifications),
    };
  }

  const headerRow = parsed[0] ?? [];
  const colIndex = new Map<string, number>();
  headerRow.forEach((h, idx) => colIndex.set(normalizeHeader(h), idx));

  const findCol = (aliases: string[]): number => {
    for (const a of aliases) {
      const idx = colIndex.get(a);
      if (idx !== undefined) return idx;
    }
    return -1;
  };

  const cId = findCol(['id', 'workerid', 'employeeid', 'empid', 'ref']);
  const cCat = findCol(['category', 'jobcategory', 'role', 'band', 'grade']);
  const cSex = findCol(['sex', 'gender']);
  const cBase = findCol(['basepay', 'basepayannualeur', 'basepayeur', 'salary', 'basesalary']);
  const cVar = findCol(['variablepay', 'variablepayannualeur', 'variablepayeur', 'bonus', 'variable']);
  const cFte = findCol(['fte', 'fteratio', 'workratio']);

  const workers: WorkerPayRow[] = [];
  const invalidNotes: string[] = [];
  let invalidRowsCount = 0;

  for (let r = 1; r < parsed.length; r += 1) {
    const raw = parsed[r] ?? [];
    const get = (idx: number): string => (idx >= 0 ? (raw[idx] ?? '') : '');

    const id = get(cId) || `W-${String(r).padStart(3, '0')}`;
    const category = get(cCat).trim() || 'General Category';
    const sex = parseSex(get(cSex));
    const baseStr = get(cBase);
    const baseNum = Number(baseStr);
    const varRaw = get(cVar);
    const varNum = varRaw === '' ? 0 : Number(varRaw);
    const fteRaw = get(cFte);
    const fteNum = fteRaw === '' ? 1 : Number(fteRaw);

    if (
      !sex ||
      baseStr === '' ||
      !Number.isFinite(baseNum) ||
      baseNum <= 0 ||
      !Number.isFinite(varNum) ||
      varNum < 0 ||
      !Number.isFinite(fteNum) ||
      fteNum <= 0 ||
      fteNum > 1
    ) {
      invalidRowsCount += 1;
      invalidNotes.push(`Row ${r} (${id}): invalid sex, base pay, variable pay, or FTE (0 < FTE <= 1).`);
      continue;
    }

    workers.push({
      id,
      category,
      sex,
      basePayAnnualEur: baseNum,
      variablePayAnnualEur: varNum,
      fteRatio: fteNum,
    });
  }

  return {
    totalInputRows: parsed.length - 1,
    parsedWorkersCount: workers.length,
    invalidRowsCount,
    invalidNotes,
    workers,
    metrics: computeArticle9Metrics(workers, justifications),
  };
}

export function escapeCsvCell(value: string | number | boolean): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportCategoryGapCsv(
  metrics: Article9Metrics,
  options: { withBom?: boolean } = {},
): string {
  const header = [
    'category',
    'total_workers',
    'female_count',
    'male_count',
    'female_mean_base_eur',
    'male_mean_base_eur',
    'base_gap_pct',
    'variable_gap_pct',
    'total_mean_gap_pct',
    'exceeds_five_percent',
    'justified_objective',
    'remedied_6m',
    'triggers_joint_assessment',
    'small_sample_privacy_warning',
    'justification_note',
  ].join(',');

  const lines = metrics.categories.map((c) =>
    [
      escapeCsvCell(c.category),
      c.totalCount,
      c.femaleCount,
      c.maleCount,
      c.femaleMeanBaseEur ?? '',
      c.maleMeanBaseEur ?? '',
      c.baseGapPct ?? '',
      c.variableGapPct ?? '',
      c.totalMeanGapPct ?? '',
      c.exceedsFivePercent,
      c.justifiedByObjectiveCriteria,
      c.remediedWithin6Months,
      c.triggersJointPayAssessment,
      c.smallSamplePrivacyWarning,
      escapeCsvCell(c.justificationNote),
    ].join(','),
  );

  const body = [header, ...lines].join('\r\n');
  return options.withBom ? `\uFEFF${body}` : body;
}
