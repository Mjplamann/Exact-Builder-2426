/**
 * The small floating card for a selected animal: its name (click to rename), species, sex, age,
 * size against its adult size, lineage if born in the tank, hunger/health/stress as soft bars,
 * what it is doing right now, and Follow / Rehome. Refreshed ~4 Hz while visible.
 */
import type { FishEntity } from '../core/types';
import type { UIHost } from './context';
import { button, confirmButton, iconButton } from './controls';
import { h, setClass, setStyle, setText } from './dom';
import { aName, formatAge, formatLength, humanActivity } from './format';
import { icon } from './icons';

interface Bar {
  fill: HTMLElement;
  value: HTMLElement;
}

export class FishCard {
  readonly el: HTMLElement;
  private fishId: string | null = null;
  private nameBtn: HTMLButtonElement;
  private nameInput: HTMLInputElement;
  private speciesEl: HTMLElement;
  private sexEl: HTMLElement;
  private ageEl: HTMLElement;
  private sizeEl: HTMLElement;
  private lineageEl: HTMLElement;
  private activityEl: HTMLElement;
  private bars: { hunger: Bar; health: Bar; stress: Bar };
  private followBtn: HTMLButtonElement;
  private renaming = false;

  constructor(
    private host: UIHost,
    layer: HTMLElement,
  ) {
    const app = host.app;
    this.nameBtn = h('button', { type: 'button', class: 'aq-card-name', title: 'Click to rename' });
    this.nameBtn.addEventListener('click', () => this.startRename());
    this.nameInput = h('input', { type: 'text', class: 'aq-card-name-input', maxlength: 32, 'aria-label': 'Name', hidden: true });
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.commitRename();
      else if (e.key === 'Escape') {
        e.stopPropagation();
        this.cancelRename();
      }
    });
    this.nameInput.addEventListener('blur', () => this.renaming && this.commitRename());

    this.speciesEl = h('button', { type: 'button', class: 'aq-card-species aq-link', title: 'About this species' });
    this.speciesEl.addEventListener('click', () => {
      const f = this.fish();
      if (f) host.showSpecies(f.species);
    });
    this.sexEl = h('span', { class: 'aq-card-sex' });
    this.ageEl = h('span');
    this.sizeEl = h('span');
    this.lineageEl = h('p', { class: 'aq-card-lineage' });
    this.activityEl = h('span', { class: 'aq-card-activity-text' });

    const bar = (label: string, cls: string): Bar & { el: HTMLElement } => {
      const fill = h('span', { class: 'aq-bar-fill' });
      const value = h('span', { class: 'aq-bar-value' });
      return { fill, value, el: h('div', { class: `aq-bar ${cls}` }, h('span', { class: 'aq-bar-label' }, label), h('span', { class: 'aq-bar-track' }, fill), value) };
    };
    const hunger = bar('Hunger', 'is-hunger');
    const health = bar('Health', 'is-health');
    const stress = bar('Stress', 'is-stress');
    this.bars = { hunger, health, stress };

    this.followBtn = button('Follow', () => {
      const id = this.fishId;
      if (!id) return;
      app.follow(app.world.follow === id ? null : id);
      this.refresh();
    }, { icon: 'follow', cls: 'aq-btn-small' });
    const rehome = confirmButton('Rehome', 'Confirm rehome', () => {
      if (this.fishId) app.removeFish(this.fishId);
    }, { icon: 'rehome', cls: 'aq-btn-small', variant: 'quiet', title: 'Pass this animal on to another keeper' });
    const close = iconButton('close', 'Close', () => {
      app.follow(null);
      app.select({});
    }, 'aq-icon-btn aq-card-close');

    this.el = h(
      'aside',
      { class: 'aq-fishcard aq-glass', 'aria-label': 'Selected animal', hidden: true },
      h('div', { class: 'aq-card-head' }, h('div', { class: 'aq-card-title' }, this.nameBtn, this.nameInput, this.sexEl), close),
      h('div', { class: 'aq-card-sub' }, this.speciesEl),
      h('div', { class: 'aq-card-facts' }, h('span', { class: 'aq-card-fact' }, icon('calendar', 13), this.ageEl), h('span', { class: 'aq-card-fact' }, icon('fish', 13), this.sizeEl)),
      this.lineageEl,
      h('div', { class: 'aq-bars' }, hunger.el, health.el, stress.el),
      h('div', { class: 'aq-card-activity' }, h('span', { class: 'aq-card-activity-dot', 'aria-hidden': 'true' }), this.activityEl),
      h('div', { class: 'aq-card-actions' }, this.followBtn, rehome),
    );
    layer.append(this.el);

    const ev = app.world.events;
    ev.on('selection-changed', (s) => this.show(s.fishId ?? null));
    const gone = (id: string) => {
      if (id === this.fishId) this.show(null);
    };
    ev.on('fish-removed', ({ fishId }) => gone(fishId));
    ev.on('fish-died', ({ fish }) => gone(fish.state.id));
    ev.on('tank-reset', () => this.show(null));
  }

  get visible(): boolean {
    return this.fishId !== null;
  }

  private fish(): FishEntity | undefined {
    return this.fishId ? this.host.app.world.fishById.get(this.fishId) : undefined;
  }

  show(fishId: string | null): void {
    if (this.renaming) this.cancelRename();
    this.fishId = fishId && this.host.app.world.fishById.has(fishId) ? fishId : null;
    this.el.hidden = !this.fishId;
    if (this.fishId) {
      this.el.classList.remove('is-in');
      requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add('is-in')));
      this.refresh();
    }
  }

  refresh(): void {
    const f = this.fish();
    if (!f) {
      if (this.fishId) this.show(null);
      return;
    }
    const app = this.host.app;
    const s = f.state;
    const sp = f.species;
    const units = app.world.settings.units;
    if (!this.renaming) setText(this.nameBtn, s.name ?? sp.commonName);
    setText(this.speciesEl, s.name ? sp.commonName : sp.scientificName);
    setClass(this.speciesEl, 'is-sci', !s.name);
    setText(this.sexEl, s.sex === 'male' ? '♂' : s.sex === 'female' ? '♀' : '');
    this.sexEl.title = s.sex === 'unknown' ? '' : s.sex;
    const age = app.world.clock.simTime - s.bornAt;
    setText(this.ageEl, age < 0 ? 'newborn' : `${formatAge(age)} old`);
    const adult = sp.adultLengthCm * s.sizeFactor * ((s.sex === 'male' ? sp.male?.lengthScale : s.sex === 'female' ? sp.female?.lengthScale : 1) ?? 1);
    const pct = Math.min(100, Math.round((s.lengthCm / adult) * 100));
    setText(this.sizeEl, `${formatLength(s.lengthCm, units)} · ${pct >= 99 ? 'fully grown' : `${pct}% of adult size`}`);

    let lineage = '';
    if (s.generation > 0) {
      const names = (s.parents ?? []).map((id) => {
        const p = app.world.fishById.get(id);
        return p ? (p.state.name ?? aName(p.species.commonName)) : null;
      });
      const known = names.filter((n): n is string => !!n);
      lineage = `Born in your tank · generation ${s.generation}${known.length ? ` · parents: ${known.join(' & ')}` : ''}`;
    } else {
      const days = Math.floor((app.world.clock.simTime - s.addedAt) / 86_400_000);
      lineage = days < 1 ? 'Arrived today' : `With you for ${formatAge(app.world.clock.simTime - s.addedAt)}`;
    }
    setText(this.lineageEl, lineage);

    this.paintBar(this.bars.hunger, s.hunger, s.hunger < 0.5 ? 'good' : s.hunger < 0.8 ? 'caution' : 'bad', s.hunger < 0.25 ? 'Full' : s.hunger < 0.5 ? 'Content' : s.hunger < 0.8 ? 'Hungry' : 'Starving');
    this.paintBar(this.bars.health, s.health, s.health > 0.75 ? 'good' : s.health > 0.4 ? 'caution' : 'bad', s.health > 0.9 ? 'Thriving' : s.health > 0.75 ? 'Good' : s.health > 0.4 ? 'Weak' : 'Poorly');
    this.paintBar(this.bars.stress, s.stress, s.stress < 0.35 ? 'good' : s.stress < 0.7 ? 'caution' : 'bad', s.stress < 0.15 ? 'Calm' : s.stress < 0.35 ? 'Relaxed' : s.stress < 0.7 ? 'Uneasy' : 'Stressed');

    setText(this.activityEl, humanActivity(f.kin.activity));
    const following = app.world.follow === s.id;
    setText(this.followBtn.querySelector('span')!, following ? 'Following' : 'Follow');
    setClass(this.followBtn, 'is-on', following);
    this.followBtn.setAttribute('aria-pressed', String(following));
  }

  private paintBar(b: Bar, v: number, level: 'good' | 'caution' | 'bad', word: string): void {
    setStyle(b.fill, 'transform', `scaleX(${Math.max(0.02, Math.min(1, v)).toFixed(2)})`);
    setClass(b.fill, 'is-good', level === 'good');
    setClass(b.fill, 'is-caution', level === 'caution');
    setClass(b.fill, 'is-bad', level === 'bad');
    setText(b.value, word);
  }

  private startRename(): void {
    const f = this.fish();
    if (!f) return;
    this.renaming = true;
    this.nameInput.value = f.state.name ?? '';
    this.nameInput.placeholder = f.species.commonName;
    this.nameBtn.hidden = true;
    this.nameInput.hidden = false;
    this.nameInput.focus();
    this.nameInput.select();
  }

  private commitRename(): void {
    const f = this.fish();
    this.renaming = false;
    if (f) this.host.app.renameFish(f.state.id, this.nameInput.value);
    this.nameInput.hidden = true;
    this.nameBtn.hidden = false;
    this.refresh();
  }

  private cancelRename(): void {
    this.renaming = false;
    this.nameInput.hidden = true;
    this.nameBtn.hidden = false;
  }

  /** Esc: cancel rename first; returns true if handled. */
  onEscape(): boolean {
    if (this.renaming) {
      this.cancelRename();
      return true;
    }
    return false;
  }
}
