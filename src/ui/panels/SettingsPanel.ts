/**
 * Settings: display quality, sound, interface behavior, care mode (with plain explanations),
 * units; exporting the open tank, and importing or building new ones into the collection.
 */
import type { Quality, Settings } from '../../core/types';
import type { Panel, UIHost } from '../context';
import { button, section, segmented, slider, toggle } from '../controls';
import { fadeTankChange, openTankBuilder } from '../builder';
import { fading } from '../builder/fade';
import { importTank as parseTank } from '../../sim/persistence';
import { h, throttle } from '../dom';
import { formatCount } from '../format';
import { CARE_MODES } from '../phrases';

export class SettingsPanel implements Panel {
  readonly id = 'settings' as const;
  readonly title = 'Settings';
  readonly el: HTMLElement;
  private syncers: (() => void)[] = [];

  constructor(
    private host: UIHost,
  ) {
    const app = host.app;
    const s = () => app.world.settings;
    const upd = (patch: Partial<Settings>) => app.updateSettings(patch);

    const quality = segmented<Quality>('Rendering quality', [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'ultra', label: 'Ultra' },
    ], s().quality, (v) => upd({ quality: v }));

    const sound = toggle('Sound', s().sound, (v) => upd({ sound: v }), 'Filter trickle, air stones, the soft tap of glass');
    const volUpd = throttle((v: number) => upd({ volume: v }), 120);
    const volume = slider({ label: 'Volume', min: 0, max: 1, step: 0.01, value: s().volume, format: (v) => `${Math.round(v * 100)}%`, onInput: volUpd, onChange: () => volUpd.flush() });

    const autoHide = toggle('Hide controls when idle', s().uiAutoHide, (v) => upd({ uiAutoHide: v }), 'Controls fade away after a few still seconds');
    const drift = toggle('Gentle camera drift', s().cameraDrift, (v) => upd({ cameraDrift: v }), 'The view breathes slowly, like someone sitting in front of the tank');
    const dayNight = toggle('Day & night', s().dayNight, (v) => upd({ dayNight: v }), 'Lights follow the tank’s schedule; fish rest at night');
    const stats = toggle('Show performance stats', s().showStats, (v) => upd({ showStats: v }));
    const units = segmented<'metric' | 'imperial'>('Units', [
      { value: 'metric', label: 'Metric (cm, °C, L)' },
      { value: 'imperial', label: 'Imperial (in, °F, gal)' },
    ], s().units, (v) => upd({ units: v }));

    // Care mode as three explained choices.
    const careGroup = h('div', { class: 'aq-cards', role: 'radiogroup', 'aria-label': 'Care mode' });
    const careBtns = CARE_MODES.map((m) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'aq-card-choice', 'aria-checked': String(s().careMode === m.value) },
        h('span', { class: 'aq-card-choice-title' }, m.label),
        h('span', { class: 'aq-card-choice-text' }, m.text),
      );
      b.addEventListener('click', () => {
        upd({ careMode: m.value });
        syncCare();
      });
      careGroup.append(b);
      return { m, b };
    });
    const syncCare = () => {
      for (const { m, b } of careBtns) b.setAttribute('aria-checked', String(s().careMode === m.value));
    };

    // Data
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      let text: string;
      try {
        text = await file.text();
      } catch {
        host.toast('That file couldn’t be read.', 'warning');
        return;
      }
      try {
        parseTank(text);
      } catch (err) {
        host.toast(`That file couldn’t be opened as an aquarium (${err instanceof Error ? err.message : String(err)}).`, 'warning');
        return;
      }
      // An import joins the collection as a new tank (nothing is replaced).
      if (fading()) return;
      host.openPanel(null);
      const ok = await fadeTankChange(() => {
        app.importTank(text);
        return true;
      });
      if (ok) host.toast(`Imported “${app.world.tank.name}” as a new tank — your other tanks are in the tank menu.`, 'success');
      else host.toast('That aquarium couldn’t be set up.', 'warning');
    });
    const exportBtn = button('Export tank', () => this.exportTank(), { icon: 'download' });
    const importBtn = button('Import tank…', () => fileInput.click(), { icon: 'upload' });
    const newBtn = button('New tank…', () => openTankBuilder(host, { returnFocus: newBtn }), { icon: 'plusCircle' });
    const presets = app.presets();
    const starter = button('Add the starter tank again', () => {
      if (!presets[0]) return;
      host.openPanel(null);
      void fadeTankChange(() => app.loadPreset(presets[0].id));
    }, { variant: 'quiet', title: 'A fresh copy of the starter tank, added as a new tank' });

    this.syncers.push(() => {
      quality.set(s().quality);
      sound.set(s().sound);
      volume.set(s().volume);
      autoHide.set(s().uiAutoHide);
      drift.set(s().cameraDrift);
      dayNight.set(s().dayNight);
      stats.set(s().showStats);
      units.set(s().units);
      syncCare();
    });

    this.el = h(
      'div',
      { class: 'aq-settings' },
      section('Sound', sound.el, volume.el),
      section('Display', h('div', { class: 'aq-field' }, h('span', { class: 'aq-field-label' }, 'Quality'), quality.el), autoHide.el, drift.el, dayNight.el, stats.el),
      section('Care mode', careGroup),
      section('Units', units.el),
      section('Your tanks', h('div', { class: 'aq-btn-grid' }, exportBtn, importBtn, newBtn), fileInput, h('div', { class: 'aq-btn-row' }, starter)),
      section(
        null,
        h('div', { class: 'aq-about' },
          host.isTouch ? null : button('Keyboard shortcuts', () => host.showShortcuts(), { icon: 'keyboard', variant: 'quiet' }),
          h('p', { class: 'aq-hint' }, `Living Aquarium · ${formatCount(app.world.species.size)} species, ${formatCount(app.world.plants.all.length)} plants & corals. Your tanks are saved automatically.`),
        ),
      ),
    );
  }

  private async exportTank(): Promise<void> {
    const app = this.host.app;
    const filename = `${app.world.tank.name.replace(/[^\w\- ]+/g, '').trim() || 'aquarium'}.aquarium.json`;
    // Inside claude.ai the page is sandboxed and plain download links are inert: use the
    // viewer's `downloads` capability when it is available (the viewer confirms the save).
    const claude = (globalThis as { claude?: { use(name: string): Promise<unknown> } }).claude;
    if (claude?.use) {
      try {
        const downloads = (await claude.use('downloads')) as { save(f: { filename: string; data: string }): Promise<unknown> } | null;
        if (downloads) {
          await downloads.save({ filename, data: app.exportTank() });
          this.host.toast('Tank exported — keep the file to restore or share it.', 'success');
          return;
        }
      } catch {
        this.host.toast('The export was not saved.', 'info');
        return;
      }
    }
    try {
      const json = app.exportTank();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      // iOS Safari asks before saving; revoking too soon breaks the download (FileSaver.js waits 40 s).
      setTimeout(() => URL.revokeObjectURL(url), 40_000);
      this.host.toast('Tank exported — keep the file to restore or share it.', 'success');
    } catch {
      this.host.toast('Export failed.', 'warning');
    }
  }

  onOpen(): void {
    for (const s of this.syncers) s();
  }
}
