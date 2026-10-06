import { Vector2, type Material } from 'three';
import { addShaderPatch, hasShaderPatch } from './materialPatch';
import { UW_FUNCTIONS_GLSL, UW_UNIFORMS_GLSL, uwUniforms } from './env/glsl';

export interface UnderwaterOptions {
  /** Project animated caustics onto upward-facing surfaces (default true). */
  caustics?: boolean;
  /** Attenuate color by the light path through water toward the camera (default true). */
  absorption?: boolean;
}

const VARYING = 'vUwWorldPos';

/** Insert `code` before the first of `anchors` found in `src`; falls back to the end of main(). */
function insertBefore(src: string, anchors: string[], code: string): string {
  for (const a of anchors) {
    const i = src.indexOf(a);
    if (i >= 0) return src.slice(0, i) + code + '\n' + src.slice(i);
  }
  const end = src.lastIndexOf('}');
  return end >= 0 ? src.slice(0, end) + code + '\n' + src.slice(end) : src + code;
}
function insertAfter(src: string, anchors: string[], code: string): string | null {
  for (const a of anchors) {
    const i = src.indexOf(a);
    if (i >= 0) return src.slice(0, i + a.length) + '\n' + code + src.slice(i + a.length);
  }
  return null;
}

/**
 * Patch a lit material (MeshStandardMaterial / MeshPhysicalMaterial / MeshLambertMaterial) so it
 * looks like it is underwater: animated caustics from the surface, depth-dependent light falloff,
 * and blue-green absorption/scattering along the view path. Composes with other patches through
 * addShaderPatch (key 'underwater', order 100). Safe to call more than once.
 *
 * World position is reconstructed from the final `mvPosition` (after skinning, morphing,
 * instancing, batching and any earlier vertex patch), so it always matches what is drawn.
 * Set `GLOBALS.uUnderwater.value = 0` around renders that should not look underwater.
 *
 * OWNER: environment module.
 */
export function applyUnderwater(material: Material, opts: UnderwaterOptions = {}): void {
  const caustics = opts.caustics !== false ? 1 : 0;
  const absorption = opts.absorption !== false ? 1 : 0;
  // Options are per-material uniforms (not #defines) so every patched material shares one
  // program variant and re-applying with other options never forces a recompile.
  const ud = material.userData as { __uwOpts?: { value: Vector2 } };
  if (ud.__uwOpts?.value instanceof Vector2 && hasShaderPatch(material, 'underwater')) {
    ud.__uwOpts.value.set(caustics, absorption);
    return;
  }
  const optsUniform = { value: new Vector2(caustics, absorption) };
  ud.__uwOpts = optsUniform;

  addShaderPatch(
    material,
    'underwater',
    (shader) => {
      Object.assign(shader.uniforms, uwUniforms());
      shader.uniforms.uwOpts = optsUniform;

      // ---- vertex: world position of the final, deformed vertex --------------------------
      let vs = shader.vertexShader;
      vs = vs.replace('void main() {', `varying vec3 ${VARYING};\nvoid main() {`);
      const worldPos = `
  // [underwater] world position from the final view-space position (rigid view matrix inverse).
  ${VARYING} = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);`;
      const after = insertAfter(vs, ['#include <project_vertex>'], worldPos);
      vs = after ?? insertBefore(vs, ['#include <worldpos_vertex>', '#include <shadowmap_vertex>', '#include <fog_vertex>'], worldPos);
      shader.vertexShader = vs;

      // ---- fragment ----------------------------------------------------------------------
      let fs = shader.fragmentShader;
      fs = fs.replace('void main() {', `${UW_UNIFORMS_GLSL}\n${UW_FUNCTIONS_GLSL}\nuniform vec2 uwOpts;\nvarying vec3 ${VARYING};\nvoid main() {`);

      if (fs.includes('#include <lights_fragment_end>')) {
        const lightCode = `
  // [underwater] caustics + depth falloff of the light that came down through the water.
  {
    float uwOn = uwUnderwater;
    vec3 uwN = inverseTransformDirection(normal, viewMatrix);
    float uwDepth = uwSurfaceY - ${VARYING}.y;
    vec3 uwAtt = mix(vec3(1.0), uwDepthAtten(uwDepth), uwOn);
    vec3 uwC = uwOpts.x > 0.5 ? mix(vec3(1.0), uwCaustics(${VARYING}, uwN), uwOn) : vec3(1.0);
    reflectedLight.directDiffuse *= uwAtt * uwC;
    reflectedLight.directSpecular *= uwAtt * mix(vec3(1.0), uwC, 0.6);
    reflectedLight.indirectDiffuse *= mix(vec3(1.0), uwAtt, 0.55);
    reflectedLight.indirectSpecular *= mix(vec3(1.0), uwAtt, 0.55);
  }`;
        fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${lightCode}`);
      }

      const veilCode = `
  // [underwater] absorption + in-scattering along the view path through the water.
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uwVeil(gl_FragColor.rgb, ${VARYING}), uwUnderwater * uwOpts.y);`;
      fs = insertBefore(fs, ['#include <tonemapping_fragment>', '#include <colorspace_fragment>', '#include <fog_fragment>'], veilCode);
      shader.fragmentShader = fs;
    },
    100,
  );
}
