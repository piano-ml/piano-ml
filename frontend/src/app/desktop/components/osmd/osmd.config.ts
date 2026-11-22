import { IOSMDOptions, CursorOptions } from "opensheetmusicdisplay";

/**
 * Configuration par défaut pour OpenSheetMusicDisplay
 * Documentation complète: https://opensheetmusicdisplay.github.io/classdoc/interfaces/IOSMDOptions.html
 */

export const CURSOR_GOOD_COLOR = "#AAFFAA";
//export const CURSOR_BAD_COLOR = "#EEFFEE";
export const CURSOR_BAD_COLOR = "#FFAAAA";


export const DEFAULT_OSMD_OPTIONS: IOSMDOptions = {
    pageFormat: 'Endless',
    autoBeam: true,
    alignRests: 2,
    //drawingParameters: "compact",
    // autoBeamOptions: {
    //     groups: [[4, 4]],
    // },
    drawLyricist: false, // toggable
    drawTitle: false, // toggable
    drawCredits: false, // always false
    drawComposer: false,
    measureNumberInterval: 1,
    backend: "svg",
    cursorsOptions: [
        {
            follow: true,
            color: CURSOR_GOOD_COLOR,
            alpha: 1,
            type: 3
        },
    ] as CursorOptions[],

    darkMode: false,
    renderSingleHorizontalStaffline: false,

    drawPartNames: false,
    drawMeasureNumbers: true,
    drawFingerings: true,
    drawLyrics: false,
    drawMetronomeMarks: false,
    coloringEnabled: true,
    followCursor: true,
    preferredSkyBottomLineBatchCalculatorBackend: 1

};

/**
 * Largeur maximale de la feuille de musique
 */
export const SHEET_MAXIMUM_WIDTH = Number.MAX_SAFE_INTEGER;

/**
 * Page margins, in OSMD units (10 px each at zoom 1; OSMD's default is 5 each side): the score lines up with the
 * toolbar, 12 px from each edge like the home and play/pause buttons. Left: the 1.4 units of a grand staff's brace,
 * drawn left of the staff, plus 1.2; right: 1.2 plus the final barline's thickness, at the end of a full line.
 */
export const PAGE_LEFT_MARGIN = 2.6;
export const PAGE_RIGHT_MARGIN = 1.3;
