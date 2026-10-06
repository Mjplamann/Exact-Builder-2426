/**
 * Uniform-grid spatial hash over the tank volume, rebuilt every frame with a counting sort
 * (O(n + cells), no allocation once sized). Neighbor queries write indices into a caller-owned
 * Int32Array.
 */
export class SpatialHash {
  private cell = 0.1;
  private inv = 10;
  private nx = 1;
  private ny = 1;
  private nz = 1;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private starts = new Int32Array(2);
  private items = new Int32Array(0);
  private cellOf = new Int32Array(0);
  /** Packed positions (x,y,z per item) of the last build — handy for callers. */
  px = new Float64Array(0);

  /** Configure the grid for a box [min, max] with the given cell size (m). */
  configure(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, cell: number): void {
    this.cell = cell;
    this.inv = 1 / cell;
    this.ox = minX;
    this.oy = minY;
    this.oz = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) * this.inv));
    this.ny = Math.max(1, Math.ceil((maxY - minY) * this.inv));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) * this.inv));
    const cells = this.nx * this.ny * this.nz;
    if (this.starts.length < cells + 1) this.starts = new Int32Array(cells + 1);
  }

  private ensure(n: number): void {
    if (this.items.length < n) {
      const cap = Math.max(64, Math.ceil(n * 1.5));
      this.items = new Int32Array(cap);
      this.cellOf = new Int32Array(cap);
      const p = new Float64Array(cap * 3);
      p.set(this.px.subarray(0, Math.min(this.px.length, p.length)));
      this.px = p;
    }
  }

  /** Reserve storage and return the position buffer to fill (x,y,z for items 0..n−1). */
  begin(n: number): Float64Array {
    this.ensure(n);
    return this.px;
  }

  private cellIndex(x: number, y: number, z: number): number {
    let ix = ((x - this.ox) * this.inv) | 0;
    let iy = ((y - this.oy) * this.inv) | 0;
    let iz = ((z - this.oz) * this.inv) | 0;
    ix = ix < 0 ? 0 : ix >= this.nx ? this.nx - 1 : ix;
    iy = iy < 0 ? 0 : iy >= this.ny ? this.ny - 1 : iy;
    iz = iz < 0 ? 0 : iz >= this.nz ? this.nz - 1 : iz;
    return (iz * this.ny + iy) * this.nx + ix;
  }

  /** Bucket items 0..n−1 using the positions written into `px` after `begin(n)`. */
  build(n: number): void {
    const cells = this.nx * this.ny * this.nz;
    const starts = this.starts;
    starts.fill(0, 0, cells + 1);
    const p = this.px;
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.cellOf[i] = c;
      starts[c + 1]++;
    }
    for (let c = 0; c < cells; c++) starts[c + 1] += starts[c];
    // Scatter each item into its cell's slot range.
    const fill = this.fillCursor(cells);
    for (let i = 0; i < n; i++) {
      const c = this.cellOf[i];
      this.items[starts[c] + fill[c]++] = i;
    }
  }

  private cursor = new Int32Array(0);
  private fillCursor(cells: number): Int32Array {
    if (this.cursor.length < cells) this.cursor = new Int32Array(cells);
    this.cursor.fill(0, 0, cells);
    return this.cursor;
  }

  /**
   * Indices of items within `r` of (x,y,z), excluding `self`, written to `out` (up to out.length).
   * Returns the count. Distances are exact (the grid only prunes).
   */
  query(x: number, y: number, z: number, r: number, self: number, out: Int32Array): number {
    const inv = this.inv;
    const x0 = Math.max(0, ((x - r - this.ox) * inv) | 0);
    const y0 = Math.max(0, ((y - r - this.oy) * inv) | 0);
    const z0 = Math.max(0, ((z - r - this.oz) * inv) | 0);
    const x1 = Math.min(this.nx - 1, ((x + r - this.ox) * inv) | 0);
    const y1 = Math.min(this.ny - 1, ((y + r - this.oy) * inv) | 0);
    const z1 = Math.min(this.nz - 1, ((z + r - this.oz) * inv) | 0);
    const r2 = r * r;
    const p = this.px;
    const max = out.length;
    let n = 0;
    for (let iz = z0; iz <= z1; iz++) {
      for (let iy = y0; iy <= y1; iy++) {
        let c = (iz * this.ny + iy) * this.nx + x0;
        for (let ix = x0; ix <= x1; ix++, c++) {
          const s = this.starts[c], e = this.starts[c + 1];
          for (let k = s; k < e; k++) {
            const j = this.items[k];
            if (j === self) continue;
            const dx = p[j * 3] - x, dy = p[j * 3 + 1] - y, dz = p[j * 3 + 2] - z;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
            out[n++] = j;
            if (n >= max) return n;
          }
        }
      }
    }
    return n;
  }
}
