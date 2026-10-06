import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { App } from '../../app/App';
import type { FishState, Sex } from '../../core/types';
import type { World } from '../../core/world';
import { makeFishEntity } from '../../core/world';
import type { Engine } from '../Engine';
import { GLOBALS } from '../globals';
import { PostFX } from '../env/PostFX';
import { sexMatters } from './archetypes';
import { FishRenderer } from './FishRenderer';
import { fitLengthCm, pickSpecies } from './gallery';

/**
 * Visual-QA "studio" (dev only, never imported by the app): the gallery lineup rendered by its
 * own small renderer with the tank's light rig (overhead LED key, fill, water-scattered sky,
 * substrate bounce), the same fish materials, underwater veil and post chain — but without the
 * rest of the tank, so material work can be judged quickly under software WebGL.
 *
 *   (await import('/src/render/fish/studio.ts')).runStudio(window.__app, 'amphiprion-ocellaris')
 *
 * Stops the app's own frame loop (reload the page to get the tank back).
 */

export interface StudioOptions {
  limit?: number;
  /** Camera distance multiplier (1 = the lineup fills the view). */
  zoom?: number;
  /** Frames to render (phases advance between them). */
  frames?: number;
  /** Tail-beat amplitude 0..1. */
  tailAmp?: number;
  /** Real body lengths (cm) instead of filling the grid cells; camera at `distance` m. */
  realSize?: boolean;
  distance?: number;
  /** Light level 0..1 (1 = midday). */
  daylight?: number;
}

let previous: { renderer: WebGLRenderer; canvas: HTMLCanvasElement; fr: FishRenderer } | null = null;

export async function runStudio(app: App, filter: string, opts: StudioOptions = {}): Promise<number> {
  (app as unknown as { running: boolean }).running = false;
  if (previous) {
    previous.fr.dispose();
    previous.renderer.dispose();
    previous.canvas.remove();
    previous = null;
  }
  const species = pickSpecies(app, filter, opts.limit ?? 48);
  const W = window.innerWidth, H = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;';
  document.body.appendChild(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  scene.background = new Color(0.006, 0.013, 0.015);
  const camera = new PerspectiveCamera(26, W / H, 0.01, 10);
  const day = opts.daylight ?? 1;

  // The tank's light rig (src/render/env/Lighting.ts at midday).
  const key = new DirectionalLight(0xffffff, 5 * day);
  key.position.set(0.1, 1, 0.22).multiplyScalar(3);
  const fill = new DirectionalLight(0xffffff, 1.1 * day);
  fill.position.set(-0.22, 1, 0.12).multiplyScalar(3);
  const hemi = new HemisphereLight(new Color(0.71, 0.74, 0.74).multiplyScalar(0.75 * day), new Color(0.5, 0.45, 0.38).multiplyScalar(0.9 * day), 1);
  scene.add(key, key.target, fill, fill.target, hemi);

  // Lay the animals out on a plane mid-tank, side-on to the glass.
  const n = Math.max(1, species.length);
  const planeZ = 0.08, midY = 0.24;
  const dist = opts.realSize ? opts.distance ?? 0.9 : 1.05 * (opts.zoom ?? 1);
  camera.position.set(0, midY + 0.05, planeZ + dist);
  camera.lookAt(0, midY, planeZ);
  camera.updateMatrixWorld();
  GLOBALS.uCameraPos.value.copy(camera.position);
  GLOBALS.uDaylight.value = day;
  const halfH = Math.tan((13 * Math.PI) / 180) * dist * 0.94, halfW = halfH * (W / H);
  const aspect = halfW / halfH;
  const cols = Math.max(1, Math.round(Math.sqrt(n * aspect * 0.55)));
  const rows = Math.ceil(n / cols);
  const cellW = (2 * halfW) / cols, cellH = (2 * halfH) / rows;
  const fake = { contents: scene, renderer, camera } as unknown as Engine;
  const fr = new FishRenderer(fake);
  const now = app.world.clock.simTime;
  const fish = [];
  for (let i = 0; i < species.length; i++) {
    const sp = species[i];
    const c = i % cols, r = Math.floor(i / cols);
    const sex: Sex = sexMatters(sp, 'male') ? 'male' : 'unknown';
    const state: FishState = {
      id: `studio-${i}-${sp.id}`, speciesId: sp.id, sex, bornAt: now - 365 * 86_400_000, addedAt: now,
      lengthCm: opts.realSize ? sp.adultLengthCm * 0.9 : Math.min(fitLengthCm(sp, sex, cellW, cellH), 60), sizeFactor: 1,
      colorSeed: 1000 + i * 7919, hunger: 0, health: 1, stress: 0, stomach: 0.5, generation: 0,
      pos: [-halfW + (c + 0.5) * cellW, midY + halfH - (r + 0.5) * cellH, planeZ], heading: 0,
    };
    const e = makeFishEntity(app.world, state);
    if (!e) continue;
    const pos = state.pos!;
    e.kin.pos = [pos[0], pos[1], pos[2]];
    e.kin.forward = [1, 0, 0];
    const a = sp.body.archetype;
    if (a === 'ray' || a === 'stingray' || a === 'starfish' || a === 'brittle-star') {
      const l = Math.hypot(1, 1.1);
      e.kin.up = [0, 1 / l, 1.1 / l];
    } else e.kin.up = [0, 1, 0];
    e.kin.tailAmp = opts.tailAmp ?? 0.3;
    e.kin.finAmp = 0.35;
    e.kin.tailPhase = i * 1.3;
    fish.push(e);
  }
  const world = { fish, env: { daylight: day, moonlight: 0 }, clock: { simTime: now } } as unknown as World;
  fr.sync(world);
  previous = { renderer, canvas, fr };
  let post: PostFX | null = null;
  try {
    post = new PostFX(renderer, scene, camera, { msaa: 4, bloom: true, bloomScale: 0.5 } as ConstructorParameters<typeof PostFX>[3]);
  } catch (err) {
    console.warn('[studio] post chain unavailable', err);
  }
  const frames = opts.frames ?? 2;
  for (let f = 0; f < frames; f++) {
    for (const e of fish) {
      e.kin.tailPhase += 0.6;
      e.kin.finPhase += 0.9;
      e.kin.gillPhase += 0.7;
      e.kin.mouth = 0.1;
    }
    GLOBALS.uTime.value += 0.1;
    fr.update(world, 0.1);
    if (post) post.render(1, GLOBALS.uTime.value);
    else renderer.render(scene, camera);
    await new Promise((res) => setTimeout(res, 0));
  }
  return fish.length;
}
