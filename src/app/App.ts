import { Plane, Vector3 } from 'three';
import type { DecorItem, DecorKind, Equipment, FoodKind, PlantInstance, Settings, TankState } from '../core/types';
import { createWorld, rebuildFishEntities, type World } from '../core/world';
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { newId } from '../core/rng';
import { loadBundledSpecies } from '../data/speciesIndex';
import { loadBundledPlants } from '../data/plantIndex';
import { Engine } from '../render/Engine';
import { FishRenderer } from '../render/fish/FishRenderer';
import { DecorRenderer } from '../render/decor/DecorRenderer';
import { FoodRenderer } from '../render/food/FoodRenderer';
import { BehaviorSystem } from '../behavior/BehaviorSystem';
import { FoodSystem } from '../behavior/FoodSystem';
import { LifeSim, type CompatibilityReport, type StockingReport } from '../sim/LifeSim';
import { computeEnv } from '../sim/environment';
import { exportTank, importTank, loadSettings, loadTank, saveSettings, saveTank } from '../sim/persistence';
import { newTank, type NewTankOptions } from '../sim/tankFactory';
import { buildColliders } from '../decor/colliders';
import { DECOR_CATALOG } from '../decor/catalog';
import { hostAnchor } from '../decor/shapes';
import { suggestPlacement } from '../decor/aquascapes';
import { UI } from '../ui/UI';
import { Ambience } from '../audio/Ambience';
import type { AppApi, DeepPartial, PickResult, TankPresetInfo } from './AppApi';
import { PRESETS, buildPresetTank, presetStock } from './presets';
import type { CloudSave } from './cloudSave';

const AUTOSAVE_SECONDS = 15;
/** Longest absence we fast-forward (sim time), to keep catch-up bounded. */
const MAX_CATCHUP_SIM_SECONDS = 2 * 365 * 86400;

function deepMerge<T>(target: T, patch: DeepPartial<T>): void {
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = (target as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') deepMerge(cur, v as DeepPartial<unknown>);
    else (target as Record<string, unknown>)[k] = v;
  }
}

export class App implements AppApi {
  readonly world: World;
  readonly engine: Engine;
  readonly fishRenderer: FishRenderer;
  readonly decorRenderer: DecorRenderer;
  private foodRenderer: FoodRenderer;
  private behavior: BehaviorSystem;
  private foodSystem: FoodSystem;
  private life: LifeSim;
  private ui: UI;
  private ambience: Ambience;
  private lastFrame = 0;
  private saveTimer = 0;
  private hiddenAt: number | null = null;
  private failures = new Set<string>();
  private running = false;
  /** Dev/QA switches (gallery mode, screenshots). */
  readonly debug = { freezeBehavior: false, freezeLife: false };

  private cloud: CloudSave | null;

  /**
   * @param opts.cloud         claude.ai cloud save (null outside a claude.ai viewer)
   * @param opts.cloudTankJson the tank saved in the cloud, if any — used when newer than the local copy
   */
  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, opts: { cloud?: CloudSave | null; cloudTankJson?: string | null } = {}) {
    this.cloud = opts.cloud ?? null;
    // Data files are validated by the test suite; re-validate at runtime only in development.
    const species = loadBundledSpecies({ validate: import.meta.env.DEV });
    const plants = loadBundledPlants({ validate: import.meta.env.DEV });
    const settings = loadSettings();

    let tank = loadTank();
    if (opts.cloudTankJson) {
      try {
        const remote = importTank(opts.cloudTankJson);
        if (!tank || remote.lastSavedReal > tank.lastSavedReal + 1000) tank = remote;
      } catch (err) {
        console.warn('[app] cloud save unreadable — using the local tank', err);
      }
    }
    let firstRun = false;
    if (!tank) {
      firstRun = true;
      tank = buildPresetTank(PRESETS[0], plants);
    }
    this.world = createWorld({ tank, species, plants, settings });

    this.engine = new Engine(canvas, this.world);
    this.fishRenderer = new FishRenderer(this.engine);
    this.decorRenderer = new DecorRenderer(this.engine);
    this.foodRenderer = new FoodRenderer(this.engine);
    this.life = new LifeSim(this.world);
    this.behavior = new BehaviorSystem(this.world);
    this.foodSystem = new FoodSystem();
    this.ambience = new Ambience();

    this.behavior.onEat = (fish, food, amount) => {
      const taken = this.foodSystem.consume(this.world, food, amount);
      if (taken > 0) {
        this.life.onEat(this.world, fish, food, taken);
        this.world.events.emit('food-eaten', { fishId: fish.state.id, foodId: food.id });
      }
    };
    this.foodSystem.onDecay = (food) => this.life.onFoodDecay(this.world, food);
    // Auto-feeder: the life sim schedules feedings; drop real food so fish visibly come to eat.
    this.life.requestFeed = (kind, pinches) => this.feed(kind, undefined, pinches);

    this.wireEvents();
    this.rebuildEnvironment();

    if (firstRun) {
      for (const { speciesId, count } of presetStock(PRESETS[0], species)) this.life.addFish(this.world, speciesId, count);
    } else {
      this.catchUpSince(tank.lastSavedReal);
    }
    for (const f of this.world.fish) if (!f.state.pos) this.behavior.placeNewFish(this.world, f);
    this.fishRenderer.sync(this.world);

    this.ui = new UI(uiRoot, this);
    this.ambience.setEnabled(settings.sound, settings.volume);

    window.addEventListener('resize', () => this.engine.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save(true));
  }

  // ------------------------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Stop the requestAnimationFrame loop (QA harnesses then drive frames manually via frame()). */
  stop(): void {
    this.running = false;
  }

  /**
   * QA helper: advance simulation (clock, environment, life, food, behavior) by `seconds` of real
   * time in fixed steps without rendering — lets headless screenshots stage scenes reliably even
   * when software WebGL renders at a few fps.
   */
  advance(seconds: number, step = 1 / 30): void {
    const w = this.world;
    for (let t = 0; t < seconds; t += step) {
      const simDt = w.clock.tick(step);
      computeEnv(w);
      if (!this.debug.freezeLife) this.life.update(w, simDt);
      this.foodSystem.update(w, step, simDt);
      if (!this.debug.freezeBehavior) this.behavior.update(w, step);
    }
  }

  /** One frame. Exposed for tests/screenshots (advance deterministically). */
  frame(dt: number): void {
    const w = this.world;
    const simDt = w.clock.tick(dt);
    this.guard('env', () => computeEnv(w));
    if (!this.debug.freezeLife) this.guard('life', () => this.life.update(w, simDt));
    this.guard('food', () => this.foodSystem.update(w, dt, simDt));
    if (!this.debug.freezeBehavior) this.guard('behavior', () => this.behavior.update(w, dt));
    if (w.follow) {
      const f = w.fishById.get(w.follow);
      if (f) this.engine.setFocus(new Vector3(...f.kin.pos));
      else this.follow(null);
    }
    this.guard('engine', () => this.engine.update(w, dt));
    this.guard('fishRenderer', () => this.fishRenderer.update(w, dt));
    this.guard('decorRenderer', () => this.decorRenderer.update(w, dt));
    this.guard('foodRenderer', () => this.foodRenderer.update(w, dt));
    this.guard('ambience', () => this.ambience.update(w, dt));
    this.guard('ui', () => this.ui.update(dt));
    this.guard('render', () => this.engine.render());

    this.saveTimer += dt;
    if (this.saveTimer > AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private guard(name: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (!this.failures.has(name)) {
        this.failures.add(name);
        console.error(`[app] ${name} failed (further errors suppressed)`, err);
      }
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.save(true);
    } else if (this.hiddenAt) {
      this.catchUpSince(this.hiddenAt);
      this.hiddenAt = null;
      this.lastFrame = performance.now();
    }
  }

  private catchUpSince(realMs: number): void {
    const away = Math.max(0, Date.now() - realMs) / 1000;
    if (away < 5) return;
    // Absences pass in real time: the time-lapse speed applies only while someone is watching
    // (otherwise one day away at "1 min = 1 week" would age the tank 27 years).
    const simSeconds = Math.min(MAX_CATCHUP_SIM_SECONDS, away);
    const summary = this.life.catchUp(this.world, simSeconds);
    this.fishRenderer.sync(this.world);
    this.decorRenderer.sync(this.world);
    if (summary.text && away > 60) queueMicrotask(() => this.ui?.showWelcomeBack(summary.text));
  }

  private wireEvents(): void {
    const ev = this.world.events;
    const resync = () => this.fishRenderer.sync(this.world);
    ev.on('fish-added', ({ fish }) => {
      if (!fish.state.pos) this.behavior.placeNewFish(this.world, fish);
      resync();
    });
    ev.on('fish-born', resync);
    // A selected or followed animal that dies or is removed must not stay selected/followed.
    const gone = (id: string) => {
      if (this.world.selection.fishId === id) this.select({});
      if (this.world.follow === id) this.follow(null);
    };
    ev.on('fish-removed', ({ fishId }) => {
      gone(fishId);
      resync();
    });
    ev.on('fish-died', ({ fish }) => {
      gone(fish.state.id);
      resync();
    });
    ev.on('decor-changed', () => this.rebuildEnvironment());
    ev.on('plants-changed', () => this.rebuildEnvironment());
    ev.on('settings-changed', () => {
      this.engine.setQuality(this.world.settings.quality);
      this.ambience.setEnabled(this.world.settings.sound, this.world.settings.volume);
    });
  }

  private rebuildEnvironment(): void {
    const { colliders, cover } = buildColliders(this.world.tank, this.world.plants);
    this.world.colliders = colliders;
    this.world.cover = cover;
    this.decorRenderer.sync(this.world);
    this.behavior.onEnvironmentChanged(this.world);
  }

  private resetTank(tank: TankState, stock: { speciesId: string; count: number }[] = []): void {
    const w = this.world;
    w.tank = tank;
    w.clock.simTime = tank.simTime;
    w.clock.timeScale = tank.timeScale;
    w.food.length = 0;
    w.selection = {};
    w.follow = null;
    this.engine.setFocus(null);
    rebuildFishEntities(w);
    this.engine.rebuildTank(w);
    this.rebuildEnvironment();
    for (const { speciesId, count } of stock) this.life.addFish(w, speciesId, count);
    for (const f of w.fish) if (!f.state.pos) this.behavior.placeNewFish(w, f);
    this.fishRenderer.sync(w);
    w.events.emit('tank-reset', {});
    this.save();
  }

  /** Persist locally (always) and to the cloud (throttled; `force` on leaving the page). */
  save(force = false): void {
    const w = this.world;
    for (const f of w.fish) {
      f.state.pos = [...f.kin.pos];
      f.state.heading = Math.atan2(f.kin.forward[2], f.kin.forward[0]);
    }
    w.tank.simTime = w.clock.simTime;
    w.tank.timeScale = w.clock.timeScale;
    saveTank(w.tank);
    this.cloud?.save(w.tank, force);
  }

  // ------------------------------------------------------------------------------------------
  // AppApi — animals
  // ------------------------------------------------------------------------------------------

  addFish(speciesId: string, count: number): void {
    const added = this.life.addFish(this.world, speciesId, count);
    if (added.length) {
      const sp = added[0].species;
      this.journal('added', `Added ${added.length} × ${sp.commonName}`);
    }
  }

  removeFish(fishId: string): void {
    const f = this.world.fishById.get(fishId);
    if (!f) return;
    this.life.removeFish(this.world, fishId);
    this.journal('removed', `Rehomed ${f.state.name ?? f.species.commonName}`);
    if (this.world.selection.fishId === fishId) this.select({});
    if (this.world.follow === fishId) this.follow(null);
  }

  renameFish(fishId: string, name: string): void {
    const f = this.world.fishById.get(fishId);
    if (f) f.state.name = name.trim() || undefined;
  }

  compatibility(speciesId: string, count?: number): CompatibilityReport {
    const sp = this.world.species.get(speciesId);
    return sp ? this.life.compatibility(this.world, sp, count) : { level: 'bad', issues: ['Unknown species'] };
  }

  stocking(): StockingReport {
    return this.life.stocking(this.world);
  }

  // ------------------------------------------------------------------------------------------
  // Feeding & interaction
  // ------------------------------------------------------------------------------------------

  feed(kind: FoodKind, at?: [number, number, number], pinches = 1): void {
    const b = tankBounds(this.world.tank);
    const p: [number, number, number] = at ?? [(Math.random() - 0.5) * b.halfW * 0.6, b.surfaceY, (Math.random() - 0.3) * b.halfD * 0.5];
    this.foodSystem.drop(this.world, kind, p, pinches);
    this.world.tank.stats.feedings++;
    this.world.events.emit('food-dropped', { kind, at: p, count: pinches });
    this.ambience.playDrop();
  }

  tapGlass(at: [number, number, number]): void {
    this.behavior.startle(this.world, at, 1);
    this.world.events.emit('tap-glass', { at, strength: 1 });
    this.ambience.playTap();
  }

  // ------------------------------------------------------------------------------------------
  // Care
  // ------------------------------------------------------------------------------------------

  waterChange(fraction: number): void {
    this.life.waterChange(this.world, fraction);
    this.world.tank.stats.waterChanges++;
    this.world.events.emit('water-change', { fraction });
    this.journal('care', `Changed ${Math.round(fraction * 100)}% of the water`);
  }

  cleanGlass(): void {
    this.life.cleanGlass(this.world);
    this.journal('care', 'Scraped algae from the glass');
  }

  trimPlants(): void {
    this.life.trimPlants(this.world);
    this.world.events.emit('plants-changed', {});
    this.journal('care', 'Trimmed the plants');
  }

  setEquipment(patch: DeepPartial<Equipment>): void {
    deepMerge(this.world.tank.equipment, patch);
    this.world.events.emit('tank-settings-changed', {});
  }

  setTimeScale(scale: number): void {
    this.world.clock.timeScale = scale;
    this.world.tank.timeScale = scale;
    this.world.events.emit('time-scale-changed', { timeScale: scale });
  }

  setPaused(paused: boolean): void {
    this.world.clock.paused = paused;
  }

  // ------------------------------------------------------------------------------------------
  // Decor & plants
  // ------------------------------------------------------------------------------------------

  addDecor(kind: DecorKind, variant: string, at?: [number, number]): DecorItem {
    const t = this.world.tank;
    const [x, z] = at ?? suggestPlacement(t, { decor: { kind, variant } }, this.world.plants).at;
    const item: DecorItem = {
      id: newId('decor'),
      kind,
      variant,
      seed: Math.floor(Math.random() * 2 ** 31),
      position: [x, substrateHeight(t, x, z), z],
      rotation: [0, Math.random() * Math.PI * 2, 0],
      scale: 1,
    };
    t.decor.push(item);
    this.world.events.emit('decor-changed', { item });
    this.behavior.startle(this.world, item.position, 0.5);
    return item;
  }

  updateDecor(id: string, patch: Partial<Omit<DecorItem, 'id'>>): void {
    const item = this.world.tank.decor.find((d) => d.id === id);
    if (!item) return;
    Object.assign(item, patch);
    if (patch.position && patch.position.length === 3 && patch.position[1] === undefined) {
      item.position[1] = substrateHeight(this.world.tank, item.position[0], item.position[2]);
    }
    this.world.events.emit('decor-changed', { item });
  }

  removeDecor(id: string): void {
    const t = this.world.tank;
    const i = t.decor.findIndex((d) => d.id === id);
    if (i < 0) return;
    t.decor.splice(i, 1);
    // Epiphytes attached to it drop to the substrate.
    for (const p of t.plants) if (p.attachedTo === id) {
      p.attachedTo = undefined;
      p.position[1] = substrateHeight(t, p.position[0], p.position[2]);
    }
    if (this.world.selection.decorId === id) this.select({});
    this.world.events.emit('decor-changed', { removedId: id });
  }

  addPlant(speciesId: string, at?: [number, number], attachTo?: string): PlantInstance | null {
    const sp = this.world.plants.get(speciesId);
    if (!sp) return null;
    const t = this.world.tank;
    const b = tankBounds(t);
    if (!at && !attachTo) {
      const sug = suggestPlacement(t, { plant: sp }, this.world.plants);
      at = sug.at;
      attachTo = sug.attachTo;
    }
    const x = at?.[0] ?? (Math.random() - 0.5) * b.halfW;
    const z = at?.[1] ?? (Math.random() - 0.6) * b.halfD * 0.6;
    let y = substrateHeight(t, x, z);
    if (sp.placement === 'floating') y = b.surfaceY;
    const host = attachTo ? t.decor.find((d) => d.id === attachTo) : undefined;
    let px = x;
    let pz = z;
    if (host) {
      // Sit the epiphyte on the host's actual surface (same anchor the renderer and colliders use).
      const a = hostAnchor(host, x, z);
      [px, y, pz] = a.p;
    }
    const plant: PlantInstance = {
      id: newId('plant'),
      speciesId,
      seed: Math.floor(Math.random() * 2 ** 31),
      position: [px, y, pz],
      rotationY: Math.random() * Math.PI * 2,
      growth: 0.35,
      plantedAt: this.world.clock.simTime,
      attachedTo: host?.id,
      health: 1,
    };
    t.plants.push(plant);
    this.world.events.emit('plants-changed', { plant });
    return plant;
  }

  updatePlant(id: string, patch: Partial<Omit<PlantInstance, 'id'>>): void {
    const p = this.world.tank.plants.find((q) => q.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this.world.events.emit('plants-changed', { plant: p });
  }

  removePlant(id: string): void {
    const t = this.world.tank;
    const i = t.plants.findIndex((p) => p.id === id);
    if (i < 0) return;
    t.plants.splice(i, 1);
    if (this.world.selection.plantId === id) this.select({});
    this.world.events.emit('plants-changed', { removedId: id });
  }

  setTankLook(patch: Partial<Pick<TankState, 'substrate' | 'substrateDepthFrontCm' | 'substrateDepthBackCm' | 'background' | 'name'>>): void {
    Object.assign(this.world.tank, patch);
    const t = this.world.tank;
    for (const d of t.decor) d.position[1] = substrateHeight(t, d.position[0], d.position[2]);
    for (const p of t.plants) if (!p.attachedTo && this.world.plants.get(p.speciesId)?.placement !== 'floating') p.position[1] = substrateHeight(t, p.position[0], p.position[2]);
    this.engine.rebuildTank(this.world);
    this.rebuildEnvironment();
    this.world.events.emit('tank-settings-changed', {});
  }

  // ------------------------------------------------------------------------------------------
  // Selection, camera, picking
  // ------------------------------------------------------------------------------------------

  select(sel: { fishId?: string; decorId?: string; plantId?: string }): void {
    this.world.selection = { ...sel };
    this.fishRenderer.setSelected(sel.fishId ?? null);
    this.decorRenderer.setSelected(sel.decorId ? { kind: 'decor', id: sel.decorId } : sel.plantId ? { kind: 'plant', id: sel.plantId } : null);
    this.world.events.emit('selection-changed', { ...sel });
  }

  follow(fishId: string | null): void {
    this.world.follow = fishId;
    if (!fishId) this.engine.setFocus(null);
  }

  pickAt(clientX: number, clientY: number): PickResult {
    const ray = this.engine.rayFromScreen(clientX, clientY);
    const fishId = this.fishRenderer.pick(ray, this.world);
    if (fishId) return { kind: 'fish', id: fishId };
    const d = this.decorRenderer.pick(ray);
    if (d) return d.kind === 'decor' ? { kind: 'decor', id: d.id, point: d.point } : { kind: 'plant', id: d.id, point: d.point };
    const s = this.substratePointAt(clientX, clientY);
    if (s) return { kind: 'substrate', point: new Vector3(...s) };
    const b = tankBounds(this.world.tank);
    const p = ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), new Vector3());
    if (p && Math.abs(p.x) < b.halfW && p.y > 0 && p.y < b.surfaceY) return { kind: 'water', point: p };
    return { kind: 'none' };
  }

  substratePointAt(clientX: number, clientY: number): [number, number, number] | null {
    const ray = this.engine.rayFromScreen(clientX, clientY);
    const t = this.world.tank;
    const b = tankBounds(t);
    // March from the front glass inward until we pass under the substrate surface.
    const tFront = (b.halfD - ray.origin.z) / ray.direction.z;
    let s = Math.max(0, Number.isFinite(tFront) ? tFront : 0);
    const p = new Vector3();
    let prevAbove = true;
    for (let i = 0; i < 400; i++) {
      ray.at(s, p);
      if (p.z < -b.halfD || p.y < -0.05) break;
      const inside = Math.abs(p.x) <= b.halfW && Math.abs(p.z) <= b.halfD;
      const h = inside ? substrateHeight(t, p.x, p.z) : -1;
      const above = !inside || p.y > h;
      if (!above && prevAbove && inside) {
        // refine
        let lo = s - 0.005, hi = s;
        for (let j = 0; j < 12; j++) {
          const mid = (lo + hi) / 2;
          ray.at(mid, p);
          if (p.y > substrateHeight(t, p.x, p.z)) lo = mid;
          else hi = mid;
        }
        ray.at(hi, p);
        return [p.x, substrateHeight(t, p.x, p.z), p.z];
      }
      prevAbove = above;
      s += 0.005;
    }
    return null;
  }

  surfacePointAt(clientX: number, clientY: number): [number, number, number] | null {
    const ray = this.engine.rayFromScreen(clientX, clientY);
    const b = tankBounds(this.world.tank);
    // Project the screen point straight up to the surface along the view plane at mid depth.
    const p = ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), new Vector3());
    if (!p) return null;
    const x = Math.max(-b.halfW + 0.02, Math.min(b.halfW - 0.02, p.x));
    return [x, b.surfaceY, 0];
  }

  // ------------------------------------------------------------------------------------------
  // Tank lifecycle & settings
  // ------------------------------------------------------------------------------------------

  presets(): TankPresetInfo[] {
    return PRESETS.map(({ id, name, description, water }) => ({ id, name, description, water }));
  }

  loadPreset(presetId: string): void {
    const p = PRESETS.find((q) => q.id === presetId);
    if (!p) return;
    const tank = buildPresetTank(p, this.world.plants);
    this.resetTank(tank, presetStock(p, this.world.species));
    this.journal('info', `Set up “${p.name}”`);
  }

  newTank(opts: NewTankOptions): void {
    this.resetTank(newTank(opts));
    this.journal('info', 'Set up a new tank');
  }

  exportTank(): string {
    this.save();
    return exportTank(this.world.tank);
  }

  importTank(json: string): void {
    const tank = importTank(json);
    this.resetTank(tank);
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.world.settings, patch);
    saveSettings(this.world.settings);
    this.world.events.emit('settings-changed', {});
  }

  private journal(kind: 'added' | 'removed' | 'care' | 'info', text: string): void {
    const entry = { at: this.world.clock.simTime, kind, text };
    this.world.tank.journal.push(entry);
    if (this.world.tank.journal.length > 500) this.world.tank.journal.splice(0, this.world.tank.journal.length - 500);
    this.world.events.emit('journal', { entry });
  }

  /** Default decor variant list (for the UI). */
  static decorCatalog() {
    return DECOR_CATALOG;
  }
}
