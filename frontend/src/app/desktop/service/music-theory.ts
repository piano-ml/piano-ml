/**
 * Some elements relative to music theory.
 */

export const sharpSpelling = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const majorKeys = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

export const minorKeys = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];


export const flatSpelling = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export enum MajorKeys {
  C = "C",
  F = "F",
  Bb = "Bb",
  Eb = "Eb",
  Ab = "Ab",
  Db = "Db",
  Gb = "Gb",
  Cb = "Cb",
  G = "G",
  D = "D",
  A = "A",
  E = "E",
  B = "B",
  FSharp = "F#",
  CSharp = "C#",
}

export enum MinorKeys {
  A = 'Am',
  D = 'Dm',
  G = 'Gm',
  C = 'Cm',
  F = 'Fm',
  Bb = 'Bbm',
  Eb = 'Ebm',
  Ab = 'Abm',
  E = 'Em',
  B = 'Bm',
  FSharp = 'F#m',
  CSharp = 'C#m',
  GSharp = 'G#m',
  DSharp = 'D#m',
  ASharp = 'A#m'
};


export const keySpelling: { [key in MajorKeys]: string[] } = {
  [MajorKeys.Cb]: flatSpelling,
  [MajorKeys.Gb]: flatSpelling,
  [MajorKeys.Db]: flatSpelling,
  [MajorKeys.Ab]: flatSpelling,
  [MajorKeys.Eb]: flatSpelling,
  [MajorKeys.Bb]: flatSpelling,
  [MajorKeys.F]: flatSpelling,
  [MajorKeys.C]: sharpSpelling,
  [MajorKeys.G]: sharpSpelling,
  [MajorKeys.D]: sharpSpelling,
  [MajorKeys.A]: sharpSpelling,
  [MajorKeys.E]: sharpSpelling,
  [MajorKeys.B]: sharpSpelling,
  [MajorKeys.FSharp]: sharpSpelling,
  [MajorKeys.CSharp]: sharpSpelling,
}

export const majorKeySignatureSharpFlats: { [key in MajorKeys]?: string[] } = {
  [MajorKeys.Db]: ["Bb", "Eb", "Ab", "Db", "Gb"],
  [MajorKeys.Ab]: ["Bb", "Eb", "Ab", "Db"],
  [MajorKeys.Eb]: ["Bb", "Eb", "Ab"],
  [MajorKeys.Bb]: ["Bb", "Eb"],
  [MajorKeys.F]: ["Bb"],
  [MajorKeys.C]: [],
  [MajorKeys.G]: ['F#'],
  [MajorKeys.D]: ["F#", "C#"],
  [MajorKeys.A]: ["F#", "C#", "G#"],
  [MajorKeys.E]: ["F#", "C#", "G#", "D#"],
  [MajorKeys.B]: ["F#", "C#", "G#", "D#", "A#"],
  [MajorKeys.FSharp]: ["F#", "C#", "G#", "D#", "A#", "E#"]
}

export const minorKeySignatureSharpFlats: { [key in MinorKeys]?: string[] } = {
  // Minor keys with flats
  [MinorKeys.D]: ["Bb"], // D minor - 1 flat
  [MinorKeys.G]: ["Bb", "Eb"], // G minor - 2 flats
  [MinorKeys.C]: ["Bb", "Eb", "Ab"], // C minor - 3 flats
  [MinorKeys.F]: ["Bb", "Eb", "Ab", "Db"], // F minor - 4 flats
  [MinorKeys.Bb]: ["Bb", "Eb", "Ab", "Db", "Gb"], // Bb minor - 5 flats
  [MinorKeys.Eb]: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb"], // Eb minor - 6 flats
  [MinorKeys.Ab]: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"], // Ab minor - 7 flats

  // Minor keys with no accidentals or sharps
  [MinorKeys.A]: [], // A minor - 0 accidentals
  [MinorKeys.E]: ["F#"], // E minor - 1 sharp
  [MinorKeys.B]: ["F#", "C#"], // B minor - 2 sharps
  [MinorKeys.FSharp]: ["F#", "C#", "G#"], // F# minor - 3 sharps
  [MinorKeys.CSharp]: ["F#", "C#", "G#", "D#"], // C# minor - 4 sharps
  [MinorKeys.GSharp]: ["F#", "C#", "G#", "D#", "A#"], // G# minor - 5 sharps
  [MinorKeys.DSharp]: ["F#", "C#", "G#", "D#", "A#", "E#"], // D# minor - 6 sharps
  [MinorKeys.ASharp]: ["F#", "C#", "G#", "D#", "A#", "E#", "B#"] // A# minor - 7 sharps
}


export const majorKeySpellings: { [key in MajorKeys]: string[] } = {
  [MajorKeys.C]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.G]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.D]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.A]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.E]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.B]: ["C", "C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.FSharp]: ["B#", "C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B"],
  [MajorKeys.CSharp]: ["B#", "C#", "D", "D#", "E#", "E#", "F#", "G", "G#", "A", "A#", "B#"],
  [MajorKeys.F]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MajorKeys.Bb]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MajorKeys.Eb]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MajorKeys.Ab]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MajorKeys.Db]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"],
  [MajorKeys.Gb]: ["C", "Db", "D", "Eb", "Fb", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"],
  [MajorKeys.Cb]: ["C", "Db", "D", "Eb", "Fb", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"],
};


export const minorKeySpellings: { [key in MinorKeys]: string[] } = {
  // Minor keys with no accidentals
  [MinorKeys.A]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],

  // Minor keys with sharps
  [MinorKeys.E]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MinorKeys.B]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MinorKeys.FSharp]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MinorKeys.CSharp]: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  [MinorKeys.GSharp]: ["C", "C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B"],
  [MinorKeys.DSharp]: ["B#", "C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B"],
  [MinorKeys.ASharp]: ["B#", "C#", "D", "D#", "E#", "E#", "F#", "G", "G#", "A", "A#", "B#"],

  // Minor keys with flats
  [MinorKeys.D]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MinorKeys.G]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MinorKeys.C]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MinorKeys.F]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
  [MinorKeys.Bb]: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"],
  [MinorKeys.Eb]: ["C", "Db", "D", "Eb", "Fb", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"],
  [MinorKeys.Ab]: ["Cb", "Db", "D", "Eb", "Fb", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"],
};


export interface Scale {
  kind: 'Scale',
  key?: string,
  name: string,
  alt: string,
  description?: string,
  pattern: number[]
}


export interface Chord {
  kind: 'Chord',
  name: string,
  alt: string,
  pattern: number[]
}

export const chords: Chord[] = [
  {
    kind: "Chord",
    name: "Major",
    alt: "",
    pattern: [0, 4, 7]
  },
  {
    kind: "Chord",
    name: "Minor",
    alt: "",
    pattern: [0, 3, 7]
  },
  {
    kind: "Chord",
    name: "Dominant 7",
    alt: "",
    pattern: [0, 4, 7, 10]
  }
]

export function getChordNote(midiStart: number, index2: number, pattern: number[]): number {
  const index = index2 - 1;
  const octaveShift = Math.floor(index / pattern.length);
  return pattern[index % pattern.length] + midiStart + (12 * octaveShift);
}


const bebopBlues = [2, 1, 2, 1, 1, 2, 2, 1]  // 8 notes - dominant bebop blues
const minorBluesBebop = [3, 2, 1, 1, 2, 1, 3, 1]  // 8 notes - minor bebop blues
const majorScalePattern = [2, 2, 1, 2, 2, 2, 1]
const naturalMinorScalePattern = [2, 1, 2, 2, 1, 2, 2]     // Aeolian
const harmonicMinorScalePattern = [2, 1, 2, 2, 1, 3, 1]     //  Aeolian ♮7 scale
const melodicMinorScalePattern = [2, 1, 2, 2, 2, 2, 1]     //  Jazz minor scale
const dorianScalePattern = [2, 1, 2, 2, 2, 1, 2]     //  Dorian
const phrygianScalePattern = [1, 2, 2, 2, 1, 2, 2]     //  Phrygian
const phrygianDominant = [1, 3, 1, 2, 1, 2, 2]     //  Metal riffs, Spanish/flamenco feeling
const lydianScalePattern = [2, 2, 2, 1, 2, 2, 1]     //  Lydian
const mixolydianScalePattern = [2, 2, 1, 2, 2, 1, 2]     //  Mixolydian, Dominant 7th chords, classic rock, funk
const locrianScalePattern = [1, 2, 2, 1, 2, 2, 2]     //  Locrian
const bluesHeptatonicPattern = [2, 1, 2, 1, 1, 2, 3]     // Heptatonique (7 notes)
const alteredScale = [1, 2, 1, 2, 2, 2, 2]     // Modern jazz - tense dominant V7alt chords
const minorBluesScalePattern = [3, 2, 1, 1, 3, 2]        // Hexatonique (6 notes), minor blues scale
const majorBluesScalePattern = [2, 1, 1, 3, 2, 3]        // Hexatonique (6 notes), major blues scale
const minorPentatonic = [3, 2, 2, 3, 2];          // 90% of rock/blues solos
const majorPentatonic = [2, 2, 3, 2, 3];          // 5 notes - sweet major blues/country


export const scales: Scale[] = [
  {
    kind: "Scale",
    key: 'major',
    name: 'Major',
    alt: 'Ionian',
    description: `The major (Ionian) scale is the default “bright / stable” sound in Western music. It’s the backbone of diatonic harmony: I, ii, iii, IV, V, vi and vii° all come straight from it.
Common genres: classical, pop, folk, film music, worship, EDM melodies.
Usage: build singable melodies, outline major triads/7ths, and write progressions like I–V–vi–IV. For improvisation, target chord tones on strong beats and use the remaining scale tones as passing/neighbor tones.`,
    pattern: majorScalePattern
  },
  {
    kind: "Scale",
    key: 'minor',
    name: 'Minor',
    alt: 'Aeolian',
    description: `Natural minor (Aeolian) is the “darker / melancholic” counterpart to major. It’s the relative minor of a major key (same notes, different tonic), which is why modulating between relative major/minor feels so natural.

Common genres: rock, pop ballads, classical, cinematic, indie.

Usage: great for i–bVII–bVI progressions (a classic minor-key sound), and for melodies that lean on the b3, b6, and b7. Harmonically it lacks a strong leading tone (7→1), so cadences can feel modal unless you introduce harmonic/melodic minor.`,
    pattern: naturalMinorScalePattern
  },
  {
    kind: "Scale",
    key: 'harmonic_minor',
    name: 'Harmonic Minor',
    alt: 'Aeolian ♮7',
    description: `Harmonic minor is natural minor with a raised 7th degree, restoring the leading tone and enabling a strong V(7)→i cadence in minor keys. This is why it’s central to classical “functional” minor harmony.

Signature color: the augmented 2nd between b6 and 7, which can sound “exotic” if emphasized melodically.

Common genres: classical, neo-classical metal, film scoring, some Middle Eastern/Spanish-influenced lines.

Usage: use it over the dominant in minor (V7 in minor), in cadences, and when you want that strong pull back to the tonic. Be mindful: sustained melodies may sound stylized; many writers mix it with natural minor.`,
    pattern: harmonicMinorScalePattern
  },
  {
    kind: "Scale",
    key: 'melodic_minor',
    name: 'Melodic Minor',
    alt: 'Jazz minor',
    description: `Melodic minor (as used in jazz) is a minor scale with raised 6th and 7th degrees. In classical theory it’s often taught as “ascending melodic minor”, but in jazz it’s generally used the same way up and down.

Common genres: jazz, fusion, modern film/TV harmony.

Usage: it’s a powerhouse “parent scale” because its modes are used everywhere (e.g., Lydian dominant, altered scale). Use melodic minor on minor-major7 chords, on tonic minor colors, and to derive dominant options in ii–V–i contexts.`,
    pattern: melodicMinorScalePattern
  },
  {
    kind: "Scale",
    key: 'dorian',
    name: 'Dorian',
    alt: '',
    description: `Dorian is a minor mode with a natural 6 (compared to Aeolian). That single note change makes it feel less “sad” and more “groovy / open”, perfect for modal vamps.

Common genres: modal jazz (e.g., “So What”), funk, rock jams, Celtic/folk flavors.

Usage: typically played over a minor7 chord (i7) when the harmony stays put for a long time. Emphasize the natural 6 to clearly distinguish it from natural minor; a classic vamp is i7–IV7 (or i7–IV) which highlights that color.`,
    pattern: dorianScalePattern
  },
  {
    kind: "Scale",
    key: 'phrygian_dominant',
    name: 'Phrygian Dominant',
    alt: 'Metal riffs, Spanish/flamenco feeling',
    description: `Phrygian dominant is the 5th mode of harmonic minor. It sounds “Spanish / flamenco / Middle Eastern” because of the b2 combined with a major 3rd.

Common genres: flamenco, metal riffs, cinematic “exotic” cues.

Usage: great over dominant chords that want to resolve to a minor tonic (V7→i). It naturally implies dominant tension (b9, b13 colors) while staying strongly directional. Riff writing tip: lean on the b2–1 motion and the b6–5 movement for that instantly recognizable flavor.`,
    pattern: phrygianDominant
  },
  {
    kind: "Scale",
    key: 'phrygian',
    name: 'Phrygian',
    alt: '',
    description: `Phrygian is a minor mode with a flat 2, giving it a tense, “dark / ancient” character. It’s less functional-harmony-driven and more about sustained modal color.

Common genres: metal, prog, film/game scoring, some Spanish-influenced lines.

Usage: works well over minor chords (i or i7) when the harmony is static. The b2 is the identity note—use it carefully: sustained b2 can sound very tense, while quick b2→1 resolves nicely and feels idiomatic.`,
    pattern: phrygianScalePattern
  },
  {
    kind: "Scale",
    key: 'lydian',
    name: 'Lydian',
    alt: '',
    description: `Lydian is a major mode with a raised 4 (#11). Compared to Ionian, it feels more “floating / dreamy / cinematic” because the #4 avoids the strong IV pull and adds a bright tension.

Common genres: film scoring, ambient, fusion, modern pop harmony.

Usage: ideal over maj7(#11) chords and long tonic major vamps. To highlight the mode, feature the #4 against the major chord (e.g., play 1–2–3–#4–5). Great for melodies that should feel uplifting but not overly “resolved”.`,
    pattern: lydianScalePattern
  },
  {
    kind: "Scale",
    key: 'mixolydian',
    name: 'Mixolydian',
    alt: '',
    description: `Mixolydian is major with a flat 7. It’s the classic “dominant / bluesy major” sound: bright like major, but with a relaxed, rootsy edge.

Common genres: blues, rock, funk, country, folk, jam music.

Usage: use it over dominant 7 chords (especially a I7 in blues/rock contexts) and in progressions like I–bVII–IV. Emphasize the b7 to separate it from Ionian; it pairs naturally with pentatonics and blues vocabulary.`,
    pattern: mixolydianScalePattern
  },
  {
    kind: "Scale",
    key: 'locrian',
    name: 'Locrian',
    alt: '',
    description: `Locrian is the most unstable diatonic mode: it has a flat 2 and a diminished 5 (b5), which makes the tonic triad diminished. Because of that, it’s rarely used as a “home base” in tonal music.

Common genres: jazz harmony (as a function), some metal/experimental contexts.

Usage: most often used over half-diminished chords (m7b5), typically as iiø in minor ii–V–i progressions. Treat it as a color for a chord-function moment rather than a long tonic. Target chord tones (1, b3, b5, b7) for clarity.`,
    pattern: locrianScalePattern
  },
  {
    kind: "Scale",
    key: 'minor_blues_hexatonic',
    name: 'Minor blues (Hexatonic)',
    alt: '',
    description: `Minor blues (hexatonic) is essentially minor pentatonic with the added “blue note” (b5). It’s one of the most practical, high-hit-rate scales for expressive phrasing.

Common genres: blues, rock, soul, funk, guitar-centric leads.

Usage: play it over minor tonal centers (i, i7) and even over dominant blues contexts for a more “minor” bite. The b5 is a tension note—use it as a passing tone or bend/slide target rather than a long sustain for the most idiomatic blues feel.`,
    pattern: minorBluesScalePattern
  },
  {
    kind: "Scale",
    key: 'major_blues_hexatonic',
    name: 'Major blues (Hexatonic)',
    alt: '',
    description: `Major blues (hexatonic) is major pentatonic with an added b3 “blues” color. This gives that classic major/minor mixture that defines so much blues and country phrasing.

Common genres: blues, country, swing, classic rock.

Usage: great over I7 in blues, or any major-key groove where you want sweetness (major pentatonic) plus grit (b3). A common approach is to alternate major blues and minor blues around the same chord for call-and-response phrasing.`,
    pattern: majorBluesScalePattern
  },
  {
    kind: "Scale",
    key: 'altered_super_locrian',
    name: 'Altered / Super Locrian',
    alt: 'Modern jazz - tense dominant V7alt chords',
    description: `The altered (super Locrian) scale is the 7th mode of melodic minor. It contains the strongest set of dominant alterations: b9, #9, b5/#11, and #5/b13.

Common genres: bebop/post-bop jazz, modern jazz, fusion.

Usage: apply it over V7alt chords resolving by fifth (e.g., G7alt → Cmin/Cmaj). It’s a “maximum tension” choice: aim the altered tones to resolve by half-step into target chord tones of the resolution chord. In lines, treat it as a tension palette rather than a scale to run straight up and down.`,
    pattern: alteredScale
  },
  {
    kind: "Scale",
    key: 'blues_heptatonic',
    name: 'Blues (Heptatonic)',
    alt: '',
    description: `This heptatonic blues flavor expands beyond the common 6-note blues scale. With 7 notes, it can bridge “pentatonic safety” and more diatonic motion, while still keeping blues DNA.

Common genres: blues, rock, funk, jam improvisation.

Usage: useful when you want blues phrasing but also want a smoother melodic line that can outline more chord movement. Start with classic blues licks (1, b3, 4, b5, 5, b7) and use the extra scale degree as a connector between strong targets.`,
    pattern: bluesHeptatonicPattern
  },
  {
    kind: "Scale",
    key: 'minor_pentatonic',
    name: 'Minor (pentatonic)',
    alt: '90% of rock/blues solos',
    description: `Minor pentatonic is the workhorse scale for melodic improvisation: five notes, no “bad” avoid notes against many common chords, and extremely easy to phrase.

Common genres: rock, blues, pop, funk, metal (as a base vocabulary).

Usage: play it over minor tonal centers (i, i7) and many dominant blues contexts. For stronger storytelling, don’t just run the pattern—target chord tones, use bends/ornaments (where applicable), and vary rhythm. Add the b5 to turn it into the classic minor blues scale when you want more bite.`,
    pattern: minorPentatonic
  },
  {
    kind: "Scale",
    key: 'major_pentatonic',
    name: 'Major (pentatonic)',
    alt: 'Sweet major blues/country',
    description: `Major pentatonic is a 5-note subset of the major scale (1–2–3–5–6). Because it avoids the 4 and 7, it tends to sound “clean” and consonant over many major-key progressions.

Common genres: country, pop, folk, classic rock, gospel, melodic EDM leads.

Usage: use it over major chords and major-key vamps when you want a smooth, singable melody. It’s also a great “safe” starting point for improvisation: you can focus on rhythm, phrasing, and target notes (especially 1/3/5) without worrying about harsh clashes. To add blues flavor, mix in the b3 occasionally (major blues sound) or switch to minor pentatonic for contrast.`,
    pattern: majorPentatonic
  },
  {
    kind: "Scale",
    key: 'bebop_blues',
    name: 'Bebop blues (dominant)',
    alt: '8-note dominant bebop blues',
    description: `Dominant bebop blues is an 8-note scale designed for swing/bebop phrasing over dominant harmony. The extra chromatic passing tone makes it easier to land chord tones on strong beats when playing continuous eighth-notes.

Common genres: bebop, swing, blues-jazz, organ trio, big band lines.

Usage: use it over dominant 7 chords (often I7 in blues, or V7 in a progression) when you want that “inside” bebop flow. A practical approach is to treat it as a rhythmic tool: run eighth-notes and aim for 1–3–5–b7 on downbeats, letting the chromatic note act as a connector. Combine with classic blues vocabulary (b3, b5 bends/approaches) for authentic language.`,
    pattern: bebopBlues
  },
  {
    kind: "Scale",
    key: 'minor_blues_bebop',
    name: 'Minor blues bebop',
    alt: '8-note minor bebop blues',
    description: `Minor blues bebop is an 8-note minor/blues-oriented scale that supports bebop-style eighth-note lines while keeping a minor-blues color. Like other bebop scales, the added chromaticism helps align chord tones with strong beats.

Common genres: bebop over minor blues, jazz blues, fusion, modern blues improvisation.

Usage: use it over minor chords and minor-blues contexts (i7 / i chord centers) when you want to keep the blues sound but phrase with bebop-style momentum. Target the minor chord tones (1, b3, 5, b7) on downbeats and use the chromatic notes as approach tones into those targets. It pairs well with minor pentatonic/blues licks—think of it as a “bebop-friendly” extension rather than a replacement.`,
    pattern: minorBluesBebop
  }
]

export function generateMajorCadence(root: number): number[][] {
  const majorChord = [0, 4, 7]; // Major triad
  const dominant7Chord = [0, 4, 7, 10]; // Dominant 7th chord
  const I = majorChord.map(interval => interval + root); // I chord
  const IV = majorChord.map(interval => interval + root + 5); // IV chord (5 semitones up)
  const V = majorChord.map(interval => interval + root + 7); // V chord (7 semitones up)
  const V7 = dominant7Chord.map(interval => interval + root + 7); // V7 chord (7 semitones up)
  return [I, IV, V, V7];
}