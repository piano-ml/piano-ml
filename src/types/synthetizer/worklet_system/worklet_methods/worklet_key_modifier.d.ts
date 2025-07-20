export class KeyModifier {
    /**
     * @param velocity {number}
     * @param bank {number}
     * @param program {number}
     */
    constructor(velocity?: number, bank?: number, program?: number);
    /**
     * The new override velocity. -1 means unchanged
     * @type {number}
     */
    velocity: number;
    /**
     * The patch this key uses. -1 on either means default
     * @type {{bank: number, program: number}}
     */
    patch: {
        bank: number;
        program: number;
    };
}
export type workletKeyModifierMessageType = number;
export namespace workletKeyModifierMessageType {
    let addMapping: number;
    let deleteMapping: number;
    let clearMappings: number;
}
export class WorkletKeyModifierManager {
    /**
     * The velocity override mappings for MIDI keys
     * @type {KeyModifier[][]}
     * @private
     */
    private _keyMappings;
    /**
     * @param type {workletKeyModifierMessageType}
     * @param data {any}
     */
    handleMessage(type: workletKeyModifierMessageType, data: any): void;
    /**
     * @param channel {number}
     * @param midiNote {number}
     * @param mapping {KeyModifier}
     */
    addMapping(channel: number, midiNote: number, mapping: KeyModifier): void;
    deleteMapping(channel: any, midiNote: any): void;
    clearMappings(): void;
    /**
     * @param mappings {KeyModifier[][]}
     */
    setMappings(mappings: KeyModifier[][]): void;
    /**
     * @returns {KeyModifier[][]}
     */
    getMappings(): KeyModifier[][];
    /**
     * @param channel {number}
     * @param midiNote {number}
     * @returns {number} velocity, -1 if unchanged
     */
    getVelocity(channel: number, midiNote: number): number;
    /**
     * @param channel {number}
     * @param midiNote {number}
     * @returns {boolean}
     */
    hasOverridePatch(channel: number, midiNote: number): boolean;
    /**
     * @param channel {number}
     * @param midiNote {number}
     * @returns {{bank: number, program: number}} -1 if unchanged
     */
    getPatch(channel: number, midiNote: number): {
        bank: number;
        program: number;
    };
}
