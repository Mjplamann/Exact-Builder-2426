/**
 * Naive Surface Nets: polygonize a signed distance field on a regular grid into a welded,
 * watertight quad-dominant mesh (one vertex per sign-changing cell). Vertices are refined onto
 * the true surface with Newton steps so faceted stones keep crisp planes.
 */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
}

export type Field = (x: number, y: number, z: number) => number;

/** Edges of a cube as pairs of corner indices (corner bit order: x=1, y=2, z=4). */
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNets(f: Field, min: [number, number, number], max: [number, number, number], cell: number, refine = 2): MeshData {
  const nx = Math.max(2, Math.ceil((max[0] - min[0]) / cell) + 1);
  const ny = Math.max(2, Math.ceil((max[1] - min[1]) / cell) + 1);
  const nz = Math.max(2, Math.ceil((max[2] - min[2]) / cell) + 1);
  const vals = sampleField(f, min, cell, nx, ny, nz);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = vals[i + (c & 1) + nx * (j + ((c >> 1) & 1) + ny * (k + ((c >> 2) & 1)))];
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + (((b & 1) - (a & 1)) * t);
          sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
          sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
          n++;
        }
        cellVert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }
    }
  }

  // Quads across every sign-changing grid edge.
  const idx: number[] = [];
  const cellIndex = (i: number, j: number, k: number) => cellVert[i + cx * (j + cy * k)];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const inside = vals[i + nx * (j + ny * k)] < 0;
        // x-edge (i,j,k)→(i+1,j,k): shared by cells (i, j-1..j, k-1..k)
        if (i < cx && j >= 1 && j < cy && k >= 1 && k < cz && inside !== vals[i + 1 + nx * (j + ny * k)] < 0) {
          quad(idx, cellIndex(i, j - 1, k - 1), cellIndex(i, j, k - 1), cellIndex(i, j, k), cellIndex(i, j - 1, k), inside);
        }
        // y-edge: cells (i-1..i, j, k-1..k)
        if (j < cy && i >= 1 && i < cx && k >= 1 && k < cz && inside !== vals[i + nx * (j + 1 + ny * k)] < 0) {
          quad(idx, cellIndex(i - 1, j, k - 1), cellIndex(i - 1, j, k), cellIndex(i, j, k), cellIndex(i, j, k - 1), inside);
        }
        // z-edge: cells (i-1..i, j-1..j, k)
        if (k < cz && i >= 1 && i < cx && j >= 1 && j < cy && inside !== vals[i + nx * (j + ny * (k + 1))] < 0) {
          quad(idx, cellIndex(i - 1, j - 1, k), cellIndex(i, j - 1, k), cellIndex(i, j, k), cellIndex(i - 1, j, k), inside);
        }
      }
    }
  }

  const vertexCount = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(vertexCount * 3);
  const e = cell * 0.5;
  for (let v = 0; v < vertexCount; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let r = 0; r <= refine; r++) {
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      if (r === refine) break;
      // Newton step onto the zero set, limited to half a cell so thin parts don't collapse.
      const d = f(x, y, z);
      const step = Math.max(-cell * 0.5, Math.min(cell * 0.5, d));
      x -= gx * step;
      y -= gy * step;
      z -= gz * step;
    }
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    normals[v * 3] = gx;
    normals[v * 3 + 1] = gy;
    normals[v * 3 + 2] = gz;
  }
  return { positions, normals, indices: new Uint32Array(idx), vertexCount };
}

function quad(out: number[], a: number, b: number, c: number, d: number, flip: boolean): void {
  if (a < 0 || b < 0 || c < 0 || d < 0) return;
  if (flip) out.push(a, b, c, a, c, d);
  else out.push(a, c, b, a, d, c);
}

/**
 * Sample the field on the grid. A coarse lattice (stride 4) is evaluated first; blocks whose
 * corners are all farther from the surface than the block diagonal (with a safety factor for
 * noise-displaced fields) cannot contain it, so their interior is filled by trilinear
 * interpolation — only the narrow band around the surface is evaluated exactly.
 */
function sampleField(f: Field, min: [number, number, number], cell: number, nx: number, ny: number, nz: number): Float32Array {
  const S = 4;
  const vals = new Float32Array(nx * ny * nz);
  const done = new Uint8Array(nx * ny * nz);
  const cnx = Math.ceil((nx - 1) / S) + 1, cny = Math.ceil((ny - 1) / S) + 1, cnz = Math.ceil((nz - 1) / S) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  const ci = (i: number) => Math.min(i * S, nx - 1), cj = (j: number) => Math.min(j * S, ny - 1), ck = (k: number) => Math.min(k * S, nz - 1);
  for (let k = 0; k < cnz; k++)
    for (let j = 0; j < cny; j++)
      for (let i = 0; i < cnx; i++) coarse[i + cnx * (j + cny * k)] = f(min[0] + ci(i) * cell, min[1] + cj(j) * cell, min[2] + ck(k) * cell);
  // A corner farther than half the block diagonal (×1.3 for noise-steepened fields) from the
  // surface guarantees the block holds no zero crossing.
  const safe = S * cell * Math.sqrt(3) * 0.5 * 1.3;
  for (let bk = 0; bk < cnz - 1; bk++) {
    for (let bj = 0; bj < cny - 1; bj++) {
      for (let bi = 0; bi < cnx - 1; bi++) {
        const c000 = coarse[bi + cnx * (bj + cny * bk)], c100 = coarse[bi + 1 + cnx * (bj + cny * bk)];
        const c010 = coarse[bi + cnx * (bj + 1 + cny * bk)], c110 = coarse[bi + 1 + cnx * (bj + 1 + cny * bk)];
        const c001 = coarse[bi + cnx * (bj + cny * (bk + 1))], c101 = coarse[bi + 1 + cnx * (bj + cny * (bk + 1))];
        const c011 = coarse[bi + cnx * (bj + 1 + cny * (bk + 1))], c111 = coarse[bi + 1 + cnx * (bj + 1 + cny * (bk + 1))];
        const far =
          Math.min(Math.abs(c000), Math.abs(c100), Math.abs(c010), Math.abs(c110), Math.abs(c001), Math.abs(c101), Math.abs(c011), Math.abs(c111)) > safe &&
          (c000 > 0) === (c111 > 0) && (c000 > 0) === (c100 > 0) && (c000 > 0) === (c010 > 0) && (c000 > 0) === (c001 > 0) &&
          (c000 > 0) === (c110 > 0) && (c000 > 0) === (c101 > 0) && (c000 > 0) === (c011 > 0);
        const i0 = ci(bi), i1 = ci(bi + 1), j0 = cj(bj), j1 = cj(bj + 1), k0 = ck(bk), k1 = ck(bk + 1);
        for (let k = k0; k <= k1; k++) {
          const tz = (k - k0) / Math.max(1, k1 - k0);
          const z = min[2] + k * cell;
          for (let j = j0; j <= j1; j++) {
            const ty = (j - j0) / Math.max(1, j1 - j0);
            const y = min[1] + j * cell;
            for (let i = i0; i <= i1; i++) {
              const idx = i + nx * (j + ny * k);
              if (done[idx]) continue;
              done[idx] = 1;
              if (far) {
                const tx = (i - i0) / Math.max(1, i1 - i0);
                const a = c000 + (c100 - c000) * tx, b = c010 + (c110 - c010) * tx;
                const c = c001 + (c101 - c001) * tx, d = c011 + (c111 - c011) * tx;
                const e = a + (b - a) * ty, g = c + (d - c) * ty;
                vals[idx] = e + (g - e) * tz;
              } else {
                vals[idx] = f(min[0] + i * cell, y, z);
              }
            }
          }
        }
      }
    }
  }
  return vals;
}
