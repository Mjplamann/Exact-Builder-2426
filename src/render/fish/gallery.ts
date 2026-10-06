import type { App } from '../../app/App';

/**
 * Visual-QA harness (`/?gallery=<filter>`): freezes behavior and lines up one animal per species
 * (optionally filtered by archetype/family/id substring) side-on in rows so the renderer can be
 * judged from screenshots.
 *
 * OWNER: fish-rendering module.
 */
export function runGallery(app: App, filter: string): void {
  void app;
  void filter;
}
