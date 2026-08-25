import {
  createPadAudioChain,
  updatePadParams,
  type PadAudioChain,
} from "./audio";
import { clampDistance, cutoffForDistance, panForAngle } from "./scale";

export interface Pad {
  distance: number; // normalized 0 (centre) .. 1 (edge)
  angle: number; // radians
  el: HTMLButtonElement;
  audioChain: PadAudioChain;
  nextTriggerTime: number | null;
  triggered: boolean;
}

const RADIUS_PERCENT = 42; // leaves margin so a pad never clips the pond's edge
const ANGLE_STEP_RADIANS = Math.PI / 12; // 15 degrees
const DISTANCE_STEP = 0.05;

// The pond's lily pads are authored as real <button> elements in index.html
// (not created here) so the spec's static structural check — a real,
// keyboard/touch-operable control inside <main> — holds even before this
// script runs. This function reads their starting position off data
// attributes and wires up the interaction.
export function createPond(pond: HTMLElement, ctx: AudioContext): Pad[] {
  const buttons = Array.from(
    pond.querySelectorAll<HTMLButtonElement>(".lily-pad"),
  );

  return buttons.map((el) => {
    const distance = clampDistance(Number(el.dataset.distance));
    const angle = (Number(el.dataset.angle) * Math.PI) / 180;

    const pad: Pad = {
      distance,
      angle,
      el,
      audioChain: createPadAudioChain(ctx),
      nextTriggerTime: null,
      triggered: false,
    };

    attachPointerHandlers(pad, pond);
    attachKeyboardHandlers(pad);
    renderPad(pad);
    return pad;
  });
}

export function renderPad(pad: Pad): void {
  const offsetPercent = pad.distance * RADIUS_PERCENT;
  const x = 50 + offsetPercent * Math.cos(pad.angle);
  const y = 50 + offsetPercent * Math.sin(pad.angle);
  pad.el.style.left = `${x}%`;
  pad.el.style.top = `${y}%`;

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

function attachPointerHandlers(pad: Pad, pond: HTMLElement): void {
  pad.el.addEventListener("pointerdown", (event) => {
    pad.el.setPointerCapture(event.pointerId);
  });

  pad.el.addEventListener("pointermove", (event) => {
    if (!pad.el.hasPointerCapture(event.pointerId)) return;

    const rect = pond.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const maxRadius = (Math.min(rect.width, rect.height) * RADIUS_PERCENT) / 100;

    pad.distance = clampDistance(Math.hypot(dx, dy) / maxRadius);
    pad.angle = Math.atan2(dy, dx);
    renderPad(pad);
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
    renderPad(pad);
  });
}
