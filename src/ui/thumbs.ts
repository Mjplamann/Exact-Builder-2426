/**
 * Lazy portrait loading for the catalog. Real portraits come from `FishRenderer.thumbnail()`
 * (an offscreen 3D render). Requests are queued newest-first (whatever the user is looking at now
 * wins) and run one at a time with a frame gap, so scrolling through 2000 species never stalls
 * the tank. Until a portrait exists, callers show the procedural silhouette.
 */
import type { Species } from '../core/types';
import type { FishRenderer } from '../render/fish/FishRenderer';
import { silhouetteDataUrl } from './silhouette';

type Callback = (url: string) => void;

interface Job {
  key: string;
  species: Species;
  size: number;
  /** Who asked (e.g. 'catalog'), so a list can drop just its own stale requests. */
  tag: string;
}

/** Retry an empty result after this long (the renderer may simply not be ready yet). */
const RETRY_EMPTY_MS = 45_000;
const MAX_QUEUE = 48;

export class ThumbnailLoader {
  private ready = new Map<string, string>();
  private emptyAt = new Map<string, number>();
  private waiting = new Map<string, Callback[]>();
  private queue: Job[] = [];
  private running = false;

  constructor(private renderer: FishRenderer) {}

  /** A portrait URL right now: the real thumbnail if cached, else the procedural silhouette. */
  immediate(sp: Species, size: number): { url: string; real: boolean } {
    const real = this.ready.get(`${sp.id}@${size}`);
    return real ? { url: real, real: true } : { url: silhouetteDataUrl(sp), real: false };
  }

  /** Ask for the real portrait; `cb` fires once if/when it becomes available. */
  request(sp: Species, size: number, cb: Callback, tag = ''): void {
    const key = `${sp.id}@${size}`;
    const have = this.ready.get(key);
    if (have) {
      cb(have);
      return;
    }
    const failed = this.emptyAt.get(key);
    if (failed !== undefined && performance.now() - failed < RETRY_EMPTY_MS) return;
    const list = this.waiting.get(key);
    if (list) {
      list.push(cb);
      // Move to the front of the queue — the user is looking at it again.
      const i = this.queue.findIndex((j) => j.key === key);
      if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
      return;
    }
    this.waiting.set(key, [cb]);
    this.queue.unshift({ key, species: sp, size, tag });
    // Forget the oldest requests (scrolled far past) rather than rendering them.
    while (this.queue.length > MAX_QUEUE) {
      const dropped = this.queue.pop()!;
      this.waiting.delete(dropped.key);
    }
    this.pump();
  }

  /**
   * Drop pending requests (e.g. the list was re-filtered or scrolled on). With a tag, only that
   * requester's jobs are dropped — except keys in `keep` (rows still on screen). Callbacks for
   * in-flight work still fire.
   */
  cancelPending(tag?: string, keep?: (speciesId: string, size: number) => boolean): void {
    if (tag === undefined) {
      for (const j of this.queue) this.waiting.delete(j.key);
      this.queue.length = 0;
      return;
    }
    let w = 0;
    for (const j of this.queue) {
      if (j.tag === tag && !keep?.(j.species.id, j.size)) this.waiting.delete(j.key);
      else this.queue[w++] = j;
    }
    this.queue.length = w;
  }

  /** Pending (not yet started) requests — for diagnostics/tests. */
  get pending(): number {
    return this.queue.length;
  }

  private pump(): void {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running = true;
    const done = (url: string) => {
      const cbs = this.waiting.get(job.key) ?? [];
      this.waiting.delete(job.key);
      if (url) {
        this.ready.set(job.key, url);
        for (const cb of cbs) cb(url);
      } else this.emptyAt.set(job.key, performance.now());
      this.running = false;
      // Leave a frame for the tank between offscreen renders.
      requestAnimationFrame(() => this.pump());
    };
    let p: Promise<string>;
    try {
      p = this.renderer.thumbnail(job.species, job.size);
    } catch {
      p = Promise.resolve('');
    }
    p.then(done, () => done(''));
  }
}
