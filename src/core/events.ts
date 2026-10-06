import type { DecorItem, FishEntity, FoodKind, JournalEntry, PlantInstance } from './types';

/** Every cross-module notification. Payloads are plain data. */
export interface EventMap {
  'fish-added': { fish: FishEntity };
  'fish-removed': { fishId: string };
  'fish-died': { fish: FishEntity; cause: string };
  'fish-born': { fish: FishEntity };
  'fish-grew': { fish: FishEntity };
  'food-dropped': { kind: FoodKind; at: [number, number, number]; count: number };
  'food-eaten': { fishId: string; foodId: number };
  'decor-changed': { item?: DecorItem; removedId?: string };
  'plants-changed': { plant?: PlantInstance; removedId?: string };
  /** Tank was replaced wholesale (load, preset, resize, water type). Rebuild everything. */
  'tank-reset': Record<string, never>;
  'tank-settings-changed': Record<string, never>;
  'settings-changed': Record<string, never>;
  'selection-changed': { fishId?: string; decorId?: string; plantId?: string };
  'tap-glass': { at: [number, number, number]; strength: number };
  'water-change': { fraction: number };
  'journal': { entry: JournalEntry };
  'notify': { message: string; level: 'info' | 'success' | 'warning' | 'danger' };
  'time-scale-changed': { timeScale: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<any>>>();

  on<K extends keyof EventMap>(type: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(type)}" failed`, err);
      }
    }
  }
}
