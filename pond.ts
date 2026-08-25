import type { Object3D } from "three";
import {
  createPadAudioChain,
  updatePadParams,
  type PadAudioChain,
} from "./audio";
import { ADDABLE_MODELS, INSTRUMENT_FOR_MODEL } from "./instruments";
import {
  attachPolarKeyboardHandlers,
  attachPolarPointerHandlers,
  REMOVE_DISTANCE_THRESHOLD,
} from "./polarControl";
import { clampDistance, cutoffForDistance, normalizedAngle, panForAngle } from "./scale";
import { PAD_MODEL_SCALE, PAD_MODEL_URLS, WORLD_RADIUS, type PondScene } from "./scene";

export interface Pad {
  distance: number; // normalized 0 (centre) .. 1 (edge), can exceed 1 mid-drag
  angle: number; // radians
  el: HTMLButtonElement;
  object3D: Object3D;
  audioChain: PadAudioChain;
  nextTriggerTime: number | null;
  triggered: boolean;
  bobStartTime: number | null;
  fallStartTime: number | null;
  fallOrigin: { x: number; z: number };
  fallSpin: { x: number; z: number };
  sizeLevel: number; // index into SIZE_MULTIPLIERS; click a pad to cycle it
}

// Offset so pad models don't z-fight the water plane. Needs to scale with
// PAD_MODEL_SCALE: at 0.02 (fine at scale 1) the scaled-up pad disc sat close
// enough to y=0 that it z-fought the water plane and back-culled to a sliver,
// leaving only the raised flower/stamen mesh visible as a red cross.
const REST_HEIGHT = 0.15;
const BOB_DURATION_SECONDS = 0.6;
const BOB_PEAK_SCALE = 1.35;

// A removed pad tumbles off along the direction it was already heading
// (pad.angle) rather than just fading out, so a drag-off or Delete reads as
// something falling off the edge of the pond rather than vanishing.
const FALL_DURATION_SECONDS = 0.6;
const FALL_OUTWARD_DISTANCE = 1.5;
const FALL_SINK_DEPTH = 1.8;
const FALL_SPIN_RANGE_RAD_PER_SECOND = 5;

// Click a pad to cycle through these — the same multiplier drives both the
// model's visible scale and its note's peak gain, so "bigger" and "louder"
// are one dial, not two separate settings to learn. Index 2 (1x) is the
// default so an untouched pad looks/sounds exactly as it always has.
const SIZE_MULTIPLIERS = [0.65, 0.85, 1, 1.25, 1.55];
const DEFAULT_SIZE_LEVEL = 2;

function padBaseScale(pad: Pad): number {
  return PAD_MODEL_SCALE * SIZE_MULTIPLIERS[pad.sizeLevel];
}

// Same multiplier padBaseScale uses, exposed so main.ts can scale a note's
// gain by the same "bigger" dial that drives the visible model size.
export function sizeMultiplierFor(pad: Pad): number {
  return SIZE_MULTIPLIERS[pad.sizeLevel];
}

// Advances a pad through its size levels, wrapping back to the smallest
// after the largest — click again cycles through, rather than clamping at
// the top. Applies the new scale immediately for instant visual feedback
// rather than waiting for the next bob/fall to pick it up.
export function cyclePadSize(pad: Pad): void {
  pad.sizeLevel = (pad.sizeLevel + 1) % SIZE_MULTIPLIERS.length;
  if (pad.bobStartTime === null && pad.fallStartTime === null) {
    pad.object3D.scale.setScalar(padBaseScale(pad));
  }
  applyPadState(pad);
}

// Spawn angles for newly-added pads, cycled through so repeated adds fan out
// around the rim instead of stacking on top of each other.
const SPAWN_ANGLES_DEGREES = [20, 160, 250, 340, 70, 200, 290];
let spawnAngleIndex = 0;

export type PadRemovedHandler = (pad: Pad) => void;

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
  onRemove: PadRemovedHandler,
): Promise<Pad[]> {
  const buttons = Array.from(
    pond.querySelectorAll<HTMLButtonElement>(".lily-pad"),
  );

  return Promise.all(buttons.map((el) => instantiatePad(el, ctx, pondScene, onRemove)));
}

async function instantiatePad(
  el: HTMLButtonElement,
  ctx: AudioContext,
  pondScene: PondScene,
  onRemove: PadRemovedHandler,
): Promise<Pad> {
  const distance = clampDistance(Number(el.dataset.distance));
  const angle = (Number(el.dataset.angle) * Math.PI) / 180;
  const modelKey = el.dataset.model;
  const modelUrl = modelKey ? PAD_MODEL_URLS[modelKey] : undefined;
  if (!modelKey || !modelUrl) {
    throw new Error(`Lily pad button has an unknown data-model: ${el.outerHTML}`);
  }

  const object3D = await pondScene.loadModel(modelUrl);
  object3D.scale.setScalar(PAD_MODEL_SCALE * SIZE_MULTIPLIERS[DEFAULT_SIZE_LEVEL]);
  pondScene.scene.add(object3D);

  const instrument = INSTRUMENT_FOR_MODEL[modelKey] ?? "pad";
  const pad: Pad = {
    distance,
    angle,
    el,
    object3D,
    audioChain: createPadAudioChain(ctx, instrument),
    nextTriggerTime: null,
    triggered: false,
    bobStartTime: null,
    fallStartTime: null,
    fallOrigin: { x: 0, z: 0 },
    fallSpin: { x: 0, z: 0 },
    sizeLevel: DEFAULT_SIZE_LEVEL,
  };

  attachPolarPointerHandlers(
    el,
    pondScene,
    pad,
    () => {
      el.classList.toggle("lily-pad-leaving", pad.distance > REMOVE_DISTANCE_THRESHOLD);
      applyPadState(pad);
    },
    {
      allowOverflow: true,
      onRelease: (_state, wasOverflowing) => {
        if (wasOverflowing) onRemove(pad);
      },
      onClick: () => cyclePadSize(pad),
    },
  );
  attachPolarKeyboardHandlers(el, pad, () => applyPadState(pad));
  el.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(pad);
    }
  });

  applyPadState(pad);
  syncPadScreenPosition(pad, pondScene);
  return pad;
}

// Adds a brand-new pad of the given model kind, fanning spawn positions
// around the rim so repeated adds don't stack. Mirrors the static buttons'
// markup so it satisfies the same structural/ARIA contract.
export async function addPad(
  pond: HTMLElement,
  ctx: AudioContext,
  pondScene: PondScene,
  modelKey: string,
  onRemove: PadRemovedHandler,
): Promise<Pad> {
  const model = ADDABLE_MODELS.find((entry) => entry.key === modelKey);
  const angleDegrees = SPAWN_ANGLES_DEGREES[spawnAngleIndex % SPAWN_ANGLES_DEGREES.length];
  spawnAngleIndex += 1;

  const el = document.createElement("button");
  el.type = "button";
  el.className = "lily-pad";
  el.setAttribute("role", "slider");
  el.setAttribute("aria-label", model ? model.label : "New pond element");
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.dataset.distance = "0.5";
  el.dataset.angle = String(angleDegrees);
  el.dataset.model = modelKey;
  pond.appendChild(el);

  return instantiatePad(el, ctx, pondScene, onRemove);
}

// Detaches a pad's controls immediately (hit-target button, audio chain) but
// leaves its 3D model in the scene so it can play out beginPadFall's tumble
// animation. Call removePad once updateFallAnimation reports finished.
export function beginPadFall(pad: Pad, currentTime: number): void {
  pad.el.remove();
  pad.audioChain.filter.disconnect();
  pad.audioChain.panner.disconnect();
  pad.fallOrigin = { x: pad.object3D.position.x, z: pad.object3D.position.z };
  pad.fallSpin = {
    x: (Math.random() * 2 - 1) * FALL_SPIN_RANGE_RAD_PER_SECOND,
    z: (Math.random() * 2 - 1) * FALL_SPIN_RANGE_RAD_PER_SECOND,
  };
  pad.fallStartTime = currentTime;
}

// Eases the pad outward along the angle it was already heading, sinking and
// spinning it as it shrinks away — a "fallen off the edge" tumble rather than
// an instant disappear. t*t (not the bob's sine ease) reads as acceleration,
// like gravity taking over once it's left the pond. Returns true once the
// animation has finished, at which point the caller should call removePad.
export function updateFallAnimation(pad: Pad, currentTime: number): boolean {
  if (pad.fallStartTime === null) return true;
  const elapsed = currentTime - pad.fallStartTime;
  if (elapsed >= FALL_DURATION_SECONDS) return true;

  const t = elapsed / FALL_DURATION_SECONDS;
  const eased = t * t;
  pad.object3D.position.set(
    pad.fallOrigin.x + Math.cos(pad.angle) * FALL_OUTWARD_DISTANCE * eased,
    REST_HEIGHT - FALL_SINK_DEPTH * eased,
    pad.fallOrigin.z + Math.sin(pad.angle) * FALL_OUTWARD_DISTANCE * eased,
  );
  pad.object3D.rotation.x = pad.fallSpin.x * elapsed;
  pad.object3D.rotation.z = pad.fallSpin.z * elapsed;
  pad.object3D.scale.setScalar(padBaseScale(pad) * (1 - eased));
  return false;
}

// Final teardown once a fall animation (or an instant removal) has finished:
// drops the 3D model from the scene. Models are clone()d from a shared cache
// in scene.ts, so clones share geometry/material — only this pad's own
// Object3D node needs removing, never disposed.
export function removePad(pad: Pad, pondScene: PondScene): void {
  pondScene.scene.remove(pad.object3D);
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

  const clamped = clampDistance(pad.distance);
  const cutoff = cutoffForDistance(clamped);
  const pan = panForAngle(pad.angle);
  updatePadParams(pad.audioChain, cutoff, pan);

  // Pitch is read off angle (see scale.ts's frequencyForAngle) — valueNow
  // mirrors that same 0=highest..100=lowest mapping so the announced number
  // and the audible pitch move together.
  const valueNow = Math.round((1 - normalizedAngle(pad.angle)) * 100);
  const panLabel =
    pan < -0.15 ? "panned left" : pan > 0.15 ? "panned right" : "panned centre";
  pad.el.setAttribute("aria-valuenow", String(valueNow));
  pad.el.setAttribute(
    "aria-valuetext",
    `pitch ${valueNow} of 100, ${panLabel}, size ${pad.sizeLevel + 1} of ${SIZE_MULTIPLIERS.length}`,
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
    pad.object3D.scale.setScalar(padBaseScale(pad));
    pad.bobStartTime = null;
    return;
  }
  const t = elapsed / BOB_DURATION_SECONDS;
  const bump = Math.sin(t * Math.PI); // 0 -> 1 -> 0
  pad.object3D.scale.setScalar(padBaseScale(pad) * (1 + bump * (BOB_PEAK_SCALE - 1)));
}
