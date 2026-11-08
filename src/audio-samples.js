// Recorded instruments, bundled locally. Sources, processing and CC0 license:
// assets/audio/sources.json and assets/audio/CC0-1.0.txt.
export const BOSS_SAMPLES = [
  { id: "guitar-left-e", instrument: "guitar", midi: 40, side: -1 },
  { id: "guitar-left-a", instrument: "guitar", midi: 45, side: -1 },
  { id: "guitar-right-e", instrument: "guitar", midi: 40, side: 1 },
  { id: "guitar-right-a", instrument: "guitar", midi: 45, side: 1 },
  { id: "bass-e", instrument: "bass", midi: 28 },
  { id: "kick", instrument: "kick" },
  { id: "snare", instrument: "snare" },
  { id: "hat", instrument: "hihat" },
  { id: "crash", instrument: "cymbal" },
];
export const RECORDED_INSTRUMENTS = new Set(BOSS_SAMPLES.map((s) => s.instrument));
