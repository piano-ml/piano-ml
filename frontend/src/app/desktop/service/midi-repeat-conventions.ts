import { type MusicSheet, type Repetition, RepetitionInstructionEnum } from "opensheetmusicdisplay";

/**
 * Makes OSMD's playback order (MusicPartManagerIterator with EngravingRules.CursorIgnoreRepetitions = false)
 * follow the repeats the way MuseScore's MIDI export plays them, since the cursor is mapped onto that MIDI.
 * OSMD and MuseScore differ only on a section closed by more than one backward repeat (:|), as in Diabelli's
 * Op. 151 Sonatina 1 (|: m10 ... [1. m26 :| [2. m27 ... m47 :|), where OSMD lost a 37-measure pass:
 *
 * 1. Each backward jump is taken once. A repetition holding n backward jumps (OSMD groups them when the
 *    first one closes an ending) is played n + 1 times; OSMD played it twice, so the second jump never fired.
 * 2. A pass beyond the last numbered ending plays the LAST ending (passes 1 2 3 with endings 1 2: 1 2 2);
 *    OSMD's UserNumberOfRepetitions setter puts the extra passes first (1 1 2).
 * 3. A :| without a |: of its own (OSMD gives its repetition an implicit start, RepetitionInstructionEnum.None)
 *    jumps back to the last |: before it, or to the start of the piece; OSMD goes to just after the previous
 *    :|. Only that repetition's jump target changes: its start (and so which repetitions OSMD sees nested in
 *    it and restarts) stays, so the inner repeat already played is not played again, as in MuseScore.
 *
 * Call it once per loaded sheet, before iterating it (osmd.load() builds the repetitions). Idempotent.
 * Returns how many repetitions were changed.
 */
export function applyMidiRepeatConventions(sheet: MusicSheet | undefined): number {
    if (!sheet?.Repetitions) return 0;
    let changed = 0;
    // The forward repeats (|:) written in the score, by measure index
    const forwardRepeats = sheet.Repetitions
        .filter(rep => rep.startMarker?.type === RepetitionInstructionEnum.StartLine)
        .map(rep => rep.StartIndex)
        .sort((a, b) => a - b);

    for (const rep of sheet.Repetitions) {
        if (PATCHED.has(rep) || rep.SkipRepetition || rep.FromWords) continue;
        let touched = false;

        // 1 + 2: one pass per backward jump, the last ending for the passes past the numbered ones
        const passes = rep.BackwardJumpInstructions.length + 1;
        if (rep.BackwardJumpInstructions.length > 1 && rep.UserNumberOfRepetitions < passes) {
            rep.UserNumberOfRepetitions = passes;
            const endings = rep.NumberOfEndings;
            if (endings > 0) {
                (rep as unknown as RepetitionInternals).repetitonIterationOrder =
                    Array.from({ length: passes }, (_, i) => Math.min(i + 1, endings));
            }
            touched = true;
        }

        // 3: a :| without its own |: goes back to the last |: before it
        if (rep.startMarker?.type === RepetitionInstructionEnum.None) {
            const anchor = forwardRepeats.filter(start => start < rep.StartIndex).at(-1) ?? 0;
            if (anchor !== rep.getBackwardJumpTarget()) {
                rep.getBackwardJumpTarget = () => anchor;
                touched = true;
            }
        }

        if (touched) {
            PATCHED.add(rep);
            changed++;
        }
    }
    return changed;
}

/** Repetitions already adapted (a sheet's repetitions live as long as the sheet). */
const PATCHED = new WeakSet<Repetition>();

/** OSMD's private pass -> ending order (Repetition.getForwardJumpTargetForIteration reads it). */
interface RepetitionInternals {
    repetitonIterationOrder: number[];
}
