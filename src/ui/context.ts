/**
 * What UI components may ask of the UI shell. Components receive this instead of the concrete
 * `UI` class (avoids import cycles and keeps each panel self-contained).
 */
import type { AppApi } from '../app/AppApi';
import type { FoodKind, Species } from '../core/types';
import type { ThumbnailLoader } from './thumbs';
import type { ToastLevel } from './Toasts';
import type { TankNeeds, WaterAssessment } from './waterHealth';

export type PanelId = 'fish' | 'feed' | 'scape' | 'care' | 'time' | 'journal' | 'settings';

export interface UIHost {
  readonly app: AppApi;
  readonly thumbs: ThumbnailLoader;
  readonly isMobile: boolean;

  toast(message: string, level?: ToastLevel): void;

  /** Open a panel (closing any other), or close with null. */
  openPanel(id: PanelId | null): void;
  readonly openPanelId: PanelId | null;

  /** Feeding tool: the cursor becomes a pinch of `kind`. */
  startFeeding(kind: FoodKind): void;
  stopFeeding(): void;
  readonly feedingKind: FoodKind | null;
  /** Remembered for the F key. */
  lastFood: FoodKind;

  /** Select an animal and show its card. */
  showFish(fishId: string): void;
  /** Open the catalog on a species' detail page. */
  showSpecies(sp: Species): void;

  /** Inhabitants' combined tolerances & the latest water assessment (refreshed ~1 Hz). */
  readonly needs: TankNeeds;
  readonly water: WaterAssessment;

  showShortcuts(): void;
}

/** A side-sheet panel. Built lazily the first time it opens. */
export interface Panel {
  readonly id: PanelId;
  readonly title: string;
  readonly el: HTMLElement;
  /** Panels that manage their own scrolling (virtual lists) set this. */
  readonly selfScroll?: boolean;
  onOpen?(): void;
  onClose?(): void;
  /** Called ~4 Hz while the panel is open. */
  refresh?(): void;
  /** Esc pressed while open: return true if handled internally (e.g. back from a detail view). */
  onEscape?(): boolean;
}
