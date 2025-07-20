/**
 * synth_event_handler.js
 * purpose: manages the synthesizer's event system, calling assinged functions when synthesizer requests dispatching the event
 */
/**
 * @typedef {Object} NoteOnCallback
 * @property {number} midiNote - The MIDI note number.
 * @property {number} channel - The MIDI channel number.
 * @property {number} velocity - The velocity of the note.
 */
/**
 * @typedef {Object} NoteOffCallback
 * @property {number} midiNote - The MIDI note number.
 * @property {number} channel - The MIDI channel number.
 */
/**
 * @typedef {Object} DrumChangeCallback
 * @property {number} channel - The MIDI channel number.
 * @property {boolean} isDrumChannel - Indicates if the channel is a drum channel.
 */
/**
 * @typedef {Object} ProgramChangeCallback
 * @property {number} channel - The MIDI channel number.
 * @property {number} program - The program number.
 * @property {number} bank - The bank number.
 * @property {boolean} userCalled - Indicates if the change was user-initiated.
 */
/**
 * @typedef {Object} ControllerChangeCallback
 * @property {number} channel - The MIDI channel number.
 * @property {number} controllerNumber - The controller number.
 * @property {number} controllerValue - The value of the controller.
 */
/**
 * @typedef {Object} MuteChannelCallback
 * @property {number} channel - The MIDI channel number.
 * @property {boolean} isMuted - Indicates if the channel is muted.
 */
/**
 * @typedef {Object} PresetListChangeCallbackSingle
 * @property {string} presetName - The name of the preset.
 * @property {number} bank - The bank number.
 * @property {number} program - The program number.
 */
/**
 * @typedef {PresetListChangeCallbackSingle[]} PresetListChangeCallback - A list of preset objects.
 */
/**
 * @typedef {Object} SynthDisplayCallback
 * @property {Uint8Array} displayData - The data to display.
 * @property {SynthDisplayType} displayType - The type of display.
 */
/**
 * @typedef {Object} PitchWheelCallback
 * @property {number} channel - The MIDI channel number.
 * @property {number} MSB - The most significant byte of the pitch wheel value.
 * @property {number} LSB - The least significant byte of the pitch wheel value.
 */
/**
 * @typedef {Object} ChannelPressureCallback
 * @property {number} channel - The MIDI channel number.
 * @property {number} pressure - The pressure value.
 */
/**
 * @typedef {Error} SoundfontErrorCallback - The error message for soundfont errors.
 */
/**
 * @typedef {
 *     NoteOnCallback |
 *     NoteOffCallback |
 *     DrumChangeCallback |
 *     ProgramChangeCallback |
 *     ControllerChangeCallback |
 *     MuteChannelCallback |
 *     PresetListChangeCallback |
 *     PitchWheelCallback |
 *     SoundfontErrorCallback |
 *     ChannelPressureCallback |
 *     SynthDisplayCallback |
 *     undefined
 * } EventCallbackData
 */
/**
 * @typedef {
 * "noteon"|
 * "noteoff"|
 * "pitchwheel"|
 * "controllerchange"|
 * "programchange"|
 * "channelpressure"|
 * "polypressure" |
 * "drumchange"|
 * "stopall"|
 * "newchannel"|
 * "mutechannel"|
 * "presetlistchange"|
 * "allcontrollerreset"|
 * "soundfonterror"|
 * "synthdisplay"} EventTypes
 */
export class EventHandler {
    /**
     * The main list of events
     * @type {Object<EventTypes, Object<string, function(EventCallbackData)>>}
     */
    events: any;
    /**
     * Set to 0 to disabled, otherwise in seconds
     * @type {number}
     */
    timeDelay: number;
    /**
     * Adds a new event listener
     * @param name {EventTypes}
     * @param id {string} the unique identifier for the event (to delete it
     * @param callback {function(EventCallbackData)}
     */
    addEvent(name: EventTypes, id: string, callback: (arg0: EventCallbackData) => any): void;
    /**
     * Removes an event listener
     * @param name {EventTypes}
     * @param id {string}
     */
    removeEvent(name: EventTypes, id: string): void;
    /**
     * Calls the given event
     * @param name {EventTypes}
     * @param eventData {EventCallbackData}
     */
    callEvent(name: EventTypes, eventData: EventCallbackData): void;
}
export type NoteOnCallback = {
    /**
     * - The MIDI note number.
     */
    midiNote: number;
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - The velocity of the note.
     */
    velocity: number;
};
export type NoteOffCallback = {
    /**
     * - The MIDI note number.
     */
    midiNote: number;
    /**
     * - The MIDI channel number.
     */
    channel: number;
};
export type DrumChangeCallback = {
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - Indicates if the channel is a drum channel.
     */
    isDrumChannel: boolean;
};
export type ProgramChangeCallback = {
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - The program number.
     */
    program: number;
    /**
     * - The bank number.
     */
    bank: number;
    /**
     * - Indicates if the change was user-initiated.
     */
    userCalled: boolean;
};
export type ControllerChangeCallback = {
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - The controller number.
     */
    controllerNumber: number;
    /**
     * - The value of the controller.
     */
    controllerValue: number;
};
export type MuteChannelCallback = {
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - Indicates if the channel is muted.
     */
    isMuted: boolean;
};
export type PresetListChangeCallbackSingle = {
    /**
     * - The name of the preset.
     */
    presetName: string;
    /**
     * - The bank number.
     */
    bank: number;
    /**
     * - The program number.
     */
    program: number;
};
/**
 * - A list of preset objects.
 */
export type PresetListChangeCallback = PresetListChangeCallbackSingle[];
export type SynthDisplayCallback = {
    /**
     * - The data to display.
     */
    displayData: Uint8Array;
    /**
     * - The type of display.
     */
    displayType: SynthDisplayType;
};
export type PitchWheelCallback = {
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - The most significant byte of the pitch wheel value.
     */
    MSB: number;
    /**
     * - The least significant byte of the pitch wheel value.
     */
    LSB: number;
};
export type ChannelPressureCallback = {
    /**
     * - The MIDI channel number.
     */
    channel: number;
    /**
     * - The pressure value.
     */
    pressure: number;
};
/**
 * - The error message for soundfont errors.
 */
export type SoundfontErrorCallback = Error;
