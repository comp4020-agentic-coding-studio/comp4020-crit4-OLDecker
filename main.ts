import { getAudioContext, resumeAudio, triggerPadNote } from "./audio";
import {
  addPad,
  applyPadState,
  beginPadFall,
  createPond,
  removePad,
  sizeMultiplierFor,
  syncPadScreenPosition,
  triggerBob,
  updateBobAnimation,
  updateFallAnimation,
  type Pad,
} from "./pond";
import { BUTTON_ZOOM_STEP, createPondScene, WORLD_RADIUS } from "./scene";
import { clampDistance, delayFractionForDistance, frequencyForAngle } from "./scale";
import {
  createWindmill,
  getWindSpeedMultiplier,
  syncWindmillScreenPosition,
  updateWindmillSpin,
} from "./windmill";

// At the windmill's default position (multiplier ~1.4) this lands just
// under a beat per second; at full wind (multiplier 2.2) pulses come
// roughly every 0.8s, fast enough to read as an ongoing rhythm rather than
// a sequence of isolated pings.
const BASE_PULSE_INTERVAL_SECONDS = 1.8;
const RIPPLE_LOOKAHEAD_SECONDS = 0.1;

// iOS Safari (and any browser shell on iOS, since they all wrap WebKit)
// silently mutes WebAudio output when the phone's hardware silent switch is
// on — the AudioContext still reports "running" and every node still fires,
// there's just no sound. There is no web API that exposes the switch's
// state, so this can't be detected directly; it's inferred from the
// platform, since iOS is the only place this failure mode exists at all.
// iPadOS 13+ reports its userAgent as a plain Mac, unlike a real Mac it
// exposes multiple touch points, which is the standard way to tell them
// apart.
function isIOS(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const SILENT_MODE_NOTICE_DELAY_MS = 1500;
const SILENT_MODE_NOTICE_VISIBLE_MS = 4500;
// Matches the CSS transition duration on .silent-mode-notice, so `hidden`
// isn't set until the fade-out has actually finished playing.
const SILENT_MODE_NOTICE_FADE_MS = 400;

const pond = document.querySelector<HTMLElement>("#pond");
const ripple = document.querySelector<HTMLElement>(".ripple");
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
const paletteButtons = document.querySelectorAll<HTMLButtonElement>(".palette-button");
const silentModeNotice = document.querySelector<HTMLElement>("#silent-mode-notice");
const silentModeDismiss = document.querySelector<HTMLButtonElement>(".silent-mode-dismiss");

function dismissSilentModeNotice(): void {
  if (!silentModeNotice || silentModeNotice.hidden) return;
  silentModeNotice.classList.add("silent-mode-notice-fade");
  window.setTimeout(() => {
    silentModeNotice.hidden = true;
    silentModeNotice.classList.remove("silent-mode-notice-fade");
  }, SILENT_MODE_NOTICE_FADE_MS);
}

silentModeDismiss?.addEventListener("click", dismissSilentModeNotice);

if (pond) {
  // A separate non-null binding: TS doesn't retain the `if (pond)` narrowing
  // of the outer `const pond` inside nested function declarations below.
  const pondEl = pond;
  const ctx = getAudioContext();
  const pondScene = await createPondScene(pond);

  let pads: Pad[] = [];
  // The pad stays in the `pads` array, mid-fall, until tick()'s animation
  // loop reports it finished — only then is it actually torn down and
  // filtered out, so the ragdoll tumble has time to play out.
  const handlePadRemoved = (pad: Pad): void => {
    beginPadFall(pad, ctx.currentTime);
  };
  pads = await createPond(pond, ctx, pondScene, handlePadRemoved);

  let paused = false;
  const pondStatus = document.querySelector<HTMLElement>("#pond-status");
  const windmill = await createWindmill(pond, pondScene, () => {
    paused = !paused;
    windmill.el.classList.toggle("wind-control-paused", paused);
    if (pondStatus) pondStatus.textContent = paused ? "Melody paused." : "Melody resumed.";
  });

  let started = false;
  let nextPulseTime = 0;
  let lastTickTime = ctx.currentTime;

  const start = (): void => {
    // Retried on every gesture, not just the first: some mobile browsers
    // reject resume() on a gesture type they don't treat as a "real"
    // activation, so the first call can silently no-op. resumeAudio() itself
    // is a no-op once the context is already running, so this stays cheap.
    resumeAudio().catch(() => {});
    if (started) return;
    started = true;
    // Delayed rather than immediate so it reads as "you should have heard
    // something by now" instead of appearing before the first pulse has
    // even had a chance to play. Fades itself out shortly after — a cute,
    // easy-to-miss hint rather than a banner demanding to be dismissed.
    if (isIOS() && silentModeNotice) {
      window.setTimeout(() => {
        silentModeNotice.hidden = false;
        window.setTimeout(dismissSilentModeNotice, SILENT_MODE_NOTICE_VISIBLE_MS);
      }, SILENT_MODE_NOTICE_DELAY_MS);
    }
    nextPulseTime = ctx.currentTime + 0.2;
    requestAnimationFrame(tick);
  };

  // pointerdown/keydown give instant feedback on desktop, but mobile Safari
  // in particular does not reliably treat pointerdown as a "real" user
  // gesture for unlocking AudioContext.resume() — click is the one event
  // type every browser (including old WebKit) honours, and a tap on a touch
  // device synthesises one after touchend. Registering both means desktop
  // gets the instant pointerdown response while mobile still gets a gesture
  // click will accept even if pointerdown's resume() silently no-ops.
  pond.addEventListener("pointerdown", start);
  pond.addEventListener("click", start);
  pond.addEventListener("keydown", start);

  // iOS Safari drops the AudioContext into its own non-standard "interrupted"
  // state when the tab is backgrounded or the browser is closed and reopened
  // (see resumeAudio's comment) — ctx.currentTime freezes, which stalls the
  // whole tick loop, not just sound. visibilitychange (unlike the tap-to-start
  // gesture handlers above) isn't a user gesture, but iOS accepts resume()
  // here anyway once a context has already been running before. Resetting
  // lastTickTime/nextPulseTime avoids a single huge dt/overdue-pulse spike
  // from however long the tab was hidden.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !started) return;
    resumeAudio()
      .then(() => {
        lastTickTime = ctx.currentTime;
        nextPulseTime = ctx.currentTime + 0.2;
      })
      .catch(() => {});
  });

  zoomInButton?.addEventListener("click", () => pondScene.zoomBy(-BUTTON_ZOOM_STEP));
  zoomOutButton?.addEventListener("click", () => pondScene.zoomBy(BUTTON_ZOOM_STEP));

  // Palette buttons add a pad two ways: a plain click/tap adds at a rotating
  // spawn position (addPad's default), while a drag lets the user place the
  // new pad exactly where they drop it on the pond. Both live here rather
  // than as native HTML5 drag-and-drop so touch works identically to mouse
  // and the drop target can be validated against the pond's actual disc
  // (screenToWorld + WORLD_RADIUS), not just its rectangular container.
  const DRAG_START_THRESHOLD_PX = 6;

  interface PaletteDrag {
    pointerId: number;
    modelKey: string;
    icon: string;
    startX: number;
    startY: number;
    dragging: boolean;
    ghost: HTMLDivElement | null;
  }

  let activeDrag: PaletteDrag | null = null;
  // Set right before a completed drag's synthesized click would fire, so
  // that click doesn't also add a second pad. Cleared on a timer rather than
  // in the click handler itself, since a drag that ends off any button never
  // gets a click to consume the flag.
  let dragHandled = false;

  function positionGhost(ghost: HTMLDivElement, clientX: number, clientY: number): void {
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY}px`;
  }

  // Valid only when the drop is both inside the pond's element and on its
  // actual circular disc — the container is a wider rectangle than the
  // pond's world-space circle, so a rect-only check would accept drops in
  // the corners that land off the water entirely.
  function dropWorldPosition(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = pondEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    const world = pondScene.screenToWorld(clientX, clientY);
    if (!world) return null;
    const rawDistance = Math.hypot(world.x, world.z) / WORLD_RADIUS;
    return rawDistance <= 1 ? world : null;
  }

  for (const button of paletteButtons) {
    const icon = button.querySelector<HTMLElement>(".palette-icon")?.textContent ?? "";

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      // Without this, a real click-drag over the button's emoji/text can
      // arm the browser's own native text-selection/drag gesture, which
      // then swallows the pointermove stream below before our own drag
      // (and its ghost) ever gets a chance to start.
      event.preventDefault();
      activeDrag = {
        pointerId: event.pointerId,
        modelKey: button.dataset.model ?? "",
        icon,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        ghost: null,
      };
    });

    button.addEventListener("click", () => {
      if (dragHandled) return;
      start();
      const modelKey = button.dataset.model;
      if (!modelKey) return;
      void addPad(pond, ctx, pondScene, modelKey, handlePadRemoved).then((pad) => {
        pads.push(pad);
      });
    });
  }

  window.addEventListener("pointermove", (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const drag = activeDrag;
    if (!drag.dragging) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved < DRAG_START_THRESHOLD_PX) return;
      drag.dragging = true;
      const ghost = document.createElement("div");
      ghost.className = "palette-ghost";
      ghost.textContent = drag.icon;
      ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    event.preventDefault();
    if (drag.ghost) positionGhost(drag.ghost, event.clientX, event.clientY);
    pondEl.classList.toggle("pond-drop-target", dropWorldPosition(event.clientX, event.clientY) !== null);
  });

  window.addEventListener("pointerup", (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const drag = activeDrag;
    activeDrag = null;
    pondEl.classList.remove("pond-drop-target");
    if (!drag.dragging) return; // a plain tap: the button's own click handler adds the pad

    dragHandled = true;
    setTimeout(() => {
      dragHandled = false;
    }, 0);

    const world = dropWorldPosition(event.clientX, event.clientY);
    if (world) {
      drag.ghost?.remove();
      start();
      void addPad(pond, ctx, pondScene, drag.modelKey, handlePadRemoved).then((pad) => {
        pad.distance = clampDistance(Math.hypot(world.x, world.z) / WORLD_RADIUS);
        pad.angle = Math.atan2(world.z, world.x);
        applyPadState(pad);
        syncPadScreenPosition(pad, pondScene);
        pads.push(pad);
      });
    } else if (drag.ghost) {
      // Dropped off the pond entirely: let it tumble away, like it's fallen
      // off the edge of the little world it lives on, rather than just
      // vanishing.
      const ghost = drag.ghost;
      ghost.classList.add("palette-ghost-falling");
      ghost.addEventListener("animationend", () => ghost.remove(), { once: true });
    }
  });

  window.addEventListener("pointercancel", (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    activeDrag.ghost?.remove();
    activeDrag = null;
    pondEl.classList.remove("pond-drop-target");
  });

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

    if (!paused && now >= nextPulseTime - RIPPLE_LOOKAHEAD_SECONDS) {
      triggerRipple();
      const interval = BASE_PULSE_INTERVAL_SECONDS / getWindSpeedMultiplier(windmill.distance);
      for (const pad of pads) {
        if (pad.fallStartTime !== null) continue; // falling pads don't schedule notes
        // Clamp: mid-drag past the rim (removal gesture) a pad's raw distance
        // can exceed 1, which would index off the end of the pentatonic scale.
        const distance = clampDistance(pad.distance);
        const triggerTime =
          nextPulseTime + delayFractionForDistance(distance) * interval;
        triggerPadNote(
          ctx,
          pad.audioChain,
          frequencyForAngle(pad.angle),
          triggerTime,
          sizeMultiplierFor(pad),
        );
        pad.nextTriggerTime = triggerTime;
        pad.triggered = false;
      }
      nextPulseTime += interval;
    }

    // Collected rather than filtered in place: mutating `pads` mid-loop would
    // skip/duplicate iteration.
    const finishedFalling: Pad[] = [];
    for (const pad of pads) {
      if (pad.fallStartTime !== null) {
        if (updateFallAnimation(pad, now)) finishedFalling.push(pad);
        continue;
      }
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
    if (finishedFalling.length > 0) {
      for (const pad of finishedFalling) removePad(pad, pondScene);
      pads = pads.filter((pad) => !finishedFalling.includes(pad));
    }

    if (!paused) updateWindmillSpin(windmill, dt);
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
