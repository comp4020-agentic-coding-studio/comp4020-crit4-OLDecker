import type { InstrumentKind } from "./instruments";

export interface PadAudioChain {
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  instrument: InstrumentKind;
}

const PEAK_GAIN = 0.35;

let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

// The context starts suspended per the browser's autoplay policy; this must
// be called synchronously inside a real user-gesture handler. Checking for
// anything other than "running" (rather than specifically "suspended")
// matters on iOS Safari, which also has its own non-standard "interrupted"
// state after the tab is backgrounded or the browser is closed and reopened
// — ctx.currentTime freezes in that state too, which stalls the whole tick
// loop (ripple, windmill spin, bobbing), not just sound.
export function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state !== "running") {
    return ctx.resume();
  }
  return Promise.resolve();
}

export function createPadAudioChain(
  ctx: AudioContext,
  instrument: InstrumentKind,
): PadAudioChain {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  filter.connect(panner);
  panner.connect(ctx.destination);

  return { filter, panner, instrument };
}

// Filter and panner are persistent per pad — this previews a drag/keyboard
// move live, rather than waiting for the next pulse to hear the change.
export function updatePadParams(
  chain: PadAudioChain,
  cutoffHz: number,
  pan: number,
): void {
  chain.filter.frequency.value = cutoffHz;
  chain.panner.pan.value = pan;
}

// Generated once and shared by every snare hit; AudioBufferSourceNodes
// themselves are still single-use, so each trigger gets its own source
// wrapping this same buffer.
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const durationSeconds = 0.3;
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * durationSeconds),
    ctx.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function envelopeGain(
  ctx: AudioContext,
  time: number,
  attackSeconds: number,
  decaySeconds: number,
  peak: number,
): GainNode {
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(peak, time + attackSeconds);
  envelope.gain.exponentialRampToValueAtTime(
    0.0001,
    time + attackSeconds + decaySeconds,
  );
  return envelope;
}

function playTone(
  ctx: AudioContext,
  destination: AudioNode,
  type: OscillatorType,
  frequency: number,
  time: number,
  attackSeconds: number,
  decaySeconds: number,
  peak: number,
  detuneCents = 0,
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detuneCents;

  const envelope = envelopeGain(ctx, time, attackSeconds, decaySeconds, peak);
  oscillator.connect(envelope);
  envelope.connect(destination);

  oscillator.start(time);
  oscillator.stop(time + attackSeconds + decaySeconds + 0.05);
}

// Fast downward pitch sweep — the shared shape behind the kick (short) and
// tom (longer, lower) voices.
function playThump(
  ctx: AudioContext,
  destination: AudioNode,
  startFrequency: number,
  time: number,
  decaySeconds: number,
  peak: number,
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  const sweepSeconds = Math.min(0.08, decaySeconds);
  oscillator.frequency.setValueAtTime(startFrequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(startFrequency * 0.4, 20),
    time + sweepSeconds,
  );

  const envelope = envelopeGain(ctx, time, 0.005, decaySeconds, peak);
  oscillator.connect(envelope);
  envelope.connect(destination);

  oscillator.start(time);
  oscillator.stop(time + decaySeconds + 0.05);
}

// Filtered noise burst — the snare voice, using the shared buffer above.
function playNoiseBurst(
  ctx: AudioContext,
  destination: AudioNode,
  centreFrequency: number,
  time: number,
  decaySeconds: number,
  peak: number,
): void {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = centreFrequency;
  bandpass.Q.value = 0.9;

  const envelope = envelopeGain(ctx, time, 0.002, decaySeconds, peak);
  source.connect(bandpass);
  bandpass.connect(envelope);
  envelope.connect(destination);

  source.start(time);
  source.stop(time + decaySeconds + 0.05);
}

// Oscillators (and buffer sources) are single-use, so a fresh one is built
// per note. Every voice still routes through chain.filter, so distance-based
// cutoff and angle-based pan (updatePadParams) shape every instrument kind
// the same way.
export function triggerPadNote(
  ctx: AudioContext,
  chain: PadAudioChain,
  frequency: number,
  time: number,
  gainMultiplier = 1,
): void {
  const dest = chain.filter;
  switch (chain.instrument) {
    case "pad":
      playTone(ctx, dest, "sine", frequency, time, 0.02, 0.6, PEAK_GAIN * gainMultiplier);
      break;
    case "pluck":
      playTone(ctx, dest, "triangle", frequency, time, 0.005, 0.25, 0.4 * gainMultiplier);
      break;
    case "guitar":
      // Two detuned layers, one an octave down, read as a plucked string
      // rather than a pure tone.
      playTone(ctx, dest, "triangle", frequency, time, 0.004, 0.4, 0.3 * gainMultiplier, -6);
      playTone(ctx, dest, "sawtooth", frequency / 2, time, 0.004, 0.4, 0.18 * gainMultiplier, 6);
      break;
    case "snare":
      playNoiseBurst(ctx, dest, frequency, time, 0.15, 0.5 * gainMultiplier);
      break;
    case "kick":
      playThump(ctx, dest, frequency * 0.6, time, 0.2, 0.55 * gainMultiplier);
      break;
    case "woodblock":
      playTone(ctx, dest, "square", frequency * 1.5, time, 0.002, 0.08, 0.25 * gainMultiplier);
      break;
    case "tom":
      playThump(ctx, dest, frequency * 0.4, time, 0.45, 0.5 * gainMultiplier);
      break;
  }
}
