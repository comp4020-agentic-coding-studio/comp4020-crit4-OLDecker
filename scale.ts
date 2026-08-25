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
const MAX_DELAY_FRACTION = 0.45; // fraction of the current pulse interval
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

// 0 at angle 0, sweeping up through 1 all the way round to (just short of)
// angle 2π again.
export function normalizedAngle(angleRadians: number): number {
  const twoPi = Math.PI * 2;
  return (((angleRadians % twoPi) + twoPi) % twoPi) / twoPi;
}

// Pitch comes from where a pad sits around the ring, not how far out it is —
// same quantization/order as frequencyForDistance (0 -> highest, 1 -> lowest)
// so going around the pond still sweeps through the scale the same way
// moving out from the centre used to.
export function frequencyForAngle(angleRadians: number): number {
  const index = Math.round((1 - normalizedAngle(angleRadians)) * (SCALE_FREQUENCIES.length - 1));
  return SCALE_FREQUENCIES[index];
}

// The ripple takes longer to reach a pad that's farther from the centre.
// Returned as a fraction of the current pulse interval (not absolute
// seconds) so ripple timing scales automatically as wind speed changes the
// tempo — an absolute delay could otherwise exceed a shortened interval and
// pile notes onto the next pulse.
export function delayFractionForDistance(distance: number): number {
  return distance * MAX_DELAY_FRACTION;
}

// Closer pads ring brighter; farther pads sound warmer/more muffled.
export function cutoffForDistance(distance: number): number {
  return MAX_CUTOFF_HZ - distance * (MAX_CUTOFF_HZ - MIN_CUTOFF_HZ);
}

export function panForAngle(angleRadians: number): number {
  return Math.sin(angleRadians);
}
