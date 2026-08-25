// Pure math: no DOM, no Web Audio. A pentatonic scale means every pad
// position is "in tune" — that's what makes the pond fail-state-free, not
// just a design nicety.

const ROOT_FREQUENCY_HZ = 261.63; // C4
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9, 12, 14];

export const PAD_COUNT = PENTATONIC_SEMITONES.length;

export const SCALE_FREQUENCIES = PENTATONIC_SEMITONES.map(
  (semitones) => ROOT_FREQUENCY_HZ * 2 ** (semitones / 12),
);

export const MIN_DISTANCE = 0.12;
const MAX_DELAY_SECONDS = 1.4;
const MIN_CUTOFF_HZ = 500;
const MAX_CUTOFF_HZ = 5000;

export function clampDistance(distance: number): number {
  return Math.min(1, Math.max(MIN_DISTANCE, distance));
}

// Closer to the centre (distance near 0) is higher-pitched; farther out is lower.
export function frequencyForDistance(distance: number): number {
  const index = Math.round((1 - distance) * (SCALE_FREQUENCIES.length - 1));
  return SCALE_FREQUENCIES[index];
}

// The ripple takes longer to reach a pad that's farther from the centre.
export function delayForDistance(distance: number): number {
  return distance * MAX_DELAY_SECONDS;
}

// Closer pads ring brighter; farther pads sound warmer/more muffled.
export function cutoffForDistance(distance: number): number {
  return MAX_CUTOFF_HZ - distance * (MAX_CUTOFF_HZ - MIN_CUTOFF_HZ);
}

export function panForAngle(angleRadians: number): number {
  return Math.sin(angleRadians);
}
