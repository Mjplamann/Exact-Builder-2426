import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GLOBALS } from '../globals';

/**
 * Animated, tileable caustic texture rendered once per frame into a small mip-mapped target and
 * sampled by every underwater material (cheap: a few fetches per fragment instead of evaluating
 * the pattern per pixel). Mip levels provide the depth blur.
 *
 * Pattern: the iterated warped-sine "tileable water caustic" (after joltz0r / D. Hoskins), made
 * exactly periodic by replacing its linear term with a constant. Channels:
 *   R  caustic layer A (from the first LED)
 *   B  caustic layer B (second LED, different phase/speed) — averaging two layers also keeps the
 *      overall brightness steady while the pattern evolves
 *   G  slow, broad layer used for light shafts in the water column
 * Stored as value/1.3 so the brightest lines fit in 8 bits; spatial mean ≈ CAUSTIC_MEAN.
 */
export class Caustics {
  readonly target: WebGLRenderTarget;
  private quad: FullScreenQuad;
  private material: ShaderMaterial;
  private time = 0;

  constructor(size: number) {
    this.target = new WebGLRenderTarget(size, size, {
      type: UnsignedByteType,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      magFilter: LinearFilter,
      minFilter: LinearMipmapLinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });
    this.target.texture.name = 'env.caustics';
    // Floors and walls are seen at grazing angles: without anisotropic filtering the pattern
    // would mip down to blotches.
    this.target.texture.anisotropy = 8;
    this.material = new ShaderMaterial({
      name: 'env.causticsGen',
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        #define TAU 6.28318530718
        // Exactly periodic over uv ∈ [0,1)².
        float caustic(vec2 uv, float time) {
          vec2 p = mod(uv * TAU, TAU) - 250.0;
          vec2 i = p;
          float c = 1.0;
          const float inten = 0.005;
          for (int n = 0; n < 5; n++) {
            float t = time * (1.0 - (3.5 / float(n + 1)));
            i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
            c += 1.0 / length(vec2(250.0 / (sin(i.x + t) / inten), 250.0 / (cos(i.y + t) / inten)));
          }
          c /= 5.0;
          c = 1.17 - pow(c, 1.4);
          return pow(abs(c), 8.0);
        }
        void main() {
          float a = caustic(vUv, uTime + 23.0);
          float b = caustic(vec2(vUv.y, 1.0 - vUv.x) + vec2(0.37, 0.61), uTime * 0.83 + 71.0);
          float s = caustic(vUv + vec2(0.5, 0.21), uTime * 0.28 + 140.0);
          gl_FragColor = vec4(vec3(a, s, b) / 1.3, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    GLOBALS.uCausticMap.value = this.target.texture;
  }

  /**
   * Advance and re-render. `agitation` (≈0.5 calm … 1.5 strong flow/airstones) scales how fast
   * the surface ripples evolve.
   */
  render(renderer: WebGLRenderer, dt: number, agitation: number): void {
    // ~0.45 pattern-time units per second ≈ the dance of caustics under a gently rippled surface.
    this.time += dt * 0.45 * agitation;
    this.material.uniforms.uTime.value = this.time;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
