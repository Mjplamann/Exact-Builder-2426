import { Color, Vector2, Vector3 } from 'three';

/**
 * Shared shader uniforms. Every material patched with `applyUnderwater` (and the fish/plant
 * vertex animation) references these exact objects, so the Engine updates them once per frame
 * and every material sees the new values.
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
};

export type GlobalUniforms = typeof GLOBALS;
