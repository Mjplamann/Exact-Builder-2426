/**
 * Turns simulation events into calm, human notifications:
 *  - 'notify' passes through;
 *  - births are batched ("3 Guppy fry were born") so a brood is one message, not twenty;
 *  - deaths are announced respectfully, also batched during catch-up;
 *  - water-quality warnings fire at most once per several sim hours *and* a couple of real
 *    minutes per kind, so accelerated time never turns into a stream of alarms.
 */
import type { FishEntity } from '../core/types';
import type { World } from '../core/world';
import { deathPhrase } from '../sim/text';
import { article, capitalize, formatTemp, localizeUnits, pluralName, proseName } from './format';
import { youngWord } from './phrases';
import type { ToastLevel } from './Toasts';
import type { TankNeeds } from './waterHealth';

const BATCH_MS = 1800;
const WARN_SIM_MS = 6 * 3600_000;
const WARN_REAL_MS = 120_000;

type WarnKey = 'ammonia' | 'nitrite' | 'nitrate' | 'temperature' | 'oxygen';

/** "A Neon tetra fry was born", "An Endler's livebearer fry…", "12 young Cherry shrimp appeared". */
export function birthMessage(name: string, group: FishEntity['species']['group'], n: number): string {
  const prose = proseName(name);
  if (group === 'fish') return n === 1 ? `${capitalize(article(prose))} ${prose} fry was born` : `${n} ${prose} ${youngWord(group)} were born`;
  return n === 1 ? `A young ${prose} appeared` : `${n} young ${pluralName(prose)} appeared`;
}

/**
 * One loss, told gently with the sim's own phrasing of the cause: "One of your Neon tetras passed
 * away peacefully of old age." / "Pip, your Betta, passed away because the water was too cold."
 */
export function deathMessage(name: string, speciesName: string, othersRemain: boolean, cause: string): string {
  const prose = proseName(speciesName);
  const who = name ? `${name}, your ${prose},` : othersRemain ? `One of your ${pluralName(prose)}` : `Your ${prose}`;
  return `${who} passed away ${deathPhrase(cause)}.`;
}

export class Notifier {
  private births = new Map<string, { name: string; group: FishEntity['species']['group']; n: number }>();
  private deaths: { name: string; species: string; speciesId: string; cause: string }[] = [];
  private birthTimer: ReturnType<typeof setTimeout> | null = null;
  private deathTimer: ReturnType<typeof setTimeout> | null = null;
  private lastWarn = new Map<WarnKey, { sim: number; real: number; n: number; cleared: boolean }>();
  private offs: (() => void)[] = [];
  /** Sim time of the last birth toast per invertebrate colony species (journal keeps every brood). */
  private lastColonyBirthToast = new Map<string, number>();

  constructor(
    private world: World,
    private toast: (msg: string, level?: ToastLevel) => void,
  ) {
    const ev = world.events;
    this.offs.push(
      ev.on('notify', ({ message, level }) => toast(localizeUnits(message, world.settings.units), level)),
      ev.on('fish-born', ({ fish }) => this.onBorn(fish)),
      ev.on('fish-died', ({ fish, cause }) => this.onDied(fish, cause)),
      ev.on('tank-reset', () => {
        this.lastWarn.clear();
        this.lastColonyBirthToast.clear();
      }),
    );
  }

  private onBorn(fish: FishEntity): void {
    const sp = fish.species;
    const b = this.births.get(sp.id);
    if (b) b.n++;
    else this.births.set(sp.id, { name: sp.commonName, group: sp.group, n: 1 });
    this.birthTimer ??= setTimeout(() => this.flushBirths(), BATCH_MS);
  }

  private flushBirths(): void {
    this.birthTimer = null;
    const now = this.world.clock.simTime;
    for (const [id, { name, group, n }] of this.births) {
      // A thriving shrimp or snail colony broods every few days — announce it at most weekly.
      if (group !== 'fish') {
        const last = this.lastColonyBirthToast.get(id);
        if (last !== undefined && now - last < 7 * 86_400_000) continue;
        this.lastColonyBirthToast.set(id, now);
      }
      this.toast(birthMessage(name, group, n), 'success');
    }
    this.births.clear();
  }

  private onDied(fish: FishEntity, cause: string): void {
    this.deaths.push({ name: fish.state.name ?? '', species: fish.species.commonName, speciesId: fish.species.id, cause });
    this.deathTimer ??= setTimeout(() => this.flushDeaths(), BATCH_MS);
  }

  private flushDeaths(): void {
    this.deathTimer = null;
    const d = this.deaths;
    if (d.length === 1) {
      const { name, species, speciesId, cause } = d[0];
      const others = this.world.fish.some((f) => f.species.id === speciesId);
      this.toast(deathMessage(name, species, others, cause), 'info');
    } else if (d.length > 1) {
      const species = new Set(d.map((x) => x.species));
      const what = species.size === 1 ? pluralName(proseName([...species][0])) : 'animals';
      this.toast(`${d.length} ${what} passed away. They will be missed.`, 'info');
    }
    this.deaths = [];
  }

  /** ~1 Hz: gentle water-quality reminders. */
  check(needs: TankNeeds, units: 'metric' | 'imperial'): void {
    const w = this.world;
    if (w.settings.careMode === 'zen') return;
    const wp = w.tank.waterParams;
    // Ammonia and nitrite only harm animals: in an empty tank they are a fishless cycle feeding its
    // new bacteria (the ammonia is dosed on purpose), and changing water would only slow it down.
    const animals = needs.animals > 0;
    if (animals && wp.ammonia > 0.25) this.warn('ammonia', `Ammonia has risen to ${wp.ammonia.toFixed(2)} mg/L. A partial water change will help.`, 'warning');
    else this.settle('ammonia');
    if (animals && wp.nitrite > 0.25) this.warn('nitrite', `Nitrite is ${wp.nitrite.toFixed(2)} mg/L — the filter bacteria are struggling. Feed lightly and change some water.`, 'warning');
    else this.settle('nitrite');
    if (wp.nitrate > 40) this.warn('nitrate', `Nitrate has built up to ${Math.round(wp.nitrate)} mg/L. It may be time for a water change.`, 'warning');
    else this.settle('nitrate');
    if (wp.oxygen < 0.6 && needs.animals > 0) this.warn('oxygen', 'Oxygen is running low — check the filter or add an air stone.', 'warning');
    else this.settle('oxygen');
    let tempOff = false;
    if (needs.animals > 0) {
      const t = wp.temperatureC;
      for (const s of needs.species) {
        if (t > s.tempC[1] + 0.5 || t < s.tempC[0] - 0.5) {
          const warm = t > s.tempC[1];
          tempOff = true;
          this.warn(
            'temperature',
            `The water is ${formatTemp(t, units)} — ${warm ? 'warmer' : 'cooler'} than your ${pluralName(proseName(s.name))} like.${warm ? '' : ' Check the heater.'}`,
            'warning',
          );
          break;
        }
      }
    }
    if (!tempOff) this.settle('temperature');
  }

  /**
   * At most one reminder per kind every few sim hours and real minutes. A condition that persists
   * (one the keeper may not be able to fix at once, like tankmates wanting different temperatures)
   * is mentioned less and less often — 2, 4, 8 … up to 32 real minutes apart — until it clears.
   */
  private warn(key: WarnKey, msg: string, level: ToastLevel): void {
    const now = performance.now();
    const sim = this.world.clock.simTime;
    const last = this.lastWarn.get(key);
    if (last) {
      const repeats = last.cleared ? 0 : last.n;
      const backoff = 2 ** Math.min(4, Math.max(0, repeats - 1));
      if (sim - last.sim < WARN_SIM_MS * backoff || now - last.real < WARN_REAL_MS * backoff) return;
    }
    this.lastWarn.set(key, { sim, real: now, n: last && !last.cleared ? last.n + 1 : 1, cleared: false });
    this.toast(msg, level);
  }

  /** The condition is fine again: the next time it turns up starts a fresh (short) interval. */
  private settle(key: WarnKey): void {
    const last = this.lastWarn.get(key);
    if (last) last.cleared = true;
  }

  dispose(): void {
    for (const off of this.offs) off();
    if (this.birthTimer) clearTimeout(this.birthTimer);
    if (this.deathTimer) clearTimeout(this.deathTimer);
  }
}

