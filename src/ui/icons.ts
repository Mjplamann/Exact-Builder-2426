/**
 * Hand-drawn line icons (24×24, 1.5 px stroke, round joins). Kept deliberately simple and quiet
 * so they read as part of the glass chrome rather than as decoration. Icons are parsed once and
 * cloned on use.
 */
const PATHS = {
  fish:
    '<path d="M2.8 12c2.7-3.7 6.1-5.5 9.6-5.5 3.1 0 5.5 1.5 7.2 3.2L22 7.6v8.8l-2.4-2.1c-1.7 1.7-4.1 3.2-7.2 3.2-3.5 0-6.9-1.8-9.6-5.5z"/><path d="M10.2 9.4c.7 1.7.7 3.5 0 5.2"/><circle cx="6.6" cy="11.2" r=".75" fill="currentColor" stroke="none"/>',
  feed:
    '<path d="M2.5 15.5c1.6-1 3.2-1 4.8 0s3.2 1 4.8 0 3.2-1 4.8 0 3.2 1 4.6 0"/><path d="M9.3 4.6l2.3.7-.8 2.1-2.3-.7z"/><path d="M14.6 7.6l1.9.9-.9 1.7-1.9-.9z"/><path d="M11 10.6l1.6.3-.4 1.5-1.6-.3z"/><circle cx="8.6" cy="19.4" r=".7" fill="currentColor" stroke="none"/><circle cx="14.2" cy="20.4" r=".7" fill="currentColor" stroke="none"/>',
  aquascape:
    '<path d="M2.5 20.5h19"/><path d="M3.5 20.5c.6-3.2 2.9-5 5.4-5s4.5 1.6 5 5"/><path d="M17.5 20.5V8.5"/><path d="M17.5 14c-2.6 0-4.2-1.5-4.6-4.1 2.6 0 4.2 1.5 4.6 4.1z"/><path d="M17.5 11c2.3 0 3.7-1.3 4-3.7-2.3 0-3.7 1.3-4 3.7z"/>',
  care:
    '<path d="M12 3.2c3.1 3.8 5.7 7 5.7 10.4a5.7 5.7 0 0 1-11.4 0c0-3.4 2.6-6.6 5.7-10.4z"/><path d="M9.3 14.2a2.7 2.7 0 0 0 2.7 2.7"/>',
  time: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.3V12l3.2 2"/>',
  journal:
    '<path d="M5.2 4.5h10.6a2.4 2.4 0 0 1 2.4 2.4v12.6H7.6a2.4 2.4 0 0 1-2.4-2.4z"/><path d="M5.2 17.1a2.4 2.4 0 0 1 2.4-2.4h10.6"/><path d="M9 8.6h5.2"/>',
  settings:
    '<path d="M4 7.5h8.5M16.5 7.5H20M4 16.5h3.5M11.5 16.5H20"/><circle cx="14.5" cy="7.5" r="2"/><circle cx="9.5" cy="16.5" r="2"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
  search: '<circle cx="10.8" cy="10.8" r="6"/><path d="M15.4 15.4L20 20"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  check: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>',
  sun:
    '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M5.8 18.2l1.4-1.4M16.8 7.2l1.4-1.4"/>',
  dawn: '<path d="M3.5 17.5h17"/><path d="M7.3 17.5a4.7 4.7 0 0 1 9.4 0"/><path d="M12 8.2v2.2M6 10.6l1.3 1.3M18 10.6l-1.3 1.3"/>',
  moon: '<path d="M18.8 14.6A7.4 7.4 0 0 1 9.4 5.2a7.4 7.4 0 1 0 9.4 9.4z"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11"/>',
  play: '<path d="M8.5 6v12l9.5-6z"/>',
  follow:
    '<circle cx="12" cy="12" r="6.6"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6"/>',
  rehome: '<path d="M4 11.2L12 4.8l8 6.4"/><path d="M6.5 9.6V19h11V9.6"/><path d="M10.2 19v-4.4h3.6V19"/>',
  trash: '<path d="M5 7h14"/><path d="M9.8 7V5h4.4v2"/><path d="M7 7l.9 12.2h8.2L17 7"/>',
  rotate: '<path d="M18.6 12.4a6.7 6.7 0 1 1-2-5.3"/><path d="M18.8 4.4v3.8H15"/>',
  grow: '<path d="M14 4.5h5.5V10M19.5 4.5L13.5 10.5M10 19.5H4.5V14M4.5 19.5l6-6"/>',
  shrink: '<path d="M19.5 10H14V4.5M14 10l5.5-5.5M4.5 14H10v5.5M10 14l-5.5 5.5"/>',
  reshape:
    '<rect x="4.5" y="4.5" width="15" height="15" rx="3.2"/><circle cx="9" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-11"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M5 19.5h14"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r=".8" fill="currentColor" stroke="none"/>',
  warning: '<path d="M12 4.3l8.6 15H3.4z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.9" r=".8" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 19s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.2C19 14.7 12 19 12 19z"/>',
  feather: '<path d="M19.5 4.5c-6.5 0-11 4.5-11 11v4"/><path d="M8.5 15.5c4.6 0 8.2-2.2 9.7-6.5"/><path d="M11.5 12.5h4.5"/>',
  sparkle: '<path d="M12 3.5l1.7 5.2 5.3 1.8-5.3 1.8L12 17.5l-1.7-5.2L5 10.5l5.3-1.8z"/><path d="M18.5 16.5l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z"/>',
  plusCircle: '<circle cx="12" cy="12" r="8.6"/><path d="M12 8v8M8 12h8"/>',
  arrowOut: '<path d="M10 5H5.5v13.5H19V14"/><path d="M13 4.5h6.5V11"/><path d="M19.5 4.5L11 13"/>',
  drop: '<path d="M12 4c2.8 3.4 5 6.2 5 9.2a5 5 0 0 1-10 0c0-3 2.2-5.8 5-9.2z"/>',
  keyboard:
    '<rect x="3" y="6.5" width="18" height="11" rx="2.2"/><path d="M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M17.5 10h.01M8 14h8"/>',
  sound: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.6 7.6 0 0 1 0 11"/>',
  mute: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  thermometer: '<path d="M10 14.2V5a2 2 0 0 1 4 0v9.2a3.8 3.8 0 1 1-4 0z"/><path d="M12 9v7"/>',
  bulb: '<path d="M9 17.5h6M10 20.5h4"/><path d="M8.2 14.5a5.6 5.6 0 1 1 7.6 0c-.8.8-1.3 1.7-1.3 3h-5c0-1.3-.5-2.2-1.3-3z"/>',
  filter: '<path d="M3.5 8c2.1-1.5 4.2-1.5 6.3 0s4.2 1.5 6.3 0 3.2-1.4 4.4-.6"/><path d="M3.5 12.5c2.1-1.5 4.2-1.5 6.3 0s4.2 1.5 6.3 0 3.2-1.4 4.4-.6"/><path d="M3.5 17c2.1-1.5 4.2-1.5 6.3 0s4.2 1.5 6.3 0 3.2-1.4 4.4-.6"/>',
  bubbles: '<circle cx="9" cy="16" r="3.2"/><circle cx="15.5" cy="9.5" r="2.4"/><circle cx="10" cy="6.2" r="1.5"/><circle cx="17" cy="16.6" r="1.2"/>',
  glass: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M8 15l7-7M11.5 16.5l5-5"/>',
  scissors: '<circle cx="7" cy="7.5" r="2.5"/><circle cx="7" cy="16.5" r="2.5"/><path d="M9 9l10 8M9 15l10-8"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5 19z"/><path d="M5 19l7.5-7.5"/>',
  cursor: '<path d="M6 4l12 7.2-5.6 1.3-2.5 5.3z"/>',
  layers: '<path d="M12 4.5l8.5 4.5-8.5 4.5-8.5-4.5z"/><path d="M3.5 13l8.5 4.5 8.5-4.5"/>',
  shield: '<path d="M12 3.8l7 2.6v5.2c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.4z"/>',
} as const;

export type IconName = keyof typeof PATHS;

const cache = new Map<string, SVGSVGElement>();

/** A fresh `<svg>` element for the icon (aria-hidden; label the surrounding control instead). */
export function icon(name: IconName, size = 20, cls = 'aq-icon'): SVGSVGElement {
  const key = `${name}:${size}:${cls}`;
  let tpl = cache.get(key);
  if (!tpl) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
    tpl = wrap.firstChild as SVGSVGElement;
    cache.set(key, tpl);
  }
  return tpl.cloneNode(true) as SVGSVGElement;
}

/** Raw SVG markup (for CSS cursors / data URLs). */
export function iconMarkup(name: IconName, color = '#fff', size = 24, strokeWidth = 1.5): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
}
