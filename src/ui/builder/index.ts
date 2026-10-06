/**
 * The tank builder's front door: one builder at a time, opened from the tank menu, the
 * Aquascape panel or Settings.
 */
import '../builder.css';
import type { UIHost } from '../context';
import { fadeThrough } from './fade';
import { TankBuilder, type BuilderOptions } from './TankBuilder';

let current: TankBuilder | null = null;
let layerEl: HTMLElement | null = null;

/** Where the builder (and the tank-change veil) live: the UI layer. */
export function setBuilderLayer(layer: HTMLElement): void {
  layerEl = layer;
}

function layer(): HTMLElement {
  return layerEl ?? document.querySelector<HTMLElement>('.aq-root') ?? document.body;
}

/** Change tanks (set up a preset, import…) behind the same soft dip to dark as switching. */
export function fadeTankChange<T>(work: () => T | Promise<T>): Promise<T | undefined> {
  return fadeThrough(layer(), work);
}

export function builderOpen(): boolean {
  return current !== null;
}

/** Open the builder over the tank (closing any panel and the feeding tool first). */
export function openTankBuilder(host: UIHost, opts: BuilderOptions = {}): void {
  if (current) return;
  host.stopFeeding();
  if (host.openPanelId) host.openPanel(null);
  const b = new TankBuilder(host, layer(), opts);
  b.onClosed = () => {
    if (current === b) current = null;
  };
  current = b;
}

/** Close an open builder without creating anything (e.g. the app is switching tanks). */
export function closeTankBuilder(): void {
  current?.close();
}
