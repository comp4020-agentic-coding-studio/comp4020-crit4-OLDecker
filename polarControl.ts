import { clampDistance } from "./scale";
import { WORLD_RADIUS, type PondScene } from "./scene";

const ANGLE_STEP_RADIANS = Math.PI / 12; // 15 degrees
const DISTANCE_STEP = 0.05;

export interface PolarState {
  distance: number;
  angle: number;
}

// Shared drag/keyboard interaction for anything positioned in the pond's
// polar coordinate space (lily pads, the windmill): drag raycasts the
// pointer against the ground plane and converts the hit to polar
// {distance, angle}; arrow keys nudge the same two values directly.
// `onChange` re-runs the caller's own state-apply step (position, aria
// text, audio params...) after distance/angle are updated in place.
export function attachPolarPointerHandlers(
  el: HTMLElement,
  pondScene: PondScene,
  state: PolarState,
  onChange: () => void,
): void {
  el.addEventListener("pointerdown", (event) => {
    el.setPointerCapture(event.pointerId);
  });

  el.addEventListener("pointermove", (event) => {
    if (!el.hasPointerCapture(event.pointerId)) return;

    const world = pondScene.screenToWorld(event.clientX, event.clientY);
    if (!world) return;

    state.distance = clampDistance(Math.hypot(world.x, world.z) / WORLD_RADIUS);
    state.angle = Math.atan2(world.z, world.x);
    onChange();
  });

  el.addEventListener("pointerup", (event) => {
    el.releasePointerCapture(event.pointerId);
  });
}

export function attachPolarKeyboardHandlers(
  el: HTMLElement,
  state: PolarState,
  onChange: () => void,
): void {
  el.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowLeft":
        state.angle -= ANGLE_STEP_RADIANS;
        break;
      case "ArrowRight":
        state.angle += ANGLE_STEP_RADIANS;
        break;
      case "ArrowUp":
        state.distance = clampDistance(state.distance - DISTANCE_STEP);
        break;
      case "ArrowDown":
        state.distance = clampDistance(state.distance + DISTANCE_STEP);
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange();
  });
}
