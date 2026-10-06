import { HalfFloatType, LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget, type Camera, type Scene, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Post chain: scene → MSAA HDR target → subtle bloom (only genuine light sources: bubble glints,
 * the TIR band's sparkle) → final pass (ACES filmic tone map, gentle aquarium grade, vignette,
 * very light animated grain + dither, sRGB).
 *
 * Bloom uses a soft-knee threshold that subtracts the threshold (only the energy *above* it
 * glows, so a brightly lit white fish does not halo) and is set in display terms (it follows
 * the exposure), so the same things glow by day and by moonlight.
 */

/** Bloom threshold in exposed (pre-tone-map) units: a lit white surface is ≈ 1–2. */
const BLOOM_THRESHOLD = 4.5;
/** ACES input gain (exposure / this). */
const ACES_GAIN_DIV = 0.66;

const SoftKneeHighPass = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float br = max(c.r, max(c.g, c.b));
    float knee = max(smoothWidth, 1e-4);
    float soft = clamp(br - luminosityThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);
    float w = max(soft, br - luminosityThreshold) / max(br, 1e-5);
    gl_FragColor = vec4(c * w, 1.0);
  }`;
const FinalShader = {
  name: 'env.final',
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uTime: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
    uGrain: { value: 0.012 },
    uVignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    // ACES filmic (same fit as three.js ACESFilmicToneMapping).
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFilmic(vec3 color) {
      const mat3 ACESInputMat = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(
        vec3(1.60475, -0.10208, -0.00327),
        vec3(-0.53108, 1.10813, -0.07276),
        vec3(-0.07367, -0.00605, 1.07602));
      color *= uExposure / ${ACES_GAIN_DIV.toFixed(3)};
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = acesFilmic(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Aquarium grade: shadows lean a touch teal, highlights stay neutral-warm; +5% saturation.
      c = mix(c, c * vec3(0.95, 1.0, 1.035), (1.0 - smoothstep(0.0, 0.3, l)) * 0.7);
      c = max(vec3(0.0), mix(vec3(l), c, 1.05));
      // Gentle vignette (aspect-correct), like the falloff of a lens.
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      c *= 1.0 - uVignette * smoothstep(0.4, 1.15, length(q));
      c = toSRGB(c);
      // Very light film grain (luminance, stronger in the shadows) + ordered dither against banding.
      float n = hash(vUv * uRes + fract(uTime * 7.31) * 113.0) + hash(vUv * uRes * 1.37 + fract(uTime * 3.17) * 71.0) - 1.0;
      c += n * uGrain * (1.0 - 0.6 * l);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * Copies the rendered HDR scene into a small target (no swap) so the next frame can show a
 * faint, soft reflection of the tank interior in the back glass.
 */
class CapturePass extends Pass {
  readonly target: WebGLRenderTarget;
  private quad: FullScreenQuad;
  private material: ShaderMaterial;
  constructor() {
    super();
    this.needsSwap = false;
    this.target = new WebGLRenderTarget(16, 16, { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter, depthBuffer: false, generateMipmaps: false });
    this.target.texture.name = 'env.prevFrame';
    this.material = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  override setSize(width: number, height: number): void {
    this.target.setSize(Math.max(16, Math.round(width / 4)), Math.max(16, Math.round(height / 4)));
  }
  override render(renderer: WebGLRenderer, _writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }
  override dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

export interface PostSettings {
  msaa: number;
  bloom: boolean;
  bloomScale: number;
}

export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass | null = null;
  private capture: CapturePass;
  private final: ShaderPass;
  private size = new Vector2();

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, settings: PostSettings) {
    renderer.getDrawingBufferSize(this.size);
    const target = new WebGLRenderTarget(this.size.x, this.size.y, { type: HalfFloatType, samples: settings.msaa });
    target.texture.name = 'env.hdr';
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(1); // target is already in drawing-buffer pixels
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.capture = new CapturePass();
    this.composer.addPass(this.capture);
    if (settings.bloom) {
      // Soft-knee, exposure-relative threshold (set per frame in render()).
      this.bloom = new UnrealBloomPass(new Vector2(this.size.x * settings.bloomScale, this.size.y * settings.bloomScale), 0.3, 0.5, 3);
      this.bloom.materialHighPassFilter.fragmentShader = SoftKneeHighPass;
      this.bloom.materialHighPassFilter.needsUpdate = true;
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(FinalShader);
    (this.final.material as ShaderMaterial).toneMapped = false;
    this.composer.addPass(this.final);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.final.uniforms.uRes.value.set(width, height);
  }

  /** Low-res linear HDR copy of the last rendered scene (before bloom). */
  get prevFrame(): Texture {
    return this.capture.target.texture;
  }

  render(exposure: number, time: number): void {
    this.final.uniforms.uExposure.value = exposure;
    if (this.bloom) {
      // Threshold in linear HDR so that it sits at BLOOM_THRESHOLD after exposure.
      this.bloom.threshold = (BLOOM_THRESHOLD * ACES_GAIN_DIV) / Math.max(0.05, exposure);
      (this.bloom.highPassUniforms as Record<string, { value: number }>).smoothWidth.value = this.bloom.threshold * 0.5;
    }
    this.final.uniforms.uTime.value = time;
    this.composer.render();
  }

  dispose(): void {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom?.dispose();
    this.capture.dispose();
    this.final.dispose();
    this.composer.dispose();
  }
}
