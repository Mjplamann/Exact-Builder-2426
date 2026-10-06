/**
 * Meshing worker: builds SDF hardscape meshes (rocks, stone caves) off the main thread so
 * loading a rock-heavy scape (reef, Malawi) never freezes the calm render loop.
 */
import { meshRock } from './rockMesh';
import type { RockJob, RockResult } from './rockMesher';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<RockJob>) => void) | null; postMessage(m: RockResult, transfer: Transferable[]): void };

ctx.onmessage = (e) => {
  const job = e.data;
  try {
    const d = meshRock(job.item, job.cells);
    ctx.postMessage({ id: job.id, data: d }, [d.positions.buffer, d.normals.buffer, d.colors.buffer, d.det.buffer, d.indices.buffer]);
  } catch (err) {
    ctx.postMessage({ id: job.id, error: String(err) }, []);
  }
};
