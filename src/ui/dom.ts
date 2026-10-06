/**
 * Tiny DOM helpers for the framework-free UI. Everything here is allocation-light and avoids
 * layout reads; live readouts go through `setText`/`setStyle` which skip no-op writes so a 4 Hz
 * refresh never dirties layout when nothing changed.
 */

export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, unknown>;

/**
 * Create an element. Attribute conventions:
 *  - `class` / `className`: class string
 *  - `text`: textContent
 *  - `onclick`, `oninput`, …: event listeners (any key starting with "on" whose value is a function)
 *  - `style`: object of CSS properties (custom properties allowed)
 *  - boolean `true` → empty attribute, `false`/null/undefined → omitted
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  append(el, children);
  return el;
}

function applyAttrs(el: HTMLElement, attrs: Attrs): void {
  for (const key in attrs) {
    const v = attrs[key];
    if (v === undefined || v === null || v === false) continue;
    if (key === 'class' || key === 'className') el.className = String(v);
    else if (key === 'text') el.textContent = String(v);
    else if (key === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v as Record<string, string>)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else (el.style as unknown as Record<string, string>)[p] = val;
      }
    } else if (key.startsWith('on') && typeof v === 'function') {
      el.addEventListener(key.slice(2), v as EventListener);
    } else if (v === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(v));
  }
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

/** Remove all children. */
export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const TEXT = Symbol('text');
type WithText = { [TEXT]?: string };

/** Set textContent only if it changed (cached on the node, so no DOM read). */
export function setText(el: Element, text: string): void {
  const n = el as unknown as WithText;
  if (n[TEXT] === text) return;
  n[TEXT] = text;
  el.textContent = text;
}

const STYLE = Symbol('style');
type WithStyle = { [STYLE]?: Record<string, string> };

/** Set one inline style property only if it changed. */
export function setStyle(el: HTMLElement, prop: string, value: string): void {
  const n = el as unknown as WithStyle;
  const cache = (n[STYLE] ??= {});
  if (cache[prop] === value) return;
  cache[prop] = value;
  if (prop.startsWith('--')) el.style.setProperty(prop, value);
  else (el.style as unknown as Record<string, string>)[prop] = value;
}

/** Toggle a class only if the state changes. */
export function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Set an attribute only if it changed. */
export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** True when keyboard focus is in a text-entry control (shortcuts must not fire). */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button';
  }
  return el.isContentEditable;
}

/** Trailing-edge throttle: runs at most every `ms`, always delivering the latest arguments. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { flush(): void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const run = () => {
    timer = null;
    last = performance.now();
    if (pending) {
      const a = pending;
      pending = null;
      fn(...a);
    }
  };
  const t = ((...args: A) => {
    pending = args;
    const wait = ms - (performance.now() - last);
    if (wait <= 0 && !timer) run();
    else if (!timer) timer = setTimeout(run, Math.max(0, wait));
  }) as ((...args: A) => void) & { flush(): void };
  t.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  return t;
}

/** Debounce: runs `ms` after the last call. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

/** Per-viewer convenience storage (remembered tab, last food…). Never required for correctness. */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`aquarium.ui.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`aquarium.ui.${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable — fine */
    }
  },
};

let uid = 0;
/** Unique DOM id for label/aria wiring. */
export function domId(prefix = 'aq'): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
