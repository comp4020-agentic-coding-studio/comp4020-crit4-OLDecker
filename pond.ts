import type { Object3D } from "three";
import {
  createPadAudioChain,
  updatePadParams,
  type PadAudioChain,
} from "./audio";
import { clampDistance, cutoffForDistance, panForAngle } from "./scale";
import { PAD_MODEL_URLS, WORLD_RADIUS, type PondScene } from "./scene";

export interface Pad {
  distance: number; // normalized 0 (centre) .. 1 (edge)
  angle: number; // radians
  el: HTMLButtonElement;
  object3D: Object3D;
  audioChain: PadAudioChain;
  nextTriggerTime: number | null;
  triggered: boolean;
  bobStartTime: number | null;
}

const ANGLE_STEP_RADIANS = Math.PI / 12; // 15 degrees
const DISTANCE_STEP = 0.05;
const REST_HEIGHT = 0.02; // small offset so pad models don't z-fight the water plane
const BOB_DURATION_SECONDS = 0.6;
const BOB_PEAK_SCALE = 1.35;

// The pond's lily pads are authored as real <button> elements in index.html
// (not created here) so the spec's static structural check — a real,
// keyboard/touch-operable control inside <main> — holds even before this
// script runs. This function reads their starting position and 3D model off
// data attributes and wires up the interaction. Each pad's visible presence
// is its Three.js model; the button itself is an invisible hit target kept
// in sync with that model's projected screen position every frame.
export async function createPond(
  pond: HTMLElement,
  ctx: AudioContext,
  pondScene: PondScene,
): Promise<Pad[]> {
  const buttons = Array.from(
    pond.querySelectorAll<HTMLButtonElement>(".lily-pad"),
  );

  return Promise.all(
    buttons.map(async (el) => {
      const distance = clampDistance(Number(el.dataset.distance));
      const angle = (Number(el.dataset.angle) * Math.PI) / 180;
      const modelKey = el.dataset.model;
      const modelUrl = modelKey ? PAD_MODEL_URLS[modelKey] : undefined;
      if (!modelUrl) {
        throw new Error(`Lily pad button has an unknown data-model: ${el.outerHTML}`);
      }

      const object3D = await pondScene.loadModel(modelUrl);
      pondScene.scene.add(object3D);

      const pad: Pad = {
        distance,
        angle,
        el,
        object3D,
        audioChain: createPadAudioChain(ctx),
        nextTriggerTime: null,
        triggered: false,
        bobStartTime: null,
      };

      attachPointerHandlers(pad, pondScene);
      attachKeyboardHandlers(pad);
      applyPadState(pad);
      syncPadScreenPosition(pad, pondScene);
      return pad;
    }),
  );
}

// Updates everything derived from distance/angle: the 3D model's world
// position, the audio params, and the ARIA value text. Screen position is
// deliberately not touched here — see syncPadScreenPosition.
export function applyPadState(pad: Pad): void {
  const radius = pad.distance * WORLD_RADIUS;
  pad.object3D.position.set(
    radius * Math.cos(pad.angle),
    REST_HEIGHT,
    radius * Math.sin(pad.angle),
  );

  const cutoff = cutoffForDistance(pad.distance);
  const pan = panForAngle(pad.angle);
  updatePadParams(pad.audioChain, cutoff, pan);

  const valueNow = Math.round((1 - pad.distance) * 100);
  const panLabel =
    pan < -0.15 ? "panned left" : pan > 0.15 ? "panned right" : "panned centre";
  pad.el.setAttribute("aria-valuenow", String(valueNow));
  pad.el.setAttribute(
    "aria-valuetext",
    `pitch ${valueNow} of 100, ${panLabel}`,
  );
}

// Projects the pad's current 3D world position through the camera to place
// the invisible hit-target button. Called every animation frame (not just on
// interaction) so it stays correct across window resizes and bob-animation
// scale changes without needing its own change-tracking.
export function syncPadScreenPosition(pad: Pad, pondScene: PondScene): void {
  const { x, y, z } = pad.object3D.position;
  const { xPercent, yPercent } = pondScene.worldToScreenPercent(x, y, z);
  pad.el.style.left = `${xPercent}%`;
  pad.el.style.top = `${yPercent}%`;
}

export function triggerBob(pad: Pad, currentTime: number): void {
  pad.bobStartTime = currentTime;
}

// Eases the pad model's scale up and back down over BOB_DURATION_SECONDS.
// Call every frame; it's a no-op once the animation has finished.
export function updateBobAnimation(pad: Pad, currentTime: number): void {
  if (pad.bobStartTime === null) return;
  const elapsed = currentTime - pad.bobStartTime;
  if (elapsed >= BOB_DURATION_SECONDS) {
    pad.object3D.scale.setScalar(1);
    pad.bobStartTime = null;
    return;
  }
  const t = elapsed / BOB_DURATION_SECONDS;
  const bump = Math.sin(t * Math.PI); // 0 -> 1 -> 0
  pad.object3D.scale.setScalar(1 + bump * (BOB_PEAK_SCALE - 1));
}

function attachPointerHandlers(pad: Pad, pondScene: PondScene): void {
  pad.el.addEventListener("pointerdown", (event) => {
    pad.el.setPointerCapture(event.pointerId);
  });

  pad.el.addEventListener("pointermove", (event) => {
    if (!pad.el.hasPointerCapture(event.pointerId)) return;

    const world = pondScene.screenToWorld(event.clientX, event.clientY);
    if (!world) return;

    pad.distance = clampDistance(Math.hypot(world.x, world.z) / WORLD_RADIUS);
    pad.angle = Math.atan2(world.z, world.x);
    applyPadState(pad);
  });

  pad.el.addEventListener("pointerup", (event) => {
    pad.el.releasePointerCapture(event.pointerId);
  });
}

function attachKeyboardHandlers(pad: Pad): void {
  pad.el.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowLeft":
        pad.angle -= ANGLE_STEP_RADIANS;
        break;
      case "ArrowRight":
        pad.angle += ANGLE_STEP_RADIANS;
        break;
      case "ArrowUp":
        pad.distance = clampDistance(pad.distance - DISTANCE_STEP);
        break;
      case "ArrowDown":
        pad.distance = clampDistance(pad.distance + DISTANCE_STEP);
        break;
      default:
        return;
    }
    event.preventDefault();
    applyPadState(pad);
  });
}
