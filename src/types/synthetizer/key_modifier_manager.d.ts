export class KeyModifierManager {
    /**
     * @param synth {Synthetizer}
     */
    constructor(synth: Synthetizer);
    synth: Synthetizer;
    /**
     * The velocity override mappings for MIDI keys
     * @type {KeyModifier[][]}
     * @private
     */
    private _keyModifiers;
    /**
     * @private
     * @param type {workletKeyModifierMessageType}
     * @param data {any}
     */
    private _sendToWorklet;
    /**
     * Modifies a single key
     * @param channel {number} the channel affected. Usually 0-15
     * @param midiNote {number} the MIDI note to change. 0-127
     * @param options {{
     *     velocity: number|undefined,
     *     patch: {
     *         bank: number,
     *         program: number
     *     }|undefined
     * }} the key's modifiers
     */
    addModifier(channel: number, midiNote: number, options: {
        velocity: number | undefined;
        patch: {
            bank: number;
            program: number;
        } | undefined;
    }): void;
    /**
     * Gets a key modifier
     * @param channel {number} the channel affected. Usually 0-15
     * @param midiNote {number} the MIDI note to change. 0-127
     * @returns {KeyModifier|undefined}
     */
    getModifier(channel: number, midiNote: number): KeyModifier | undefined;
    /**
     * Deletes a key modifier
     * @param channel {number} the channel affected. Usually 0-15
     * @param midiNote {number} the MIDI note to change. 0-127
     */
    deleteModifier(channel: number, midiNote: number): void;
    /**
     * Clears ALL Modifiers
     */
    clearModifiers(): void;
}
import { KeyModifier } from "./worklet_system/worklet_methods/worklet_key_modifier.js";
