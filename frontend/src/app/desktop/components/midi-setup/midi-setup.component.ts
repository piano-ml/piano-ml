import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, PLATFORM_ID, SimpleChanges, inject } from '@angular/core';
import { MidiServiceService } from '../../../shared/services/midi-service.service';

@Component({
  selector: 'app-midi-setup',
  standalone: true,
  imports: [],
  templateUrl: './midi-setup.component.html',
  styleUrl: './midi-setup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MidiSetupComponent implements OnChanges, OnDestroy {
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



  constructor(
    private midiService: MidiServiceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.loadDevices();
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
          this.error = 'MIDI access is blocked by your browser. Please open your browser settings, find site permissions for MIDI, allow access for this site, then reload the page.';
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
      this.error = 'MIDI access failed. If you denied permission, open your browser settings, clear or reset site permissions for this site, allow MIDI access, then reload the page.';
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
