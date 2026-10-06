import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraRig, MAX_ZOOM, ZOOM_STEP, defaultFill, type FollowSubject } from '../src/render/env/CameraRig';
import { substrateHeight, tankBounds } from '../src/core/tankGeometry';
import type { TankState } from '../src/core/types';

const tank = {
  size: { widthCm: 60, heightCm: 36, depthCm: 30 },
  substrate: 'beige-sand',
  substrateDepthFrontCm: 4,
  substrateDepthBackCm: 7,
  seed: 7,
} as unknown as TankState;
const b = tankBounds(tank);
const DT = 1 / 60;

function makeRig(aspect = 16 / 9): CameraRig {
  const rig = new CameraRig(aspect);
  rig.drift = false;
  rig.frame(tank, aspect);
  rig.update(DT);
  return rig;
}

function run(rig: CameraRig, seconds: number, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    each?.(t);
    rig.update(DT);
  }
}

const ndc = (rig: CameraRig, p: Vector3) => p.clone().project(rig.camera);

/** Where a screen corner's line of sight crosses the front glass (refraction happens there, so real and virtual rays agree). */
function onGlass(rig: CameraRig, x: number, y: number): Vector3 {
  const cam = rig.camera;
  const o = new Vector3().setFromMatrixPosition(cam.matrixWorld);
  const d = new Vector3(x, y, 0.5).unproject(cam).sub(o).normalize();
  return o.add(d.multiplyScalar((b.halfD - o.z) / d.z));
}

function expectFrameOnGlass(rig: CameraRig): void {
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const g = onGlass(rig, x, y);
    expect(Math.abs(g.x)).toBeLessThanOrEqual(b.halfW + 1e-4);
    expect(g.y).toBeGreaterThanOrEqual(-1e-4);
    expect(g.y).toBeLessThanOrEqual(b.surfaceY + 0.008);
  }
}

describe('camera zoom', () => {
  it('clamps zoom to 1…8 and reports the target', () => {
    const rig = makeRig();
    expect(rig.targetZoom).toBeCloseTo(1, 6);
    rig.zoomBy(1);
    expect(rig.targetZoom).toBeCloseTo(ZOOM_STEP, 6);
    rig.zoomBy(100);
    expect(rig.targetZoom).toBeCloseTo(MAX_ZOOM, 6);
    rig.zoomBy(-100);
    expect(rig.targetZoom).toBeCloseTo(1, 6);
    rig.setZoom(50);
    expect(rig.targetZoom).toBeCloseTo(MAX_ZOOM, 6);
    rig.setZoom(0.1);
    expect(rig.targetZoom).toBeCloseTo(1, 6);
    rig.setZoom(Number.NaN);
    rig.zoomBy(Number.NaN);
    expect(rig.targetZoom).toBeCloseTo(1, 6);
  });

  it('settles quickly without overshoot, and rapid input accumulates', () => {
    const rig = makeRig();
    for (let i = 0; i < 6; i++) rig.zoomBy(1); // six wheel notches in one burst
    const target = Math.pow(ZOOM_STEP, 6);
    expect(rig.targetZoom).toBeCloseTo(target, 6);
    let prev = rig.zoom;
    let at150 = 0;
    let at250 = 0;
    run(rig, 1, (t) => {
      const z = rig.zoom;
      expect(z).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic
      expect(z).toBeLessThanOrEqual(target + 1e-9); // never past the target
      prev = z;
      if (!at150 && t >= 0.15) at150 = z;
      if (!at250 && t >= 0.25) at250 = z;
    });
    const done = (z: number) => Math.log(z) / Math.log(target);
    expect(done(at150)).toBeGreaterThan(0.75);
    expect(done(at250)).toBeGreaterThan(0.95);
    expect(rig.zoom).toBeCloseTo(target, 3);
  });

  it('narrows the lens and walks closer like a telephoto, never nearer than the glass gap', () => {
    const rig = makeRig();
    const fov1 = rig.camera.fov;
    const z1 = rig.camera.position.z;
    rig.setZoom(MAX_ZOOM);
    run(rig, 2);
    // ~8× magnification overall; most of it from the lens (perspective compresses).
    expect(fov1 / rig.camera.fov).toBeGreaterThan(3.2);
    expect(rig.camera.position.z).toBeLessThan(z1);
    expect(rig.camera.position.z - b.halfD).toBeGreaterThan(0.12 * 1.333 - 1e-6);
  });

  it('keeps the anchored point under the cursor', () => {
    const rig = makeRig();
    const p = new Vector3(0.12, substrateHeight(tank, 0.12, 0.02) + 0.03, 0.02);
    const before = ndc(rig, p);
    rig.zoomBy(6, before.x, before.y, p);
    run(rig, 1.5);
    const after = ndc(rig, p);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    expect(rig.zoom).toBeCloseTo(Math.pow(ZOOM_STEP, 6), 3);

    // Deeper in, at another point, in a quick burst, and back out (still above 2×).
    const q = new Vector3(-0.05, 0.2, -0.1);
    const q0 = ndc(rig, q);
    for (let i = 0; i < 8; i++) rig.zoomBy(1, q0.x, q0.y, q);
    run(rig, 1.5);
    let q1 = ndc(rig, q);
    expect(q1.x).toBeCloseTo(q0.x, 3);
    expect(q1.y).toBeCloseTo(q0.y, 3);
    rig.zoomBy(-3, q1.x, q1.y, q);
    run(rig, 1.5);
    const q2 = ndc(rig, q);
    expect(q2.x).toBeCloseTo(q1.x, 3);
    expect(q2.y).toBeCloseTo(q1.y, 3);
    q1 = q2;
    expectFrameOnGlass(rig);
  });

  it('re-centres on the way back out to 1×', () => {
    const rig = makeRig();
    const p = new Vector3(0.25, 0.08, 0.1);
    const s = ndc(rig, p);
    rig.zoomBy(10, s.x, s.y, p);
    run(rig, 1);
    expect(Math.abs(rig.camera.position.x)).toBeGreaterThan(0.05);
    rig.zoomBy(-20, s.x, s.y, p);
    run(rig, 1.5);
    expect(rig.zoom).toBeCloseTo(1, 4);
    expect(Math.abs(rig.camera.position.x)).toBeLessThan(1e-3);
  });

  it('pans only as far as the glass allows', () => {
    const rig = makeRig();
    // 1×: the whole tank is in view; essentially no room.
    const x0 = rig.camera.position.x;
    rig.panBy(1, 0);
    run(rig, 1);
    expect(Math.abs(rig.camera.position.x - x0)).toBeLessThan(0.004);
    expectFrameOnGlass(rig);
    // 8×: roam to every corner of the front glass, never past it.
    rig.setZoom(MAX_ZOOM);
    for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      for (let i = 0; i < 30; i++) rig.panBy(dx, dy);
      run(rig, 1);
      expectFrameOnGlass(rig);
      const g = onGlass(rig, dx, dy);
      expect(Math.abs(g.x)).toBeGreaterThan(b.halfW * 0.95); // reached the side
    }
  });

  it('keeps picking exact at every zoom', () => {
    const rig = makeRig(0.46); // portrait phone
    for (const z of [1, 2.5, MAX_ZOOM]) {
      rig.setZoom(z);
      run(rig, 1);
      for (const p of [new Vector3(0, 0.15, 0), new Vector3(0.05, 0.1, -0.12), new Vector3(-0.02, 0.25, 0.1)]) {
        const s = ndc(rig, p);
        if (Math.abs(s.x) > 1 || Math.abs(s.y) > 1) continue;
        const o = new Vector3().setFromMatrixPosition(rig.camera.matrixWorld);
        const d = new Vector3(s.x, s.y, 0.5).unproject(rig.camera).sub(o).normalize();
        const off = p.clone().sub(o);
        expect(off.sub(d.multiplyScalar(off.dot(d))).length()).toBeLessThan(1e-6);
      }
    }
  });
});

describe('camera follow', () => {
  const span = (rig: CameraRig, s: FollowSubject) => {
    const [x, y, z] = s.pos;
    const a = ndc(rig, new Vector3(x - s.lengthM / 2, y, z));
    const c = ndc(rig, new Vector3(x + s.lengthM / 2, y, z));
    return { width: (c.x - a.x) / 2, cx: (a.x + c.x) / 2, cy: (a.y + c.y) / 2 };
  };

  it('frames the animal to the requested fill, centred when it faces the viewer', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [0.04, 0.16, 0.02], lengthM: 0.035, forward: [0, 0, 1] };
    rig.follow(s, { fill: 0.22 });
    run(rig, 10);
    const f = span(rig, s);
    expect(f.width).toBeCloseTo(0.22, 2);
    expect(Math.abs(f.cx)).toBeLessThan(0.02);
    expect(Math.abs(f.cy)).toBeLessThan(0.02);
    expect(rig.targetZoom).toBeGreaterThan(2);
  });

  it('zooms further for an animal near the back glass so it stays framed', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [0, 0.18, 0.1], lengthM: 0.04, forward: [0, 0, 1] };
    rig.follow(s, { fill: 0.25 });
    run(rig, 10);
    const zFront = rig.targetZoom;
    s.pos[2] = -0.12;
    run(rig, 10);
    expect(rig.targetZoom).toBeGreaterThan(zFront * 1.1);
    expect(span(rig, s).width).toBeCloseTo(0.25, 2);
  });

  it('leaves room ahead of a swimming animal (rule of thirds)', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [0, 0.18, 0], lengthM: 0.05, forward: [1, 0, 0] };
    rig.follow(s);
    run(rig, 10);
    const f = span(rig, s);
    expect(f.cx).toBeLessThan(-0.18);
    expect(f.cx).toBeGreaterThan(-0.34);
    expect(f.width).toBeCloseTo(defaultFill(0.05), 2);
  });

  it('never shakes with tail beats and keeps a darting animal in frame', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [0, 0.18, 0], lengthM: 0.035, forward: [0, 0, 1] };
    rig.follow(s, { fill: 0.22 });
    run(rig, 8);
    // 8 Hz, ±3 mm head wobble: the camera must not follow it.
    let lo = Infinity;
    let hi = -Infinity;
    run(rig, 4, (t) => {
      s.pos[0] = 0.003 * Math.sin(t * 2 * Math.PI * 8);
      if (t > 1) {
        lo = Math.min(lo, rig.camera.position.x);
        hi = Math.max(hi, rig.camera.position.x);
      }
    });
    expect(hi - lo).toBeLessThan(0.0004);
    // A 6 cm dart in 0.3 s, then cruising: stays on screen throughout, the camera moves smoothly.
    let prev = rig.camera.position.x;
    let maxStep = 0;
    run(rig, 4, (t) => {
      s.pos[0] = t < 0.3 ? (0.06 * t) / 0.3 : 0.06 + 0.03 * (t - 0.3);
      const p = ndc(rig, new Vector3(...s.pos));
      expect(Math.abs(p.x)).toBeLessThan(1);
      maxStep = Math.max(maxStep, Math.abs(rig.camera.position.x - prev));
      prev = rig.camera.position.x;
    });
    expect(maxStep).toBeLessThan(0.002); // < 2 mm per frame at 60 fps
  });

  it('stays inside the glass for an animal in a corner', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [-b.halfW + 0.01, 0.03, b.halfD - 0.02], lengthM: 0.03, forward: [-1, 0, 0] };
    rig.follow(s);
    run(rig, 10, () => expectFrameOnGlass(rig));
    const p = ndc(rig, new Vector3(...s.pos));
    expect(Math.abs(p.x)).toBeLessThan(1);
    expect(Math.abs(p.y)).toBeLessThan(1);
  });

  it('glides between animals and back to the previous free view', () => {
    const rig = makeRig();
    rig.setZoom(2.5);
    run(rig, 1);
    const s: FollowSubject = { pos: [-0.2, 0.1, 0.05], lengthM: 0.04, forward: [0, 0, 1] };
    rig.follow(s);
    let prev = rig.camera.position.clone();
    let maxStep = 0;
    run(rig, 6, () => {
      maxStep = Math.max(maxStep, rig.camera.position.distanceTo(prev));
      prev = rig.camera.position.clone();
    });
    // Same live object, another animal: no cut.
    s.pos = [0.22, 0.25, -0.05];
    rig.follow(s);
    const start = rig.camera.position.clone();
    run(rig, 0.5, () => {
      maxStep = Math.max(maxStep, rig.camera.position.distanceTo(prev));
      prev = rig.camera.position.clone();
    });
    expect(rig.camera.position.distanceTo(start)).toBeLessThan(0.05); // still easing in after 0.5 s
    run(rig, 6, () => {
      maxStep = Math.max(maxStep, rig.camera.position.distanceTo(prev));
      prev = rig.camera.position.clone();
    });
    expect(maxStep).toBeLessThan(0.01);
    expect(span(rig, s).width).toBeCloseTo(defaultFill(0.04), 2);
    rig.follow(null);
    expect(rig.targetZoom).toBeCloseTo(2.5, 6);
    run(rig, 6);
    expect(rig.zoom).toBeCloseTo(2.5, 3);
  });

  it('zoom while following scales the framing; fill is clamped', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [0, 0.18, 0], lengthM: 0.06, forward: [0, 0, 1] };
    rig.follow(s, { fill: 0.2 });
    rig.zoomBy(2);
    expect(rig.followFill).toBeCloseTo(0.2 * ZOOM_STEP * ZOOM_STEP, 6);
    rig.setFollowFill(5);
    expect(rig.followFill).toBe(0.6);
    rig.setFollowFill(0.01);
    expect(rig.followFill).toBe(0.05);
    rig.setFollowFill(0.3);
    run(rig, 10);
    expect(span(rig, s).width).toBeCloseTo(0.3, 2);
  });

  it('a drag while following holds the current picture', () => {
    const rig = makeRig();
    const s: FollowSubject = { pos: [0.1, 0.15, 0], lengthM: 0.04, forward: [1, 0, 0] };
    rig.follow(s);
    run(rig, 8);
    const before = ndc(rig, new Vector3(...s.pos));
    rig.follow(null, { hold: true });
    run(rig, 1);
    const after = ndc(rig, new Vector3(...s.pos));
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.03);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.03);
    expect(rig.isFollowing).toBe(false);
  });

  it('defaults the framing by size', () => {
    expect(defaultFill(0.02)).toBeCloseTo(0.22, 6);
    expect(defaultFill(0.2)).toBeCloseTo(0.3, 6);
    expect(defaultFill(0.06)).toBeGreaterThan(0.22);
    expect(defaultFill(0.06)).toBeLessThan(0.3);
  });

  it('focuses the free view where it is told (zoom anchor, centre autofocus)', () => {
    const rig = makeRig();
    rig.setZoom(4);
    run(rig, 1);
    for (const z of [0.1, -0.12]) {
      rig.focusAt(z);
      run(rig, 2);
      const cam = rig.camera;
      const dir = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
      expect(rig.focusDistance).toBeCloseTo((cam.position.z - z) / -dir.z, 3);
    }
    expect(rig.dofAmount).toBeGreaterThan(0.99);
  });

  it('focuses on the subject and shows depth of field when following', () => {
    const rig = makeRig();
    expect(rig.dofAmount).toBe(0);
    const s: FollowSubject = { pos: [0, 0.18, -0.05], lengthM: 0.035, forward: [0, 0, 1] };
    rig.follow(s);
    run(rig, 8);
    const cam = rig.camera;
    const dir = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const depth = new Vector3(...s.pos).sub(cam.position).dot(dir);
    expect(rig.focusDistance).toBeCloseTo(depth, 3);
    expect(rig.dofAmount).toBeGreaterThan(0.99);
    // Telephoto → a much shallower depth of field than the whole-tank lens.
    const tele = rig.dofScale;
    rig.follow(null);
    rig.setZoom(1);
    run(rig, 6);
    expect(tele / rig.dofScale).toBeGreaterThan(5);
    expect(rig.dofAmount).toBeLessThan(0.01);
  });
});
