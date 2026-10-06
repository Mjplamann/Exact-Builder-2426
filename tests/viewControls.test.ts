import { describe, expect, it, vi } from 'vitest';
import {
  BUTTON_STEPS,
  FOLLOW_FILL,
  ViewRouter,
  ZOOM_STEP_RATIO,
  dragToPan,
  pinchMove,
  stepFill,
  viewKeyAction,
  wheelSteps,
  zoomLabel,
  type ViewApp,
} from '../src/ui/ViewControls';

describe('wheelSteps', () => {
  it('maps a mouse notch to one step, scrolling down zooms out', () => {
    expect(wheelSteps({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeCloseTo(-1);
    expect(wheelSteps({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeCloseTo(1);
    // Firefox reports a notch as 3 lines.
    expect(wheelSteps({ deltaY: 3, deltaMode: 1, ctrlKey: false })).toBeCloseTo(-0.99);
  });

  it('keeps trackpad scrolling smooth and fractional', () => {
    expect(wheelSteps({ deltaY: 4, deltaMode: 0, ctrlKey: false })).toBeCloseTo(-0.04);
    expect(wheelSteps({ deltaY: -1.5, deltaMode: 0, ctrlKey: false })).toBeCloseTo(0.015);
  });

  it('makes a trackpad pinch (ctrl+wheel) ten times more sensitive, tracking the fingers', () => {
    const s = wheelSteps({ deltaY: -5, deltaMode: 0, ctrlKey: true });
    expect(s).toBeCloseTo(0.5);
    // Chromium scales a page by e^(-deltaY/100) for the same gesture: we match it within 1 %.
    const ours = Math.pow(ZOOM_STEP_RATIO, s);
    expect(Math.abs(ours - Math.exp(0.05))).toBeLessThan(0.01);
  });

  it('clamps flings and ignores nonsense', () => {
    expect(wheelSteps({ deltaY: 2400, deltaMode: 0, ctrlKey: false })).toBe(-2);
    expect(wheelSteps({ deltaY: -1, deltaMode: 2, ctrlKey: false })).toBe(2);
    expect(wheelSteps({ deltaY: 0, deltaMode: 0, ctrlKey: true })).toBe(0);
    expect(wheelSteps({ deltaY: Number.NaN, deltaMode: 0, ctrlKey: false })).toBe(0);
  });
});

describe('pinchMove', () => {
  it('turns a spread into zoom steps that keep the tank under the fingers', () => {
    const m = pinchMove({ ax: 150, ay: 300, bx: 250, by: 300 }, { ax: 100, ay: 300, bx: 300, by: 300 });
    expect(Math.pow(ZOOM_STEP_RATIO, m.steps)).toBeCloseTo(2);
    expect(m.cx).toBe(200);
    expect(m.cy).toBe(300);
    expect(m.dx).toBe(0);
    expect(m.dy).toBe(0);
    expect(m.ds).toBeCloseTo(100);
  });

  it('turns a two-finger drag into a pan of the centre', () => {
    const m = pinchMove({ ax: 100, ay: 100, bx: 200, by: 140 }, { ax: 130, ay: 90, bx: 230, by: 130 });
    expect(m.steps).toBeCloseTo(0);
    expect(m.dx).toBeCloseTo(30);
    expect(m.dy).toBeCloseTo(-10);
    expect(m.cx).toBeCloseTo(180);
    expect(m.cy).toBeCloseTo(110);
  });

  it('pinches in toward a moving centre (both at once)', () => {
    const m = pinchMove({ ax: 0, ay: 0, bx: 400, by: 0 }, { ax: 110, ay: 20, bx: 310, by: 20 });
    expect(Math.pow(ZOOM_STEP_RATIO, m.steps)).toBeCloseTo(0.5);
    expect(m.dx).toBeCloseTo(10);
    expect(m.dy).toBeCloseTo(20);
  });

  it('ignores fingers too close together to measure, and reuses its output', () => {
    const out = { steps: 9, cx: 0, cy: 0, dx: 0, dy: 0, ds: 0 };
    const m = pinchMove({ ax: 10, ay: 10, bx: 12, by: 10 }, { ax: 10, ay: 10, bx: 40, by: 10 }, out);
    expect(m).toBe(out);
    expect(m.steps).toBe(0);
  });
});

describe('dragToPan', () => {
  it('moves the view against the drag in fractions of the visible half-size', () => {
    const p = dragToPan(100, 50, 1000, 800);
    // Dragging right pulls the tank right: the view moves left. Dragging down: the view moves up.
    expect(p.x).toBeCloseTo(-0.2);
    expect(p.y).toBeCloseTo(0.125);
    // A zero-size viewport (hidden tab) never divides by zero.
    expect(dragToPan(10, 10, 0, 0).x).toBe(-10);
  });
});

describe('follow framing & readout', () => {
  it('steps the fill by the zoom ratio and keeps it in range', () => {
    expect(stepFill(0.2, BUTTON_STEPS)).toBeCloseTo(0.2 * Math.pow(ZOOM_STEP_RATIO, BUTTON_STEPS));
    expect(stepFill(0.2, -1)).toBeCloseTo(0.2 / ZOOM_STEP_RATIO);
    expect(stepFill(0.44, 6)).toBe(FOLLOW_FILL.max);
    expect(stepFill(0.09, -6)).toBe(FOLLOW_FILL.min);
    expect(stepFill(Number.NaN, 1)).toBe(FOLLOW_FILL.initial);
  });

  it('reads out the zoom only when closer than the whole tank', () => {
    expect(zoomLabel(1)).toBe('');
    expect(zoomLabel(1.04)).toBe('');
    expect(zoomLabel(3.24)).toBe('3.2×');
    expect(zoomLabel(8)).toBe('8.0×');
    expect(zoomLabel(12.4)).toBe('12×');
    expect(zoomLabel(Number.NaN)).toBe('');
  });
});

describe('viewKeyAction', () => {
  const far = { close: false, fishSelected: false };
  const near = { close: true, fishSelected: true };
  it('maps zoom, tour and reset keys', () => {
    expect(viewKeyAction('+', far)).toBe('zoom-in');
    expect(viewKeyAction('=', far)).toBe('zoom-in');
    expect(viewKeyAction('-', far)).toBe('zoom-out');
    expect(viewKeyAction('_', far)).toBe('zoom-out');
    expect(viewKeyAction('t', far)).toBe('tour');
    expect(viewKeyAction('T', far)).toBe('tour');
    expect(viewKeyAction('0', near)).toBe('reset');
    expect(viewKeyAction('0', far)).toBeNull();
  });

  it('leaves F to feeding unless an animal is selected, and arrows to the page unless zoomed', () => {
    expect(viewKeyAction('f', far)).toBeNull();
    expect(viewKeyAction('F', near)).toBe('follow');
    expect(viewKeyAction('ArrowLeft', far)).toBeNull();
    expect(viewKeyAction('ArrowLeft', near)).toBe('pan-left');
    expect(viewKeyAction('ArrowUp', near)).toBe('pan-up');
    expect(viewKeyAction('x', near)).toBeNull();
  });
});

/** A stand-in for the App's view API with the same follow/tour rules (follow and pan end a tour). */
function fakeApp(opts: { zoom?: number } = {}) {
  const state = { zoom: opts.zoom ?? 1, touring: false };
  const world = { follow: null as string | null, selection: {} as { fishId?: string }, fishById: new Map<string, unknown>([['a', {}], ['b', {}]]) };
  const app = {
    world,
    follow: vi.fn((id: string | null) => {
      state.touring = false;
      world.follow = id;
    }),
    setFollowFill: vi.fn(),
    zoomBy: vi.fn(),
    getZoom: () => ({ zoom: state.zoom, min: 1, max: 8 }),
    panBy: vi.fn((dx: number, dy: number): void => {
      void dx;
      void dy;
      state.touring = false;
    }),
    resetView: vi.fn(() => {
      state.touring = false;
      world.follow = null;
    }),
    setTour: vi.fn((on: boolean): void => {
      state.touring = on;
    }),
    isTouring: () => state.touring,
  };
  return { app, state, world, router: new ViewRouter(app as unknown as ViewApp, { innerWidth: 1000, innerHeight: 800 }) };
}

describe('ViewRouter', () => {
  it('zooms the view toward a point when nothing is followed', () => {
    const { app, router } = fakeApp();
    router.zoom(1.5, 300, 200);
    expect(app.zoomBy).toHaveBeenCalledWith(1.5, 300, 200);
    expect(app.setFollowFill).not.toHaveBeenCalled();
    router.zoom(0);
    router.zoom(Number.NaN);
    expect(app.zoomBy).toHaveBeenCalledTimes(1);
  });

  it('reframes a followed animal instead of zooming', () => {
    const { app, router } = fakeApp();
    router.follow('a');
    expect(app.follow).toHaveBeenLastCalledWith('a', { fill: FOLLOW_FILL.initial });
    router.zoom(BUTTON_STEPS);
    expect(app.setFollowFill).toHaveBeenLastCalledWith(stepFill(FOLLOW_FILL.initial, BUTTON_STEPS));
    router.zoom(-2 * BUTTON_STEPS);
    expect(router.fill).toBeCloseTo(stepFill(stepFill(FOLLOW_FILL.initial, BUTTON_STEPS), -2 * BUTTON_STEPS));
    expect(app.zoomBy).not.toHaveBeenCalled();
    // A new animal starts from the default framing again.
    router.follow('b');
    expect(router.fill).toBe(FOLLOW_FILL.initial);
  });

  it('lets a zoom during a tour take the camera over', () => {
    const { app, state, world, router } = fakeApp();
    state.touring = true;
    world.follow = 'a';
    router.zoom(1);
    expect(app.follow).toHaveBeenLastCalledWith('a', { fill: stepFill(FOLLOW_FILL.initial, 1) });
    expect(state.touring).toBe(false);
    expect(world.follow).toBe('a');

    // A wide shot of the tour: the tour ends and the view zooms.
    state.touring = true;
    world.follow = null;
    router.zoom(1, 10, 20);
    expect(app.setTour).toHaveBeenLastCalledWith(false);
    expect(app.zoomBy).toHaveBeenLastCalledWith(1, 10, 20);
  });

  it('pans by drag fractions of the viewport', () => {
    const { app, router } = fakeApp({ zoom: 3 });
    router.pan(100, -40);
    expect(app.panBy).toHaveBeenCalledWith(-0.2, -0.1);
    router.pan(0, 0);
    expect(app.panBy).toHaveBeenCalledTimes(1);
  });

  it('clears the stage before a tour, and hands the view back when you end it', () => {
    const { app, state, world, router } = fakeApp();
    const order: string[] = [];
    router.onTourStart = () => order.push('clear');
    app.setTour.mockImplementation((on: boolean) => {
      order.push(`tour:${on}`);
      state.touring = on;
    });
    router.toggleTour();
    expect(order).toEqual(['clear', 'tour:true']);
    world.follow = 'b'; // the tour's current subject
    router.toggleTour();
    expect(order).toEqual(['clear', 'tour:true', 'tour:false']);
    expect(app.follow).toHaveBeenLastCalledWith(null);
    router.setTour(false);
    expect(order.length).toBe(3);
  });

  it('keeps the camera on an animal picked during a tour, and only then', () => {
    const { app, state, router } = fakeApp();
    router.picked('a');
    expect(app.follow).not.toHaveBeenCalled();
    state.touring = true;
    router.picked('a');
    expect(app.follow).toHaveBeenLastCalledWith('a', { fill: FOLLOW_FILL.initial });
  });

  it('toggles following, but takes over (not stops) when the tour is on that animal', () => {
    const { app, state, world, router } = fakeApp();
    router.toggleFollow('a');
    expect(world.follow).toBe('a');
    router.toggleFollow('a');
    expect(app.follow).toHaveBeenLastCalledWith(null);
    state.touring = true;
    world.follow = 'a';
    router.toggleFollow('a');
    expect(app.follow).toHaveBeenLastCalledWith('a', { fill: FOLLOW_FILL.initial });
  });

  it('unwinds Esc: tour first, then following, then nothing', () => {
    const { app, state, world, router } = fakeApp();
    state.touring = true;
    world.follow = 'a';
    expect(router.escape()).toBe(true);
    expect(state.touring).toBe(false);
    expect(world.follow).toBe(null);
    world.follow = 'b';
    expect(router.escape()).toBe(true);
    expect(app.follow).toHaveBeenLastCalledWith(null);
    expect(router.escape()).toBe(false);
  });

  it('runs keyboard shortcuts', () => {
    const { app, state, world, router } = fakeApp();
    expect(router.key('+')).toBe(true);
    expect(app.zoomBy).toHaveBeenLastCalledWith(BUTTON_STEPS, undefined, undefined);
    expect(router.key('-')).toBe(true);
    expect(app.zoomBy).toHaveBeenLastCalledWith(-BUTTON_STEPS, undefined, undefined);
    // At the whole-tank view 0 and the arrows are left alone.
    expect(router.key('0')).toBe(false);
    expect(router.key('ArrowRight')).toBe(false);
    // F feeds unless an animal is selected.
    expect(router.key('f')).toBe(false);
    world.selection = { fishId: 'b' };
    expect(router.key('f')).toBe(true);
    expect(world.follow).toBe('b');
    expect(router.key('ArrowRight')).toBe(true);
    expect(app.panBy).toHaveBeenLastCalledWith(0.12, 0);
    expect(router.key('ArrowDown')).toBe(true);
    expect(app.panBy).toHaveBeenLastCalledWith(0, -0.12);
    expect(router.key('0')).toBe(true);
    expect(app.resetView).toHaveBeenCalled();
    expect(router.key('t')).toBe(true);
    expect(state.touring).toBe(true);
    // A selection whose animal is gone does not count.
    world.selection = { fishId: 'gone' };
    expect(router.key('F')).toBe(false);
  });

  it('knows when the view is closer than the whole tank', () => {
    expect(fakeApp().router.isClose()).toBe(false);
    expect(fakeApp({ zoom: 1.5 }).router.isClose()).toBe(true);
    const f = fakeApp();
    f.world.follow = 'a';
    expect(f.router.isClose()).toBe(true);
  });
});
