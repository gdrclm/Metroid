// Small, endlessly connected phrases; all timings use the Web Audio clock.
const themes = {
  pier: {
    bpm: 72,
    chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]],
  },
  station: {
    bpm: 68,
    chords: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]],
  },
  quarter: {
    bpm: 80,
    chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
  },
  boss: {
    bpm: 144,
    chords: [[38, 41, 45], [34, 38, 41], [31, 34, 38], [33, 37, 40]],
  },
};
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function musicBar(theme, bar) {
  const { bpm, chords } = themes[theme] || themes.pier,
    beat = 60 / bpm,
    chord = chords[bar % chords.length],
    battle = theme === "boss",
    notes = [];
  const add = (offset, midi, length, instrument, gain, pan) =>
    notes.push({
      offset: offset * beat,
      frequency: frequency(midi),
      duration: length * beat,
      instrument,
      gain,
      pan,
    });
  // Piano arpeggios connect the bars even while the violin changes bow.
  const arpeggio = [0, 1, 2, 1, 0, 2, 1, 2];
  for (let i = 0; i < 8; i++)
    add(
      i * 0.5,
      chord[arpeggio[i]] + 12,
      battle ? 0.8 : 2.2,
      "piano",
      battle ? 0.028 : 0.07,
      -0.22,
    );
  if (battle) {
    // Low, palm-muted power chords lead the mix; piano and violin add tension.
    const riff = [0, 0, null, 0, 0, null, 1, 0, 0, null, 0, 0, 3, 1, 0, null];
    riff.forEach((semitones, i) => {
      if (semitones === null) return;
      const root = chord[0] + semitones,
        length = i === 14 ? 0.9 : 0.38,
        accent = i % 4 === 0;
      add(i * 0.25, root, length, "guitar", accent ? 0.14 : 0.1, -0.45);
      add(i * 0.25, root + 7, length, "guitar", accent ? 0.1 : 0.075, 0.45);
    });
    for (let i = 0; i < 4; i++) {
      add(
        i, chord[(i + bar) % 3] + 24, 0.5, "violin", 0.03, 0.18,
      );
      add(i, chord[0] - 12, 0.96, "bass", 0.17, 0);
    }
    for (const offset of [0, 0.5, 1.5, 2, 2.5, 3.5])
      notes.push({
        offset: offset * beat, frequency: 145, to: 38,
        duration: 0.16, type: "sine", gain: 0.22,
      });
    for (const offset of [1, 3])
      add(offset, 60, 0.42, "snare", 0.14, 0.05);
    for (let i = 0; i < 8; i++)
      add(i * 0.5, 60, 0.13, "hihat", i % 2 ? 0.035 : 0.05, 0.3);
    if (bar % 2 === 0) add(0, 60, 1.8, "cymbal", 0.07, -0.25);
  } else {
    const melody = bar % 8 < 4 ? [2, 1, 0] : [1, 2, 1];
    add(0, chord[melody[0]] + 24, 2.15, "violin", 0.045, 0.2);
    add(2, chord[melody[1]] + 24, 1.15, "violin", 0.04, 0.2);
    add(3, chord[melody[2]] + 24, 1.15, "violin", 0.04, 0.2);
    add(0, chord[0] - 12, 4.2, "piano", 0.07, -0.08);
  }
  return { duration: 4 * beat, notes };
}
