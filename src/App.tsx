import { useEffect, useRef, useState } from 'react';
import {
  CopyPlus,
  Globe,
  HardDrive,
  Lock,
  Moon,
  Plus,
  Save,
  Scale,
  Server,
  Sun,
  Trash2,
} from 'lucide-react';
import { PAYFAIR_PRESETS } from './core/presets.ts';
import { assessPayFairEu } from './core/readinessAssessor.ts';
import type { Locale, PayFairAssessmentInput, WorkerPayRow } from './core/types.ts';
import {
  createDossier,
  deleteDossier,
  deleteProfile,
  detectBackendMode,
  duplicateDossier,
  finalizeDossier,
  listDossiers,
  listProfiles,
  loadPublicReport,
  saveProfile,
  updateDossier,
  type BackendMode,
  type DossierListRecord,
  type EmployerProfileRecord,
  type UiPayFairDossier,
} from './lib/api.ts';
import { stripBase, withBase } from './lib/basePath.ts';
import { THEME_OPTIONS, getLabels, isolateLtr, type ThemeId } from './lib/i18n.ts';
import { EmployerAndPayGapPanel } from './components/EmployerAndPayGapPanel.tsx';
import { JobAdAndArt7Panel } from './components/JobAdAndArt7Panel.tsx';
import { BatchPayrollCsvPanel } from './components/BatchPayrollCsvPanel.tsx';
import { DossierPreviewAndPrint } from './components/DossierPreviewAndPrint.tsx';

type TabKey = 'analytics' | 'notices' | 'batch' | 'dossier';

const LOCALE_STORAGE_KEY = 'payfaireu_locale';
const THEME_STORAGE_KEY = 'payfaireu_theme';

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return saved === 'ar' ? 'ar' : 'en';
}

function readInitialTheme(): ThemeId {
  if (typeof window === 'undefined') return 'equity-parchment';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'boardroom-slate' ? 'boardroom-slate' : 'equity-parchment';
}

function getPublicSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const rel = stripBase(window.location.pathname);
  const match = rel.match(/^\/r\/([^/]+)$/);
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(readInitialLocale);
  const [theme, setTheme] = useState<ThemeId>(readInitialTheme);
  const [mode, setMode] = useState<BackendMode>('local');
  const [activeTab, setActiveTab] = useState<TabKey>('analytics');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PAYFAIR_PRESETS[0]!.id);
  const [dossiers, setDossiers] = useState<DossierListRecord[]>([]);
  const [activeDossier, setActiveDossier] = useState<UiPayFairDossier | null>(null);
  const [profiles, setProfiles] = useState<EmployerProfileRecord[]>([]);
  const [publicSlug, setPublicSlug] = useState<string | null>(getPublicSlugFromUrl);
  const [publicNotFound, setPublicNotFound] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const saveTimerRef = useRef<number | null>(null);

  const t = getLabels(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [locale, theme]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const detected = await detectBackendMode();
      if (cancelled) return;
      setMode(detected);

      const routeSlug = getPublicSlugFromUrl();
      if (routeSlug) {
        setPublicSlug(routeSlug);
        const pub = await loadPublicReport(detected, routeSlug);
        if (cancelled) return;
        if (!pub) {
          setPublicNotFound(true);
        } else {
          setActiveDossier(pub.dossier);
          setActiveTab('dossier');
        }
        return;
      }

      const [list, profs] = await Promise.all([
        listDossiers(detected),
        listProfiles(detected),
      ]);
      if (cancelled) return;
      setProfiles(profs);

      if (list.length === 0) {
        const created = await createDossier(detected, PAYFAIR_PRESETS[0]!.id);
        if (cancelled) return;
        const refreshed = await listDossiers(detected);
        setDossiers(refreshed);
        setActiveDossier(created.dossier);
      } else {
        setDossiers(list);
        setActiveDossier(list[0]!.dossier);
      }
    }

    bootstrap().catch((err: unknown) => {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to initialize PayFairEU');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function clearPendingSave() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  async function refreshListAndProfiles(curMode: BackendMode) {
    const [list, profs] = await Promise.all([listDossiers(curMode), listProfiles(curMode)]);
    setDossiers(list);
    setProfiles(profs);
  }

  function handleInputChange(nextInput: PayFairAssessmentInput) {
    if (!activeDossier || activeDossier.status === 'locked' || publicSlug) return;
    const optimisticResult = assessPayFairEu(nextInput);
    const updatedLocal: UiPayFairDossier = {
      ...activeDossier,
      input: nextInput,
      result: optimisticResult,
      updatedAt: new Date().toISOString(),
    };
    setActiveDossier(updatedLocal);
    setDossiers((prev) =>
      prev.map((d) =>
        d.id === updatedLocal.id
          ? {
              ...d,
              readinessTier: optimisticResult.tier,
              dossier: updatedLocal,
            }
          : d,
      ),
    );

    clearPendingSave();
    const targetId = activeDossier.id;
    saveTimerRef.current = window.setTimeout(() => {
      updateDossier(mode, targetId, nextInput)
        .then((bundle) => {
          setActiveDossier((prev) => (prev && prev.id === targetId ? bundle.dossier : prev));
          setErrorBanner('');
        })
        .catch((err: unknown) => {
          setErrorBanner(err instanceof Error ? err.message : 'Sync failed');
        });
    }, mode === 'local' ? 120 : 280);
  }

  async function handleFlushPendingSave(targetId: string, nextInput: PayFairAssessmentInput) {
    clearPendingSave();
    const bundle = await updateDossier(mode, targetId, nextInput);
    setActiveDossier(bundle.dossier);
    return bundle.dossier;
  }

  async function handleCreateFromPreset(presetId: string) {
    clearPendingSave();
    setErrorBanner('');
    setSelectedPresetId(presetId);
    const bundle = await createDossier(mode, presetId);
    setActiveDossier(bundle.dossier);
    await refreshListAndProfiles(mode);
  }

  async function handleSeal() {
    if (!activeDossier || activeDossier.status === 'locked') return;
    setErrorBanner('');
    await handleFlushPendingSave(activeDossier.id, activeDossier.input);
    const sealed = await finalizeDossier(mode, activeDossier.id);
    setActiveDossier(sealed.dossier);
    setActiveTab('dossier');
    await refreshListAndProfiles(mode);
  }

  async function handleDuplicate() {
    if (!activeDossier) return;
    clearPendingSave();
    setErrorBanner('');
    const dup = await duplicateDossier(mode, activeDossier.id);
    setActiveDossier(dup.dossier);
    setActiveTab('analytics');
    await refreshListAndProfiles(mode);
  }

  async function handleDeleteDraft() {
    if (!activeDossier || activeDossier.status === 'locked') return;
    clearPendingSave();
    setErrorBanner('');
    await deleteDossier(mode, activeDossier.id);
    const remaining = await listDossiers(mode);
    if (remaining.length === 0) {
      const created = await createDossier(mode, PAYFAIR_PRESETS[0]!.id);
      const refreshed = await listDossiers(mode);
      setDossiers(refreshed);
      setActiveDossier(created.dossier);
    } else {
      setDossiers(remaining);
      setActiveDossier(remaining[0]!.dossier);
    }
  }

  async function handleSaveEmployerProfile() {
    if (!activeDossier) return;
    const nextProfiles = await saveProfile(mode, activeDossier.input);
    setProfiles(nextProfiles);
  }

  async function handleApplyProfile(profileId: string) {
    const chosen = profiles.find((p) => p.id === profileId);
    if (!chosen || !activeDossier || activeDossier.status === 'locked') return;
    handleInputChange({
      ...activeDossier.input,
      employerName: chosen.profile.employerName,
      memberStateIso: chosen.profile.memberStateIso,
      headcountDeclared: chosen.profile.headcountDeclared,
      reportingYear: chosen.profile.reportingYear,
      hasObjectivePayCriteriaArt6: chosen.profile.hasObjectivePayCriteriaArt6,
      hasArt7WorkflowReady: chosen.profile.hasArt7WorkflowReady,
    });
  }

  async function handleDeleteProfile(profileId: string) {
    const nextProfiles = await deleteProfile(mode, profileId);
    setProfiles(nextProfiles);
  }

  function handleApplyBatchWorkers(workers: WorkerPayRow[]) {
    if (!activeDossier || activeDossier.status === 'locked') return;
    handleInputChange({
      ...activeDossier.input,
      workers,
    });
  }

  function exitPublicRoute() {
    window.history.pushState({}, '', withBase('/'));
    window.location.reload();
  }

  if (publicNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="payfair-card rounded-2xl max-w-md w-full p-6 text-center space-y-3">
          <Scale className="h-10 w-10 mx-auto text-[var(--accent-amber)]" />
          <h1 className="text-lg font-bold">{t.notFoundTitle}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t.notFoundDesc}</p>
          <button
            type="button"
            onClick={exitPublicRoute}
            className="rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] px-4 py-2 text-sm font-semibold"
          >
            {t.backToWorkspace}
          </button>
        </div>
      </div>
    );
  }

  if (!activeDossier) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
        Loading PayFairEU Studio...
      </div>
    );
  }

  const isLocked = activeDossier.status === 'locked' || Boolean(publicSlug);
  const res = activeDossier.result;
  const shareSlugOrCode = activeDossier.dossierCode || activeDossier.slug;
  const publicShareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${withBase(`/r/${encodeURIComponent(shareSlugOrCode)}`)}`
      : `/r/${shareSlugOrCode}`;

  const kpiTierBg =
    res.tier === 'ready'
      ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
      : res.tier === 'conditional'
        ? 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
        : 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header Toolbar */}
      <header className="no-print border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-base sm:text-lg leading-tight payfair-display truncate">
                  {t.brandTitle}
                </div>
                <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] truncate">
                  {t.brandSubtitle}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold">
                {mode === 'server' ? (
                  <Server className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
                ) : (
                  <HardDrive className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                )}
                {mode === 'server' ? t.modeServer : t.modeLocal}
              </span>

              <button
                type="button"
                data-testid="toggle-theme"
                aria-label={t.themeLabel}
                onClick={() =>
                  setTheme((prev) =>
                    prev === 'equity-parchment' ? 'boardroom-slate' : 'equity-parchment',
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
              >
                {theme === 'equity-parchment' ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {THEME_OPTIONS.find((x) => x.id === theme)?.[locale]}
                </span>
              </button>

              <button
                type="button"
                data-testid="toggle-locale"
                onClick={() => setLocale((prev) => (prev === 'en' ? 'ar' : 'en'))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg-elevated)]"
              >
                <Globe className="h-3.5 w-3.5" />
                {t.langToggle}
              </button>
            </div>
          </div>

          {/* Workspace Control Row */}
          {publicSlug ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg-elevated)] px-3 py-2 text-xs">
              <span className="font-semibold text-[var(--accent-primary)]">{t.publicBanner}</span>
              <button
                type="button"
                onClick={exitPublicRoute}
                className="rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] px-3 py-1 font-semibold"
              >
                {t.backToWorkspace}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                <select
                  aria-label="Active Dossier"
                  className="payfair-input text-xs py-1.5 max-w-full sm:w-56"
                  value={activeDossier.id}
                  onChange={(e) => {
                    clearPendingSave();
                    const picked = dossiers.find((d) => d.id === e.target.value);
                    if (picked) setActiveDossier(picked.dossier);
                  }}
                >
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.dossierCode ? `[${d.dossierCode}] ` : ''}
                      {d.dossier.input.employerName}
                    </option>
                  ))}
                </select>

                <select
                  data-testid="preset-select"
                  aria-label={t.presetLabel}
                  className="payfair-input text-xs py-1.5 max-w-full sm:w-64"
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                >
                  {PAYFAIR_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {locale === 'ar' ? p.labelAr : p.labelEn}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  data-testid="new-from-preset-btn"
                  onClick={() => void handleCreateFromPreset(selectedPresetId)}
                  className="inline-flex items-center gap-1 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] px-3 py-1.5 font-semibold hover:opacity-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t.newPresetBtn}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {profiles.length > 0 && !isLocked && (
                  <div className="inline-flex items-center gap-1">
                    <select
                      aria-label={t.savedProfiles}
                      className="payfair-input text-xs py-1.5 w-40"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) void handleApplyProfile(e.target.value);
                      }}
                    >
                      <option value="">{t.savedProfiles}...</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {profiles[0] && (
                      <button
                        type="button"
                        aria-label="Delete Latest Saved Employer"
                        onClick={() => void handleDeleteProfile(profiles[0]!.id)}
                        className="rounded-lg p-1.5 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-crimson)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleSaveEmployerProfile()}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] px-2.5 py-1.5 font-semibold hover:bg-[var(--bg-elevated)]"
                >
                  <Save className="h-3.5 w-3.5" />
                  {t.saveProfileBtn}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDuplicate()}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] px-2.5 py-1.5 font-semibold hover:bg-[var(--bg-elevated)]"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                  {t.duplicateBtn}
                </button>

                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteDraft()}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] px-2.5 py-1.5 font-semibold text-[var(--accent-crimson)] hover:bg-[var(--accent-crimson-soft)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.deleteDraftBtn}
                  </button>
                )}

                {!isLocked && (
                  <button
                    type="button"
                    data-testid="seal-dossier-btn"
                    onClick={() => void handleSeal()}
                    className="inline-flex items-center gap-1 rounded-xl bg-[var(--accent-teal)] text-[var(--accent-teal-fg)] px-3 py-1.5 font-bold hover:opacity-95"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {t.sealBtn}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 space-y-5">
        {errorBanner && (
          <div className="no-print rounded-xl bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)] px-4 py-2.5 text-xs font-semibold">
            {errorBanner}
          </div>
        )}

        {/* Executive KPI Strip */}
        <section className="no-print grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-xs num-tabular">
          <div className="payfair-card rounded-2xl p-3">
            <div className="text-[var(--text-secondary)]">{t.kpiSchedule}</div>
            <div className="font-bold text-sm mt-1">
              {t.frequencyLabels[res.reportingObligation.frequency]}
            </div>
          </div>

          <div className="payfair-card rounded-2xl p-3">
            <div className="text-[var(--text-secondary)]">{t.kpiMeanGap}</div>
            <div className="font-extrabold text-base payfair-mono mt-1">
              {isolateLtr(`${res.metrics.meanPayGapPct ?? 'N/A'}%`)}
            </div>
          </div>

          <div className="payfair-card rounded-2xl p-3">
            <div className="text-[var(--text-secondary)]">{t.kpiMedianGap}</div>
            <div className="font-extrabold text-base payfair-mono mt-1">
              {isolateLtr(`${res.metrics.medianPayGapPct ?? 'N/A'}%`)}
            </div>
          </div>

          <div className="payfair-card rounded-2xl p-3">
            <div className="text-[var(--text-secondary)]">{t.kpiArt10}</div>
            <div
              data-testid="kpi-art10"
              className={`inline-block rounded-full px-2.5 py-0.5 font-bold mt-1 ${
                res.metrics.anyJointPayAssessmentTriggered
                  ? 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]'
                  : 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
              }`}
            >
              {res.metrics.anyJointPayAssessmentTriggered
                ? t.art10TriggeredYes
                : t.art10TriggeredNo}
            </div>
          </div>

          <div className="payfair-card rounded-2xl p-3">
            <div className="text-[var(--text-secondary)]">{t.kpiTransposition}</div>
            <div className="font-bold text-sm payfair-mono mt-1">
              {isolateLtr(res.transpositionDeadline)}
            </div>
          </div>

          <div className="payfair-card rounded-2xl p-3">
            <div className="text-[var(--text-secondary)]">{t.kpiScore}</div>
            <div data-testid="kpi-score" className="flex items-center gap-2 mt-1">
              <span className="font-extrabold text-base payfair-mono">
                {isolateLtr(`${res.readinessScore}/100`)}
              </span>
              <span className={`rounded-full px-2 py-0.5 font-bold ${kpiTierBg}`}>
                {t.tierLabels[res.tier]}
              </span>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        {!publicSlug && (
          <nav className="no-print flex flex-wrap gap-2">
            {(
              [
                ['analytics', t.tabs.analytics],
                ['notices', t.tabs.notices],
                ['batch', t.tabs.batch],
                ['dossier', t.tabs.dossier],
              ] as Array<[TabKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-testid={`tab-${key}`}
                onClick={() => setActiveTab(key)}
                className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
                  activeTab === key
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {/* Active Panel */}
        {activeTab === 'analytics' && !publicSlug && (
          <EmployerAndPayGapPanel
            input={activeDossier.input}
            result={res}
            locale={locale}
            locked={isLocked}
            onChange={handleInputChange}
          />
        )}

        {activeTab === 'notices' && !publicSlug && (
          <JobAdAndArt7Panel
            dossier={activeDossier}
            locale={locale}
            locked={isLocked}
            onChange={handleInputChange}
          />
        )}

        {activeTab === 'batch' && !publicSlug && (
          <BatchPayrollCsvPanel
            locale={locale}
            locked={isLocked}
            justifications={activeDossier.input.categoryJustifications}
            onApplyWorkers={handleApplyBatchWorkers}
          />
        )}

        {(activeTab === 'dossier' || Boolean(publicSlug)) && (
          <DossierPreviewAndPrint
            dossier={activeDossier}
            locale={locale}
            publicShareUrl={publicShareUrl}
          />
        )}
      </main>

      <footer
        data-testid="legal-disclaimer"
        className="no-print border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-3 px-4 text-center text-[11px] text-[var(--text-secondary)]"
      >
        {t.legalFooter}
      </footer>
    </div>
  );
}
