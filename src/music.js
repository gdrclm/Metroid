// Few changes of pitch, with a continuous, quiet legato underneath.
const melodies = {
  pier: [[57, 52, 50], [52, 50, 45], [57, 55, 52]],
  station: [[52, 55, 50], [55, 52, 47], [52, 50, 47]],
  quarter: [[50, 53, 49], [45, 50, 48], [53, 50, 49]],
};
export const BOSS_BPM = 12;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const note = (offset, midi, duration, instrument, gain, pan = 0, sustain = false) => ({
  offset, frequency: frequency(midi), duration, instrument, gain, pan, sustain,
});

export function musicPhrase(theme, index, roomId = "P01") {
  if (theme === "boss") return bossPhrase(index);
  if (theme === "lift") return liftPhrase();
  const room = Number(roomId.slice(1)) || 0,
    pitches = (melodies[theme] || melodies.pier)[(index + room) % 3],
    duration = (theme === "station" ? 36 : theme === "quarter" ? 34 : 33) + room % 3,
    step = duration / 3,
    notes = pitches.map((midi, i) => note(
      i * step, midi - 12, step + 3.5,
      "violin", theme === "station" ? 0.016 : 0.013, i % 2 ? -0.1 : 0.1, true,
    ));
  // Isolated piano notes sit inside the same composition; the held line never
  // falls silent between them or at the phrase boundary.
  notes.push(note(1.5, pitches[0], 7, "piano", 0.018, -0.1));
  notes.push(note(step * 1.8, pitches[2], 8, "piano", 0.014, 0.1));
  return { duration, notes };
}

function bossPhrase(index) {
  const beat = 60 / BOSS_BPM,
    duration = 4 * beat,
    root = [38, 38, 37, 37, 34, 34, 36, 36][index % 8],
    notes = [];
  // A single, drawn-out chord every twenty seconds. No second strum or fast
  // turnaround: the recordings themselves have been stretched without repitching.
  for (const side of [-1, 1])
    [0, 7, 12].forEach((interval, string) => notes.push(note(
      string * 0.12 + (side > 0 ? 0.08 : 0), root + interval,
      duration + 2.4, "guitar", [0.14, 0.1, 0.065][string], side * 0.42, true,
    )));
  notes.push(note(0, root - 12, duration + 2.8, "bass", 0.21, 0, true));
  notes.push(note(0.1, 60, 1.5, "kick", 0.3));
  if (index % 2 === 0)
    notes.push(note(2 * beat, 60, 1.8, "snare", 0.12, 0.08));
  if (index % 4 === 0)
    notes.push(note(0.3, 60, 6, "cymbal", 0.08, -0.2));
  return { duration, notes };
}

function liftPhrase() {
  const pitches = [60, 64, 67, 72, 71, 67, 64, 67],
    notes = pitches.map((midi, i) => note(
      i * 0.21, midi, 0.38, "piano", i % 2 ? 0.04 : 0.05, i % 2 ? 0.12 : -0.12,
    ));
  notes.push(note(0, 48, 0.7, "piano", 0.035));
  notes.push(note(0.84, 55, 0.7, "piano", 0.03));
  return { duration: 4, notes };
}
