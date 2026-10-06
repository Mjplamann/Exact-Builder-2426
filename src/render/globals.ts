import { Color, DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType, Vector2, Vector3, Vector4, type Texture } from 'three';

/** 1×1 black texture (placeholder for optional inputs). */
function blackTexture(): Texture {
  const t = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

/** 1×1 neutral caustic texture used until the Engine's animated caustic target exists. */
function neutralCausticTexture(): Texture {
  // R/B ≈ the mean caustic level (so the modulation is ~1), G = mean shaft level.
  const t = new DataTexture(new Uint8Array([41, 41, 41, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Shared shader uniforms. Every material patched with `applyUnderwater` (and the fish/plant
 * vertex animation) references these exact objects, so the Engine updates them once per frame
 * and every material sees the new values.
 *
 * The first block is the cross-module contract. The second block (below `uCameraPos`) is owned
 * by the environment renderer and used by `applyUnderwater` and the env shaders; other modules
 * may read them but should not write them (except `uUnderwater`, see its note).
 */
export const GLOBALS = {
  /** Real seconds since start. */
  uTime: { value: 0 },
  /** Main light output 0..1 and moonlight 0..1. */
  uDaylight: { value: 1 },
  uMoonlight: { value: 0 },
  /** Main light color (linear). */
  uLightColor: { value: new Color(1, 1, 1) },
  /** Water absorption tint (linear) and turbidity (fog density per meter). */
  uWaterTint: { value: new Color(0.85, 0.95, 0.95) },
  uTurbidity: { value: 0.15 },
  /** Water surface height (m). */
  uSurfaceY: { value: 0.5 },
  /** Tank interior: (halfW, height, halfD) in meters. */
  uTankHalf: { value: new Vector3(0.6, 0.5, 0.25) },
  /** Caustic intensity (0 disables). */
  uCausticStrength: { value: 1 },
  /** Water current at the tank level: xz direction × speed (m/s) — used for plant sway. */
  uCurrent: { value: new Vector2(0.05, 0) },
  /** Camera position in world space (for water path-length attenuation). */
  uCameraPos: { value: new Vector3(0, 0.25, 2) },

  // ---- environment-renderer internals (additive; see note above) ----------------------------

  /** Unit vector pointing from the scene toward the main (LED) light, world space. */
  uLightDir: { value: new Vector3(0.08, 1, 0.18).normalize() },
  /**
   * Radiance (linear RGB) of light scattered toward the viewer by the water itself — the
   * blue-green (or tannin-amber) veil that distant objects fade into. Computed per frame from
   * the light levels and water tint.
   */
  uVeilColor: { value: new Color(0.02, 0.05, 0.06) },
  /** Height above which a view path is in air, not water (the surface; raised while rendering the mirrored surface reflection). */
  uVeilCeiling: { value: 0.5 },
  /** Animated, tileable caustic texture: R/B = two caustic layers, G = slow light-shaft layer. */
  uCausticMap: { value: neutralCausticTexture() as Texture },
  /** Accumulated drift (tile units) of the two caustic layers with the surface current: xy = layer A, zw = layer B. */
  uCausticDrift: { value: new Vector4(0, 0, 0, 0) },
  /**
   * Key-light shadow frame for the soft-shadow lookup: (frustum width m, frustum height m,
   * depth range m, blocker search distance m). Set by the lighting rig when it fits the tank.
   */
  uShadowFrame: { value: new Vector4(1.3, 0.6, 1.5, 0.25) },
  /**
   * Shadow softness: (penumbra per meter of occluder distance along the LED bar, across it,
   * minimum penumbra m, distance in m over which water scattering fills a shadow by 1/e).
   */
  uShadowSoft: { value: new Vector4(0.24, 0.1, 0.002, 0.75) },
  /** Soft-shadow sample counts (blocker search, filter), by quality preset. */
  uShadowTaps: { value: new Vector2(10, 14) },
  /**
   * Low-resolution copy of the previous frame's HDR scene (linear), used for the faint
   * reflection of the tank interior in the back glass. `uGhost` = 0 disables it (no post chain,
   * or during off-screen passes).
   */
  uPrevFrame: { value: blackTexture() as Texture },
  uGhost: { value: 0 },
  /**
   * Master switch for the underwater look in patched materials (1 = on). Set to 0 around an
   * off-screen render that is not "inside the tank" (e.g. catalog thumbnails), then restore.
   */
  uUnderwater: { value: 1 },
};

export type GlobalUniforms = typeof GLOBALS;
