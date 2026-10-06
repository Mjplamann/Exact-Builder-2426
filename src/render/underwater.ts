import type { Material } from 'three';

export interface UnderwaterOptions {
  /** Project animated caustics onto upward-facing surfaces (default true). */
  caustics?: boolean;
  /** Attenuate color by the light path through water toward the camera (default true). */
  absorption?: boolean;
}

/**
 * Patch a lit material (MeshStandardMaterial / MeshPhysicalMaterial / MeshLambertMaterial) so it
 * looks like it is underwater: animated caustics from the surface, depth-dependent light falloff,
 * and blue-green absorption/scattering along the view path. Composes with other patches through
 * addShaderPatch (key 'underwater', order 100). Safe to call more than once.
 *
 * OWNER: environment module. (Stub: no-op until implemented.)
 */
export function applyUnderwater(material: Material, opts: UnderwaterOptions = {}): void {
  void material;
  void opts;
}
