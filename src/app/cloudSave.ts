import type { TankState } from '../core/types';
import type { LibraryIndex } from './tankLibrary';

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
        await job();
      } catch {
        // Quota / transient errors: the local copy remains; the next save retries.
      }
    }
  }
}

export class CloudSave {
  private writers = new Map<string, DocWriter>();

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

  private async readBody(path: string): Promise<string | null> {
    try {
      const snap = await this.db.doc(path).get();
      if (!snap.exists) return null;
      const d = snap.data() ?? {};
      if (typeof d.gz === 'string') return await gunzipBase64(d.gz);
      if (typeof d.json === 'string') return d.json;
      return null;
    } catch {
      return null;
    }
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

  async loadIndex(): Promise<LibraryIndex | null> {
    try {
      const snap = await this.db.doc(`${this.base}/tanks`).get();
      if (!snap.exists) return null;
      const d = snap.data() as unknown as LibraryIndex | undefined;
      if (!d || !Array.isArray(d.tanks)) return null;
      return { currentId: d.currentId ?? null, tanks: d.tanks, deleted: Array.isArray(d.deleted) ? d.deleted.filter((x) => typeof x === 'string') : [] };
    } catch {
      return null;
    }
  }

  saveIndex(index: LibraryIndex, force = false): void {
    this.writer('index').schedule(() => this.db.doc(`${this.base}/tanks`).set({ currentId: index.currentId, tanks: index.tanks, deleted: index.deleted ?? [] }), force);
  }

  // ---- tanks ------------------------------------------------------------------------------

  /** A tank's saved JSON. */
  async loadTank(id: string): Promise<string | null> {
    return this.readBody(`${this.base}/${tankDoc(id)}`);
  }

  /** The pre-library single save, if any (`data/users/<id>/aquarium`). */
  async loadLegacy(): Promise<string | null> {
    return this.readBody(`${this.base}/aquarium`);
  }

  /** Save a tank (throttled to once a minute per tank unless `force`). */
  save(tank: TankState, force = false): void {
    const json = JSON.stringify(tank);
    this.writer(tank.id).schedule(() => this.writeTankBody(`${this.base}/${tankDoc(tank.id)}`, json), force);
  }

  /** Delete a tank's document (queued behind any save of it still in flight). */
  deleteTank(id: string): void {
    this.writer(id).schedule(async () => {
      await this.db.doc(`${this.base}/${tankDoc(id)}`).delete?.();
    }, true);
  }
}
