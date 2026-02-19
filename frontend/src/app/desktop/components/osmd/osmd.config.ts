import { IOSMDOptions, CursorOptions } from "opensheetmusicdisplay";

/**
 * Configuration par défaut pour OpenSheetMusicDisplay
 * Documentation complète: https://opensheetmusicdisplay.github.io/classdoc/interfaces/IOSMDOptions.html
 */

export const CURSOR_GOOD_COLOR = "#50FF50";
export const CURSOR_BAD_COLOR = "#FF5050";


export const DEFAULT_OSMD_OPTIONS: IOSMDOptions = {
    pageFormat: 'Endless',
    autoBeam: false ,
    // autoBeamOptions: {
    //     groups: [[4, 4]],
    // },
    drawLyricist: false,
    measureNumberInterval: 1,
    backend: "svg",
    cursorsOptions: [
        {
            follow: true, 
            color: CURSOR_GOOD_COLOR,
            alpha: 1,
            type: 4
        },
    ] as CursorOptions[],
    drawTitle: false,
    darkMode: false,
    renderSingleHorizontalStaffline: false,
    drawCredits: false,
    drawComposer: false,
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
