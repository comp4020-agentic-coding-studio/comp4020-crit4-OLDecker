import { getAudioContext, resumeAudio, triggerPadNote } from "./audio";
import { createPond, type Pad } from "./pond";
import { delayForDistance, frequencyForDistance } from "./scale";

const PULSE_INTERVAL_SECONDS = 3.2;
const RIPPLE_LOOKAHEAD_SECONDS = 0.1;

const pond = document.querySelector<HTMLElement>("#pond");
const ripple = document.querySelector<HTMLElement>(".ripple");

if (pond) {
  const ctx = getAudioContext();
  const pads = createPond(pond, ctx);

  let started = false;
  let nextPulseTime = 0;

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

  function triggerRipple(): void {
    if (!ripple) return;
    ripple.classList.remove("ripple-pulse");
    void ripple.offsetWidth; // force reflow so the animation restarts
    ripple.classList.add("ripple-pulse");
  }

  function bob(pad: Pad): void {
    pad.el.classList.remove("lily-pad-active");
    void pad.el.offsetWidth;
    pad.el.classList.add("lily-pad-active");
  }

  function tick(): void {
    const now = ctx.currentTime;

    if (now >= nextPulseTime - RIPPLE_LOOKAHEAD_SECONDS) {
      triggerRipple();
      for (const pad of pads) {
        const triggerTime = nextPulseTime + delayForDistance(pad.distance);
        triggerPadNote(
          ctx,
          pad.audioChain,
          frequencyForDistance(pad.distance),
          triggerTime,
        );
        pad.nextTriggerTime = triggerTime;
        pad.triggered = false;
      }
      nextPulseTime += PULSE_INTERVAL_SECONDS;
    }

    for (const pad of pads) {
      if (
        pad.nextTriggerTime !== null &&
        !pad.triggered &&
        now >= pad.nextTriggerTime
      ) {
        pad.triggered = true;
        bob(pad);
      }
    }

    requestAnimationFrame(tick);
  }
}
