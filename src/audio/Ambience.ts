import type { World } from '../core/world';

/**
 * Procedural, calming soundscape with WebAudio (no audio files): filter hum and water trickle,
 * airstone bubbling, soft surface sounds, a muted glass tap. Starts only after a user gesture.
 *
 * OWNER: UI module.
 */
export class Ambience {
  setEnabled(enabled: boolean, volume: number): void {
    void enabled;
    void volume;
  }
  update(world: World, dt: number): void {
    void world;
    void dt;
  }
  playTap(): void {}
  playDrop(): void {}
  dispose(): void {}
}
