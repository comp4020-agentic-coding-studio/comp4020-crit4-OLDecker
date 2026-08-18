import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// crit 4 — "An instrument": https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/04-instrument/
//
// Most of this week's spec is judged live by a pod playing the page cold —
// expressiveness, whether a stranger finds the first sound uninstructed,
// whether there's a fail state — none of that is testable statically. These
// two lines have a real structural contract, so they're asserted here.

const doc = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8")).window
  .document;

describe("crit 4: an instrument", () => {
  it("makes sound live in the page rather than playing back a recording", () => {
    const playback = doc.querySelectorAll("main audio, main video");
    expect(
      playback.length,
      "found a static <audio>/<video> element in the instrument — sound should come from the Web Audio API responding to the player, not a pre-recorded file",
    ).toBe(0);
  });

  it("exposes at least one control a keyboard or touch user can operate, not mouse-only", () => {
    const controls = doc.querySelectorAll(
      'main button, main input, main [role="button"], main [tabindex]',
    );
    expect(
      controls.length,
      "no focusable control found in the instrument — a mouse-only surface (e.g. a bare <canvas> with only mousedown listeners) locks out keyboard and screen-reader users",
    ).toBeGreaterThan(0);
  });
});
