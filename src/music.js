// Exploration leaves room for water, wind and the city, as in the first release.
// These are isolated phrases, not a chord progression or a metronomic loop.
const melodies = {
  pier: [[57, 52, 50], [52, 50, 45], [57, 55, 52]],
  station: [[52, 55, 50], [55, 52, 47], [52, 50, 47]],
  quarter: [[50, 53, 49], [45, 50, 48], [53, 50, 49]],
};
export const BOSS_BPM = 56;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const note = (offset, midi, duration, instrument, gain, pan = 0) => ({
  offset, frequency: frequency(midi), duration, instrument, gain, pan,
});

export function musicPhrase(theme, index, roomId = "P01") {
  if (theme === "boss") return bossPhrase(index);
  const room = Number(roomId.slice(1)) || 0,
    variant = (index + room) % 3,
    pitches = (melodies[theme] || melodies.pier)[variant],
    station = theme === "station",
    quarter = theme === "quarter",
    spacing = station ? [1.2, 9, 18.5] : quarter ? [0.7, 8, 16] : [0.8, 6.8, 14],
    notes = pitches.map((midi, i) => note(
      spacing[i] + (i ? (room % 4) * 0.45 : 0), midi,
      i === 2 ? 5.4 : 4.2,
      i === 2 && (room + index) % 2 === 0 ? "violin" : "piano",
      i === 2 ? 0.014 : 0.027,
      i === 1 ? -0.12 : 0.1,
    ));
  return { duration: (station ? 32 : quarter ? 30 : 28) + room % 3, notes };
}

function bossPhrase(index) {
  const beat = 60 / BOSS_BPM,
    root = [38, 38, 37, 34, 38, 36, 35, 37][index % 8],
    notes = [],
    second = index % 4 === 3 ? 3 : 2.65;
  // Two independent recorded guitars, slowly strummed root/fifth/octave.
  // Keep their natural pick transients, string movement and ringing sustain.
  for (const start of [0, second])
    for (const side of [-1, 1])
      [0, 7, 12].forEach((interval, string) => notes.push(note(
        start * beat + string * 0.018 + (side > 0 ? 0.014 : 0),
        root + interval,
        (start === 0 ? second + 0.2 : 4 - second + 0.15) * beat,
        "guitar", [0.13, 0.1, 0.065][string], side * 0.42,
      )));
  notes.push(note(0, root - 12, 4.15 * beat, "bass", 0.2));
  for (const start of [0, second])
    notes.push(note(start * beat, 60, 1.3, "kick", 0.42));
  notes.push(note(2 * beat + 0.012, 60, 1.7, "snare", 0.27, 0.08));
  for (let i = 0; i < 4; i++)
    notes.push(note(i * beat + 0.02, 60, 1.1, "hihat", i % 2 ? 0.06 : 0.08, 0.3));
  if (index % 2 === 0)
    notes.push(note(0.025, 60, 5.5, "cymbal", 0.18, -0.22));
  return { duration: 4 * beat, notes };
}
