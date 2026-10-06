import type { World } from '../core/world';

/**
 * Documentary "tour" mode: the camera drifts from one interesting animal to the next (an active
 * shoal, a cleaner at work, a goby on its perch, a shrimp grazing…), lingering ~20–40 s on each
 * with gentle framing, then easing back to the whole tank now and then. Stops on any user action.
 *
 * OWNER: camera module (stub — picks nothing).
 */
export interface TourHost {
  world: World;
  /** Follow an animal (null = back to the whole tank). */
  followAnimal(fishId: string | null, fill?: number): void;
}

export class Tour {
  active = false;
  constructor(private host: TourHost) {}
  start(): void {
    this.active = true;
  }
  stop(): void {
    this.active = false;
  }
  update(dt: number): void {
    void dt;
    void this.host;
  }
}
