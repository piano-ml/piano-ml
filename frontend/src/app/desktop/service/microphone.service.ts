import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { Recording, inputLatency, recordStream } from './mic-onsets';

/** Where the chosen microphone is kept between visits ('' or missing: the system default). */
export const MICROPHONE_DEVICE_KEY = 'microphoneDeviceId';

/**
 * The microphone used by the timing calibration (not for playing: scores are played on a MIDI keyboard). The
 * stream is opened without the processing that adds latency (echo cancellation, noise suppression, gain control).
 */
@Injectable({ providedIn: 'root' })
export class MicrophoneService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** The chosen device id, '' for the system default. */
  readonly deviceId = signal(this.readDeviceId());

  /** Whether this browser can capture audio at all. */
  isSupported(): boolean {
    return this.isBrowser && !!navigator.mediaDevices?.getUserMedia;
  }

  /** The audio inputs. Their labels stay empty until the user has allowed the microphone once. */
  async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!this.isSupported() || !navigator.mediaDevices.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== '');
  }

  /** Asks for the microphone (the browser prompt), so that the devices can be listed with their names. */
  async requestPermission(): Promise<void> {
    const stream = await this.open();
    stream.getTracks().forEach((track) => track.stop());
  }

  select(deviceId: string): void {
    this.deviceId.set(deviceId);
    try {
      if (deviceId) {
        localStorage.setItem(MICROPHONE_DEVICE_KEY, deviceId);
      } else {
        localStorage.removeItem(MICROPHONE_DEVICE_KEY);
      }
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  }

  /** Opens the chosen microphone (the default one if it is gone). The caller stops its tracks. */
  async open(): Promise<MediaStream> {
    const deviceId = this.deviceId();
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: this.constraints(deviceId) });
    } catch (error) {
      if (deviceId && (error as DOMException)?.name === 'OverconstrainedError') {
        return navigator.mediaDevices.getUserMedia({ audio: this.constraints('') });
      }
      throw error;
    }
  }

  /**
   * Opens the microphone and records it on `context`'s clock. Resolves with the input latency the browser reports
   * (seconds) and stop(), which closes the microphone and resolves with the recording.
   */
  async record(context: AudioContext): Promise<{ inputLatency: number; stop: () => Promise<Recording> }> {
    const stream = await this.open();
    const close = () => stream.getTracks().forEach((track) => track.stop());
    try {
      const recorder = await recordStream(context, stream);
      return {
        inputLatency: inputLatency(stream),
        stop: async () => {
          try {
            return await recorder.stop();
          } finally {
            close();
          }
        },
      };
    } catch (error) {
      close();
      throw error;
    }
  }

  private constraints(deviceId: string): MediaTrackConstraints {
    return {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      // Not in TypeScript's MediaTrackConstraints, but honoured by Chromium
      ...({ latency: 0 } as MediaTrackConstraints),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
  }

  private readDeviceId(): string {
    try {
      return this.isBrowser ? localStorage.getItem(MICROPHONE_DEVICE_KEY) ?? '' : '';
    } catch {
      return '';
    }
  }
}
