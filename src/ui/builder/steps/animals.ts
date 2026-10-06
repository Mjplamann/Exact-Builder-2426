/**
 * Step 7: the first inhabitants. Communities the stock advisor proposes for this exact tank
 * (best first), each usable as it is; or a compact species picker with count steppers. The
 * hand-picked list is checked against the planned tank as it changes. Both calls run off the
 * input path (after a frame / debounced) behind a soft placeholder. A fishless cycle starts
 * without animals — any planned here are noted in the journal, to add once the filter matures.
 */
import type { Species } from '../../../core/types';
import type { StockCheck, StockSuggestion } from '../../../app/tankTypes';
import { stepper } from '../../controls';
import { clear, debounce, h, setAttr, setClass, setText } from '../../dom';
import { formatLength, localizeUnits, plural } from '../../format';
import { icon } from '../../icons';
import { VirtualList } from '../../VirtualList';
import type { StepEnv, StepView } from './types';

const THUMB = 72;
const TAG = 'builder';
const LEVEL_WORDS: Record<StockCheck['level'], string> = { good: 'Good match', caution: 'Needs care', bad: 'Not advised' };
const CHECK_WORDS: Record<StockCheck['level'], string> = { good: 'They should get along here', caution: 'Workable, with care', bad: 'Not a good idea in this tank' };

/** What the advisor's answer depends on (not the animals already chosen). */
function suggestKey(env: StepEnv): string {
  const s = env.model.spec;
  return JSON.stringify([s.water, s.size, s.aquascape, s.substrate, s.waterParams, s.equipment, s.cycled]);
}

/** Why a 'caution' community is still worth considering (optional in the advisor's answer). */
function notesOf(s: StockSuggestion): string[] {
  const notes = (s as StockSuggestion & { notes?: unknown }).notes;
  return Array.isArray(notes) ? notes.filter((n): n is string => typeof n === 'string') : [];
}

function stockingBar(fraction: number): HTMLElement {
  const f = Math.max(0, fraction);
  const cls = f > 1 ? 'is-bad' : f > 0.8 ? 'is-caution' : '';
  return h(
    'div',
    { class: 'aqb-stocking' },
    h('div', { class: 'aq-meter', role: 'img', 'aria-label': `Uses about ${Math.round(f * 100)}% of what the tank can support` }, h('div', { class: `aq-meter-fill ${cls}`, style: { transform: `scaleX(${Math.min(1, f).toFixed(3)})` } })),
    h('span', { class: 'aqb-stocking-text' }, f > 1 ? `About ${Math.round(f * 100)}% of capacity — overstocked` : `Uses about ${Math.round(f * 100)}% of the tank's capacity`),
  );
}

export function animalsStep(env: StepEnv): StepView {
  const { host, model: m, units } = env;
  const app = host.app;
  const species = app.world.species;
  const water = m.spec.water;
  let disposed = false;
  let pickerBuilt = false;

  const thumb = (sp: Species, cls = 'aqb-thumb') => {
    const t = host.thumbs.immediate(sp, THUMB);
    const img = h('img', { class: `${cls}${t.real ? ' is-real' : ''}`, src: t.url, alt: '', width: 56, height: 36, decoding: 'async', draggable: 'false' });
    if (!t.real)
      host.thumbs.request(sp, THUMB, (url) => {
        img.src = url;
        img.classList.add('is-real');
      }, TAG);
    return img;
  };

  // --- Fishless note ----------------------------------------------------------------------------
  const cycling = m.spec.cycled
    ? null
    : h(
        'div',
        { class: 'aqb-callout' },
        icon('calendar', 18),
        h('p', null, 'Your filter will be cycling, so the tank starts without animals. When ammonia and nitrite both test at zero — in about 4–6 weeks — add them from the Fish panel. Anything you plan here waits in the journal until then.'),
      );

  // --- The chosen animals & their check --------------------------------------------------------
  const selList = h('div', { class: 'aqb-sel-list' });
  const checkBox = h('div', { class: 'aqb-check aq-compat', 'aria-live': 'polite' });
  const selCount = h('span', { class: 'aqb-sel-count' });
  const selection = h('section', { class: 'aqb-sel', 'aria-label': 'Your animals' }, h('h3', { class: 'aq-sec-title' }, 'Your animals ', selCount), selList, checkBox);

  const renderSelection = () => {
    clear(selList);
    const stock = m.spec.stock;
    setText(selCount, stock.length ? `· ${m.animals}` : '');
    if (!stock.length) {
      selList.append(h('p', { class: 'aqb-sel-empty' }, m.spec.cycled ? 'None yet — use a community below, or pick animals yourself.' : 'None yet — that is right for a fishless cycle.'));
      checkBox.hidden = true;
      return;
    }
    for (const q of stock) {
      const sp = species.get(q.speciesId);
      if (!sp) continue;
      const step = stepper(sp.commonName, q.count, 0, 99, (v) => {
        m.setCount(sp.id, v);
        env.changed();
        if (v === 0) {
          renderSelection();
          syncCards();
        } else setText(selCount, `· ${m.animals}`);
        scheduleCheck();
      });
      selList.append(
        h(
          'div',
          { class: 'aqb-sel-row' },
          h('span', { class: 'aqb-thumb-wrap' }, thumb(sp)),
          h('span', { class: 'aqb-sel-text' }, h('span', { class: 'aqb-sel-name' }, sp.commonName), h('span', { class: 'aqb-sel-sub' }, `${formatLength(sp.adultLengthCm, units)} adult · ${sp.temperament}`)),
          step.el,
        ),
      );
    }
    checkBox.hidden = false;
  };

  const runCheck = () => {
    if (disposed) return;
    if (!m.spec.stock.length) return;
    let res: StockCheck;
    try {
      res = app.checkStock(m.toSpec(), m.spec.stock.map((q) => ({ ...q })));
    } catch (err) {
      console.warn('[builder] checkStock failed', err);
      setClass(checkBox, 'is-pending', false);
      checkBox.replaceChildren(h('p', { class: 'aq-compat-text' }, 'The compatibility check is not available right now.'));
      return;
    }
    setClass(checkBox, 'is-pending', false);
    setClass(checkBox, 'is-caution', res.level === 'caution');
    setClass(checkBox, 'is-bad', res.level === 'bad');
    const name = (id: string) => species.get(id)?.commonName ?? id;
    checkBox.replaceChildren(
      h('div', { class: 'aq-compat-head' }, h('span', { class: `aq-compat-dot${res.level === 'good' ? '' : ` is-${res.level}`}` }), h('strong', null, CHECK_WORDS[res.level])),
    );
    // A load too small to show (or not yet known) needs no bar.
    if (res.stocking >= 0.005) checkBox.append(stockingBar(res.stocking));
    if (res.issues.length) checkBox.append(h('ul', { class: 'aq-compat-issues' }, ...res.issues.slice(0, 6).map((i) => h('li', null, `${name(i.speciesId)}: ${localizeUnits(i.text, units)}`))));
  };
  const debouncedCheck = debounce(runCheck, 260);
  const scheduleCheck = () => {
    if (!m.spec.stock.length) {
      checkBox.hidden = true;
      return;
    }
    checkBox.hidden = false;
    setClass(checkBox, 'is-pending', true);
    if (!checkBox.firstChild) checkBox.append(h('p', { class: 'aq-compat-text' }, 'Checking how they suit this tank…'));
    debouncedCheck();
  };

  // --- Suggested communities ------------------------------------------------------------------
  const sugList = h('div', { class: 'aqb-communities', 'aria-busy': 'true' }, h('p', { class: 'aqb-placeholder' }, 'Finding animals that suit this tank…'));
  const cards: { s: StockSuggestion; btn: HTMLButtonElement; el: HTMLElement }[] = [];
  const sameStock = (a: StockSuggestion['stock']) => a.length === m.spec.stock.length && a.every((q) => m.countOf(q.speciesId) === q.count);
  const syncCards = () => {
    for (const c of cards) {
      const on = sameStock(c.s.stock);
      setClass(c.el, 'is-chosen', on);
      setAttr(c.btn, 'aria-pressed', String(on));
      setText(c.btn.querySelector('span')!, on ? 'Chosen' : 'Use this community');
    }
  };
  const renderSuggestions = (list: StockSuggestion[]) => {
    sugList.removeAttribute('aria-busy');
    clear(sugList);
    cards.length = 0;
    if (!list.length) {
      sugList.append(h('p', { class: 'aqb-placeholder' }, 'No ready-made communities for this tank yet — pick animals yourself below.'));
      openPicker();
      return;
    }
    for (const s of list) {
      const members = s.stock.map((q) => ({ q, sp: species.get(q.speciesId) })).filter((x): x is { q: { speciesId: string; count: number }; sp: Species } => !!x.sp);
      const n = members.reduce((a, x) => a + x.q.count, 0);
      const btn = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost aqb-use', 'aria-pressed': 'false' }, icon('check', 16), h('span', null, 'Use this community'));
      btn.addEventListener('click', () => {
        m.setStock(s.stock);
        env.changed();
        renderSelection();
        syncCards();
        scheduleCheck();
      });
      const el = h(
        'article',
        { class: 'aqb-community' },
        h('div', { class: 'aqb-community-head' }, h('h4', { class: 'aqb-community-title' }, s.title), h('span', { class: `aqb-level is-${s.level}` }, LEVEL_WORDS[s.level])),
        h('p', { class: 'aqb-community-desc' }, s.description),
        notesOf(s).length ? h('ul', { class: 'aqb-community-notes' }, ...notesOf(s).slice(0, 3).map((n) => h('li', null, localizeUnits(n, units)))) : null,
        h('ul', { class: 'aqb-members' }, ...members.map(({ q, sp }) => h('li', { class: 'aqb-member' }, h('span', { class: 'aqb-thumb-wrap' }, thumb(sp)), h('span', { class: 'aqb-member-name' }, h('span', { class: 'aqb-member-count' }, `${q.count} ×`), ` ${sp.commonName}`)))),
        stockingBar(s.stocking),
        h('div', { class: 'aqb-community-foot' }, h('span', { class: 'aq-hint' }, `${n} ${plural(n, 'animal')}, ${members.length} ${plural(members.length, 'species', 'species')}`), btn),
      );
      cards.push({ s, btn, el });
      sugList.append(el);
    }
    syncCards();
  };
  const loadSuggestions = () => {
    const key = suggestKey(env);
    const cached = env.cache.suggestions.get(key);
    if (cached) return renderSuggestions(cached);
    // Let the step's entrance settle before the advisor's (synchronous) work.
    setTimeout(() => {
      if (disposed) return;
      let list: StockSuggestion[] = [];
      try {
        list = app.suggestStock(m.toSpec());
      } catch (err) {
        console.warn('[builder] suggestStock failed', err);
      }
      env.cache.suggestions.set(key, list);
      if (!disposed) renderSuggestions(list);
    }, 60);
  };

  // --- Species picker ----------------------------------------------------------------------------
  const pickerBody = h('div', { class: 'aqb-picker-body', hidden: true });
  const customize = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost aqb-customize', 'aria-expanded': 'false' }, icon('search', 16), h('span', null, 'Pick animals yourself'));
  customize.addEventListener('click', () => (pickerBody.hidden ? openPicker(true) : closePicker()));
  let vlist: VirtualList<Species> | null = null;
  const resultsMeta = h('p', { class: 'aqb-picker-meta' });
  function closePicker(): void {
    pickerBody.hidden = true;
    setAttr(customize, 'aria-expanded', 'false');
  }
  function openPicker(focus = false): void {
    pickerBody.hidden = false;
    setAttr(customize, 'aria-expanded', 'true');
    if (!pickerBuilt) buildPicker();
    if (focus) pickerBody.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }
  function buildPicker(): void {
    pickerBuilt = true;
    const search = h('input', { type: 'search', class: 'aq-search-input', 'data-enter': 'ignore', placeholder: 'Search by name, family or region', 'aria-label': 'Search animals', value: env.cache.pickerQuery, enterkeyhint: 'search' });
    vlist = new VirtualList<Species>({
      rowHeight: host.isTouch ? 60 : 54,
      className: 'aqb-picker-list aqb-noswipe',
      ariaLabel: 'Animals for this water',
      createRow: () => {
        const img = h('img', { class: 'aqb-thumb', alt: '', width: 56, height: 36, decoding: 'async', draggable: 'false' });
        const b = h(
          'button',
          { type: 'button', class: 'aqb-pick' },
          h('span', { class: 'aqb-thumb-wrap' }, img),
          h('span', { class: 'aqb-pick-text' }, h('span', { class: 'aqb-pick-name' }), h('span', { class: 'aqb-pick-sub' })),
          h('span', { class: 'aqb-pick-count' }),
          h('span', { class: 'aqb-pick-add', 'aria-hidden': 'true' }, icon('plus', 16)),
        );
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          const sp = id ? species.get(id) : undefined;
          if (!sp) return;
          const have = m.countOf(sp.id);
          m.setCount(sp.id, have ? have + 1 : Math.max(1, Math.min(12, sp.groupSize)));
          env.changed();
          renderSelection();
          syncCards();
          scheduleCheck();
          vlist?.refresh();
        });
        return h('div', null, b);
      },
      bindRow: (row, sp) => {
        const b = row.firstChild as HTMLButtonElement;
        b.dataset.id = sp.id;
        const img = b.querySelector('img')!;
        const t = host.thumbs.immediate(sp, THUMB);
        img.src = t.url;
        setClass(img, 'is-real', t.real);
        if (!t.real)
          host.thumbs.request(sp, THUMB, (url) => {
            if (b.dataset.id === sp.id) {
              img.src = url;
              img.classList.add('is-real');
            }
          }, TAG);
        setText(b.querySelector('.aqb-pick-name')!, sp.commonName);
        setText(b.querySelector('.aqb-pick-sub')!, `${sp.scientificName} · ${formatLength(sp.adultLengthCm, units)}`);
        const have = m.countOf(sp.id);
        setText(b.querySelector('.aqb-pick-count')!, have ? `${have} chosen` : '');
        b.setAttribute('aria-label', have ? `Add one more ${sp.commonName} (${have} chosen)` : `Add ${sp.commonName}`);
      },
    });
    const fill = () => {
      const list = species.search(env.cache.pickerQuery, { water });
      vlist!.setItems(list, true);
      setText(resultsMeta, `${list.length.toLocaleString()} ${plural(list.length, 'animal')} for ${water === 'marine' ? 'saltwater' : water} tanks`);
    };
    search.addEventListener(
      'input',
      debounce(() => {
        env.cache.pickerQuery = search.value;
        host.thumbs.cancelPending(TAG);
        fill();
      }, 140),
    );
    pickerBody.append(h('div', { class: 'aq-search' }, icon('search', 16), search), resultsMeta, vlist.el);
    fill();
  }

  renderSelection();
  if (m.spec.stock.length) scheduleCheck();

  return {
    title: 'First inhabitants',
    lead: m.spec.cycled ? 'Communities that genuinely suit this tank, best first — use one as it is, or make it your own.' : 'Plan who will live here once the filter has matured.',
    el: h(
      'div',
      { class: 'aqb-step-animals' },
      cycling,
      selection,
      h('h3', { class: 'aq-sec-title' }, 'Suggested communities'),
      sugList,
      h('section', { class: 'aqb-picker' }, customize, pickerBody),
    ),
    onShown: loadSuggestions,
    dispose() {
      disposed = true;
      vlist?.dispose();
      host.thumbs.cancelPending(TAG);
    },
  };
}
