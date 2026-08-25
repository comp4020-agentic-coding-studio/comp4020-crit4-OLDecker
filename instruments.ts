// Maps each 3D model kind to a Web Audio synthesis voice (audio.ts) and
// lists the kinds offered in the palette (pond.ts/main.ts). Every voice still
// derives its pitch/tone from scale.ts's distance-based frequency/cutoff, so
// the pond stays "in tune" with itself regardless of which kinds are on it.
export type InstrumentKind =
  | "pad"
  | "pluck"
  | "guitar"
  | "snare"
  | "kick"
  | "woodblock"
  | "tom";

export const INSTRUMENT_FOR_MODEL: Record<string, InstrumentKind> = {
  lily_large: "pad",
  lily_small: "pluck",
  flower_purpleA: "guitar",
  mushroom_red: "snare",
  mushroom_tan: "kick",
  rock_smallFlatA: "woodblock",
  stump_round: "tom",
};

export interface AddableModel {
  key: string;
  label: string;
}

export const ADDABLE_MODELS: AddableModel[] = [
  { key: "lily_large", label: "Lily pad (pad)" },
  { key: "lily_small", label: "Small lily (pluck)" },
  { key: "flower_purpleA", label: "Flower (guitar)" },
  { key: "mushroom_red", label: "Red mushroom (snare)" },
  { key: "mushroom_tan", label: "Tan mushroom (kick)" },
  { key: "rock_smallFlatA", label: "Rock (woodblock)" },
  { key: "stump_round", label: "Stump (tom)" },
];
