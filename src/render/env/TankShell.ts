import {
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  type Material,
} from 'three';
import type { BackgroundKind, TankState } from '../../core/types';
import { substrateHeight, tankBounds } from '../../core/tankGeometry';
import { applyUnderwater } from '../underwater';
import { GLOBALS } from '../globals';
import { NOISE_GLSL, UW_PARS_GLSL, uwUniforms } from './glsl';

/** Render layer for effects that must not appear in the surface reflection. */
export const FX_LAYER = 1;

const BACKGROUND_INDEX: Record<BackgroundKind, number> = {
  black: 0,
  'deep-blue': 1,
  frosted: 2,
  'gradient-blue': 3,
  'dark-green': 4,
  clear: 5,
};

const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/** Shared lighting of film/glass surfaces from inside the tank (no normal maps, cheap). */
const SHELL_LIGHT_GLSL = /* glsl */ `
uniform float uRoom;
const vec3 MOON_RGB = vec3(0.1, 0.24, 1.0);
// Irradiance (relative) reaching a surface at p inside the water from the lamp/moon/room.
// Walls are vertical: the light grazes them, so its ripple pattern is a faint play of stretched
// lines near the top only (deeper down it is smeared out) — never a full-height curtain.
vec3 shellLight(vec3 p, vec3 n) {
  float depth = uwSurfaceY - p.y;
  vec3 lamp = uwLightColor * uwDaylight * 0.55 + MOON_RGB * uwMoonlight * 0.07;
  vec3 e = lamp;
  if (depth > 0.0) {
    vec3 c = mix(vec3(1.0), uwCaustics(p, n), 0.55 * exp(-depth / 0.1));
    e *= uwDepthAtten(depth) * c;
  }
  return e + vec3(1.0, 0.8, 0.62) * uRoom * 0.02;
}`;

/**
 * Background film / backlight behind the back glass (radiance before the water veil), shared by
 * the backdrop and the side panes (which mirror it by total internal reflection).
 */
const BACKDROP_GLSL = /* glsl */ `
uniform float uKind;
uniform float uBacklight;

// A dim room seen out of focus through the back glass: wall, a shelf, a window or lamp.
vec3 roomView(vec2 q) {
  float day = clamp(uRoom, 0.0, 1.0);
  vec3 wall = mix(vec3(0.05, 0.045, 0.04), vec3(0.16, 0.15, 0.14), day);
  vec3 c = wall * (0.8 + 0.2 * q.y);
  float shelf = smoothstep(0.18, 0.05, abs(q.x + 0.55)) * smoothstep(0.75, 0.6, q.y);
  c = mix(c, wall * 0.35, shelf * 0.8);
  vec2 w = (q - vec2(0.55, 0.62)) * vec2(2.4, 3.2);
  float window = exp(-dot(w, w) * 1.6);
  c += vec3(0.55, 0.65, 0.8) * window * day * 0.9;
  vec2 l = (q - vec2(-0.2, 0.35)) * vec2(3.0, 3.6);
  float lamp = exp(-dot(l, l));
  c += vec3(1.0, 0.7, 0.4) * lamp * (1.0 - day) * 0.12 * step(0.05, uRoom);
  return c * (0.25 + 0.75 * uRoom);
}

// Radiance of the background at back-wall point p (x across, y up).
vec3 backdropColor(vec3 p) {
  float v = clamp(p.y / uwTankHalf.y, 0.0, 1.0);
  float u = clamp(p.x / uwTankHalf.x, -1.0, 1.0);
  int k = int(uKind + 0.5);
  vec3 albedo = vec3(0.006);
  vec3 emit = vec3(0.0);
  float film = uwNoise(p.xy * 40.0) * 0.04 + uwNoise(p.xy * 4.0) * 0.03; // print/film texture
  if (k == 1) {
    albedo = mix(vec3(0.0, 0.02, 0.085), vec3(0.008, 0.06, 0.2), smoothstep(0.0, 1.0, v));
    emit = albedo * 0.08 * uBacklight;
  } else if (k == 2) {
    // Frosted film lit by an LED strip behind it: bright, soft, brightest low and centre.
    albedo = vec3(0.75);
    float g = 0.45 + 0.55 * pow(1.0 - v, 1.3);
    emit = mix(vec3(0.6, 0.78, 1.0), vec3(0.96, 0.98, 1.0), g) * g * (1.0 - 0.3 * u * u) * 1.15 * uBacklight;
  } else if (k == 3) {
    albedo = mix(vec3(0.02, 0.09, 0.26), vec3(0.3, 0.58, 0.86), smoothstep(0.0, 1.0, v));
    emit = albedo * 0.22 * uBacklight;
  } else if (k == 4) {
    albedo = vec3(0.01, 0.032, 0.016) * (1.0 + 0.5 * v);
  } else if (k == 5) {
    albedo = vec3(0.0);
    emit = roomView(vec2(u, v));
  }
  albedo *= 1.0 + film - 0.035;
  vec3 col = albedo * shellLight(p, vec3(0.0, 0.0, 1.0)) * 1.4 + emit;
  float depth = uwSurfaceY - p.y;
  vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.07;
  if (k == 0 || k == 1 || k == 4) {
    // Satin film right under the lamp: a soft sheen that fades down the back wall — the
    // backdrop is never a perfectly uniform void.
    float sheen = exp(-max(depth, 0.0) / 0.16) * (0.75 + 0.25 * (1.0 - u * u));
    col += lamp * uwDepthAtten(max(depth, 0.0)) * sheen * (k == 1 ? 0.016 : 0.011);
  } else if (depth > 0.0) {
    // Light films/backlights: the surface ripples' light play shows near the top.
    vec3 c = uwCaustics(p, normalize(vec3(0.0, 0.55, 0.85)));
    col *= 1.0 + (c - 1.0) * 0.22 * exp(-depth / 0.1) * uwDaylight;
  }
  return col;
}

uniform sampler2D uwPrevFrame;
uniform float uwGhost;
uniform mat4 projectionMatrix; // (not predeclared in fragment shaders)
// Faint mirror image of the tank interior in the back glass (black-backed tanks show the plants
// again, softly, in the gaps). From the previous frame: the eye ray is reflected at the back pane
// and assumed to meet the scenery at a typical depth; the result is blurred (out of focus,
// rippled) and only a few percent strong.
vec3 backGlassGhost(vec3 B) {
  if (uwGhost < 0.5) return vec3(0.0);
  int k = int(uKind + 0.5);
  float R = k == 0 ? 0.018 : k == 4 ? 0.016 : k == 1 ? 0.012 : k == 5 ? 0.012 : 0.004;
  vec3 d = normalize(B - uwCameraPos);
  vec3 r = vec3(d.x, d.y, -d.z);
  float zRep = -uwTankHalf.z * 0.3;
  vec3 P = B + r * ((zRep - B.z) / max(r.z, 0.05));
  vec4 c = projectionMatrix * viewMatrix * vec4(P, 1.0);
  vec2 uv = c.xy / c.w * 0.5 + 0.5;
  vec2 o = vec2(0.008, 0.014);
  vec3 g = texture2D(uwPrevFrame, uv).rgb * 2.0
         + texture2D(uwPrevFrame, uv + o).rgb + texture2D(uwPrevFrame, uv - o).rgb
         + texture2D(uwPrevFrame, uv + vec2(o.x, -o.y)).rgb + texture2D(uwPrevFrame, uv - vec2(o.x, -o.y)).rgb;
  g *= 1.0 / 6.0;
  float inside = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.94, uv.y);
  // The extra water path (back glass → scenery and back) absorbs a little more.
  vec3 T = exp(-uwExtinction() * 2.0 * max(zRep - B.z, 0.0));
  return g * T * R * inside;
}`;

function backdropUniforms(kind: BackgroundKind) {
  return {
    ...uwUniforms(),
    uKind: { value: BACKGROUND_INDEX[kind] },
    uRoom: { value: 0.2 },
    uBacklight: { value: 1 },
    uwPrevFrame: GLOBALS.uPrevFrame,
    uwGhost: GLOBALS.uGhost,
  };
}

/** Background film/backlight behind the back glass, seen through the water. */
function backdropMaterial(kind: BackgroundKind): ShaderMaterial {
  return new ShaderMaterial({
    name: 'env.backdrop',
    uniforms: backdropUniforms(kind),
    vertexShader: WORLD_VERT,
    fragmentShader: /* glsl */ `
      ${UW_PARS_GLSL}
      ${NOISE_GLSL}
      ${SHELL_LIGHT_GLSL}
      ${BACKDROP_GLSL}
      varying vec3 vWorld;
      void main() {
        vec3 col = uwVeil(backdropColor(vWorld) + backGlassGhost(vWorld), vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Side panes seen from inside the water at grazing angles are mirrors (total internal reflection
 * at the glass/air face): they show the tank again, mostly the back wall. Approximated by the
 * backdrop seen along the folded path (pane → back wall), so they read as the tank continuing
 * rather than as a dark wall.
 */
function sidePaneMaterial(kind: BackgroundKind): ShaderMaterial {
  return new ShaderMaterial({
    name: 'env.sidePane',
    uniforms: backdropUniforms(kind),
    vertexShader: WORLD_VERT,
    fragmentShader: /* glsl */ `
      ${UW_PARS_GLSL}
      ${NOISE_GLSL}
      ${SHELL_LIGHT_GLSL}
      ${BACKDROP_GLSL}
      varying vec3 vWorld;
      void main() {
        vec3 p = vWorld;
        vec3 d = normalize(p - uwCameraPos);
        // Continue the eye ray as far as the reflected ray travels to the back wall.
        float extra = (p.z + uwTankHalf.z) / max(abs(d.z), 0.2);
        vec3 v = p + d * extra;
        // Mirror image of the back wall point (inside the tank's x range).
        vec3 wall = vec3(sign(p.x) * (2.0 * uwTankHalf.x - abs(v.x)), v.y, -uwTankHalf.z);
        vec3 col = backdropColor(wall) * 0.92;              // a little lost in the glass
        col = uwVeil(col, v);
        // Faint sheen of the glass edge-on.
        col += uwVeilColor * 0.15 * pow(1.0 - abs(d.x), 4.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Front glass: barely-there reflection + algae film driven by waterParams.glassAlgae. */
function frontGlassMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'env.frontGlass',
    uniforms: { ...uwUniforms(), uAlgae: { value: 0 }, uSubLine: { value: 0.03 }, uRoom: { value: 0.2 }, uReflect: { value: 1 } },
    vertexShader: WORLD_VERT,
    fragmentShader: /* glsl */ `
      ${UW_PARS_GLSL}
      ${NOISE_GLSL}
      uniform float uAlgae;
      uniform float uSubLine;
      uniform float uRoom;
      uniform float uReflect;
      varying vec3 vWorld;
      void main() {
        vec3 p = vWorld;
        vec2 q = p.xy;
        vec3 rgb = vec3(0.0);
        float alpha = 0.0;
        // Light reaching the film: the lit water behind it and the lamp spill on the glass.
        vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.15;
        vec3 behind = uwVeilColor * 2.5 + lamp * 0.3 + vec3(1.0, 0.8, 0.62) * uRoom * 0.05;
        float a = uAlgae;
        if (a > 0.002) {
          // Film settles first along the substrate line, in the corners and at the waterline.
          float bottom = exp(-max(p.y - uSubLine, 0.0) / 0.08);
          float corner = exp(-(uwTankHalf.x - abs(p.x)) / 0.07);
          float top = exp(-abs(uwSurfaceY - p.y) / 0.025);
          float bias = 0.35 + 0.9 * bottom + 0.6 * corner + 0.35 * top;
          // Patchy, wiped-streak structure: large blotches with fine mottling.
          float n = uwFbm(q * vec2(5.0, 6.5) + 1.7) * 0.65 + uwFbm(q * 24.0 + 5.3) * 0.35;
          float cover = clamp(a * bias * 1.3, 0.0, 1.0);
          float film = smoothstep(1.0 - cover, 1.0 - cover + 0.35, n + 0.1 * cover);
          film *= 0.75 + 0.25 * uwNoise(q * 60.0);
          float fa = film * (0.1 + 0.42 * a);
          // Young film is brown (diatoms); older, denser film turns green. It scatters light, so it
          // reads as a soft tinted haze rather than a dark stain.
          float green = clamp(a * 1.1 + uwNoise(q * 3.0) * 0.5 - 0.25, 0.0, 1.0);
          vec3 fc = mix(vec3(0.42, 0.34, 0.16), vec3(0.24, 0.42, 0.12), green);
          // Green spot algae: hard round 1–3 mm discs once the glass is neglected.
          vec2 g = q * 140.0;
          vec2 cell = floor(g);
          vec2 f = fract(g) - 0.5;
          float h = uwHash12(cell);
          vec2 off = vec2(uwHash12(cell + 3.1), uwHash12(cell + 7.7)) - 0.5;
          float r = 0.14 + 0.2 * uwHash12(cell + 11.3);
          float spotOn = step(h, max(0.0, a - 0.2) * 0.07 * (0.4 + bias));
          float d = length(f - off * 0.6);
          float spot = spotOn * smoothstep(r, r * 0.7, d);
          vec3 sc = mix(vec3(0.2, 0.42, 0.1), vec3(0.1, 0.26, 0.05), smoothstep(r * 0.4, r, d));
          rgb = fc * behind * fa * (1.0 - spot) + sc * behind * 0.9 * spot;
          alpha = fa * (1.0 - spot) + spot * 0.85;
        }
        // The room behind the viewer, reflected at ~4% by the glass: barely there.
        if (uReflect > 0.5) {
          float v = clamp(p.y / uwTankHalf.y, 0.0, 1.0);
          float sheen = 0.5 + 0.5 * smoothstep(-0.6, 0.9, (p.x / uwTankHalf.x) * 0.5 + v);
          rgb += vec3(0.85, 0.8, 0.75) * (0.0015 + 0.006 * uRoom) * sheen;
        }
        gl_FragColor = vec4(rgb, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
}

/**
 * Meniscus: water climbs ~3 mm up clean glass; seen from below the curved band shines silver.
 * The back one is seen through the whole tank: fainter, and broken up by the ripples so it never
 * reads as a ruled line.
 */
function meniscusMaterial(back: boolean): ShaderMaterial {
  return new ShaderMaterial({
    name: 'env.meniscus',
    uniforms: { ...uwUniforms(), uBack: { value: back ? 1 : 0 } },
    vertexShader: WORLD_VERT,
    fragmentShader: /* glsl */ `
      ${UW_PARS_GLSL}
      ${NOISE_GLSL}
      uniform float uBack;
      varying vec3 vWorld;
      void main() {
        vec3 p = vWorld;
        // Wobble with the passing ripples.
        float w = sin(p.x * 37.0 + uwTime * 2.3) * 0.00025 + sin(p.x * 91.0 - uwTime * 3.7) * 0.00012;
        float t = (p.y - uwSurfaceY - w) / 0.0035;             // 0 at the flat surface, 1 at the contact line
        float band = smoothstep(-0.25, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));
        float bright = band * (0.55 + 0.45 * smoothstep(0.1, 0.5, t));
        float contact = exp(-pow((t - 1.0) / 0.12, 2.0));      // thin dark line where water meets glass
        vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.25;
        vec3 silver = uwVeilColor * 6.0 + lamp * 0.45;
        if (uBack > 0.5) {
          float vary = 0.35 + 0.65 * smoothstep(0.25, 0.75, uwNoise(vec2(p.x * 9.0 + uwTime * 0.05, uwTime * 0.11)));
          bright *= 0.4 * vary;
          contact *= 0.5;
        }
        vec3 rgb = silver * bright;
        float alpha = clamp(bright * 0.85 + contact * 0.45, 0.0, 1.0);
        if (uBack > 0.5) rgb *= uwTransmittance(p);
        gl_FragColor = vec4(rgb, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
}

export class TankShell {
  readonly group = new Group();
  private backdrop: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  private sides: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private seams: Mesh[] = [];
  private front: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  private menisci: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private seamMaterial: MeshStandardMaterial;

  constructor() {
    this.group.name = 'env.shell';
    // Black silicone, as on most rimless show tanks.
    this.seamMaterial = new MeshStandardMaterial({ color: 0x0b0c0c, roughness: 0.35, metalness: 0 });
    applyUnderwater(this.seamMaterial);
  }

  build(tank: TankState): void {
    this.clear();
    const b = tankBounds(tank);
    const W = 2 * b.halfW, H = b.height, D = 2 * b.halfD;

    // Backdrop just behind the back glass (glass thickness ~ 8 mm).
    const back = new Mesh(new PlaneGeometry(W + 0.002, H), backdropMaterial(tank.background));
    back.position.set(0, H / 2, -b.halfD - 0.004);
    back.name = 'env.backdrop';
    back.userData.castShadow = false;
    this.backdrop = back;
    this.group.add(back);

    // Side panes (inner faces), facing into the tank.
    for (const s of [-1, 1]) {
      const m = new Mesh(new PlaneGeometry(D, H), sidePaneMaterial(tank.background));
      m.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      m.position.set(s * (b.halfW + 0.001), H / 2, 0);
      m.name = 'env.sidePane';
      m.userData.castShadow = false;
      this.sides.push(m);
      this.group.add(m);
    }

    // Silicone beads in the back vertical corners and along the floor edges.
    const r = 0.0035;
    for (const s of [-1, 1]) {
      const seam = new Mesh(new CylinderGeometry(r, r, H - 0.004, 6, 1, true), this.seamMaterial);
      seam.position.set(s * (b.halfW - r * 0.4), H / 2, -b.halfD + r * 0.4);
      seam.userData.castShadow = false;
      this.seams.push(seam);
    }
    const along = (len: number, x: number, z: number, rotY: number) => {
      const seam = new Mesh(new CylinderGeometry(r, r, len, 6, 1, true), this.seamMaterial);
      seam.rotation.set(0, rotY, Math.PI / 2);
      seam.position.set(x, r * 0.4, z);
      seam.userData.castShadow = false;
      this.seams.push(seam);
    };
    along(W, 0, -b.halfD + r * 0.4, 0);
    along(D, -b.halfW + r * 0.4, 0, Math.PI / 2);
    along(D, b.halfW - r * 0.4, 0, Math.PI / 2);
    for (const s of this.seams) this.group.add(s);

    // Front glass overlay (algae film, faint reflections) — drawn last, never reflected.
    const front = new Mesh(new PlaneGeometry(W, H), frontGlassMaterial());
    front.position.set(0, H / 2, b.halfD + 0.0002);
    front.renderOrder = 20;
    front.layers.set(FX_LAYER);
    front.name = 'env.frontGlass';
    front.userData.castShadow = false;
    let line = 0;
    for (let i = 0; i <= 8; i++) line += substrateHeight(tank, (i / 8 - 0.5) * W * 0.9, b.halfD);
    front.material.uniforms.uSubLine.value = line / 9;
    this.front = front;
    this.group.add(front);

    // Menisci at the front and back glass.
    for (const isBack of [false, true]) {
      const m = new Mesh(new PlaneGeometry(W, 0.012), meniscusMaterial(isBack));
      m.position.set(0, b.surfaceY + 0.002, isBack ? -b.halfD + 0.0004 : b.halfD - 0.0004);
      m.renderOrder = 12;
      m.layers.set(FX_LAYER);
      m.material.side = DoubleSide;
      m.name = isBack ? 'env.meniscus.back' : 'env.meniscus.front';
      m.userData.castShadow = false;
      this.menisci.push(m);
      this.group.add(m);
    }
  }

  /** Per-frame: room light, backlight schedule, algae amount. */
  update(tank: TankState, room: number, backlight: number, frontReflections: boolean): void {
    if (this.backdrop) {
      this.backdrop.material.uniforms.uRoom.value = room;
      this.backdrop.material.uniforms.uBacklight.value = backlight;
    }
    for (const s of this.sides) {
      s.material.uniforms.uRoom.value = room;
      s.material.uniforms.uBacklight.value = backlight;
    }
    if (this.front) {
      const algae = Math.min(1, Math.max(0, tank.waterParams.glassAlgae));
      const u = this.front.material.uniforms;
      u.uAlgae.value = algae;
      u.uRoom.value = room;
      u.uReflect.value = frontReflections ? 1 : 0;
      this.front.visible = algae > 0.002 || frontReflections;
    }
  }

  private clear(): void {
    const meshes: Mesh[] = [...this.seams, ...this.sides, ...this.menisci];
    if (this.backdrop) meshes.push(this.backdrop);
    if (this.front) meshes.push(this.front);
    for (const m of meshes) {
      m.geometry.dispose();
      if (m.material !== this.seamMaterial) (m.material as Material).dispose();
      m.removeFromParent();
    }
    this.seams = [];
    this.sides = [];
    this.menisci = [];
    this.backdrop = null;
    this.front = null;
  }

  dispose(): void {
    this.clear();
    this.seamMaterial.dispose();
  }
}
