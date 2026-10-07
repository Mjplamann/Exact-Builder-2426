import {
  AddEquation,
  BufferGeometry,
  CustomBlending,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OneFactor,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  ZeroFactor,
  type Camera,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Post chain: scene → MSAA HDR target (+ depth texture) → subtle bloom (only genuine light
 * sources: bubble glints, the TIR band's sparkle) → depth of field for close-ups (half
 * resolution) → final pass (DOF composite, ACES filmic tone map, gentle aquarium grade,
 * vignette, very light animated grain + dither, sRGB).
 *
 * Bloom uses a soft-knee threshold that subtracts the threshold (only the energy *above* it
 * glows, so a brightly lit white fish does not halo) and is set in display terms (it follows
 * the exposure), so the same things glow by day and by moonlight.
 *
 * Depth of field (telephoto close-ups and following): the circle of confusion comes from the real
 * thin-lens optics of the rig (focus distance, focal length, aperture — see CameraRig.dofScale)
 * and the scene's depth buffer. Three cheap half-resolution passes — a CoC-aware downsample, a
 * disc gather and a small tent — and the composite rides along in the final pass, so there is no
 * extra full-resolution pass. Depth-aware weights keep the sharp subject's colour out of the blur
 * (no halo) and the blurred background off the subject, while out-of-focus foreground spreads
 * over what is behind it like real bokeh.
 *
 * Clear fins (FishRenderer's fin twins, close-ups only): a defocused fin, or a solid part of one,
 * owns its pixel's depth and blurs like its body; a clear part of a fin in focus leaves the depth
 * to the background seen through it and marks its share of the pixel in the HDR alpha (alpha =
 * −opacity × sharpness, from the same lens as here: DOF_LENS; the scene's alpha is ≥ 0 elsewhere,
 * and bloom is blended so that it keeps the alpha). The composite keeps that share sharp — all of
 * the pixel along the fin's outline and rays, where its opacity changes, so the fin's own structure
 * stays crisp — and blurs the rest like the background beside the fin: no sharp fin-shaped window
 * into the background.
 *
 * The half-resolution blur is brought back to full resolution with a jittered 4-tap filter (a
 * small grid turned per pixel), so high-contrast textures out of focus (a spotted catfish behind
 * the subject) blur smoothly instead of showing the half-res grid as stair-steps. (Weighting the
 * taps by depth was tried: it re-aliases the silhouettes between two out-of-focus layers.)
 */

/** Bloom threshold in exposed (pre-tone-map) units: a lit white surface is ≈ 1–2. */
const BLOOM_THRESHOLD = 4.5;
/** ACES input gain (exposure / this). */
const ACES_GAIN_DIV = 0.66;
/** Largest circle of confusion (radius) as a fraction of the frame height, and in half-res pixels. */
const MAX_COC_FRAC = 0.011;
const MAX_COC_PX = 14;

/**
 * Half-res texels mostly covered by a clear fin in focus carry their CoC as −(this + CoC) (CoCs are
 * at most MAX_COC_PX), so the gather can tell them apart even between bilinear neighbours.
 */
const DOF_FIN_MARK = 64;

/** Linear view depth and signed circle of confusion (half-res px; + behind the focus) from the depth buffer. */
const CocGlsl = /* glsl */ `
  uniform vec3 uCoc;  // scale (half-res px per 1/m), 1/focus, max radius
  uniform vec2 uClip; // camera near, far
  float dofDepth(float d) { return uClip.x * uClip.y / (uClip.y - d * (uClip.y - uClip.x)); }
  float dofCoc(float d) { return clamp(uCoc.x * (uCoc.y - 1.0 / dofDepth(d)), -uCoc.z, uCoc.z); }`;

/**
 * The lens this frame, shared with materials that must agree with the depth of field (the fin
 * twins judge which fins are in focus): CoC scale (half-res px per 1/m; 0 = no depth of field),
 * 1/focus distance, largest radius; camera near and far.
 */
export const DOF_LENS = { uCoc: { value: new Vector3() }, uClip: { value: new Vector2(0.03, 12) } };

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
    tDof: { value: null },
    tDepth: { value: null },
    uDofOn: { value: 0 },
    uCoc: { value: new Vector3() },
    uClip: { value: new Vector2(0.03, 12) },
    /** Texel of the half-resolution blur. */
    uHalfTexel: { value: new Vector2(1, 1) },
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
    uniform sampler2D tDof;
    uniform sampler2D tDepth;
    uniform float uDofOn;
    uniform vec2 uHalfTexel;
    ${CocGlsl}
    varying vec2 vUv;

    // Half-res blur → full res: four bilinear taps on a small grid turned per pixel (interleaved
    // gradient noise), so the half-res grid never shows as stair-steps on high-contrast textures.
    vec4 dofUpsample() {
      float a = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 d = 0.7 * vec2(cos(a), sin(a)) * uHalfTexel;
      vec2 e = 0.7 * vec2(-sin(a), cos(a)) * uHalfTexel;
      return 0.25 * (texture2D(tDof, vUv + d) + texture2D(tDof, vUv - d) + texture2D(tDof, vUv + e) + texture2D(tDof, vUv - e));
    }

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
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      if (uDofOn > 0.5) {
        // Depth of field: blend toward the half-res blur by this pixel's own circle of confusion
        // (sharp subject stays full-res sharp), or where out-of-focus foreground spreads over it.
        float k = dofCoc(texture2D(tDepth, vUv).x);
        vec4 b = dofUpsample();
        // A clear fin in focus (HDR alpha = −its share of the pixel) keeps that share sharp and lets
        // the blurred background through — except along its outline and rays, where its opacity
        // changes: the fin's own structure stays crisp.
        float fin = clamp(-src.a, 0.0, 1.0);
        float finEdge = clamp(fwidth(fin) * 24.0, 0.0, 1.0); // (derivatives outside any per-pixel branch)
        float keep = fin > 0.0 ? max(fin, finEdge) : 0.0;
        float t = max(smoothstep(0.35, 1.25, abs(k)) * (1.0 - keep), b.a);
        c = mix(c, b.rgb, t);
      }
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

const QuadVert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Downsample to half resolution, carrying the signed CoC in alpha. */
const DofPrefilter = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel; // full-res texel
  ${CocGlsl}
  varying vec2 vUv;
  void main() {
    vec2 o = 0.5 * uTexel;
    vec2 uv0 = vUv - o, uv1 = vUv + vec2(o.x, -o.y), uv2 = vUv + vec2(-o.x, o.y), uv3 = vUv + o;
    vec4 c0 = texture2D(tColor, uv0), c1 = texture2D(tColor, uv1), c2 = texture2D(tColor, uv2), c3 = texture2D(tColor, uv3);
    float k0 = dofCoc(texture2D(tDepth, uv0).x), k1 = dofCoc(texture2D(tDepth, uv1).x);
    float k2 = dofCoc(texture2D(tDepth, uv2).x), k3 = dofCoc(texture2D(tDepth, uv3).x);
    // Defocused taps dominate, so the in-focus subject's colour never smears into the blur.
    float w0 = 0.02 + smoothstep(0.0, 1.0, abs(k0)), w1 = 0.02 + smoothstep(0.0, 1.0, abs(k1));
    float w2 = 0.02 + smoothstep(0.0, 1.0, abs(k2)), w3 = 0.02 + smoothstep(0.0, 1.0, abs(k3));
    vec3 c = c0.rgb * w0 + c1.rgb * w1 + c2.rgb * w2 + c3.rgb * w3;
    float kMin = min(min(k0, k1), min(k2, k3));
    float kMax = max(max(k0, k1), max(k2, k3));
    float k = -kMin > kMax ? kMin : kMax;
    // Mostly covered by a clear fin in focus (HDR alpha < 0): marked by moving its CoC (that of the
    // background behind the fin) below -${DOF_FIN_MARK}, so the gather blurs it only within the fin.
    float fins = step(c0.a, -1e-4) + step(c1.a, -1e-4) + step(c2.a, -1e-4) + step(c3.a, -1e-4);
    gl_FragColor = vec4(c / (w0 + w1 + w2 + w3), fins >= 2.0 ? -(${DOF_FIN_MARK}.0 + max(k, 0.0)) : k);
  }`;

/**
 * Disc gather over the half-res buffer (golden-angle taps, unrolled). A sample counts where its
 * own blur reaches this pixel; behind-focus samples cannot spread over a nearer, sharper pixel
 * (no background bleeding onto the subject), foreground samples spread over anything. Alpha =
 * how much out-of-focus foreground covers the pixel.
 */
function dofGather(taps: number): string {
  let body = '';
  for (let i = 0; i < taps; i++) {
    const r = Math.sqrt((i + 0.5) / taps);
    const a = i * 2.399963229728653;
    body += `
    s = texture2D(tSrc, vUv + vec2(${(r * Math.cos(a)).toFixed(5)}, ${(r * Math.sin(a)).toFixed(5)}) * rad);
    fn = step(s.a, ${-DOF_FIN_MARK / 2}.0);
    c = fn > 0.5 ? ctrFin * min(max(-s.a - ${DOF_FIN_MARK}.0, 0.0), cp) : s.a >= 0.0 ? min(s.a, cp) : s.a > -20.0 ? -s.a : 0.0;
    w = clamp(c - ${r.toFixed(5)} * uRadius + 1.0, 0.0, 1.0);
    acc += s.rgb * w; wsum += w; fg += s.a < 0.0 && fn < 0.5 ? w : 0.0;`;
  }
  return /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel; // half-res texel
  uniform float uRadius; // kernel radius (half-res px)
  varying vec2 vUv;
  void main() {
    vec4 ctr = texture2D(tSrc, vUv);
    // A clear fin in focus (see the prefilter) gathers the background behind it; its own colour
    // spreads only within the fin (no halo around it).
    float ctrFin = step(ctr.a, ${-DOF_FIN_MARK / 2}.0);
    float cp = ctrFin > 0.5 ? -ctr.a - ${DOF_FIN_MARK}.0 : max(ctr.a, 0.0);
    vec2 rad = uRadius * uTexel;
    vec3 acc = ctr.rgb;
    float wsum = 1.0, fg = 0.0, c, w, fn;
    vec4 s;${body}
    gl_FragColor = vec4(acc / wsum, min(1.0, fg * ${(3 / taps).toFixed(5)}));
  }`;
}

/** 2×2 tent at half resolution: smooths the gather's tap pattern. */
const DofTent = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 o = 0.5 * uTexel;
    gl_FragColor = 0.25 * (texture2D(tSrc, vUv - o) + texture2D(tSrc, vUv + o) + texture2D(tSrc, vUv + vec2(o.x, -o.y)) + texture2D(tSrc, vUv + vec2(-o.x, o.y)));
  }`;

/** Lens state for the depth of field this frame (from the camera rig). */
export interface DofParams {
  /** 0..1 fade (0 = off). */
  amount: number;
  /** Focus distance along the view axis (m, true space = what the depth buffer measures). */
  focus: number;
  /** CoC as a fraction of the frame height per unit of |1/focus − 1/depth| (already × amount). */
  scale: number;
  /** Nearest/farthest depth that can be in view (front and back glass): bounds the kernel. */
  near: number;
  far: number;
  /** Camera clip planes (depth linearisation). */
  cameraNear: number;
  cameraFar: number;
}

/**
 * Half-resolution depth of field (see the file comment). Reads the scene colour + depth of the
 * read buffer; writes its result into its own target, which the final pass composites.
 */
class DofPass extends Pass {
  private half: WebGLRenderTarget;
  private blur: WebGLRenderTarget;
  private out: WebGLRenderTarget;
  private quad: FullScreenQuad;
  private prefilter: ShaderMaterial;
  private gather: ShaderMaterial;
  private tent: ShaderMaterial;
  private final: ShaderPass;
  private fullTexel = new Vector2(1, 1);

  constructor(taps: number, final: ShaderPass) {
    super();
    this.needsSwap = false;
    this.final = final;
    const opts = { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter, depthBuffer: false, generateMipmaps: false } as const;
    this.half = new WebGLRenderTarget(16, 16, opts);
    this.blur = new WebGLRenderTarget(16, 16, opts);
    this.out = new WebGLRenderTarget(16, 16, opts);
    this.out.texture.name = 'env.dof';
    const fu = final.uniforms;
    this.prefilter = new ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: this.fullTexel }, uCoc: fu.uCoc, uClip: fu.uClip },
      vertexShader: QuadVert,
      fragmentShader: DofPrefilter,
      depthTest: false,
      depthWrite: false,
    });
    this.gather = new ShaderMaterial({
      uniforms: { tSrc: { value: this.half.texture }, uTexel: { value: new Vector2(1, 1) }, uRadius: { value: 1 } },
      vertexShader: QuadVert,
      fragmentShader: dofGather(taps),
      depthTest: false,
      depthWrite: false,
    });
    this.tent = new ShaderMaterial({
      uniforms: { tSrc: { value: this.blur.texture }, uTexel: { value: new Vector2(1, 1) } },
      vertexShader: QuadVert,
      fragmentShader: DofTent,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.prefilter);
    fu.tDof.value = this.out.texture;
  }

  /** Kernel radius (half-res px) for this frame. */
  set radius(r: number) {
    this.gather.uniforms.uRadius.value = r;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(16, Math.ceil(width / 2));
    const h = Math.max(16, Math.ceil(height / 2));
    this.half.setSize(w, h);
    this.blur.setSize(w, h);
    this.out.setSize(w, h);
    this.fullTexel.set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.final.uniforms.uHalfTexel.value.set(1 / w, 1 / h);
    this.gather.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.tent.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  override render(renderer: WebGLRenderer, _writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const prev = renderer.getRenderTarget();
    this.prefilter.uniforms.tColor.value = readBuffer.texture;
    this.prefilter.uniforms.tDepth.value = readBuffer.depthTexture;
    this.final.uniforms.tDepth.value = readBuffer.depthTexture;
    this.quad.material = this.prefilter;
    renderer.setRenderTarget(this.half);
    this.quad.render(renderer);
    this.quad.material = this.gather;
    renderer.setRenderTarget(this.blur);
    this.quad.render(renderer);
    this.quad.material = this.tent;
    renderer.setRenderTarget(this.out);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }

  /** Compile this pass's shaders now (for the targets they draw into), not at the first close-up. */
  prewarm(renderer: WebGLRenderer, camera: Camera): void {
    // A stand-in for the full-screen triangle (same attributes, so the same programs).
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    geo.setAttribute('uv', new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    const mesh = new Mesh(geo, this.prefilter);
    const prev = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.half);
      for (const m of [this.prefilter, this.gather, this.tent]) {
        mesh.material = m;
        void renderer.compileAsync(mesh, camera);
      }
    } finally {
      renderer.setRenderTarget(prev);
      mesh.geometry.dispose();
    }
  }

  override dispose(): void {
    this.half.dispose();
    this.blur.dispose();
    this.out.dispose();
    this.prefilter.dispose();
    this.gather.dispose();
    this.tent.dispose();
    this.quad.dispose();
  }
}

export interface PostSettings {
  msaa: number;
  bloom: boolean;
  bloomScale: number;
  /** Depth-of-field gather taps; 0 = no depth of field. */
  dofTaps?: number;
}

export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass | null = null;
  private capture: CapturePass;
  private dof: DofPass | null = null;
  private final: ShaderPass;
  private size = new Vector2();

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, settings: PostSettings) {
    renderer.getDrawingBufferSize(this.size);
    // The depth texture receives the (already performed) MSAA depth resolve, for depth of field.
    const dofTaps = settings.dofTaps ?? 0;
    const target = new WebGLRenderTarget(this.size.x, this.size.y, {
      type: HalfFloatType,
      samples: settings.msaa,
      depthTexture: dofTaps > 0 ? new DepthTexture(this.size.x, this.size.y) : null,
    });
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
      // Same additive glow, but the HDR alpha (the fin-coverage mask) is left as it is.
      const blend = this.bloom.blendMaterial;
      blend.blending = CustomBlending;
      blend.blendEquation = AddEquation;
      blend.blendSrc = SrcAlphaFactor;
      blend.blendDst = OneFactor;
      blend.blendSrcAlpha = ZeroFactor;
      blend.blendDstAlpha = OneFactor;
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(FinalShader);
    (this.final.material as ShaderMaterial).toneMapped = false;
    // The lens is shared with the fin twins (see DOF_LENS); every pass below references these.
    this.final.uniforms.uCoc = DOF_LENS.uCoc;
    this.final.uniforms.uClip = DOF_LENS.uClip;
    if (dofTaps > 0) {
      this.dof = new DofPass(dofTaps, this.final);
      this.dof.enabled = false;
      this.composer.addPass(this.dof);
    }
    this.composer.addPass(this.final);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.size.set(width, height);
    this.final.uniforms.uRes.value.set(width, height);
  }

  /**
   * Compile the close-up-only shaders ahead of time (depth-of-field passes, and `closeUp` scene
   * objects for the HDR target they are drawn into), so the first close-up does not stall on them.
   * With KHR_parallel_shader_compile the driver compiles them in the background.
   */
  prewarm(renderer: WebGLRenderer, camera: Camera, scene: Scene, closeUp: readonly Object3D[]): void {
    const prev = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.composer.readBuffer);
      for (const o of closeUp) void renderer.compileAsync(o, camera, scene);
    } finally {
      renderer.setRenderTarget(prev);
    }
    this.dof?.prewarm(renderer, camera);
  }

  /** Low-res linear HDR copy of the last rendered scene (before bloom). */
  get prevFrame(): Texture {
    return this.capture.target.texture;
  }

  render(exposure: number, time: number, dof?: DofParams | null): void {
    const fu = this.final.uniforms;
    fu.uExposure.value = exposure;
    // Depth of field: only while it shows (close-ups), so the whole-tank view pays nothing.
    const dofOn = !!this.dof && !!dof && dof.amount > 0.01 && dof.scale > 0;
    if (this.dof) this.dof.enabled = dofOn;
    fu.uDofOn.value = dofOn ? 1 : 0;
    // No depth of field: everything counts as in focus (the fin twins then lay down nothing).
    if (!dofOn) fu.uCoc.value.x = 0;
    if (dofOn) {
      // dof.scale is a CoC diameter as a fraction of the frame height; the shaders work with
      // radii in half-resolution pixels (÷2 twice).
      const halfH = this.size.y / 2;
      const scale = (dof!.scale * halfH) / 2;
      const inv = 1 / Math.max(1e-3, dof!.focus);
      const cap = Math.max(2, Math.min(MAX_COC_PX, MAX_COC_FRAC * halfH));
      fu.uCoc.value.set(scale, inv, cap);
      fu.uClip.value.set(dof!.cameraNear, dof!.cameraFar);
      // Kernel only as wide as the largest blur the tank's depth range can produce.
      const reach = scale * Math.max(1 / Math.max(1e-3, dof!.near) - inv, inv - 1 / Math.max(1e-3, dof!.far));
      this.dof!.radius = Math.max(1, Math.min(cap, reach));
    }
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
    this.dof?.dispose();
    this.capture.dispose();
    this.final.dispose();
    this.composer.dispose();
  }
}
