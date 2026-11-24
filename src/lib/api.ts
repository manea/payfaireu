import {
  buildJointAssessmentNotice,
  buildPayFairBriefMarkdown,
  computePayFairDigest,
} from '../core/dossierDigest.ts';
import { exportCategoryGapCsv, parsePayrollCsv } from '../core/payrollCsvParser.ts';
import { PAYFAIR_PRESETS } from '../core/presets.ts';
import { assessPayFairEu } from '../core/readinessAssessor.ts';
import type {
  BatchPayrollCsvSummary,
  CategoryJustification,
  Locale,
  PayFairAssessmentInput,
  PayFairAssessmentResult,
  ReadinessTier,
} from '../core/types.ts';
import { withBase } from './basePath.ts';

export interface UiPayFairDossier {
  id: string;
  presetKey?: string;
  slug: string;
  dossierCode: string;
  status: 'draft' | 'locked';
  localeDefault: Locale;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  sha256Digest: string | null;
  viewCount: number;
  input: PayFairAssessmentInput;
  result: PayFairAssessmentResult;
}

export interface DossierListRecord {
  id: string;
  slug: string;
  dossierCode: string;
  status: 'draft' | 'locked';
  readinessTier: ReadinessTier;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  dossier: UiPayFairDossier;
}

export interface DossierBundle {
  dossier: UiPayFairDossier;
  status: 'draft' | 'locked';
  slug: string;
  viewCount: number;
  publicReportUrl?: string;
  markdownEn?: string;
  markdownAr?: string;
  art10NoticeEn?: string;
  art10NoticeAr?: string;
}

export interface EmployerProfileRecord {
  id: string;
  name: string;
  profile: {
    employerName: string;
    memberStateIso: string;
    headcountDeclared: number;
    reportingYear: number;
    hasObjectivePayCriteriaArt6: boolean;
    hasArt7WorkflowReady: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export type BackendMode = 'server' | 'local';

const LOCAL_STORE_KEY = 'payfaireu_local_store_v1';

interface LocalStoreState {
  seqByYear: Record<string, number>;
  dossiers: Array<{ dossier: UiPayFairDossier; status: 'draft' | 'locked'; viewCount: number }>;
  profiles: EmployerProfileRecord[];
}

function slugifyLocal(input: string, fallback = 'payfair-employer'): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function buildLocalDossierFromInput(
  input: PayFairAssessmentInput,
  presetKey = '',
  slugOverride?: string,
  localeDefault: Locale = 'en',
): { dossier: UiPayFairDossier; status: 'draft'; viewCount: number } {
  const now = new Date().toISOString();
  const clonedInput = structuredClone(input);
  const result = assessPayFairEu(clonedInput);
  const suffix = Math.random().toString(36).slice(2, 6);
  const id = `payf-local-${Date.now().toString(36)}-${suffix}`;
  const slug = slugifyLocal(slugOverride || clonedInput.employerName, id);
  return {
    dossier: {
      id,
      presetKey,
      dossierCode: '',
      slug,
      status: 'draft',
      localeDefault,
      createdAt: now,
      updatedAt: now,
      lockedAt: null,
      sha256Digest: null,
      viewCount: 0,
      input: clonedInput,
      result,
    },
    status: 'draft',
    viewCount: 0,
  };
}

function writeLocalStore(state: LocalStoreState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

function readLocalStore(): LocalStoreState {
  if (typeof window === 'undefined') {
    return { seqByYear: {}, dossiers: [], profiles: [] };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalStoreState;
      if (Array.isArray(parsed.dossiers) && parsed.dossiers.length > 0) {
        return {
          seqByYear: parsed.seqByYear || {},
          dossiers: parsed.dossiers,
          profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        };
      }
    }
  } catch {
    // ignore malformed store
  }

  const firstPreset = PAYFAIR_PRESETS[0]!;
  const seeded = buildLocalDossierFromInput(
    firstPreset.data,
    firstPreset.id,
    'nordic-cloud-systems-oy',
  );
  const initState: LocalStoreState = {
    seqByYear: {},
    dossiers: [seeded],
    profiles: [],
  };
  writeLocalStore(initState);
  return initState;
}

export async function detectBackendMode(): Promise<BackendMode> {
  try {
    const res = await fetch(withBase('/api/health'), { method: 'GET' });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = (await res.json()) as { ok?: boolean; service?: string };
        if (json.ok && json.service === 'payfaireu') return 'server';
      }
    }
  } catch {
    // offline / Cloudflare Workers Static mode
  }
  return 'local';
}

export async function listDossiers(mode: BackendMode): Promise<DossierListRecord[]> {
  if (mode === 'local') {
    const st = readLocalStore();
    return st.dossiers.map((entry) => ({
      id: entry.dossier.id,
      slug: entry.dossier.slug,
      dossierCode: entry.dossier.dossierCode || '',
      status: entry.status,
      readinessTier: entry.dossier.result.tier,
      viewCount: entry.viewCount,
      createdAt: entry.dossier.createdAt,
      updatedAt: entry.dossier.updatedAt,
      dossier: entry.dossier,
    }));
  }
  const res = await fetch(withBase('/api/dossiers'));
  if (!res.ok) throw new Error('Failed to load PayFairEU dossiers');
  const data = (await res.json()) as { dossiers: DossierListRecord[] };
  return data.dossiers;
}

export async function createDossier(
  mode: BackendMode,
  presetKey?: string,
  inputOverride?: PayFairAssessmentInput,
): Promise<DossierBundle> {
  if (mode === 'local') {
    const st = readLocalStore();
    const preset = PAYFAIR_PRESETS.find((p) => p.id === presetKey) || PAYFAIR_PRESETS[0]!;
    const item = buildLocalDossierFromInput(inputOverride || preset.data, preset.id);
    st.dossiers.unshift(item);
    writeLocalStore(st);
    return {
      dossier: item.dossier,
      status: item.status,
      slug: item.dossier.slug,
      viewCount: 0,
      publicReportUrl: `${window.location.origin}${withBase(`/r/${encodeURIComponent(item.dossier.slug)}`)}`,
    };
  }
  const res = await fetch(withBase('/api/dossiers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presetKey: presetKey || PAYFAIR_PRESETS[0]!.id,
      ...(inputOverride ? { input: inputOverride } : {}),
    }),
  });
  if (!res.ok) throw new Error('Failed to create PayFairEU dossier');
  return (await res.json()) as DossierBundle;
}

export async function updateDossier(
  mode: BackendMode,
  id: string,
  input: PayFairAssessmentInput,
): Promise<DossierBundle> {
  if (mode === 'local') {
    const st = readLocalStore();
    const idx = st.dossiers.findIndex((d) => d.dossier.id === id);
    if (idx < 0) throw new Error('PayFairEU dossier not found');
    const existing = st.dossiers[idx]!;
    if (existing.status === 'locked') throw new Error('Sealed PayFairEU dossier is locked');
    const clonedInput = structuredClone(input);
    const result = assessPayFairEu(clonedInput);
    const updated: UiPayFairDossier = {
      ...existing.dossier,
      updatedAt: new Date().toISOString(),
      input: clonedInput,
      result,
    };
    st.dossiers[idx] = { ...existing, dossier: updated };
    writeLocalStore(st);
    return {
      dossier: updated,
      status: 'draft',
      slug: updated.slug,
      viewCount: existing.viewCount,
    };
  }
  const res = await fetch(withBase(`/api/dossiers/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Failed to save PayFairEU dossier');
  }
  return (await res.json()) as DossierBundle;
}

export async function deleteDossier(mode: BackendMode, id: string): Promise<void> {
  if (mode === 'local') {
    const st = readLocalStore();
    st.dossiers = st.dossiers.filter((d) => d.dossier.id !== id || d.status === 'locked');
    writeLocalStore(st);
    return;
  }
  const res = await fetch(withBase(`/api/dossiers/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete draft');
}

export async function duplicateDossier(mode: BackendMode, id: string): Promise<DossierBundle> {
  if (mode === 'local') {
    const st = readLocalStore();
    const src = st.dossiers.find((d) => d.dossier.id === id);
    if (!src) throw new Error('PayFairEU dossier not found');
    const item = buildLocalDossierFromInput(
      {
        ...src.dossier.input,
        employerName: `${src.dossier.input.employerName} (Copy)`,
      },
      src.dossier.presetKey,
    );
    st.dossiers.unshift(item);
    writeLocalStore(st);
    return {
      dossier: item.dossier,
      status: 'draft',
      slug: item.dossier.slug,
      viewCount: 0,
    };
  }
  const res = await fetch(withBase(`/api/dossiers/${encodeURIComponent(id)}/duplicate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error('Failed to duplicate dossier');
  return (await res.json()) as DossierBundle;
}

export async function finalizeDossier(mode: BackendMode, id: string): Promise<DossierBundle> {
  if (mode === 'local') {
    const st = readLocalStore();
    const idx = st.dossiers.findIndex((d) => d.dossier.id === id);
    if (idx < 0) throw new Error('PayFairEU dossier not found');
    const curEntry = st.dossiers[idx]!;
    const cur = curEntry.dossier;
    const year = new Date().getUTCFullYear();
    const nextSeq = (st.seqByYear[String(year)] || 0) + 1;
    st.seqByYear[String(year)] = nextSeq;
    const dossierCode = `PAYF-${year}-${String(nextSeq).padStart(4, '0')}`;
    const sha256Digest = await computePayFairDigest(cur.input, cur.result);
    const now = new Date().toISOString();
    const locked: UiPayFairDossier = {
      ...cur,
      dossierCode,
      status: 'locked',
      sha256Digest,
      lockedAt: now,
      updatedAt: now,
    };
    st.dossiers[idx] = { dossier: locked, status: 'locked', viewCount: curEntry.viewCount };
    writeLocalStore(st);
    return {
      dossier: locked,
      status: 'locked',
      slug: locked.slug,
      viewCount: curEntry.viewCount,
      publicReportUrl: `${window.location.origin}${withBase(`/r/${encodeURIComponent(locked.dossierCode)}`)}`,
    };
  }
  const res = await fetch(withBase(`/api/dossiers/${encodeURIComponent(id)}/finalize`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error('Failed to seal PayFairEU dossier');
  return (await res.json()) as DossierBundle;
}

export async function loadPublicReport(
  mode: BackendMode,
  slugOrCode: string,
): Promise<DossierBundle | null> {
  if (mode === 'local') {
    const st = readLocalStore();
    const idx = st.dossiers.findIndex(
      (d) =>
        d.dossier.slug === slugOrCode ||
        d.dossier.dossierCode === slugOrCode ||
        d.dossier.id === slugOrCode,
    );
    if (idx < 0) return null;
    const entry = st.dossiers[idx]!;
    entry.viewCount += 1;
    const target: UiPayFairDossier = {
      ...entry.dossier,
      viewCount: entry.viewCount,
    };
    writeLocalStore(st);
    return {
      dossier: target,
      status: entry.status,
      slug: target.slug,
      viewCount: target.viewCount,
    };
  }
  const res = await fetch(withBase(`/api/public/reports/${encodeURIComponent(slugOrCode)}`));
  if (!res.ok) return null;
  return (await res.json()) as DossierBundle;
}

export async function listProfiles(mode: BackendMode): Promise<EmployerProfileRecord[]> {
  if (mode === 'local') {
    return readLocalStore().profiles;
  }
  const res = await fetch(withBase('/api/profiles'));
  if (!res.ok) return [];
  const data = (await res.json()) as { profiles: EmployerProfileRecord[] };
  return data.profiles || [];
}

export async function saveProfile(
  mode: BackendMode,
  input: PayFairAssessmentInput,
): Promise<EmployerProfileRecord[]> {
  if (mode === 'local') {
    const st = readLocalStore();
    const now = new Date().toISOString();
    const rec: EmployerProfileRecord = {
      id: `emp-${Date.now().toString(36)}`,
      name: input.employerName || 'EU Employer',
      profile: {
        employerName: input.employerName,
        memberStateIso: input.memberStateIso,
        headcountDeclared: input.headcountDeclared,
        reportingYear: input.reportingYear,
        hasObjectivePayCriteriaArt6: input.hasObjectivePayCriteriaArt6,
        hasArt7WorkflowReady: input.hasArt7WorkflowReady,
      },
      createdAt: now,
      updatedAt: now,
    };
    st.profiles.unshift(rec);
    writeLocalStore(st);
    return st.profiles;
  }
  await fetch(withBase('/api/profiles'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employerName: input.employerName,
      memberStateIso: input.memberStateIso,
      headcountDeclared: input.headcountDeclared,
      reportingYear: input.reportingYear,
      hasObjectivePayCriteriaArt6: input.hasObjectivePayCriteriaArt6,
      hasArt7WorkflowReady: input.hasArt7WorkflowReady,
    }),
  });
  return listProfiles('server');
}

export async function deleteProfile(
  mode: BackendMode,
  id: string,
): Promise<EmployerProfileRecord[]> {
  if (mode === 'local') {
    const st = readLocalStore();
    st.profiles = st.profiles.filter((p) => p.id !== id);
    writeLocalStore(st);
    return st.profiles;
  }
  await fetch(withBase(`/api/profiles/${encodeURIComponent(id)}`), { method: 'DELETE' });
  return listProfiles('server');
}

export function triggerBlobDownload(filename: string, content: string | Uint8Array, mime: string) {
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: mime })
      : new Blob([content as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDossierMarkdown(dossier: UiPayFairDossier, locale: Locale) {
  const digest = dossier.sha256Digest || (await computePayFairDigest(dossier.input, dossier.result));
  const md = buildPayFairBriefMarkdown(
    dossier.input,
    dossier.result,
    locale,
    digest,
    dossier.dossierCode || 'DRAFT',
  );
  const fname = `payfaireu-${slugifyLocal(dossier.dossierCode || dossier.slug, 'draft')}-${locale}.md`;
  triggerBlobDownload(fname, md, 'text/markdown; charset=utf-8');
}

export function downloadArt10NoticeMarkdown(dossier: UiPayFairDossier, locale: Locale) {
  const md = buildJointAssessmentNotice(dossier.input, dossier.result, locale);
  const fname = `payfaireu-art10-notice-${slugifyLocal(dossier.dossierCode || dossier.slug, 'draft')}-${locale}.md`;
  triggerBlobDownload(fname, md, 'text/markdown; charset=utf-8');
}

export function downloadArt7DraftMarkdown(dossier: UiPayFairDossier, locale: Locale) {
  const md =
    locale === 'ar' ? dossier.result.article7Clock.letterAr : dossier.result.article7Clock.letterEn;
  const fname = `payfaireu-art7-reply-${slugifyLocal(dossier.dossierCode || dossier.slug, 'draft')}-${locale}.md`;
  triggerBlobDownload(fname, md, 'text/markdown; charset=utf-8');
}

export function downloadJobAdHtmlSnippet(dossier: UiPayFairDossier) {
  const html = dossier.result.jobAdAudit.htmlSnippet;
  const fname = `payfaireu-art5-job-ad-${slugifyLocal(dossier.dossierCode || dossier.slug, 'draft')}.html`;
  triggerBlobDownload(fname, html, 'text/html; charset=utf-8');
}

export function downloadDossierCategoryCsv(dossier: UiPayFairDossier) {
  const csv = exportCategoryGapCsv(dossier.result.metrics, { withBom: true });
  const fname = `payfaireu-${slugifyLocal(dossier.dossierCode || dossier.slug, 'draft')}.csv`;
  triggerBlobDownload(fname, csv, 'text/csv; charset=utf-8');
}

export function runBatchPayrollCsvAudit(
  csvText: string,
  justifications: CategoryJustification[] = [],
): BatchPayrollCsvSummary {
  return parsePayrollCsv(csvText, justifications);
}

export function downloadBatchCategoryGapCsvFile(summary: BatchPayrollCsvSummary) {
  const csv = exportCategoryGapCsv(summary.metrics, { withBom: true });
  triggerBlobDownload('payfaireu-batch-category-gaps.csv', csv, 'text/csv; charset=utf-8');
}
