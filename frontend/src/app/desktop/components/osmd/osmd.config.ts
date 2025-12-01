import { IOSMDOptions, CursorOptions } from "opensheetmusicdisplay";

/**
 * Configuration par défaut pour OpenSheetMusicDisplay
 * Documentation complète: https://opensheetmusicdisplay.github.io/classdoc/interfaces/IOSMDOptions.html
 */
export const DEFAULT_OSMD_OPTIONS: IOSMDOptions = {
    pageFormat: 'Endless',
    autoBeam: true,
    autoBeamOptions: {
        groups: [[4, 4]],
    },
    drawLyricist: true,
    measureNumberInterval: 1,
    backend: "svg",
    cursorsOptions: [
        {
            follow: true,  // Désactivé - on gère le scroll nous-mêmes
            color: "#B0F2B4",
            alpha: 0.6,
            //type: 2
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
    drawLyrics: true,
    drawMetronomeMarks: false,
    coloringEnabled: true,
    followCursor: true,  // Désactivé - on gère le scroll nous-mêmes
    //useXMLMeasureNumbers: false,
};

/**
 * Largeur maximale de la feuille de musique
 */
export const SHEET_MAXIMUM_WIDTH = Number.MAX_SAFE_INTEGER;
