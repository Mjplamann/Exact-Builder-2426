import type { AppApi } from '../app/AppApi';

/**
 * The calm, auto-hiding interface: species catalog (search/filter, thumbnails, compatibility),
 * feeding tool, decor & plant editor (place/drag/rotate/scale/delete), care panel (water tests,
 * water change, glass cleaning, equipment, light schedule), time controls, fish info card,
 * journal, settings, notifications, keyboard shortcuts.
 *
 * OWNER: UI module. Placeholder: nothing.
 */
export class UI {
  constructor(
    private root: HTMLElement,
    private app: AppApi,
  ) {}

  /** Called every frame; refresh live readouts at a modest rate. */
  update(dt: number): void {
    void dt;
    void this.root;
    void this.app;
  }

  /** Show a one-off message (e.g. the catch-up summary after being away). */
  showWelcomeBack(text: string): void {
    void text;
  }
}
