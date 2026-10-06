import type { TankState } from '../core/types';

/**
 * Optional cloud save for when the aquarium runs as a published claude.ai page: the tank is kept
 * in the viewer's own private document (`data/users/<id>/aquarium`) of the page's `db`
 * capability, so it survives browser-storage eviction (iOS clears site data of pages that are not
 * visited for a while) and follows the person between devices. Everywhere else (a local dev
 * server, a saved file) `window.claude` is absent and the app simply uses localStorage.
 *
 * Bodies are gzip-compressed + base64 when CompressionStream is available (a large tank's JSON
 * can exceed the 256 KiB document limit); otherwise plain JSON with the journal trimmed to fit.
 */

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
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

export class CloudSave {
  private constructor(
    private ref: DocRef,
    private lastWrite = 0,
    private writing: Promise<void> | null = null,
    private pending: string | null = null,
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
      const got = await Promise.race([
        (async () => {
          const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [DbLike | null, UserLike | null];
          if (!db || !user) return null;
          const id = await user.id();
          if (!id) return null;
          return new CloudSave(db.doc(`data/users/${id}/aquarium`));
        })(),
        timeout,
      ]);
      return got;
    } catch {
      return null;
    }
  }

  /** The saved tank JSON, or null when there is none (or it cannot be read). */
  async load(): Promise<string | null> {
    try {
      const snap = await this.ref.get();
      if (!snap.exists) return null;
      const d = snap.data() ?? {};
      if (typeof d.gz === 'string') return await gunzipBase64(d.gz);
      if (typeof d.json === 'string') return d.json;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save (throttled to once a minute unless `force`). Writes are serialized: one in flight at a
   * time, the latest state wins.
   */
  save(tank: TankState, force = false): void {
    const now = Date.now();
    if (!force && now - this.lastWrite < MIN_INTERVAL_MS) return;
    this.lastWrite = now;
    this.pending = JSON.stringify(tank);
    if (!this.writing) this.writing = this.flush().finally(() => (this.writing = null));
  }

  private async flush(): Promise<void> {
    while (this.pending) {
      const json = this.pending;
      this.pending = null;
      try {
        const gz = await gzipBase64(json);
        if (gz && gz.length < DOC_LIMIT) {
          await this.ref.set({ gz, savedAt: Date.now(), v: 1 });
          continue;
        }
        // No compression available (or still too big): trim the journal until it fits.
        let body = json;
        if (body.length >= DOC_LIMIT) {
          const t = JSON.parse(json) as TankState;
          while (JSON.stringify(t).length >= DOC_LIMIT && t.journal.length > 20) t.journal.splice(0, Math.ceil(t.journal.length / 2));
          body = JSON.stringify(t);
        }
        if (body.length < DOC_LIMIT) await this.ref.set({ json: body, savedAt: Date.now(), v: 1 });
      } catch {
        // Quota / transient errors: the local copy remains; try again on the next save.
      }
    }
  }
}
