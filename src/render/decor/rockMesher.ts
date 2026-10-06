/**
 * Off-thread SDF meshing with a small worker pool, plus an LRU of finished meshes so re-adding a
 * stone, reloading a scape or undoing an edit is instant. Falls back to synchronous meshing when
 * workers are unavailable.
 */
import type { DecorItem } from '../../core/types';
import { meshRock, type RockMeshData } from './rockMesh';
import RockWorker from './rockWorker?worker&inline';

export interface RockJob {
  id: number;
  item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>;
  cells: number;
}
export type RockResult = { id: number; data: RockMeshData; error?: undefined } | { id: number; error: string; data?: undefined };

/** Cache budget for finished meshes (bytes of vertex/index data kept on the CPU side). */
const CACHE_BYTES = 40 * 1024 * 1024;

export function rockKey(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>, cells: number): string {
  return `${item.kind}|${item.variant}|${item.seed}|${cells}`;
}

function bytesOf(d: RockMeshData): number {
  return d.positions.byteLength + d.normals.byteLength + d.colors.byteLength + d.det.byteLength + d.indices.byteLength;
}

export class RockMesher {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { job: RockJob; resolve: (d: RockMeshData) => void; reject: (e: unknown) => void }[] = [];
  private running = new Map<number, { resolve: (d: RockMeshData) => void; reject: (e: unknown) => void; worker: Worker; key: string }>();
  private inflight = new Map<string, Promise<RockMeshData>>();
  private cache = new Map<string, RockMeshData>();
  private cacheBytes = 0;
  private nextId = 1;
  private failed = false;

  /** Whether off-thread meshing is available. */
  get available(): boolean {
    return !this.failed && typeof Worker !== 'undefined';
  }

  /** A finished mesh from the cache (refreshes its LRU position). */
  cached(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>, cells: number): RockMeshData | undefined {
    const key = rockKey(item, cells);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
    }
    return hit;
  }

  /** Mesh synchronously on this thread (and cache the result). */
  meshNow(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>, cells: number): RockMeshData {
    const hit = this.cached(item, cells);
    if (hit) return hit;
    const d = meshRock(item, cells);
    this.store(rockKey(item, cells), d);
    return d;
  }

  /** Mesh off-thread; resolves with the (cached) result. */
  request(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>, cells: number): Promise<RockMeshData> {
    const key = rockKey(item, cells);
    const hit = this.cached(item, cells);
    if (hit) return Promise.resolve(hit);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = new Promise<RockMeshData>((resolve, reject) => {
      const job: RockJob = { id: this.nextId++, item: { kind: item.kind, variant: item.variant, seed: item.seed }, cells };
      this.queue.push({ job, resolve, reject });
      this.pump();
    }).then(
      (d) => {
        this.inflight.delete(key);
        this.store(key, d);
        return d;
      },
      (err) => {
        this.inflight.delete(key);
        // Worker trouble: mesh here instead so the stone still appears.
        console.warn('[decor] meshing worker failed, meshing on the main thread', err);
        return this.meshNow(item, cells);
      },
    );
    this.inflight.set(key, p);
    return p;
  }

  /** Number of jobs queued or running. */
  get pending(): number {
    return this.queue.length + this.running.size;
  }

  private store(key: string, d: RockMeshData): void {
    if (this.cache.has(key)) return;
    this.cache.set(key, d);
    this.cacheBytes += bytesOf(d);
    for (const [k, v] of this.cache) {
      if (this.cacheBytes <= CACHE_BYTES || this.cache.size <= 1) break;
      this.cache.delete(k);
      this.cacheBytes -= bytesOf(v);
    }
  }

  private spawn(): Worker | null {
    if (this.failed) return null;
    try {
      const w = new RockWorker();
      w.onmessage = (e: MessageEvent<RockResult>) => this.onResult(w, e.data);
      w.onerror = (e) => this.onWorkerError(w, e);
      this.workers.push(w);
      return w;
    } catch (err) {
      this.failed = true;
      console.warn('[decor] could not start meshing worker', err);
      return null;
    }
  }

  private pump(): void {
    const maxWorkers = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
    while (this.queue.length) {
      let w = this.idle.pop();
      if (!w && this.workers.length < maxWorkers) w = this.spawn() ?? undefined;
      if (!w) {
        if (this.failed && !this.workers.length) {
          // No workers at all: fail the queue over to synchronous meshing.
          for (const q of this.queue.splice(0)) q.reject(new Error('workers unavailable'));
        }
        return;
      }
      const next = this.queue.shift()!;
      this.running.set(next.job.id, { resolve: next.resolve, reject: next.reject, worker: w, key: rockKey(next.job.item, next.job.cells) });
      w.postMessage(next.job);
    }
  }

  private onResult(w: Worker, r: RockResult): void {
    const run = this.running.get(r.id);
    this.running.delete(r.id);
    this.idle.push(w);
    if (run) {
      if (r.data) run.resolve(r.data);
      else run.reject(new Error(r.error));
    }
    this.pump();
  }

  private onWorkerError(w: Worker, e: ErrorEvent): void {
    // Fail every job on this worker and retire it.
    for (const [id, run] of this.running) {
      if (run.worker !== w) continue;
      this.running.delete(id);
      run.reject(e.error ?? new Error(e.message));
    }
    w.terminate();
    this.workers = this.workers.filter((x) => x !== w);
    this.idle = this.idle.filter((x) => x !== w);
    if (!this.workers.length) this.failed = true;
    this.pump();
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.cache.clear();
    this.cacheBytes = 0;
  }
}
