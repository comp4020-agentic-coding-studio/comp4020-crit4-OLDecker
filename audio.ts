export interface PadAudioChain {
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
}

const ATTACK_SECONDS = 0.02;
const DECAY_SECONDS = 0.6;
const PEAK_GAIN = 0.35;

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

// The context starts suspended per the browser's autoplay policy; this must
// be called synchronously inside a real user-gesture handler.
export function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    return ctx.resume();
  }
  return Promise.resolve();
}

export function createPadAudioChain(ctx: AudioContext): PadAudioChain {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  filter.connect(panner);
  panner.connect(ctx.destination);

  return { filter, panner };
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

// Oscillators are single-use, so a fresh one is created per note and torn
// down after its envelope decays.
export function triggerPadNote(
  ctx: AudioContext,
  chain: PadAudioChain,
  frequency: number,
  time: number,
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(PEAK_GAIN, time + ATTACK_SECONDS);
  envelope.gain.exponentialRampToValueAtTime(
    0.0001,
    time + ATTACK_SECONDS + DECAY_SECONDS,
  );

  oscillator.connect(envelope);
  envelope.connect(chain.filter);

  oscillator.start(time);
  oscillator.stop(time + ATTACK_SECONDS + DECAY_SECONDS + 0.05);
}
