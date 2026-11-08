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
  for (let i = 0; i < (battle ? 16 : 8); i++)
    add(
      i * (battle ? 0.25 : 0.5),
      chord[arpeggio[i % 8]] + 12 + (battle && i % 4 === 3 ? 12 : 0),
      battle ? 1.1 : 2.2,
      "piano",
      battle ? (i % 4 === 0 ? 0.12 : 0.075) : 0.07,
      -0.22,
    );
  if (battle) {
    // Short, accented bow strokes and a low pulse keep the fight urgent.
    for (let i = 0; i < 8; i++)
      add(
        i * 0.5, chord[(i + bar) % 3] + 24, 0.43,
        "violin", i % 2 ? 0.06 : 0.09, 0.18,
      );
    for (let i = 0; i < 4; i++) {
      add(i, chord[0], 0.9, "piano", 0.15, 0);
      notes.push({
        offset: i * beat,
        frequency: i % 2 ? 135 : 85,
        to: 36,
        duration: 0.14,
        type: "triangle",
        gain: i % 2 ? 0.07 : 0.12,
      });
    }
  } else {
    const melody = bar % 8 < 4 ? [2, 1, 0] : [1, 2, 1];
    add(0, chord[melody[0]] + 24, 2.15, "violin", 0.045, 0.2);
    add(2, chord[melody[1]] + 24, 1.15, "violin", 0.04, 0.2);
    add(3, chord[melody[2]] + 24, 1.15, "violin", 0.04, 0.2);
    add(0, chord[0] - 12, 4.2, "piano", 0.07, -0.08);
  }
  return { duration: 4 * beat, notes };
}
