/**
 * Two clocks:
 *  - real time (`realSeconds`) drives animation, swimming and physics — always 1×.
 *  - sim time (`simTime`, epoch ms) drives biology (growth, hunger, water chemistry, day/night),
 *    advancing `timeScale` times faster than real time.
 */
export const TIME_SCALES = [
  { value: 1, label: 'Real time', hint: 'Nature’s pace — a neon tetra matures in ~6 months' },
  { value: 60, label: '1 min = 1 hour', hint: 'Watch a day unfold over a lunch break' },
  { value: 1440, label: '1 min = 1 day', hint: 'Fry grow up over an evening' },
  { value: 10080, label: '1 min = 1 week', hint: 'Seasons of growth in an hour' },
] as const;

export class SimClock {
  /** Real seconds since the app started. */
  realSeconds = 0;
  /** Sim epoch ms. */
  simTime: number;
  timeScale: number;
  paused = false;

  constructor(simTime: number, timeScale = 1) {
    this.simTime = simTime;
    this.timeScale = timeScale;
  }

  /** Advance by real dt seconds; returns the sim seconds that elapsed. */
  tick(dt: number): number {
    this.realSeconds += dt;
    if (this.paused) return 0;
    const simDt = dt * this.timeScale;
    this.simTime += simDt * 1000;
    return simDt;
  }

  /** Local hour of day (0..24, fractional) at the current sim time. */
  hourOfDay(): number {
    const d = new Date(this.simTime);
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }
}

export const MS_PER_DAY = 86_400_000;
export const MS_PER_YEAR = 365.25 * MS_PER_DAY;
