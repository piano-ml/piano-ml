import { IOSMDOptions, CursorOptions } from "opensheetmusicdisplay";

/**
 * Configuration par défaut pour OpenSheetMusicDisplay
 * Documentation complète: https://opensheetmusicdisplay.github.io/classdoc/interfaces/IOSMDOptions.html
 */

export const CURSOR_GOOD_COLOR = "#AAFFAA";
export const CURSOR_BAD_COLOR = "#EEFFEE";


export const DEFAULT_OSMD_OPTIONS: IOSMDOptions = {
    pageFormat: 'Endless',
    autoBeam: true,
    alignRests: 2,
    //drawingParameters: "compacttight",
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
            type: 2
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
