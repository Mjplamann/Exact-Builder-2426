import {
  BackSide,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * A soft underwater light probe for fish reflections (prefiltered with PMREM): bright Snell's
 * window overhead, blue-green water at the horizon, dim substrate below. Silvery guanine,
 * wet clearcoat and eyes need something to reflect — without it metallic fish render black.
 */
export function createUnderwaterEnv(renderer: WebGLRenderer, kind: 'tank' | 'studio' = 'tank'): Texture {
  const scene = new Scene();
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uStudio: { value: kind === 'studio' ? 1 : 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStudio;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = d.y;
        // Linear radiance.
        vec3 sky = vec3(1.0, 1.06, 1.1);
        vec3 window = vec3(1.9, 1.95, 1.92);
        vec3 water = mix(vec3(0.16, 0.27, 0.3), vec3(0.32, 0.36, 0.38), uStudio);
        vec3 floorC = mix(vec3(0.09, 0.08, 0.065), vec3(0.18, 0.18, 0.18), uStudio);
        vec3 c = mix(water, sky, smoothstep(0.05, 0.75, up));
        c = mix(c, window, smoothstep(0.7, 0.98, up));
        c = mix(c, floorC, smoothstep(-0.05, -0.45, up));
        // A brighter front side (the room / viewer side of the glass) for a gentle fill.
        c += vec3(0.08, 0.09, 0.1) * smoothstep(0.2, 1.0, d.z) * (1.0 - abs(up));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const geo = new SphereGeometry(5, 48, 24);
  scene.add(new Mesh(geo, mat));
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return rt.texture;
}
