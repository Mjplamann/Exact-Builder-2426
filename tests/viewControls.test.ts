import { describe, expect, it, vi } from 'vitest';
import {
  BUTTON_STEPS,
  ViewRouter,
  awayFromHome,
  ZOOM_STEP_RATIO,
  dragToPan,
  followSafeArea,
  pinchMove,
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

describe('zoomLabel', () => {
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

/**
 * A stand-in for the App's view API with its rules: following or any hands-on framing ends a tour
 * on the current shot; a pan lets go of a followed animal; a tour opens on the whole tank.
 */
function fakeApp(opts: { zoom?: number } = {}) {
  const state = { zoom: opts.zoom ?? 1, touring: false, atHome: true as boolean | undefined };
  const world = { follow: null as string | null, selection: {} as { fishId?: string }, fishById: new Map<string, unknown>([['a', {}], ['b', {}]]) };
  const app = {
    world,
    follow: vi.fn((id: string | null): void => {
      state.touring = false;
      world.follow = id;
    }),
    zoomBy: vi.fn((steps: number, x?: number, y?: number): void => {
      void steps;
      void x;
      void y;
      state.touring = false;
    }),
    getZoom: () => ({ zoom: state.zoom, min: 1, max: 8, atHome: state.atHome === undefined ? undefined : state.atHome && state.zoom <= 1.001 }),
    panBy: vi.fn((dx: number, dy: number): void => {
      void dx;
      void dy;
      state.touring = false;
      world.follow = null;
    }),
    resetView: vi.fn((): void => {
      state.touring = false;
      world.follow = null;
    }),
    setTour: vi.fn((on: boolean): void => {
      state.touring = on;
      if (on) world.follow = null;
    }),
    isTouring: () => state.touring,
  };
  return { app, state, world, router: new ViewRouter(app as unknown as ViewApp, { innerWidth: 1000, innerHeight: 800 }) };
}

describe('ViewRouter', () => {
  it('zooms toward a point, or reframes a followed animal through the same call', () => {
    const { app, world, router } = fakeApp();
    router.zoom(1.5, 300, 200);
    expect(app.zoomBy).toHaveBeenLastCalledWith(1.5, 300, 200);
    world.follow = 'a';
    router.zoom(-BUTTON_STEPS);
    expect(app.zoomBy).toHaveBeenLastCalledWith(-BUTTON_STEPS, undefined, undefined);
    expect(world.follow).toBe('a');
    router.zoom(0);
    router.zoom(Number.NaN);
    expect(app.zoomBy).toHaveBeenCalledTimes(2);
  });

  it('lets the camera frame a followed animal to suit its size', () => {
    const { app, router } = fakeApp();
    router.follow('a');
    expect(app.follow).toHaveBeenLastCalledWith('a');
    router.follow(null);
    expect(app.follow).toHaveBeenLastCalledWith(null);
  });

  it('pans by drag fractions of the viewport', () => {
    const { app, router } = fakeApp({ zoom: 3 });
    router.pan(100, -40);
    expect(app.panBy).toHaveBeenCalledWith(-0.2, -0.1);
    router.pan(0, 0);
    expect(app.panBy).toHaveBeenCalledTimes(1);
  });

  it('clears the stage before a tour, and gives the view back when you end it', () => {
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
    expect(app.follow).toHaveBeenLastCalledWith('a');
    expect(state.touring).toBe(false);
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
    expect(app.follow).toHaveBeenLastCalledWith('a');
    expect(world.follow).toBe('a');
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
    state.zoom = 2;
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
    f.world.follow = null;
    f.state.touring = true;
    expect(f.router.isClose()).toBe(true);
  });

  it('counts a pan away from the whole-tank framing at 1× as away (whole tank, 0, two-finger tap)', () => {
    const f = fakeApp();
    expect(f.router.isClose()).toBe(false);
    // A wide tank on a phone held upright, or a cube on a wide screen, panned at 1×.
    f.state.atHome = false;
    expect(f.router.isClose()).toBe(true);
    expect(f.router.key('0')).toBe(true);
    expect(f.app.resetView).toHaveBeenCalledTimes(1);
    expect(f.router.key('ArrowLeft')).toBe(true);
    f.state.atHome = true;
    expect(f.router.isClose()).toBe(false);
    expect(f.router.key('0')).toBe(false);
    // Without the signal (an older app), the zoom alone decides.
    f.state.atHome = undefined;
    expect(f.router.isClose()).toBe(false);
    f.state.zoom = 1.5;
    expect(f.router.isClose()).toBe(true);
  });

  it('awayFromHome: zoomed in, or panned at 1×', () => {
    expect(awayFromHome({ zoom: 1, atHome: true })).toBe(false);
    expect(awayFromHome({ zoom: 1, atHome: false })).toBe(true);
    expect(awayFromHome({ zoom: 1.01 })).toBe(false);
    expect(awayFromHome({ zoom: 1.5 })).toBe(true);
  });
});

describe('followSafeArea', () => {
  it('frames a followed animal above the phone card, below the chip', () => {
    // iPhone portrait: the card covers the lower half of the screen above the dock.
    const a = followSafeArea(440, 763, [{ left: 8, top: 365, right: 432, bottom: 685 }], 122)!;
    expect(a).toEqual({ left: 0, top: 122, right: 440, bottom: 365 });
  });

  it('frames it beside the card in landscape', () => {
    const a = followSafeArea(838, 390, [{ left: 22, top: 89, right: 582, bottom: 288 }], 122, { bottom: 298 })!;
    expect(a.left).toBe(582);
    expect(a.right).toBe(838);
  });

  it('leaves the framing alone when nothing covers the middle', () => {
    // Desktop: the card sits in the bottom-left corner.
    expect(followSafeArea(1600, 900, [{ left: 22, top: 560, right: 318, bottom: 882 }], 60)).toBeNull();
    expect(followSafeArea(1600, 900, [], 60)).toBeNull();
  });

  it('uses the space beside a side panel', () => {
    expect(followSafeArea(1600, 900, [{ left: 1186, top: 0, right: 1600, bottom: 900 }], 60)).toEqual({ left: 0, top: 60, right: 1186, bottom: 900 });
    // …and between the panel and the card when both are open.
    const a = followSafeArea(1600, 900, [{ left: 1186, top: 0, right: 1600, bottom: 900 }, { left: 22, top: 560, right: 318, bottom: 882 }], 60)!;
    expect(a.left).toBe(318);
    expect(a.right).toBe(1186);
  });

  it('keeps clear of the dock and the zoom buttons', () => {
    // iPhone landscape: below the card is only the dock; beside it, the strip up to the buttons.
    const a = followSafeArea(838, 390, [{ left: 22, top: 89, right: 582, bottom: 288 }], 122, { bottom: 298, right: 758 })!;
    expect(a).toEqual({ left: 582, top: 122, right: 758, bottom: 298 });
  });
});
