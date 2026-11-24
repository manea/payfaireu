import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function makeError(message, code, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

export function slugify(input, fallback = 'payfair-employer') {
  const cleaned = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function parseJsonSafe(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function openPayFairDatabase(dataDir) {
  const resolvedDataDir = path.resolve(dataDir);
  fs.mkdirSync(resolvedDataDir, { recursive: true });

  const dbPath = path.join(resolvedDataDir, 'payfaireu.sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS dossiers (
      id TEXT PRIMARY KEY,
      public_slug TEXT NOT NULL UNIQUE,
      dossier_code TEXT UNIQUE,
      status TEXT NOT NULL,
      readiness_tier TEXT NOT NULL,
      dossier_json TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dossiers_status ON dossiers(status);
    CREATE INDEX IF NOT EXISTS idx_dossiers_updated ON dossiers(updated_at DESC);

    CREATE TABLE IF NOT EXISTS employer_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_employer_profiles_updated ON employer_profiles(updated_at DESC);

    CREATE TABLE IF NOT EXISTS dossier_counters (
      year INTEGER PRIMARY KEY,
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dossier_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dossier_events ON dossier_events(dossier_id, id DESC);
  `);

  function ensureUniqueSlug(desiredSlug, excludeId = null) {
    const base = slugify(desiredSlug, 'payfair-employer');
    let candidate = base;
    let suffix = 2;
    const checkStmt = db.prepare('SELECT id FROM dossiers WHERE public_slug = ?');
    while (true) {
      const existing = checkStmt.get(candidate);
      if (!existing || (excludeId && existing.id === excludeId)) {
        return candidate;
      }
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  }

  function insertEvent(dossierId, eventType, actor, meta = {}, createdAt = new Date().toISOString()) {
    db.prepare(
      'INSERT INTO dossier_events (dossier_id, event_type, actor, meta_json, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(dossierId, eventType, actor, JSON.stringify(meta), createdAt);
  }

  function findDossierRowByKey(key) {
    return db
      .prepare('SELECT * FROM dossiers WHERE id = ? OR public_slug = ? OR dossier_code = ?')
      .get(key, key, key);
  }

  function hydrateBundle(row) {
    if (!row) return null;
    const dossier = parseJsonSafe(row.dossier_json, null);
    if (!dossier) return null;

    const events = db
      .prepare(
        'SELECT id, dossier_id, event_type, actor, meta_json, created_at FROM dossier_events WHERE dossier_id = ? ORDER BY id DESC LIMIT 30',
      )
      .all(dossier.id)
      .map((ev) => ({
        id: ev.id,
        dossierId: ev.dossier_id,
        eventType: ev.event_type,
        actor: ev.actor,
        meta: parseJsonSafe(ev.meta_json, {}),
        createdAt: ev.created_at,
      }));

    return {
      dossier: {
        ...dossier,
        viewCount: Number(row.view_count || 0),
      },
      status: row.status,
      slug: row.public_slug,
      viewCount: Number(row.view_count || 0),
      dossierEvents: events,
    };
  }

  function getStats() {
    const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM dossiers').get();
    const byStatusRows = db.prepare('SELECT status, COUNT(*) AS cnt FROM dossiers GROUP BY status').all();
    const profRow = db.prepare('SELECT COUNT(*) AS cnt FROM employer_profiles').get();
    let draftDossiers = 0;
    let lockedDossiers = 0;
    for (const row of byStatusRows) {
      if (row.status === 'draft') draftDossiers = Number(row.cnt || 0);
      if (row.status === 'locked') lockedDossiers = Number(row.cnt || 0);
    }
    return {
      totalDossiers: Number(totalRow?.cnt || 0),
      draftDossiers,
      lockedDossiers,
      employerProfilesCount: Number(profRow?.cnt || 0),
    };
  }

  function listDossiers() {
    const rows = db
      .prepare(
        'SELECT id, public_slug, dossier_code, status, readiness_tier, dossier_json, view_count, created_at, updated_at FROM dossiers ORDER BY updated_at DESC',
      )
      .all();

    return rows
      .map((row) => {
        const dossier = parseJsonSafe(row.dossier_json, null);
        if (!dossier) return null;
        return {
          id: row.id,
          slug: row.public_slug,
          dossierCode: row.dossier_code ?? (dossier.dossierCode || ''),
          status: row.status,
          readinessTier: row.readiness_tier,
          viewCount: Number(row.view_count || 0),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          dossier: {
            ...dossier,
            viewCount: Number(row.view_count || 0),
          },
        };
      })
      .filter((entry) => entry !== null);
  }

  function getDossierById(id) {
    const row = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(id);
    return hydrateBundle(row);
  }

  function getDossierBySlugOrCode(slugOrCode, { incrementView = false } = {}) {
    const row = findDossierRowByKey(slugOrCode);
    if (!row) return null;
    if (incrementView) {
      db.prepare('UPDATE dossiers SET view_count = view_count + 1 WHERE id = ?').run(row.id);
      return getDossierById(row.id);
    }
    return hydrateBundle(row);
  }

  function createDossier(dossierInput, actor = 'payfair-coordinator') {
    const now = dossierInput.createdAt || new Date().toISOString();
    const id =
      dossierInput.id || `payf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const uniqueSlug = ensureUniqueSlug(
      dossierInput.slug || dossierInput.input?.employerName || id,
      id,
    );
    const readinessTier = dossierInput.result?.tier || 'blocked';
    const dossier = {
      id,
      presetKey: dossierInput.presetKey || '',
      slug: uniqueSlug,
      dossierCode: '',
      status: 'draft',
      localeDefault: dossierInput.localeDefault === 'ar' ? 'ar' : 'en',
      createdAt: now,
      updatedAt: dossierInput.updatedAt || now,
      lockedAt: null,
      sha256Digest: null,
      viewCount: 0,
      input: dossierInput.input,
      result: dossierInput.result,
    };

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO dossiers
         (id, public_slug, dossier_code, status, readiness_tier, dossier_json, view_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        dossier.id,
        dossier.slug,
        null,
        'draft',
        readinessTier,
        JSON.stringify(dossier),
        now,
        dossier.updatedAt,
      );

      insertEvent(
        dossier.id,
        'DOSSIER_CREATED',
        actor,
        {
          slug: dossier.slug,
          readinessTier,
          readinessScore: dossier.result?.readinessScore ?? 0,
          reportingFrequency: dossier.result?.reportingObligation?.frequency ?? '',
          anyJointPayAssessmentTriggered: Boolean(
            dossier.result?.metrics?.anyJointPayAssessmentTriggered,
          ),
        },
        now,
      );
      db.exec('COMMIT');
      return getDossierById(dossier.id);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function updateDossier(id, mutatorFn, actor = 'payfair-coordinator', eventType = 'DOSSIER_UPDATED') {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = findDossierRowByKey(id);
      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }
      const current = parseJsonSafe(row.dossier_json, null);
      if (!current) {
        db.exec('ROLLBACK');
        return null;
      }
      if (row.status === 'locked' || current.status === 'locked' || current.lockedAt) {
        throw makeError(
          'Sealed PayFairEU dossier is immutable against modification.',
          'DOSSIER_LOCKED',
          409,
        );
      }

      const next = mutatorFn(current);
      if (!next) {
        db.exec('ROLLBACK');
        return null;
      }

      const uniqueSlug = ensureUniqueSlug(next.slug || current.slug, current.id);
      const now = new Date().toISOString();
      const readinessTier = next.result?.tier || row.readiness_tier || 'blocked';
      const updated = {
        ...next,
        id: current.id,
        slug: uniqueSlug,
        dossierCode: '',
        status: 'draft',
        lockedAt: null,
        sha256Digest: null,
        createdAt: current.createdAt || row.created_at,
        updatedAt: now,
      };

      db.prepare(
        'UPDATE dossiers SET public_slug = ?, readiness_tier = ?, dossier_json = ?, updated_at = ? WHERE id = ?',
      ).run(
        updated.slug,
        readinessTier,
        JSON.stringify(updated),
        updated.updatedAt,
        current.id,
      );

      insertEvent(
        current.id,
        eventType,
        actor,
        {
          readinessTier,
          readinessScore: updated.result?.readinessScore ?? 0,
          anyJointPayAssessmentTriggered: Boolean(
            updated.result?.metrics?.anyJointPayAssessmentTriggered,
          ),
        },
        now,
      );
      db.exec('COMMIT');
      return getDossierById(current.id);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function deleteDossier(id) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = findDossierRowByKey(id);
      if (!row) {
        db.exec('ROLLBACK');
        return { deleted: false };
      }
      if (row.status === 'locked') {
        throw makeError(
          'Locked PayFairEU dossier cannot be deleted; duplicate it into a new editable draft instead.',
          'DOSSIER_LOCKED',
          409,
        );
      }
      db.prepare('DELETE FROM dossiers WHERE id = ?').run(row.id);
      db.exec('COMMIT');
      return { deleted: true, id: row.id };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function duplicateDossier(id, actor = 'payfair-coordinator') {
    const sourceBundle = getDossierById(id) || getDossierBySlugOrCode(id);
    if (!sourceBundle) return null;
    const src = sourceBundle.dossier;
    const now = new Date().toISOString();
    const suffix = crypto.randomBytes(2).toString('hex');
    const newId = `payf-${Date.now().toString(36)}-${suffix}`;
    const cloned = {
      ...src,
      id: newId,
      slug: `${slugify(src.slug || src.input?.employerName, 'payfair-employer')}-copy-${suffix}`,
      dossierCode: '',
      status: 'draft',
      lockedAt: null,
      sha256Digest: null,
      input: {
        ...src.input,
        employerName: `${src.input.employerName} (Copy)`,
      },
      createdAt: now,
      updatedAt: now,
    };
    return createDossier(cloned, actor);
  }

  function finalizeDossier(id, computeDigestSyncFn, actor = 'payfair-coordinator') {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = findDossierRowByKey(id);
      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }
      const current = parseJsonSafe(row.dossier_json, null);
      if (!current) {
        db.exec('ROLLBACK');
        return null;
      }
      if (row.status === 'locked' || current.status === 'locked' || current.lockedAt) {
        throw makeError('PayFairEU readiness dossier is already finalized.', 'ALREADY_LOCKED', 409);
      }

      const now = new Date().toISOString();
      const year = new Date().getUTCFullYear();
      db.prepare(
        'INSERT INTO dossier_counters (year, last_seq) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1',
      ).run(year);
      const seqRow = db.prepare('SELECT last_seq FROM dossier_counters WHERE year = ?').get(year);
      const seq = Number(seqRow?.last_seq || 1);
      const dossierCode = `PAYF-${year}-${String(seq).padStart(4, '0')}`;

      const sha256Digest = computeDigestSyncFn(current.input, current.result);

      const lockedDossier = {
        ...current,
        dossierCode,
        status: 'locked',
        sha256Digest,
        lockedAt: now,
        updatedAt: now,
      };

      db.prepare(
        'UPDATE dossiers SET dossier_code = ?, status = ?, dossier_json = ?, updated_at = ? WHERE id = ?',
      ).run(dossierCode, 'locked', JSON.stringify(lockedDossier), now, current.id);

      insertEvent(current.id, 'DOSSIER_FINALIZED', actor, { dossierCode, sha256Digest }, now);

      db.exec('COMMIT');
      return getDossierById(current.id);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  function listProfiles() {
    return db
      .prepare(
        'SELECT id, name, profile_json, created_at, updated_at FROM employer_profiles ORDER BY updated_at DESC',
      )
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        profile: parseJsonSafe(row.profile_json, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  function saveProfile(profileInput) {
    const now = new Date().toISOString();
    const id =
      profileInput.id || `emp-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const name =
      String(profileInput.employerName || profileInput.name || 'EU Employer').trim() ||
      'EU Employer';
    const rawHeadcount = Number(profileInput.headcountDeclared);
    const rawYear = Number(profileInput.reportingYear);

    const profile = {
      employerName: name,
      memberStateIso:
        String(profileInput.memberStateIso ?? 'DE')
          .trim()
          .toUpperCase()
          .slice(0, 2) || 'DE',
      headcountDeclared: Number.isFinite(rawHeadcount)
        ? Math.max(1, Math.floor(rawHeadcount))
        : 250,
      reportingYear:
        Number.isFinite(rawYear) && rawYear >= 2024 && rawYear <= 2100 ? Math.floor(rawYear) : 2026,
      hasObjectivePayCriteriaArt6: Boolean(profileInput.hasObjectivePayCriteriaArt6),
      hasArt7WorkflowReady: Boolean(profileInput.hasArt7WorkflowReady),
    };

    db.prepare(
      `INSERT INTO employer_profiles (id, name, profile_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, profile_json = excluded.profile_json, updated_at = excluded.updated_at`,
    ).run(id, name, JSON.stringify(profile), now, now);

    const row = db
      .prepare('SELECT id, name, profile_json, created_at, updated_at FROM employer_profiles WHERE id = ?')
      .get(id);
    return {
      id: row.id,
      name: row.name,
      profile: parseJsonSafe(row.profile_json, profile),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function deleteProfile(id) {
    const info = db.prepare('DELETE FROM employer_profiles WHERE id = ?').run(id);
    return { deleted: info.changes > 0 };
  }

  return {
    dbPath,
    getStats,
    listDossiers,
    getDossierById,
    getDossierBySlugOrCode,
    createDossier,
    updateDossier,
    deleteDossier,
    duplicateDossier,
    finalizeDossier,
    listProfiles,
    saveProfile,
    deleteProfile,
    close: () => db.close(),
  };
}
