import type { AquascapeInfo, StockSuggestion } from '../../../app/tankTypes';
import type { UIHost } from '../../context';
import type { Units } from '../../format';
import type { BuilderModel, StepId } from '../model';

/** What every step may ask of the builder. */
export interface StepEnv {
  readonly host: UIHost;
  readonly model: BuilderModel;
  readonly units: Units;
  /** The spec changed: refresh the choice chips and the footer. */
  changed(): void;
  goto(step: StepId): void;
  next(): void;
  /** Set up a ready-made tank instead (closes the builder). */
  usePreset(id: string, name: string): void;
  /** Styles for a water type (cached for the builder's lifetime). */
  styles(water?: AquascapeInfo['water']): AquascapeInfo[];
  /** Results that survive leaving and revisiting a step. */
  readonly cache: {
    suggestions: Map<string, StockSuggestion[]>;
    pickerQuery: string;
    /** Start step: build step by step, or pick a ready-made tank. */
    startMode: 'build' | 'preset';
  };
}

/** One step's content, rebuilt each time the step is shown (so it always reflects the spec). */
export interface StepView {
  el: HTMLElement;
  title: string;
  lead?: string;
  /** Called once the view is in the document (start async work, focus, measure). */
  onShown?(): void;
  /** Called when leaving the step or closing the builder. */
  dispose?(): void;
}
