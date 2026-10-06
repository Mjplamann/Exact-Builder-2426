/**
 * Feeding: pick a food (drawn icons, how it behaves in water, which inhabitants relish it), then
 * the cursor becomes a pinch and each click over the tank drops one pinch at the surface.
 */
import type { FoodKind, FoodType } from '../../core/types';
import { FOOD_LIST, FOODS } from '../../data/foods';
import type { Panel, UIHost } from '../context';
import { button } from '../controls';
import { clear, h, setAttr, setClass, setText } from '../dom';
import { formatDuration, pluralName, proseName } from '../format';
import { buoyancyLabel, foodIcon } from '../foodIcons';

interface FoodMatch {
  /** Count-weighted mean affinity across inhabitants, 0..1. */
  score: number;
  /** Species that relish it (affinity ≥ 0.8), most numerous first. */
  fans: string[];
}

type Diner = { species: { id: string; commonName: string; diet: keyof FoodType['affinity'] } };

/**
 * How well a food suits the current inhabitants (diet affinity, weighted by headcount). `fans` are
 * the species that relish it, most *specific* first: a species that relishes nearly every food (a
 * generalist omnivore) ranks below one for which this food is special (otos and algae wafers).
 */
export function foodMatch(food: FoodType, fish: Diner[]): FoodMatch {
  if (!fish.length) return { score: 0, fans: [] };
  let sum = 0;
  const fanCounts = new Map<string, { name: string; n: number; diet: Diner['species']['diet'] }>();
  for (const f of fish) {
    const a = food.affinity[f.species.diet] ?? 0;
    sum += a;
    if (a >= 0.8) {
      const e = fanCounts.get(f.species.id);
      if (e) e.n++;
      else fanCounts.set(f.species.id, { name: f.species.commonName, n: 1, diet: f.species.diet });
    }
  }
  const breadth = (diet: Diner['species']['diet']) => FOOD_LIST.reduce((k, x) => k + ((x.affinity[diet] ?? 0) >= 0.8 ? 1 : 0), 0) || 1;
  const fans = [...fanCounts.values()].sort((a, b) => b.n / breadth(b.diet) - a.n / breadth(a.diet)).map((e) => e.name);
  return { score: sum / fish.length, fans };
}

/** The food that best suits the current stock (default for the F key). */
export function bestFood(fish: Parameters<typeof foodMatch>[1], water: string): FoodKind {
  if (!fish.length) return water === 'marine' ? 'mysis' : 'flakes';
  let best: FoodKind = 'flakes';
  let bestScore = -1;
  for (const f of FOOD_LIST) {
    if (f.buoyancy === 'clip' || f.kind === 'phytoplankton') continue;
    const s = foodMatch(f, fish).score;
    if (s > bestScore) {
      bestScore = s;
      best = f.kind;
    }
  }
  return best;
}

export class FeedPanel implements Panel {
  readonly id = 'feed' as const;
  readonly title = 'Feed';
  readonly el: HTMLElement;
  private listEl: HTMLElement;
  private items = new Map<FoodKind, HTMLButtonElement>();
  private lastFedEl: HTMLElement;
  /** Fallback when the host doesn't track feedings itself. */
  private lastFedSim: number | null = null;
  private feedNowBtn: HTMLButtonElement;

  constructor(private host: UIHost) {
    this.listEl = h('div', { class: 'aq-food-list', role: 'group', 'aria-label': 'Foods' });
    this.lastFedEl = h('span', { class: 'aq-hint' });
    this.feedNowBtn = button('Feed now', () => this.feedNow(), { icon: 'feed', variant: 'primary' });
    this.el = h(
      'div',
      { class: 'aq-feed' },
      h('p', { class: 'aq-lead' }, `Choose a food, then ${host.isTouch ? 'tap' : 'click'} over the water to drop a pinch. Feed what your fish finish in two or three minutes — leftovers foul the water.`),
      h('div', { class: 'aq-feed-actions' }, this.feedNowBtn, this.lastFedEl),
      this.listEl,
    );
    host.app.world.events.on('food-dropped', () => {
      this.lastFedSim = host.app.world.clock.simTime;
    });
    host.app.world.events.on('tank-reset', () => (this.lastFedSim = null));
  }

  private feedNow(): void {
    const kind = this.host.feedingKind ?? this.host.lastFood;
    this.host.app.feed(kind);
    this.host.lastFood = kind;
  }

  private render(): void {
    const fish = this.host.app.world.fish;
    clear(this.listEl);
    this.items.clear();
    // Foods that suit the tank first; within that, the catalog order (stable, learnable).
    const ranked = FOOD_LIST.map((f, i) => ({ f, i, m: foodMatch(f, fish) })).sort((a, b) => {
      const ga = a.m.score >= 0.55 ? 0 : 1;
      const gb = b.m.score >= 0.55 ? 0 : 1;
      return ga - gb || a.i - b.i;
    });
    let dividerShown = false;
    const shownFans = new Set<string>();
    if (fish.length && ranked[0].m.score >= 0.55) this.listEl.append(h('h3', { class: 'aq-sec-title' }, 'Suits your animals'));
    for (const { f, m } of ranked) {
      if (fish.length && m.score < 0.55 && !dividerShown) {
        dividerShown = true;
        this.listEl.append(h('h3', { class: 'aq-sec-title' }, fish.length && ranked[0].m.score >= 0.55 ? 'Other foods' : 'Foods'));
      }
      const tags = h('span', { class: 'aq-food-tags' }, h('span', { class: 'aq-tag' }, buoyancyLabel(f)));
      if (f.buoyancy === 'live-swimming') tags.append(h('span', { class: 'aq-tag aq-tag-live' }, 'Triggers hunting'));
      if (f.sizeM >= 0.02) tags.append(h('span', { class: 'aq-tag' }, 'For larger fish'));
      // Name who relishes it — but only once per distinct line, so the list doesn't chant.
      const fanText = m.score >= 0.55 && m.fans.length ? `A favorite of your ${m.fans.slice(0, 2).map((n) => pluralName(proseName(n))).join(' and ')}` : '';
      const fans = fanText && !shownFans.has(fanText) ? h('span', { class: 'aq-food-fans' }, fanText) : null;
      if (fanText) shownFans.add(fanText);
      const btn = h(
        'button',
        { type: 'button', class: 'aq-food', 'aria-pressed': 'false', 'data-food': f.kind, title: fish.length ? `Suits about ${Math.round(m.score * 100)}% of your animals` : undefined },
        foodIcon(f),
        h('span', { class: 'aq-food-text' }, h('span', { class: 'aq-food-name' }, f.name), h('span', { class: 'aq-food-desc' }, f.description), tags, fans),
      );
      btn.addEventListener('click', () => this.choose(f.kind));
      this.items.set(f.kind, btn);
      this.listEl.append(btn);
    }
    this.sync();
  }

  private choose(kind: FoodKind): void {
    if (this.host.feedingKind === kind) {
      this.host.stopFeeding();
    } else {
      this.host.startFeeding(kind);
      // On phones the sheet covers the tank — get out of the way.
      if (this.host.isMobile) this.host.openPanel(null);
    }
    this.sync();
  }

  /** Reflect the active feeding tool. */
  sync(): void {
    const cur = this.host.feedingKind;
    for (const [k, b] of this.items) {
      const on = k === cur;
      setClass(b, 'is-active', on);
      setAttr(b, 'aria-pressed', String(on));
    }
    const kind = cur ?? this.host.lastFood;
    setText(this.feedNowBtn.querySelector('span')!, `Feed ${FOODS[kind].name.toLowerCase()}`);
  }

  refresh(): void {
    const now = this.host.app.world.clock.simTime;
    const last = this.host.lastFedAt !== undefined ? this.host.lastFedAt : this.lastFedSim;
    setText(this.lastFedEl, last === null || last > now ? '' : `Last fed ${formatDuration(now - last)} ago`);
  }

  onOpen(): void {
    this.render();
    this.refresh();
  }
}
