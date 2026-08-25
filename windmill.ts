import type { Object3D } from "three";
import { attachPolarKeyboardHandlers, attachPolarPointerHandlers } from "./polarControl";
import { clampDistance } from "./scale";
import { createWindmillModel, WORLD_RADIUS, type PondScene } from "./scene";

export interface Windmill {
  distance: number; // normalized 0 (centre, calm) .. 1 (edge, windy)
  angle: number; // radians
  el: HTMLButtonElement;
  object3D: Object3D;
  rotor: Object3D;
}

const WIND_MIN_MULTIPLIER = 0.55;
const WIND_MAX_MULTIPLIER = 2.2;
const BASE_BLADE_RADIANS_PER_SECOND = 2.4;
// Matches pond.ts's pad offset: keeps the tower's flat base from sitting
// exactly on the water plane (y=0), which z-fights the same way pads did
// before they got their own offset.
const REST_HEIGHT = 0.15;

// Linear interpolation from calm-at-centre to windy-at-rim. Both the
// melody's tempo (main.ts) and the visible blade-spin rate read from this
// same function, so the audible and visual effects always agree.
export function getWindSpeedMultiplier(distance: number): number {
  return WIND_MIN_MULTIPLIER + distance * (WIND_MAX_MULTIPLIER - WIND_MIN_MULTIPLIER);
}

// The windmill is a real <button> in index.html, same convention as the
// lily pads: its 3D model is the visible presence, the button is an
// invisible hit target kept in sync with the model's screen position.
export async function createWindmill(
  pond: HTMLElement,
  pondScene: PondScene,
): Promise<Windmill> {
  const el = pond.querySelector<HTMLButtonElement>(".wind-control");
  if (!el) {
    throw new Error("Pond is missing its .wind-control button");
  }

  const distance = clampDistance(Number(el.dataset.distance));
  const angle = (Number(el.dataset.angle) * Math.PI) / 180;

  const object3D = createWindmillModel();
  const rotor = object3D.userData.rotor as Object3D;
  pondScene.scene.add(object3D);

  const windmill: Windmill = { distance, angle, el, object3D, rotor };

  attachPolarPointerHandlers(el, pondScene, windmill, () => applyWindmillState(windmill));
  attachPolarKeyboardHandlers(el, windmill, () => applyWindmillState(windmill));
  applyWindmillState(windmill);
  syncWindmillScreenPosition(windmill, pondScene);

  return windmill;
}

// Updates everything derived from distance/angle: the 3D model's world
// position and the ARIA value text. Screen position is deliberately not
// touched here — see syncWindmillScreenPosition.
export function applyWindmillState(windmill: Windmill): void {
  const radius = windmill.distance * WORLD_RADIUS;
  windmill.object3D.position.set(
    radius * Math.cos(windmill.angle),
    REST_HEIGHT,
    radius * Math.sin(windmill.angle),
  );

  const valueNow = Math.round(windmill.distance * 100);
  const multiplier = getWindSpeedMultiplier(windmill.distance);
  windmill.el.setAttribute("aria-valuenow", String(valueNow));
  windmill.el.setAttribute(
    "aria-valuetext",
    `wind speed ${valueNow} of 100, melody at ${multiplier.toFixed(1)}× tempo`,
  );
}

// Projects the windmill's current 3D world position through the camera to
// place the invisible hit-target button. Called every animation frame so it
// stays correct across window resizes, same as pond.ts's pads.
export function syncWindmillScreenPosition(windmill: Windmill, pondScene: PondScene): void {
  const { x, y, z } = windmill.object3D.position;
  const { xPercent, yPercent } = pondScene.worldToScreenPercent(x, y, z);
  windmill.el.style.left = `${xPercent}%`;
  windmill.el.style.top = `${yPercent}%`;
}

// Spins the rotor continuously so the wind-speed mechanic is visible even
// before anything is touched — the causal link (position -> spin rate ->
// tempo) should be discoverable just by watching.
export function updateWindmillSpin(windmill: Windmill, dtSeconds: number): void {
  const multiplier = getWindSpeedMultiplier(windmill.distance);
  // Blades are laid out in the rotor's local xy-plane (facing the camera),
  // so spinning around z keeps them in that plane — a y or x spin would
  // tilt the cross out of view instead of reading as a pinwheel turning.
  windmill.rotor.rotation.z += BASE_BLADE_RADIANS_PER_SECOND * multiplier * dtSeconds;
}
