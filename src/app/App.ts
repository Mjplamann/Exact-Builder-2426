import { Plane, Vector3 } from 'three';
import type { DecorItem, DecorKind, Equipment, FishEntity, FoodKind, PlantInstance, Settings, TankSize, TankState, WaterType } from '../core/types';
import { createWorld, rebuildFishEntities, type World } from '../core/world';
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { newId } from '../core/rng';
import { loadBundledSpecies } from '../data/speciesIndex';
import { loadBundledPlants } from '../data/plantIndex';
import { Engine, type FollowSubject } from '../render/Engine';
import { FishRenderer } from '../render/fish/FishRenderer';
import { DecorRenderer } from '../render/decor/DecorRenderer';
import { FoodRenderer } from '../render/food/FoodRenderer';
import { BehaviorSystem } from '../behavior/BehaviorSystem';
import { FoodSystem } from '../behavior/FoodSystem';
import { LifeSim, type CompatibilityReport, type StockingReport } from '../sim/LifeSim';
import { computeEnv } from '../sim/environment';
import { exportTank, importTank, loadSettings, saveSettings } from '../sim/persistence';
import { newTank, type NewTankOptions } from '../sim/tankFactory';
import { buildColliders } from '../decor/colliders';
import { DECOR_CATALOG } from '../decor/catalog';
import { hostAnchor } from '../decor/shapes';
import { carryAttached, hostPose } from '../decor/attach';
import { AQUASCAPES, suggestPlacement } from '../decor/aquascapes';
import { UI } from '../ui/UI';
import { Ambience } from '../audio/Ambience';
import type { AppApi, DeepPartial, PickResult, TankPresetInfo } from './AppApi';
import { PRESETS, buildPresetTank, presetStock } from './presets';
import type { CloudSave } from './cloudSave';
import { TankLibrary, cleanTankName } from './tankLibrary';
import { fetchTank } from './openLibrary';
import { SHAPE_SIZES, aquascapesFor, tankFromSpec } from './biotopes';
import { checkStock, suggestStock } from './stockAdvisor';
import { Tour } from './tour';
import type { AquascapeInfo, StockCheck, StockSuggestion, TankSpec, TankSummary } from './tankTypes';

const AUTOSAVE_SECONDS = 15;
/** Longest absence we fast-forward (sim time), to keep catch-up bounded. */
const MAX_CATCHUP_SIM_SECONDS = 2 * 365 * 86400;
/** Absences shorter than this, with no births or deaths, don't get a "welcome back" card. */
const WELCOME_QUIET_SECONDS = 10 * 60;
/** A gap this long between two frames of a visible page means the computer slept: catch up. */
const FRAME_GAP_CATCHUP_MS = 30_000;
/** Remind the keeper at most this often that the browser refuses to store a tank. */
const STORAGE_WARN_EVERY_MS = 30 * 60_000;

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
  private library: TankLibrary;
  private tour: Tour;
  private switching = false;
  /** Wall-clock time of the last rendered frame (detects a computer that slept with the tank on screen). */
  private lastFrameWall = 0;
  private storageWarnedAt = -Infinity;
  /** What the camera follows: refreshed in place every frame from the followed animal. */
  private followSubject: FollowSubject = { pos: [0, 0, 0], lengthM: 0.05, forward: [1, 0, 0] };

  /**
   * @param opts.cloud   claude.ai cloud save (null outside a claude.ai viewer)
   * @param opts.library the keeper's tank collection (opened at boot, merged with the cloud)
   * @param opts.tank    the tank to open (default: the library's current tank; none → starter tank)
   */
  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, opts: { cloud?: CloudSave | null; library?: TankLibrary; tank?: TankState | null } = {}) {
    this.cloud = opts.cloud ?? null;
    this.library = opts.library ?? new TankLibrary();
    // Data files are validated by the test suite; re-validate at runtime only in development.
    const species = loadBundledSpecies({ validate: import.meta.env.DEV });
    const plants = loadBundledPlants({ validate: import.meta.env.DEV });
    const settings = loadSettings();

    let tank = opts.tank !== undefined ? opts.tank : this.library.currentId ? this.library.get(this.library.currentId) : null;
    let firstRun = false;
    if (!tank) {
      firstRun = true;
      tank = buildPresetTank(PRESETS[0], plants);
      tank.id = newId('tank');
    }
    this.library.setCurrent(tank.id);
    this.world = createWorld({ tank, species, plants, settings });
    this.tour = new Tour({ world: this.world, followAnimal: (id, fill) => this.followAnimal(id, fill) });

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
    // Opened in a background tab: nothing runs until it is shown, so it counts as hidden from now.
    if (document.hidden) this.hiddenAt = Date.now();
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save(true));
    // Tanks another device added, renamed or deleted since boot show up in the menu.
    if (this.cloud)
      this.cloud.onRemoteIndex = (index) => {
        if (this.library.mergeSummaries(index.tanks, index.deleted)) this.world.events.emit('tanks-changed', {});
      };
    // Make sure the open tank is in the collection (first run, or a fresh device).
    this.save();
    if (!this.cloud && !this.library.persistent)
      queueMicrotask(() =>
        this.world.events.emit('notify', { message: 'This browser isn’t keeping site data (private browsing?), so your tanks will be gone when this page closes. Export a tank in Settings to keep it.', level: 'warning' }),
      );
  }

  // ------------------------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.lastFrameWall = Date.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      // A computer that slept with the tank on screen resumes without a visibility change: the
      // tank lived through that time too.
      const wall = Date.now();
      if (this.hiddenAt === null && !document.hidden && wall - this.lastFrameWall > FRAME_GAP_CATCHUP_MS) this.catchUpSince(this.lastFrameWall);
      this.lastFrameWall = wall;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * QA helper: let time-smoothed visuals (light ramps, eye adaptation) settle at once after a
   * jump in the sim clock, so a staged night or dawn capture shows the right light.
   */
  settle(): void {
    computeEnv(this.world);
    this.engine.update(this.world, 30);
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
    if (this.tour.active) this.guard('tour', () => this.tour.update(dt));
    if (w.follow) {
      const f = w.fishById.get(w.follow);
      if (f) this.trackSubject(f);
      else this.followAnimal(null);
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
      this.hiddenAt ??= Date.now();
      this.save(true);
    } else if (this.hiddenAt !== null) {
      this.catchUpSince(this.hiddenAt);
      this.hiddenAt = null;
      this.lastFrame = performance.now();
      this.lastFrameWall = Date.now();
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
    // A short absence where nothing happened (a quick look at another tank or another tab) passes
    // quietly; longer ones, or any birth or death, get the calm "while you were away" card.
    const notable = summary.born > 0 || summary.died.length > 0;
    if (summary.text && (away >= WELCOME_QUIET_SECONDS || (notable && away > 60))) queueMicrotask(() => this.ui?.showWelcomeBack(summary.text));
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
      if (this.world.follow === id) this.followAnimal(null);
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

  /**
   * Show another tank: replace the world's tank, rebuild everything, add `stock`, and (for a tank
   * that has been living unwatched) catch up on the time since `catchUpFrom` (real ms).
   */
  private openTank(tank: TankState, stock: { speciesId: string; count: number }[] = [], catchUpFrom?: number): void {
    const w = this.world;
    this.library.setCurrent(tank.id);
    w.tank = tank;
    w.clock.simTime = tank.simTime;
    w.clock.timeScale = tank.timeScale;
    w.food.length = 0;
    w.selection = {};
    this.select({});
    // Every tank opens on its whole-tank view: no tour, follow or close-up carried over.
    const touring = this.tour.active;
    if (touring) this.tour.stop();
    this.followAnimal(null);
    rebuildFishEntities(w);
    this.engine.rebuildTank(w);
    if (this.engine.getZoom().zoom > 1.001) this.engine.resetView();
    this.rebuildEnvironment();
    for (const { speciesId, count } of stock) this.life.addFish(w, speciesId, count);
    for (const f of w.fish) if (!f.state.pos) this.behavior.placeNewFish(w, f);
    this.fishRenderer.sync(w);
    if (catchUpFrom !== undefined) this.catchUpSince(catchUpFrom);
    // Opened while the page is hidden (a slow cloud fetch finishing in a background tab): this
    // tank is now current up to this moment, not up to when the page was hidden.
    if (this.hiddenAt !== null) this.hiddenAt = Date.now();
    this.saveTimer = 0;
    w.events.emit('tank-reset', {});
    w.events.emit('time-scale-changed', { timeScale: w.clock.timeScale });
    if (touring) w.events.emit('view-changed', { following: null, touring: false });
    this.save(true);
    w.events.emit('tanks-changed', {});
  }

  /** Persist locally (always) and to the cloud (throttled; `force` on leaving the page or switching). */
  save(force = false): void {
    const w = this.world;
    for (const f of w.fish) {
      f.state.pos = [...f.kin.pos];
      f.state.heading = Math.atan2(f.kin.forward[2], f.kin.forward[0]);
    }
    w.tank.simTime = w.clock.simTime;
    w.tank.timeScale = w.clock.timeScale;
    // While the page is hidden nothing is simulated: the tank is current only up to when it was
    // hidden (a save on closing a long-hidden tab must not swallow those hours).
    w.tank.lastSavedReal = this.hiddenAt ?? Date.now();
    const stored = this.library.put(w.tank);
    this.cloud?.save(w.tank, force);
    this.cloud?.saveIndex(this.library.snapshot(), force);
    if (!stored && this.library.storageFull && Date.now() - this.storageWarnedAt > STORAGE_WARN_EVERY_MS) {
      this.storageWarnedAt = Date.now();
      w.events.emit('notify', {
        message: this.cloud
          ? 'This browser’s storage is full, so this tank is being saved to your account only. Deleting tanks you no longer keep frees space here.'
          : 'This browser’s storage is full — recent changes to this tank can’t be kept after the page closes. Delete a tank you no longer keep, or export this one in Settings.',
        level: 'warning',
      });
    }
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
    const before = hostPose(item);
    Object.assign(item, patch);
    if (patch.position && patch.position.length === 3 && patch.position[1] === undefined) {
      item.position[1] = substrateHeight(this.world.tank, item.position[0], item.position[2]);
    }
    // Epiphytes, mosses and corals ride along with every move, turn or resize of their host.
    carryAttached(this.world.tank, item, before);
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

  follow(fishId: string | null, opts: { fill?: number } = {}): void {
    // Choosing an animal yourself ends the tour (the camera stays on your choice).
    const touring = this.tour.active;
    if (touring) this.tour.stop();
    const prev = this.world.follow;
    this.followAnimal(fishId, opts.fill);
    // followAnimal reports a change of animal; the tour ending on the same one must be reported too.
    if (touring && prev === this.world.follow) this.world.events.emit('view-changed', { following: this.world.follow, touring: false });
  }

  /** Follow without touching the tour (the tour itself and housekeeping use this). */
  private followAnimal(fishId: string | null, fill?: number): void {
    const f = fishId ? this.world.fishById.get(fishId) : undefined;
    const prev = this.world.follow;
    this.world.follow = f ? f.state.id : null;
    if (f) {
      this.trackSubject(f);
      this.engine.follow(this.followSubject, { fill });
    } else if (prev) {
      this.engine.follow(null);
    }
    if (prev !== this.world.follow) this.world.events.emit('view-changed', { following: this.world.follow, touring: this.tour.active });
  }

  private trackSubject(f: FishEntity): void {
    const s = this.followSubject;
    const p = f.kin.pos;
    const d = f.kin.forward;
    s.pos[0] = p[0];
    s.pos[1] = p[1];
    s.pos[2] = p[2];
    s.forward![0] = d[0];
    s.forward![1] = d[1];
    s.forward![2] = d[2];
    s.lengthM = Math.max(0.005, f.state.lengthCm / 100);
  }

  setFollowFill(fill: number): void {
    // Any hands-on framing ends the tour where it is (the camera stays on the current shot).
    if (this.tour.active) this.setTour(false);
    this.engine.setFollowFill(fill);
  }

  zoomBy(steps: number, anchorClientX?: number, anchorClientY?: number): void {
    if (this.tour.active) this.setTour(false);
    // The anchor is whatever is under the pointer: an animal, a plant, decor (else the engine
    // uses the substrate and glass). Picked once per gesture by the engine.
    this.engine.zoomBy(steps, anchorClientX, anchorClientY, (x, y) => {
      const hit = this.pickAt(x, y);
      if (hit.kind === 'fish') {
        const p = this.world.fishById.get(hit.id)?.kin.pos;
        return p ? new Vector3(p[0], p[1], p[2]) : null;
      }
      return hit.kind === 'decor' || hit.kind === 'plant' || hit.kind === 'substrate' ? hit.point : null;
    });
  }

  setZoom(zoom: number): void {
    if (this.tour.active) this.setTour(false);
    this.engine.setZoom(zoom);
  }

  getZoom(): { zoom: number; min: number; max: number } {
    return this.engine.getZoom();
  }

  panBy(dx: number, dy: number): void {
    if (this.tour.active) this.setTour(false);
    if (this.world.follow) {
      // Dragging takes the camera back from the animal: the view stays put and pans from there.
      this.world.follow = null;
      this.engine.follow(null, { hold: true });
      this.world.events.emit('view-changed', { following: null, touring: false });
    }
    this.engine.panBy(dx, dy);
  }

  resetView(): void {
    if (this.tour.active) this.tour.stop();
    this.followAnimal(null);
    this.engine.resetView();
    this.world.events.emit('view-changed', { following: null, touring: false });
  }

  setTour(on: boolean): void {
    if (on === this.tour.active) return;
    if (on) {
      // Open on the whole tank (a slow pull-back), then drift from animal to animal.
      this.tour.start();
      this.followAnimal(null);
      this.engine.resetView({ gentle: true });
    } else {
      // Stopping keeps the current shot; resetView() goes back to the whole tank.
      this.tour.stop();
    }
    this.world.events.emit('view-changed', { following: this.world.follow, touring: this.tour.active });
  }

  isTouring(): boolean {
    return this.tour.active;
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

  /** Set up a ready-made tank as a new tank in the collection, and switch to it. */
  loadPreset(presetId: string): void {
    const p = PRESETS.find((q) => q.id === presetId);
    if (!p) return;
    const tank = buildPresetTank(p, this.world.plants);
    tank.id = newId('tank');
    this.save(true);
    this.openTank(tank, presetStock(p, this.world.species));
    this.journal('info', `Set up “${p.name}”`);
  }

  /** Add an empty tank to the collection and switch to it. */
  newTank(opts: NewTankOptions): void {
    const tank = newTank(opts);
    tank.id = newId('tank');
    this.save(true);
    this.openTank(tank);
    this.journal('info', 'Set up a new tank');
  }

  exportTank(): string {
    this.save();
    return exportTank(this.world.tank);
  }

  /** Import a saved tank as a new tank in the collection (never overwrites one), and switch to it. */
  importTank(json: string): void {
    const tank = importTank(json);
    // Never reuse an id: not an open, stored or deleted tank's (a deleted id would be dropped again
    // on the next boot when another device's deletion record arrives).
    if (tank.id === this.world.tank.id || this.library.has(tank.id) || this.library.isDeleted(tank.id) || !/^[\w.:~@+-]{1,80}$/.test(tank.id)) tank.id = newId('tank');
    tank.name = cleanTankName(tank.name) || (tank.water === 'marine' ? 'My Reef' : 'My Aquarium');
    this.save(true);
    this.openTank(tank);
  }

  // ------------------------------------------------------------------------------------------
  // Tank collection
  // ------------------------------------------------------------------------------------------

  listTanks(): TankSummary[] {
    this.library.touch(this.world.tank);
    return this.library.list();
  }

  currentTankId(): string {
    return this.world.tank.id;
  }

  async switchTank(id: string): Promise<boolean> {
    return this.switchTo(id, false);
  }

  private async switchTo(id: string, discardCurrent: boolean): Promise<boolean> {
    if (id === this.world.tank.id) return true;
    if (this.switching) return false;
    this.switching = true;
    const from = this.world.tank.id;
    try {
      const tank = await fetchTank(this.library, this.cloud, id);
      // Another tank change (the builder, a preset, an import) won the race while we waited.
      if (this.world.tank.id !== from) return false;
      if (!tank) {
        this.world.events.emit('notify', { message: 'That tank could not be loaded right now.', level: 'warning' });
        return false;
      }
      if (!discardCurrent) this.save(true);
      // It kept living while you were away: catch up on the time since it was last open.
      this.openTank(tank, [], tank.lastSavedReal);
      return true;
    } finally {
      this.switching = false;
    }
  }

  createTank(spec: TankSpec): string {
    // The same construction the stock advisor checked its suggestions against (biotopes.ts).
    const tank = tankFromSpec(spec);
    tank.id = newId('tank');
    const scape = AQUASCAPES.find((a) => a.id === spec.aquascape);
    if (scape) {
      const built = scape.build(tank, this.world.plants, tank.seed);
      tank.decor = built.decor;
      tank.plants = built.plants;
      tank.aquascape = scape.id;
    }
    // Merge repeats of a species; unknown ids are skipped.
    const counts = new Map<string, number>();
    for (const q of spec.stock) {
      const n = Math.round(q.count);
      if (n > 0 && this.world.species.get(q.speciesId)) counts.set(q.speciesId, (counts.get(q.speciesId) ?? 0) + n);
    }
    const planned = [...counts].map(([speciesId, count]) => ({ speciesId, count }));
    // A fishless cycle means exactly that: the animals wait until the filter has matured.
    const stock = spec.cycled ? planned : [];
    this.save(true);
    this.openTank(tank, stock);
    const liters = Math.round((tank.size.widthCm * tank.size.heightCm * tank.size.depthCm) / 1000);
    this.journal('info', `Set up “${tank.name}”: ${tank.size.widthCm}×${tank.size.depthCm}×${tank.size.heightCm} cm, ${liters} L ${tank.water}${scape && scape.id !== 'empty' ? `, ${scape.name}` : ''}${spec.cycled ? '' : ' — fishless cycle started'}`);
    for (const q of stock) this.journal('added', `Added ${q.count} × ${this.world.species.get(q.speciesId)!.commonName}`);
    if (!spec.cycled && planned.length) {
      const list = planned.map((q) => `${q.count} × ${this.world.species.get(q.speciesId)!.commonName}`).join(', ');
      this.journal('info', `Planned stock, to add once ammonia and nitrite read zero (usually 4–6 weeks): ${list}`);
      this.world.events.emit('notify', { message: 'The filter is maturing. Your planned animals are noted in the journal — add them once ammonia and nitrite read zero.', level: 'info' });
    }
    this.save(true);
    return tank.id;
  }

  async renameTank(id: string, name: string): Promise<void> {
    const n = cleanTankName(name);
    if (!n) return;
    const renameOpen = () => {
      this.world.tank.name = n;
      this.world.events.emit('tank-settings-changed', {});
      this.save(true);
    };
    if (id === this.world.tank.id) renameOpen();
    else {
      const tank = await fetchTank(this.library, this.cloud, id);
      // It was opened while we fetched it: rename the live tank (its next save would undo ours).
      if (id === this.world.tank.id) renameOpen();
      else if (tank) {
        tank.name = n;
        // A hair newer than the copies on other devices, so the new name reaches them too
        // (newer copies win); one second less of unwatched life is invisible.
        tank.lastSavedReal += 1001;
        this.library.put(tank);
        this.cloud?.save(tank, true);
      } else if (this.library.has(id)) this.library.rename(id, n);
      else return;
      this.cloud?.saveIndex(this.library.snapshot(), true);
    }
    this.world.events.emit('tanks-changed', {});
  }

  async duplicateTank(id: string): Promise<string | null> {
    if (id === this.world.tank.id) this.save();
    const src = id === this.world.tank.id ? this.world.tank : await fetchTank(this.library, this.cloud, id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src)) as TankState;
    copy.id = newId('tank');
    copy.name = `${src.name.slice(0, 73).trim()} (copy)`;
    copy.createdAt = Date.now();
    // Same last-open time as the original, so both catch up on the same unwatched time.
    copy.journal.push({ at: copy.simTime, kind: 'info', text: `Copied from “${src.name}”` });
    this.library.put(copy);
    this.cloud?.save(copy, true);
    this.cloud?.saveIndex(this.library.snapshot(), true);
    this.world.events.emit('tanks-changed', {});
    return copy.id;
  }

  async deleteTank(id: string): Promise<boolean> {
    const others = this.listTanks().filter((t) => t.id !== id);
    if (!others.length || !this.library.has(id)) return false;
    if (id === this.world.tank.id) {
      // The most recently watched other tank opens in its place (the next one if it can't be reached).
      if (this.switching) return false;
      let opened = false;
      for (const next of others.sort((a, b) => b.lastSavedReal - a.lastSavedReal)) {
        if (await this.switchTo(next.id, true)) {
          opened = true;
          break;
        }
        if (this.world.tank.id !== id) return false; // something else changed the tank meanwhile
      }
      if (!opened) return false;
    }
    this.library.remove(id);
    this.cloud?.deleteTank(id);
    this.cloud?.saveIndex(this.library.snapshot(), true);
    this.world.events.emit('tanks-changed', {});
    return true;
  }

  // ------------------------------------------------------------------------------------------
  // Tank builder helpers
  // ------------------------------------------------------------------------------------------

  aquascapes(water: WaterType, size?: TankSize): AquascapeInfo[] {
    return aquascapesFor(water, size);
  }

  shapeSizes(): typeof SHAPE_SIZES {
    return SHAPE_SIZES;
  }

  suggestStock(spec: TankSpec): StockSuggestion[] {
    return suggestStock(spec, this.world.species, this.world.plants);
  }

  checkStock(spec: TankSpec, stock: TankSpec['stock']): StockCheck {
    return checkStock(spec, stock, this.world.species, this.world.plants);
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
