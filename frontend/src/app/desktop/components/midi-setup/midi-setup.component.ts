import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, PLATFORM_ID, SimpleChanges, effect, inject, signal, untracked } from '@angular/core';
import { MIDI_BLOCKED_MESSAGE, MidiServiceService } from '../../../shared/services/midi-service.service';
import { PlayerAudioService } from '../../service/player-audio.service';
import { LatencyCalibrationComponent } from '../latency-calibration/latency-calibration.component';
import { HIGHEST_MIDI_KEY, KeyField, KeyRangeService, LOWEST_MIDI_KEY } from '../../../shared/services/key-range.service';


@Component({
  selector: 'app-midi-setup',
  standalone: true,
  imports: [LatencyCalibrationComponent],
  templateUrl: './midi-setup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MidiSetupComponent implements OnChanges, OnDestroy {
  protected readonly midiInputLabel = $localize`:@@midiSetup.inputFallback:MIDI Input`;
  protected readonly midiOutputLabel = $localize`:@@midiSetup.outputFallback:MIDI Output`;
  protected readonly unknownLabel = $localize`:@@midiSetup.unknownManufacturer:Unknown`;
  protected readonly audio = inject(PlayerAudioService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private midiAccess?: MIDIAccess;

  @Input() isOpen = false;
  @Input() hideKeyboard = false;
  @Input() hideFingeringAndHarmony = false;
  @Input() hideFingering = false;
  @Input() hideLyrics = false;

  @Output() hideKeyboardChange = new EventEmitter<boolean>();
  @Output() hideFingeringAndHarmonyChange = new EventEmitter<boolean>();
  @Output() hideFingeringChange = new EventEmitter<boolean>();  
  @Output() hideLyricsChange = new EventEmitter<boolean>();
  @Output() closeModal = new EventEmitter<void>();

  loading = false;
  error: string | null = null;
  midiInputs: MIDIInput[] = [];
  midiOutputs: MIDIOutput[] = [];
  /** The timing calibration dialog, over this one. */
  calibrationOpen = false;

  protected readonly keyFields: { name: KeyField; inputId: string }[] = [
    { name: 'leftmostKey', inputId: 'midi-lowest-key' },
    { name: 'rightmostKey', inputId: 'midi-highest-key' },
  ];
  private readonly keyRangeService = inject(KeyRangeService);
  /** The keys of the user's MIDI keyboard. */
  readonly keyRange = this.keyRangeService.range;
  /** The key range field being focused: the next key played sets it. */
  readonly listeningTo = signal<KeyField | null>(null);
  /** Why the last entered key was refused, if it was. */
  readonly keyRangeError = signal<'min' | 'max' | 'range' | null>(null);



  constructor(
    private midiService: MidiServiceService,
    private cdr: ChangeDetectorRef
  ) {
    // Runs on each key played, not on focus: a note played before the field was focused does not count.
    effect(() => {
      const event = this.midiService.midiEvent();
      const field = untracked(this.listeningTo);
      if (field && event?.type === 'down') {
        untracked(() => this.setKey(field, event.note));
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.keyRangeService.reload();
      this.keyRangeError.set(null);
      this.loadDevices();
    } else if (changes['isOpen']) {
      this.calibrationOpen = false;
      this.listeningTo.set(null);
    }
  }

  ngOnDestroy(): void {
    if (this.midiAccess) {
      this.midiAccess.removeEventListener('statechange', this.onStateChange);
    }
  }

  onBackdropClick(event: Event) {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close() {
    this.closeModal.emit();
  }

  setKeyboardVisibility(show: boolean) {
    this.hideKeyboardChange.emit(!show);
  }

  setFingeringAndHarmonyVisibility(show: boolean) {
    this.hideFingeringAndHarmonyChange.emit(!show);
  }

  setFingeringVisibility(show: boolean) {
    this.hideFingeringChange.emit(!show);
  }


  setHideLyricsVisibility(show: boolean) {
    this.hideLyricsChange.emit(!show);
  }

  /** Sets one end of the key range and saves it, unless it is out of the piano range or past the other end. */
  setKey(field: KeyField, note: number) {
    const range = { ...this.keyRange(), [field]: note };
    const error = !(note >= LOWEST_MIDI_KEY) ? 'min'
      : note > HIGHEST_MIDI_KEY ? 'max'
      : range.leftmostKey >= range.rightmostKey ? 'range'
      : null;
    this.keyRangeError.set(error);
    if (!error) {
      this.keyRangeService.save(range);
    }
    this.cdr.markForCheck();
  }

  isInputEnabled(device: MIDIInput) {
    return this.midiService.isInputDeviceSelected(device as unknown as MIDIInput);
  }

  isOutputEnabled(device: MIDIOutput | null) {
    if (device === null) {
      return this.midiService.isOutputDeviceSelected(null);
    }
    return this.midiService.isOutputDeviceSelected(device as unknown as MIDIOutput);
  }

  selectInput(device: MIDIInput) {
    this.midiService.setInputDeviceEnabled(device as unknown as MIDIInput, true);
    this.cdr.markForCheck();
  }

  selectInputById(id: string) {
    const device = this.midiInputs.find(d => d.id === id);
    if (device) {
      this.selectInput(device);
    }
  }

  getSelectedInput(): MIDIInput | undefined {
    return this.midiInputs.find(d => this.isInputEnabled(d));
  }

  selectOutput(device: MIDIOutput | null) {
    this.midiService.setOutputDeviceEnabled(device as unknown as MIDIOutput, true);
    this.cdr.markForCheck();
  }

  selectOutputById(id: string) {
    if (id === '__pianoml__') {
      this.selectOutput(null);
    } else {
      const device = this.midiOutputs.find(d => d.id === id);
      if (device) {
        this.selectOutput(device);
      }
    }
  }

  private async loadDevices() {
    if (!this.isBrowser) return;

    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      if ('permissions' in navigator) {
        const status = await navigator.permissions.query({ name: 'midi' as PermissionName });
        if (status.state === 'denied') {
          this.error = MIDI_BLOCKED_MESSAGE;
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }
      }
      this.midiAccess = await navigator.requestMIDIAccess() as MIDIAccess;
      this.refreshDeviceLists();
      this.midiAccess?.addEventListener('statechange', this.onStateChange);
    } catch (error) {
      console.error('Error accessing MIDI devices:', error);
      this.error = $localize`:@@midiSetup.error.failed:MIDI access failed. If you denied permission, open your browser settings, clear or reset site permissions for this site, allow MIDI access, then reload the page.`;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private onStateChange = () => {
    this.refreshDeviceLists();
  };

  private refreshDeviceLists() {
    if (!this.midiAccess) return;
    this.midiInputs = Array.from(this.midiAccess.inputs.values());
    this.midiOutputs = Array.from(this.midiAccess.outputs.values());
    this.cdr.markForCheck();
  }
}
