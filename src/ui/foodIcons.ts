/**
 * Small drawn food illustrations (32×32) in each food's own colors — flakes, pellets, sticks,
 * wafers, worms, shrimp, fleas, nori, zucchini, flies and a plankton cloud.
 */
import type { FoodType } from '../core/types';

function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * f)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

export function foodIconMarkup(f: FoodType): string {
  const a = f.color;
  const b = f.color2 ?? shade(a, 1.25);
  const d = shade(a, 0.7);
  let body = '';
  switch (f.shape) {
    case 'flake':
      body =
        `<path d="M6 10l7-3 4 4-6 4z" fill="${a}"/><path d="M15 17l7-2 3 5-7 2z" fill="${b}"/>` +
        `<path d="M8 21l5-1 2 4-5 1z" fill="${a}" opacity=".85"/><path d="M18 7l5 1-1 4-5-1z" fill="${b}" opacity=".85"/>`;
      break;
    case 'pellet':
      body = [
        [10, 12, 3.2],
        [19, 10, 2.8],
        [15, 19, 3.4],
        [23, 19, 2.6],
        [9, 22, 2.4],
      ]
        .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? b : a}"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff" opacity=".25"/>`)
        .join('');
      break;
    case 'stick':
      body = `<rect x="5" y="9" width="16" height="4.5" rx="2.2" fill="${a}" transform="rotate(-12 13 11)"/><rect x="11" y="18" width="16" height="4.5" rx="2.2" fill="${b}" transform="rotate(8 19 20)"/>`;
      break;
    case 'wafer':
      body = `<ellipse cx="16" cy="18" rx="11" ry="6" fill="${d}"/><ellipse cx="16" cy="16" rx="11" ry="6" fill="${a}"/><ellipse cx="13" cy="14.5" rx="4" ry="1.6" fill="${b}" opacity=".6"/>`;
      break;
    case 'worm':
      body =
        `<path d="M5 12c3-4 6 2 9-1s5-4 8-1" stroke="${a}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
        `<path d="M8 22c3-3 5 1 8-1s5-3 9 0" stroke="${b}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      break;
    case 'shrimp':
      body =
        `<path d="M7 18c0-6 6-9 12-8 5 1 7 5 6 9-2-2-5-3-8-2-4 1-6 4-10 1z" fill="${a}"/>` +
        `<path d="M25 19l3 3-4 0z" fill="${b}"/><path d="M8 15c-2-3-3-5-2-8" stroke="${d}" stroke-width=".8" fill="none"/><circle cx="10" cy="15" r="1" fill="#111"/>`;
      break;
    case 'flea':
      body = [
        [10, 11],
        [20, 9],
        [15, 18],
        [23, 20],
        [8, 22],
      ]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="2.1" fill="${a}"/><path d="M${x - 2} ${y - 1.5}l-2-2M${x - 2} ${y - 1}l-2.6 0" stroke="${d}" stroke-width=".6"/>`)
        .join('');
      break;
    case 'sheet':
      body = `<path d="M7 6h14l4 4v16H7z" fill="${a}"/><path d="M21 6v4h4" fill="${b}"/><path d="M10 12h9M10 16h11M10 20h7" stroke="${b}" stroke-width="1" opacity=".7"/><rect x="13" y="3" width="6" height="5" rx="1" fill="#9aa4a8"/>`;
      break;
    case 'slice':
      body = `<circle cx="16" cy="16" r="10" fill="${b}"/><circle cx="16" cy="16" r="8.4" fill="${a}"/><g fill="${shade(a, 0.85)}">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${16 + Math.cos(i * 1.047) * 4}" cy="${16 + Math.sin(i * 1.047) * 4}" rx="1.1" ry=".7"/>`).join('')}</g>`;
      break;
    case 'insect':
      body = [
        [11, 12],
        [21, 15],
        [13, 22],
      ]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="1.9" fill="${a}"/><circle cx="${x - 3}" cy="${y}" r="1.4" fill="${b}"/><path d="M${x - 1} ${y + 1.5}l-1 2M${x + 1} ${y + 1.5}l1 2M${x} ${y - 1.5}l0-2" stroke="${a}" stroke-width=".6"/>`)
        .join('');
      break;
    case 'cloud':
    default:
      body = `<g fill="${a}">${Array.from({ length: 22 }, (_, i) => {
        const ang = i * 2.39996;
        const r = Math.sqrt(i / 22) * 11;
        return `<circle cx="${(16 + Math.cos(ang) * r).toFixed(1)}" cy="${(16 + Math.sin(ang) * r * 0.8).toFixed(1)}" r="${(1.6 - i * 0.03).toFixed(2)}" opacity="${(0.9 - i * 0.025).toFixed(2)}"/>`;
      }).join('')}</g>`;
  }
  return `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function foodIcon(f: FoodType): HTMLElement {
  const span = document.createElement('span');
  span.className = 'aq-food-icon';
  span.innerHTML = foodIconMarkup(f);
  return span;
}

/** Short tag describing how the food behaves in water. */
export function buoyancyLabel(f: FoodType): string {
  switch (f.buoyancy) {
    case 'floating':
      return f.floatSeconds > 1e6 ? 'Stays on the surface' : 'Floats, then sinks';
    case 'slow-sinking':
      return 'Sinks slowly';
    case 'sinking':
      return 'Sinks';
    case 'live-swimming':
      return 'Live';
    case 'suspended':
      return 'Drifts in the water';
    case 'clip':
      return 'Clipped to the glass';
  }
}
