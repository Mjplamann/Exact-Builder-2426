/**
 * A soft dip to dark around a tank change (switching, creating, deleting the open tank): the view
 * dims for ~¼ s, the work happens behind the veil, and the new tank fades up. Only one at a time.
 */
import { h, prefersReducedMotion } from '../dom';

let busy = false;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function fading(): boolean {
  return busy;
}

/**
 * Dim, run `work`, fade back. `beforeOut` runs while the veil is fully dark (e.g. remove the
 * builder). Resolves with `work`'s result (undefined if it threw — the error is logged).
 */
export async function fadeThrough<T>(layer: HTMLElement, work: () => T | Promise<T>, beforeOut?: () => void): Promise<T | undefined> {
  if (busy) return undefined;
  busy = true;
  const reduced = prefersReducedMotion();
  const inMs = reduced ? 140 : 260;
  const outMs = reduced ? 220 : 560;
  const veil = h('div', { class: 'aqb-veil', 'aria-hidden': 'true', style: { '--veil-in': `${inMs}ms`, '--veil-out': `${outMs}ms` } });
  layer.append(veil);
  let result: T | undefined;
  try {
    // Commit the transparent state before transitioning.
    await frame();
    await frame();
    veil.classList.add('is-in');
    await wait(inMs + 30);
    try {
      result = await work();
    } catch (err) {
      console.error('[tanks] change failed', err);
    }
    beforeOut?.();
    // Let the new tank present a frame or two before it is revealed.
    await frame();
    await frame();
    veil.classList.remove('is-in');
    await wait(outMs + 40);
  } finally {
    veil.remove();
    busy = false;
  }
  return result;
}

let keyboard = false;
let wired = false;

/**
 * Did the keeper last use the keyboard (rather than a mouse or finger)? Focus is handed back to
 * the control that opened a menu or the builder only then — a mouse user gets no stray rings.
 */
export function usingKeyboard(): boolean {
  if (!wired && typeof window !== 'undefined') {
    wired = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape' || e.key === ' ' || e.key.startsWith('Arrow')) keyboard = true;
    }, true);
    window.addEventListener('pointerdown', () => (keyboard = false), true);
  }
  return keyboard;
}
