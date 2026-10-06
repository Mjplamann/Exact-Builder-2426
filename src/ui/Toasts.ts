/**
 * Gentle notifications: small glass toasts that fade in at the bottom center, linger long
 * enough to read (scaled by length) and fade away; at most three on screen, the rest wait.
 * Plus the calm "welcome back" card shown after being away.
 */
import { h } from './dom';
import { icon } from './icons';

export type ToastLevel = 'info' | 'success' | 'warning' | 'danger';

const MAX_VISIBLE = 3;

export class Toasts {
  readonly el: HTMLElement;
  private queue: { message: string; level: ToastLevel }[] = [];
  private visible = 0;
  /** Messages on screen right now (a repeat while one is showing is dropped, not stacked). */
  private showing = new Set<string>();
  private welcome: HTMLElement | null = null;

  constructor(private layer: HTMLElement) {
    this.el = h('div', { class: 'aq-toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
    layer.append(this.el);
  }

  show(message: string, level: ToastLevel = 'info'): void {
    // Collapse exact repeats that are already waiting or on screen.
    if (this.showing.has(message) || this.queue.some((q) => q.message === message)) return;
    this.queue.push({ message, level });
    this.pump();
  }

  private pump(): void {
    while (this.visible < MAX_VISIBLE && this.queue.length) {
      const { message, level } = this.queue.shift()!;
      this.visible++;
      this.showing.add(message);
      const t = h('div', { class: `aq-toast aq-toast-${level}` }, h('span', { class: 'aq-toast-dot', 'aria-hidden': 'true' }), h('span', { class: 'aq-toast-text' }, message));
      this.el.append(t);
      // Two frames so the initial (transparent) state is committed before transitioning in.
      requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-in')));
      const ms = Math.min(9000, 3800 + message.length * 45);
      const remove = () => {
        if (t.classList.contains('is-out')) return;
        this.showing.delete(message);
        t.classList.remove('is-in');
        t.classList.add('is-out');
        setTimeout(() => {
          t.remove();
          this.visible--;
          this.pump();
        }, 700);
      };
      const timer = setTimeout(remove, ms);
      t.addEventListener('click', () => {
        clearTimeout(timer);
        remove();
      });
    }
  }

  /** Calm centered card ("While you were away…"); fades on its own or when clicked. */
  showWelcome(text: string, touch = false): void {
    this.welcome?.remove();
    const card = h(
      'div',
      { class: 'aq-welcome', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'aq-welcome-icon' }, icon('sparkle', 22)),
      h('h2', { class: 'aq-welcome-title' }, 'Welcome back'),
      h('p', { class: 'aq-welcome-text' }, text),
      h('div', { class: 'aq-welcome-hint' }, `${touch ? 'Tap' : 'Click'} anywhere to continue`),
    );
    this.layer.append(card);
    this.welcome = card;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-in')));
    const ms = Math.min(20000, 9000 + text.length * 40);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      card.classList.remove('is-in');
      setTimeout(() => card.remove(), 900);
      if (this.welcome === card) this.welcome = null;
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
    };
    setTimeout(close, ms);
    // Any click/key dismisses — but give the user a moment so a stray click doesn't eat it.
    setTimeout(() => {
      if (closed) return;
      window.addEventListener('pointerdown', close, true);
      window.addEventListener('keydown', close, true);
    }, 600);
  }
}
