import { clampDistance, MIN_DISTANCE } from "./scale";
import { WORLD_RADIUS, type PondScene } from "./scene";

const ANGLE_STEP_RADIANS = Math.PI / 12; // 15 degrees
const DISTANCE_STEP = 0.05;

// Past this raw (unclamped) distance, a released allowOverflow drag counts
// as "dragged off the pond" rather than "dragged near the rim".
export const REMOVE_DISTANCE_THRESHOLD = 1.35;

export interface PolarState {
  distance: number;
  angle: number;
}

export interface PolarPointerOptions {
  // When set, distance is only floor-clamped during drag (still MIN_DISTANCE),
  // not ceiling-clamped, so the element can visibly follow the pointer out
  // past the rim. Used by pond.ts's removable pads, not the windmill.
  allowOverflow?: boolean;
  // Fires on pointerup when allowOverflow is set, reporting whether the last
  // position was past REMOVE_DISTANCE_THRESHOLD.
  onRelease?: (state: PolarState, wasOverflowing: boolean) => void;
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
  options: PolarPointerOptions = {},
): void {
  let wasOverflowing = false;

  el.addEventListener("pointerdown", (event) => {
    el.setPointerCapture(event.pointerId);
  });

  el.addEventListener("pointermove", (event) => {
    if (!el.hasPointerCapture(event.pointerId)) return;

    const world = pondScene.screenToWorld(event.clientX, event.clientY);
    if (!world) return;

    const rawDistance = Math.hypot(world.x, world.z) / WORLD_RADIUS;
    if (options.allowOverflow) {
      state.distance = Math.max(rawDistance, MIN_DISTANCE);
      wasOverflowing = rawDistance > REMOVE_DISTANCE_THRESHOLD;
    } else {
      state.distance = clampDistance(rawDistance);
    }
    state.angle = Math.atan2(world.z, world.x);
    onChange();
  });

  el.addEventListener("pointerup", (event) => {
    el.releasePointerCapture(event.pointerId);
    if (options.allowOverflow) {
      options.onRelease?.(state, wasOverflowing);
      if (!wasOverflowing) {
        state.distance = clampDistance(state.distance);
        onChange();
      }
      wasOverflowing = false;
    }
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
