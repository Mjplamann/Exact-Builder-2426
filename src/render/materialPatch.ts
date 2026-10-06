import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';

/**
 * Composable `onBeforeCompile` patches. Several modules modify the same material (e.g. the fish
 * swim deformation + the shared underwater caustics/fog), so never assign `onBeforeCompile`
 * directly — always go through `addShaderPatch`.
 */
export type ShaderPatch = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;

interface PatchEntry {
  key: string;
  patch: ShaderPatch;
  /** Lower runs first. Vertex deformations should use < 0, lighting/fog > 0. */
  order: number;
}

export function addShaderPatch(material: Material, key: string, patch: ShaderPatch, order = 0): void {
  const ud = material.userData as { __patches?: PatchEntry[] };
  const patches = (ud.__patches ??= []);
  const existing = patches.findIndex((p) => p.key === key);
  if (existing >= 0) patches.splice(existing, 1);
  patches.push({ key, patch, order });
  patches.sort((a, b) => a.order - b.order);
  material.onBeforeCompile = (shader, renderer) => {
    for (const p of patches) p.patch(shader, renderer);
  };
  const cacheKey = patches.map((p) => p.key).join('|');
  material.customProgramCacheKey = () => cacheKey;
  material.needsUpdate = true;
}

export function hasShaderPatch(material: Material, key: string): boolean {
  const ud = material.userData as { __patches?: PatchEntry[] };
  return !!ud.__patches?.some((p) => p.key === key);
}
