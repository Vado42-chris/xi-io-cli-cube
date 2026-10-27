// Native product adapter of Node 053b4da SystemCursor.jsx.
// The falloff and shadow below are imported from exact upstream source bytes.
// No atmosphere store is mounted here: exact source shape/defaults are retained,
// with the owner-requested dimmer HEX-only cyan intensity below; no settings sync.
import {fireProfile, IBAL_PANEL_SHADOW} from './panelShadow.js';

export const CURSOR_LIGHT_DEFAULTS = Object.freeze({intensity: 1.6, reach: 1, softness: 1, blend: 'screen'});
// Owner correction Sentinel_9c533c1c87948191bd8e2a2366558fe2: Studio is too bright;
// HEX needs lower-intensity cyan only. Peak alpha .10 vs source-default .32.
export const HEX_LIGHT_OVERRIDE = Object.freeze({intensity: .5, acceptance: 'OWNER_ACCEPTANCE_PENDING'});
export const LIGHT_SETTINGS_QUALIFICATION = 'SOURCE_PROFILE_HEX_DIM_CYAN_OVERRIDE_NO_STUDIO_SETTINGS_SYNC';

export function cursorLightGradient() {
  const gain = Math.max(0, Math.min(3, HEX_LIGHT_OVERRIDE.intensity));
  const peak = IBAL_PANEL_SHADOW.alpha * gain;
  const stops = fireProfile(CURSOR_LIGHT_DEFAULTS.softness)
    .map(([t, weight]) => `hsl(var(--cursor-glow, var(--color-brand)) / ${(peak * weight).toFixed(4)}) ${(t * 100).toFixed(1)}%`)
    .join(', ');
  return `radial-gradient(circle closest-side, ${stops})`;
}

export function sourcePanelShadow() {
  const {blur, spread, alpha} = IBAL_PANEL_SHADOW;
  return `0 0 ${blur}px ${spread}px rgba(0, 0, 0, ${alpha})`;
}

// Adapt the existing bounded plate coordinates back to the same pointer point.
// This shares its already-settling controller instead of mounting another spring.
export function cursorLightGeometry(width, height, plateX = 0, plateY = 0) {
  if (![width, height, plateX, plateY].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const diameter = Math.round(Math.hypot(width, height) * CURSOR_LIGHT_DEFAULTS.reach);
  if (!Number.isFinite(diameter)) return null;
  return {
    diameter,
    x: Math.max(0, Math.min(width, (.5 - plateX / 34) * width)),
    y: Math.max(0, Math.min(height, (.5 - plateY / 22) * height)),
  };
}
