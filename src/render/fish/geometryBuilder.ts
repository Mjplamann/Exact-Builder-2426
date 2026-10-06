import { BufferAttribute, BufferGeometry, Sphere, Box3, Vector3 } from 'three';

/**
 * Accumulates vertices for one merged animal mesh. Every vertex carries, besides position /
 * normal / uv:
 *   aSpine = (s, part, w1, w2)   s = spine coordinate (SL units from the snout) used by the swim
 *                                wave; part = PART id; w1/w2 = part-specific weights
 *                                (fish body: jaw / gill-cover weights).
 *   aFin   = (a, b, c, d)        part-specific data (fins: w, across, side·4+flow, distance from
 *                                base; eyes: center xyz + radius; invertebrates: pivot xyz + phase).
 */

export const PART = {
  body: 0,
  eye: 1,
  dorsal: 2,
  dorsal2: 3,
  anal: 4,
  caudal: 5,
  pelvic: 6,
  pectoral: 7,
  adipose: 8,
  barbel: 9,
  // Invertebrates (see shader): rigid body, legs, swimmerets, antennae, abdomen, tentacles,
  // snail foot, starfish arm, brittle-star arm, urchin spine, claw, eye stalk, mouthparts.
  invBody: 20,
  leg: 21,
  pleopod: 22,
  antenna: 23,
  abdomen: 24,
  tentacle: 25,
  foot: 26,
  arm: 27,
  brittleArm: 28,
  spine: 29,
  claw: 30,
  stalk: 31,
  maxilliped: 32,
  tailFan: 33,
} as const;

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  spine: number[] = [];
  fin: number[] = [];
  idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Add a vertex; normal may be filled later by `smoothNormals`. Returns its index. */
  v(
    x: number, y: number, z: number,
    u: number, w: number,
    s: number, part: number, w1 = 0, w2 = 0,
    f0 = 0, f1 = 0, f2 = 0, f3 = 0,
    nx = 0, ny = 0, nz = 0,
  ): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, w);
    this.spine.push(s, part, w1, w2);
    this.fin.push(f0, f1, f2, f3);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Area-weighted smooth normals for triangles added since `idxStart` (one part). */
  smoothNormals(idxStart: number, vStart: number, flip = false): void {
    const p = this.pos, n = this.nor, I = this.idx;
    for (let i = vStart * 3; i < n.length; i++) n[i] = 0;
    for (let i = idxStart; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (flip) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      for (const k of [a, b, c]) {
        n[k] += nx;
        n[k + 1] += ny;
        n[k + 2] += nz;
      }
    }
    for (let i = vStart * 3; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
      if (l > 1e-12) {
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
      } else {
        n[i] = 0;
        n[i + 1] = 1;
        n[i + 2] = 0;
      }
    }
  }

  /** Apply an affine map to the positions (and rotate/scale normals accordingly) of vertices ≥ vStart. */
  transform(vStart: number, fn: (x: number, y: number, z: number, out: number[]) => void, nfn?: (x: number, y: number, z: number, out: number[]) => void): void {
    const p = this.pos, n = this.nor, o = [0, 0, 0];
    for (let i = vStart * 3; i < p.length; i += 3) {
      fn(p[i], p[i + 1], p[i + 2], o);
      p[i] = o[0];
      p[i + 1] = o[1];
      p[i + 2] = o[2];
      if (nfn) {
        nfn(n[i], n[i + 1], n[i + 2], o);
        const l = Math.hypot(o[0], o[1], o[2]) || 1;
        n[i] = o[0] / l;
        n[i + 1] = o[1] / l;
        n[i + 2] = o[2] / l;
      }
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aSpine', new BufferAttribute(new Float32Array(this.spine), 4));
    g.setAttribute('aFin', new BufferAttribute(new Float32Array(this.fin), 4));
    const n = this.vertexCount;
    g.setIndex(new BufferAttribute(n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    // Generous bounds: the swim wave and fin flutter move vertices; instancing disables culling anyway.
    const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as BufferAttribute);
    g.boundingBox = box.expandByScalar(0.25);
    g.boundingSphere = box.getBoundingSphere(new Sphere(new Vector3(), 1));
    return g;
  }
}
