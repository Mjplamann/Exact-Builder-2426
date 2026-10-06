/**
 * Journal: the tank's story — arrivals, births, deaths, milestones and care — grouped by sim day,
 * newest first, with a few lifetime statistics. Updates live from 'journal' events.
 */
import type { JournalEntry } from '../../core/types';
import type { Panel, UIHost } from '../context';
import { button } from '../controls';
import { clear, h, setText } from '../dom';
import { dayKey, formatCount, formatSimClock, localizeUnits, relativeDay } from '../format';
import { icon, type IconName } from '../icons';

const KIND_ICON: Record<JournalEntry['kind'], IconName> = {
  added: 'plusCircle',
  removed: 'arrowOut',
  born: 'heart',
  died: 'feather',
  milestone: 'sparkle',
  care: 'drop',
  info: 'info',
  warning: 'warning',
};

const PAGE = 120;

export class JournalPanel implements Panel {
  readonly id = 'journal' as const;
  readonly title = 'Journal';
  readonly el: HTMLElement;
  private stats: Record<'births' | 'deaths' | 'feedings' | 'waterChanges', HTMLElement>;
  private ageEl: HTMLElement;
  private listEl: HTMLElement;
  private shown = PAGE;
  private moreBtn: HTMLButtonElement;
  private dirty = true;

  constructor(private host: UIHost) {
    const stat = (label: string) => {
      const v = h('span', { class: 'aq-stat-value' }, '0');
      return { v, el: h('div', { class: 'aq-stat' }, v, h('span', { class: 'aq-stat-label' }, label)) };
    };
    const b = stat('births');
    const d = stat('losses');
    const f = stat('feedings');
    const w = stat('water changes');
    this.stats = { births: b.v, deaths: d.v, feedings: f.v, waterChanges: w.v };
    this.ageEl = h('p', { class: 'aq-hint' });
    this.listEl = h('div', { class: 'aq-journal', role: 'feed', 'aria-label': 'Journal entries' });
    this.moreBtn = button('Show earlier entries', () => {
      this.shown += PAGE;
      this.render();
    }, { variant: 'quiet' });
    this.el = h('div', { class: 'aq-journal-panel' }, h('div', { class: 'aq-stats' }, b.el, d.el, f.el, w.el), this.ageEl, this.listEl, this.moreBtn);

    const ev = host.app.world.events;
    ev.on('journal', ({ entry }) => {
      if (host.openPanelId === 'journal') this.prepend(entry);
      else this.dirty = true;
    });
    ev.on('tank-reset', () => (this.dirty = true));
  }

  private entryEl(e: JournalEntry): HTMLElement {
    return h(
      'article',
      { class: `aq-entry aq-entry-${e.kind}` },
      h('span', { class: 'aq-entry-icon', 'aria-hidden': 'true' }, icon(KIND_ICON[e.kind] ?? 'info', 15)),
      h('span', { class: 'aq-entry-text' }, localizeUnits(e.text, this.host.app.world.settings.units)),
      h('time', { class: 'aq-entry-time', datetime: new Date(e.at).toISOString() }, formatSimClock(e.at)),
    );
  }

  private dayHeader(at: number, now: number): HTMLElement {
    return h('h3', { class: 'aq-sec-title aq-day', 'data-day': dayKey(at) }, relativeDay(at, now));
  }

  private render(): void {
    this.dirty = false;
    const t = this.host.app.world.tank;
    const now = this.host.app.world.clock.simTime;
    clear(this.listEl);
    const entries = t.journal;
    const start = Math.max(0, entries.length - this.shown);
    let lastDay = '';
    for (let i = entries.length - 1; i >= start; i--) {
      const e = entries[i];
      const k = dayKey(e.at);
      if (k !== lastDay) {
        this.listEl.append(this.dayHeader(e.at, now));
        lastDay = k;
      }
      this.listEl.append(this.entryEl(e));
    }
    if (!entries.length) this.listEl.append(h('p', { class: 'aq-empty' }, 'Nothing written yet. The story of your tank will gather here.'));
    this.moreBtn.hidden = start === 0;
    this.paintStats();
  }

  private prepend(e: JournalEntry): void {
    const now = this.host.app.world.clock.simTime;
    const first = this.listEl.firstElementChild as HTMLElement | null;
    const k = dayKey(e.at);
    const el = this.entryEl(e);
    if (first?.dataset.day === k) first.after(el);
    else {
      this.listEl.querySelector('.aq-empty')?.remove();
      this.listEl.prepend(this.dayHeader(e.at, now), el);
    }
    el.classList.add('is-new');
    this.paintStats();
  }

  private paintStats(): void {
    const t = this.host.app.world.tank;
    setText(this.stats.births, formatCount(t.stats.births));
    setText(this.stats.deaths, formatCount(t.stats.deaths));
    setText(this.stats.feedings, formatCount(t.stats.feedings));
    setText(this.stats.waterChanges, formatCount(t.stats.waterChanges));
    const first = t.journal[0]?.at ?? t.simTime;
    const days = Math.floor((this.host.app.world.clock.simTime - Math.min(first, t.createdAt)) / 86_400_000);
    setText(this.ageEl, days >= 1 ? `This tank has been running for ${formatCount(days)} ${days === 1 ? 'day' : 'days'} of tank time.` : 'This tank was set up today.');
  }

  refresh(): void {
    this.paintStats();
  }

  onOpen(): void {
    if (this.dirty) this.render();
    else this.paintStats();
  }

  onSettingsChanged(): void {
    this.dirty = true;
    if (this.host.openPanelId === 'journal') this.render();
  }
}
