import { getAudioContext, resumeAudio, triggerPadNote } from "./audio";
import {
  addPad,
  createPond,
  removePad,
  syncPadScreenPosition,
  triggerBob,
  updateBobAnimation,
  type Pad,
} from "./pond";
import { BUTTON_ZOOM_STEP, createPondScene } from "./scene";
import { clampDistance, delayFractionForDistance, frequencyForDistance } from "./scale";
import {
  createWindmill,
  getWindSpeedMultiplier,
  syncWindmillScreenPosition,
  updateWindmillSpin,
} from "./windmill";

const BASE_PULSE_INTERVAL_SECONDS = 3.2;
const RIPPLE_LOOKAHEAD_SECONDS = 0.1;

const pond = document.querySelector<HTMLElement>("#pond");
const ripple = document.querySelector<HTMLElement>(".ripple");
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
const paletteButtons = document.querySelectorAll<HTMLButtonElement>(".palette-button");

if (pond) {
  const ctx = getAudioContext();
  const pondScene = await createPondScene(pond);

  let pads: Pad[] = [];
  const handlePadRemoved = (pad: Pad): void => {
    removePad(pad, pondScene);
    pads = pads.filter((existing) => existing !== pad);
  };
  pads = await createPond(pond, ctx, pondScene, handlePadRemoved);
  const windmill = await createWindmill(pond, pondScene);

  let started = false;
  let nextPulseTime = 0;
  let lastTickTime = ctx.currentTime;

  const start = (): void => {
    if (started) return;
    started = true;
    void resumeAudio();
    nextPulseTime = ctx.currentTime + 0.2;
    requestAnimationFrame(tick);
  };

  // Either a drag anywhere on the pond, or tabbing/arrow-keying into a pad,
  // counts as the user gesture that's allowed to resume the audio context.
  pond.addEventListener("pointerdown", start);
  pond.addEventListener("keydown", start);

  zoomInButton?.addEventListener("click", () => pondScene.zoomBy(-BUTTON_ZOOM_STEP));
  zoomOutButton?.addEventListener("click", () => pondScene.zoomBy(BUTTON_ZOOM_STEP));

  for (const button of paletteButtons) {
    button.addEventListener("click", () => {
      start();
      const modelKey = button.dataset.model;
      if (!modelKey) return;
      void addPad(pond, ctx, pondScene, modelKey, handlePadRemoved).then((pad) => {
        pads.push(pad);
      });
    });
  }

  function triggerRipple(): void {
    if (!ripple) return;
    ripple.classList.remove("ripple-pulse");
    void ripple.offsetWidth; // force reflow so the animation restarts
    ripple.classList.add("ripple-pulse");
  }

  function tick(): void {
    const now = ctx.currentTime;
    const dt = now - lastTickTime;
    lastTickTime = now;

    if (now >= nextPulseTime - RIPPLE_LOOKAHEAD_SECONDS) {
      triggerRipple();
      const interval = BASE_PULSE_INTERVAL_SECONDS / getWindSpeedMultiplier(windmill.distance);
      for (const pad of pads) {
        // Clamp: mid-drag past the rim (removal gesture) a pad's raw distance
        // can exceed 1, which would index off the end of the pentatonic scale.
        const distance = clampDistance(pad.distance);
        const triggerTime =
          nextPulseTime + delayFractionForDistance(distance) * interval;
        triggerPadNote(
          ctx,
          pad.audioChain,
          frequencyForDistance(distance),
          triggerTime,
        );
        pad.nextTriggerTime = triggerTime;
        pad.triggered = false;
      }
      nextPulseTime += interval;
    }

    for (const pad of pads) {
      if (
        pad.nextTriggerTime !== null &&
        !pad.triggered &&
        now >= pad.nextTriggerTime
      ) {
        pad.triggered = true;
        triggerBob(pad, now);
      }
      updateBobAnimation(pad, now);
      syncPadScreenPosition(pad, pondScene);
    }

    updateWindmillSpin(windmill, dt);
    syncWindmillScreenPosition(windmill, pondScene);

    pondScene.render();
    requestAnimationFrame(tick);
  }

  // Render at least one frame immediately so the scene and pad positions are
  // visible before the first user gesture starts the audio-driven tick loop.
  for (const pad of pads) {
    syncPadScreenPosition(pad, pondScene);
  }
  syncWindmillScreenPosition(windmill, pondScene);
  pondScene.render();
}
