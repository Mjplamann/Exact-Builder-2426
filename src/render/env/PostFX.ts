import { HalfFloatType, ShaderMaterial, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Post chain: scene → MSAA HDR target → subtle bloom (only true highlights: bubble rims, the TIR
 * band's glints, wet specular) → final pass (ACES filmic tone map, gentle aquarium grade,
 * vignette, very light animated grain + dither, sRGB).
 */
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
      color *= uExposure / 0.6;
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

export interface PostSettings {
  msaa: number;
  bloom: boolean;
  bloomScale: number;
}

export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass | null = null;
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
    if (settings.bloom) {
      // Threshold in linear HDR: only things brighter than a lit white surface glow.
      this.bloom = new UnrealBloomPass(new Vector2(this.size.x * settings.bloomScale, this.size.y * settings.bloomScale), 0.22, 0.55, 1.05);
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

  render(exposure: number, time: number): void {
    this.final.uniforms.uExposure.value = exposure;
    this.final.uniforms.uTime.value = time;
    this.composer.render();
  }

  dispose(): void {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom?.dispose();
    this.final.dispose();
    this.composer.dispose();
  }
}
