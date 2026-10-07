import type { TankState } from '../core/types';
import { cleanSummary, type LibraryIndex } from './tankLibrary';

/**
 * Optional cloud save for when the aquarium runs as a published claude.ai page: the keeper's
 * tanks live in their own private documents of the page's `db` capability
 * (`data/users/<id>/tank-<tankId>` plus an index `data/users/<id>/tanks`), so they survive
 * browser-storage eviction (iOS clears site data of pages not visited for a while) and follow the
 * person between devices. Everywhere else (a local dev server, a saved file) `window.claude` is
 * absent and the app simply uses localStorage.
 *
 * Tank bodies are gzip-compressed + base64 when CompressionStream is available (a large tank's
 * JSON can exceed the 256 KiB document limit); otherwise plain JSON with the journal trimmed to fit.
 */

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete?(): Promise<void>;
}
interface DbLike {
  doc(path: string): DocRef;
}
interface UserLike {
  id(): Promise<string | null>;
}
interface ClaudeLike {
  use(name: string): Promise<unknown>;
}

const DOC_LIMIT = 250 * 1024;
const MIN_INTERVAL_MS = 60_000;
const MAX_TOMBSTONES = 100;
/** After a read times out, further reads fail fast for this long (the app stays responsive offline). */
const OFFLINE_BACKOFF_MS = 30_000;
/** Longest wait for one queued write (index read + compress + store) before the queue moves on. */
const WRITE_TIMEOUT_MS = 30_000;

class Timeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Timeout('cloud request timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Result of reading a document: `ok` false when the cloud could not be asked (offline, error, timeout). */
export interface CloudRead<T> {
  ok: boolean;
  value: T | null;
}

/**
 * Two devices' views of the collection, merged (what is written to the cloud index): every
 * tank either side knows, the newer summary of each, deletions from both sides (a deleted tank
 * stays deleted), and this device's open tank as `currentId`.
 */
export function mergeIndexes(local: LibraryIndex, remote: LibraryIndex | null): LibraryIndex {
  const deleted = [...new Set([...(remote?.deleted ?? []), ...(local.deleted ?? [])].filter((x) => typeof x === 'string'))].slice(-MAX_TOMBSTONES);
  const gone = new Set(deleted);
  const byId = new Map<string, LibraryIndex['tanks'][number]>();
  for (const raw of Array.isArray(remote?.tanks) ? remote!.tanks : []) {
    const r = cleanSummary(raw);
    if (r && !gone.has(r.id)) byId.set(r.id, r);
  }
  for (const t of local.tanks) {
    if (gone.has(t.id)) continue;
    const r = byId.get(t.id);
    if (!r || t.lastSavedReal >= r.lastSavedReal) byId.set(t.id, t);
  }
  return { currentId: local.currentId ?? remote?.currentId ?? null, tanks: [...byId.values()], deleted };
}

async function gzipBase64(text: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzipBase64(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Document-safe id segment for a tank id. */
const tankDoc = (id: string) => `tank-${id.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_')}`;

/** Serialized, throttled writer for one document (one write in flight; the latest state wins). */
class DocWriter {
  private lastWrite = 0;
  private writing: Promise<void> | null = null;
  private pending: (() => Promise<void>) | null = null;
  /** Resolves once nothing is queued or in flight (tests, and callers that must wait). */
  idle(): Promise<void> {
    return this.writing ?? Promise.resolve();
  }
  schedule(job: () => Promise<void>, force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastWrite < MIN_INTERVAL_MS) return;
    this.lastWrite = now;
    this.pending = job;
    if (!this.writing) this.writing = this.flush().finally(() => (this.writing = null));
  }
  private async flush(): Promise<void> {
    while (this.pending) {
      const job = this.pending;
      this.pending = null;
      try {
        // A write that never answers must not block every later save of this document.
        await withTimeout(job(), WRITE_TIMEOUT_MS);
      } catch {
        // Quota / transient errors: the local copy remains; the next save retries.
      }
    }
  }
}

export class CloudSave {
  private writers = new Map<string, DocWriter>();
  /** Longest wait for one cloud read before falling back to this browser's copy. */
  readTimeoutMs = 6000;
  private offlineUntil = 0;
  /**
   * Called with the cloud index as read just before each index write (another device may have
   * added, renamed or deleted tanks since boot), so the open app can merge it into its collection.
   */
  onRemoteIndex: ((index: LibraryIndex) => void) | null = null;

  private constructor(
    private db: DbLike,
    private base: string,
  ) {}

  /**
   * Connect if this page runs inside a claude.ai viewer that grants `db` + `user`. Resolves null
   * quickly outside claude.ai, and within `timeoutMs` if the viewer never answers.
   */
  static async connect(timeoutMs = 4000): Promise<CloudSave | null> {
    const claude = (globalThis as unknown as { claude?: ClaudeLike }).claude;
    if (!claude || typeof claude.use !== 'function') return null;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
    try {
      return await Promise.race([
        (async () => {
          const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [DbLike | null, UserLike | null];
          if (!db || !user) return null;
          const id = await user.id();
          if (!id) return null;
          return new CloudSave(db, `data/users/${id}`);
        })(),
        timeout,
      ]);
    } catch {
      return null;
    }
  }

  private writer(key: string): DocWriter {
    let w = this.writers.get(key);
    if (!w) this.writers.set(key, (w = new DocWriter()));
    return w;
  }

  /** One document, within `readTimeoutMs`; `ok` false when the cloud could not answer. */
  private async readDoc(path: string): Promise<CloudRead<Record<string, unknown>>> {
    if (Date.now() < this.offlineUntil) return { ok: false, value: null };
    try {
      const snap = await withTimeout(this.db.doc(path).get(), this.readTimeoutMs);
      return { ok: true, value: snap.exists ? (snap.data() ?? {}) : null };
    } catch (err) {
      if (err instanceof Timeout) this.offlineUntil = Date.now() + OFFLINE_BACKOFF_MS;
      return { ok: false, value: null };
    }
  }

  private async readBody(path: string): Promise<CloudRead<string>> {
    const r = await this.readDoc(path);
    if (!r.ok || !r.value) return { ok: r.ok, value: null };
    const d = r.value;
    try {
      if (typeof d.gz === 'string') return { ok: true, value: await gunzipBase64(d.gz) };
      if (typeof d.json === 'string') return { ok: true, value: d.json };
    } catch {
      /* damaged document: there is a copy, but it can't be read */
    }
    return { ok: false, value: null };
  }

  private async writeTankBody(path: string, json: string): Promise<void> {
    const gz = await gzipBase64(json);
    if (gz && gz.length < DOC_LIMIT) {
      await this.db.doc(path).set({ gz, savedAt: Date.now(), v: 1 });
      return;
    }
    let body = json;
    if (body.length >= DOC_LIMIT) {
      const t = JSON.parse(json) as TankState;
      while (JSON.stringify(t).length >= DOC_LIMIT && t.journal.length > 20) t.journal.splice(0, Math.ceil(t.journal.length / 2));
      body = JSON.stringify(t);
    }
    if (body.length < DOC_LIMIT) await this.db.doc(path).set({ json: body, savedAt: Date.now(), v: 1 });
  }

  // ---- index ------------------------------------------------------------------------------

  /** The cloud index; `ok` false when it could not be read (then it must not be overwritten). */
  async readIndex(): Promise<CloudRead<LibraryIndex>> {
    const r = await this.readDoc(`${this.base}/tanks`);
    if (!r.ok || !r.value) return { ok: r.ok, value: null };
    const d = r.value as unknown as Partial<LibraryIndex>;
    if (!Array.isArray(d.tanks)) return { ok: true, value: null };
    const tanks = d.tanks.map(cleanSummary).filter((t): t is NonNullable<typeof t> => !!t);
    return {
      ok: true,
      value: { currentId: typeof d.currentId === 'string' ? d.currentId : null, tanks, deleted: Array.isArray(d.deleted) ? d.deleted.filter((x) => typeof x === 'string') : [] },
    };
  }

  async loadIndex(): Promise<LibraryIndex | null> {
    return (await this.readIndex()).value;
  }

  /**
   * Write the index, merged with what the cloud holds now (so a tank another device added, or a
   * deletion it made, is never overwritten). Skipped while the cloud index can't be read.
   */
  saveIndex(index: LibraryIndex, force = false): void {
    const local: LibraryIndex = { currentId: index.currentId, tanks: index.tanks.map((t) => ({ ...t, size: { ...t.size } })), deleted: [...(index.deleted ?? [])] };
    this.writer('index').schedule(async () => {
      const remote = await this.readIndex();
      if (!remote.ok) throw new Error('cloud index unreadable: not overwriting it');
      const merged = mergeIndexes(local, remote.value);
      await this.db.doc(`${this.base}/tanks`).set({ currentId: merged.currentId, tanks: merged.tanks, deleted: merged.deleted ?? [] });
      if (remote.value) {
        try {
          this.onRemoteIndex?.(remote.value);
        } catch (err) {
          console.warn('[tanks] merging the cloud index failed', err);
        }
      }
    }, force);
  }

  /** Resolves once every queued cloud write has finished (or failed). */
  async flushed(): Promise<void> {
    await Promise.all([...this.writers.values()].map((w) => w.idle()));
  }

  // ---- tanks ------------------------------------------------------------------------------

  /** A tank's saved JSON (null when missing or unreachable). */
  async loadTank(id: string): Promise<string | null> {
    return (await this.readTank(id)).value;
  }

  /** A tank's saved JSON, telling "not in the cloud" (`ok`, null) from "couldn't ask" (`!ok`). */
  readTank(id: string): Promise<CloudRead<string>> {
    return this.readBody(`${this.base}/${tankDoc(id)}`);
  }

  /** The pre-library single save, if any (`data/users/<id>/aquarium`). */
  async loadLegacy(): Promise<string | null> {
    return (await this.readBody(`${this.base}/aquarium`)).value;
  }

  /** Save a tank (throttled to once a minute per tank unless `force`). */
  save(tank: TankState, force = false): void {
    const json = JSON.stringify(tank);
    this.writer(tank.id).schedule(() => this.writeTankBody(`${this.base}/${tankDoc(tank.id)}`, json), force);
  }

  /** Delete a tank's document (queued behind any save of it still in flight). */
  deleteTank(id: string): void {
    const w = this.writer(id);
    w.schedule(async () => {
      await this.db.doc(`${this.base}/${tankDoc(id)}`).delete?.();
    }, true);
    void w.idle().then(() => {
      if (this.writers.get(id) === w) this.writers.delete(id);
    });
  }
}
