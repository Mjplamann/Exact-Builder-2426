/**
 * Time: how fast the tank's biology runs. Large, friendly choices with what each pace means in
 * practice, pause/resume, and the tank's date and time of day.
 */
import { TIME_SCALES } from '../../core/clock';
import type { Panel, UIHost } from '../context';
import { button } from '../controls';
import { h, setAttr, setClass, setText } from '../dom';
import { formatHour, formatLongDate, formatSimClock, scheduleIsOn } from '../format';
import { icon } from '../icons';

export class TimePanel implements Panel {
  readonly id = 'time' as const;
  readonly title = 'Time';
  readonly el: HTMLElement;
  private clockEl: HTMLElement;
  private dateEl: HTMLElement;
  private lightEl: HTMLElement;
  private choices: { value: number; el: HTMLButtonElement }[] = [];
  private pauseBtn: HTMLButtonElement;

  constructor(private host: UIHost) {
    const app = host.app;
    this.clockEl = h('div', { class: 'aq-time-big' });
    this.dateEl = h('div', { class: 'aq-time-date' });
    this.lightEl = h('div', { class: 'aq-hint' });
    this.pauseBtn = button('Pause', () => app.setPaused(!app.world.clock.paused), { icon: 'pause', cls: 'aq-pause-btn' });

    const group = h('div', { class: 'aq-time-choices', role: 'radiogroup', 'aria-label': 'Speed of time' });
    TIME_SCALES.forEach((t, i) => {
      const b = h(
        'button',
        { type: 'button', role: 'radio', class: 'aq-time-choice', 'aria-checked': 'false', 'data-scale': t.value },
        h('span', { class: 'aq-time-choice-label' }, t.label),
        h('span', { class: 'aq-time-choice-hint' }, t.hint),
        h('kbd', { class: 'aq-kbd' }, String(i + 1)),
      );
      b.addEventListener('click', () => {
        app.setTimeScale(t.value);
        if (app.world.clock.paused) app.setPaused(false);
        this.refresh();
      });
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const j = (i + d + TIME_SCALES.length) % TIME_SCALES.length;
        this.choices[j].el.focus();
        this.choices[j].el.click();
      });
      this.choices.push({ value: t.value, el: b });
      group.append(b);
    });

    this.el = h(
      'div',
      { class: 'aq-timepanel' },
      h('div', { class: 'aq-time-now' }, this.clockEl, this.dateEl, this.lightEl),
      h('div', { class: 'aq-time-pause' }, this.pauseBtn),
      group,
      h(
        'p',
        { class: 'aq-hint aq-time-note' },
        'Swimming always happens in real time. The chosen pace speeds up biology — growth, appetite, water chemistry, breeding and the day/night cycle.',
      ),
    );
  }

  refresh(): void {
    const w = this.host.app.world;
    const t = w.clock.simTime;
    setText(this.clockEl, formatSimClock(t));
    setText(this.dateEl, formatLongDate(t));
    const L = w.tank.equipment.lights;
    const hr = w.env.hour;
    let light: string;
    if (!w.settings.dayNight) light = 'Day/night cycle is off — the lights stay on.';
    else if (scheduleIsOn(hr, L.onHour, L.offHour)) light = `Lights on · they dim at ${formatHour(L.offHour)}`;
    else light = `Night · lights come on at ${formatHour(L.onHour)}`;
    setText(this.lightEl, light);
    const paused = w.clock.paused;
    const scale = w.clock.timeScale;
    for (const c of this.choices) {
      const on = c.value === scale;
      setAttr(c.el, 'aria-checked', String(on));
      if (c.el.tabIndex !== (on ? 0 : -1)) c.el.tabIndex = on ? 0 : -1;
      setClass(c.el, 'is-active', on);
    }
    const label = this.pauseBtn.querySelector('span')!;
    setText(label, paused ? 'Resume time' : 'Pause time');
    const ic = this.pauseBtn.querySelector('svg');
    const want = paused ? 'play' : 'pause';
    if (ic && ic.dataset.name !== want) {
      const n = icon(want, 16);
      n.dataset.name = want;
      ic.replaceWith(n);
    }
    setClass(this.pauseBtn, 'is-paused', paused);
  }

  onOpen(): void {
    this.refresh();
  }
}
