import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MidiServiceService } from '../../../shared/services/midi-service.service';
import { MidiSetupComponent } from './midi-setup.component';

/** Minimal Web MIDI access: device maps plus 'statechange' events (devices plugged / unplugged). */
class FakeMidiAccess extends EventTarget {
  inputs = new Map<string, MIDIInput>();
  outputs = new Map<string, MIDIOutput>();
}
const device = (id: string, name: string, manufacturer = 'Acme') => ({ id, name, manufacturer }) as MIDIInput & MIDIOutput;

describe('MidiSetupComponent', () => {
  let fixture: ComponentFixture<MidiSetupComponent>;
  let component: MidiSetupComponent;
  let el: HTMLElement;
  let access: FakeMidiAccess;
  let permission: PermissionState;
  let midi: {
    isInputDeviceSelected: ReturnType<typeof vi.fn>;
    isOutputDeviceSelected: ReturnType<typeof vi.fn>;
    setInputDeviceEnabled: ReturnType<typeof vi.fn>;
    setOutputDeviceEnabled: ReturnType<typeof vi.fn>;
  };

  /** Opens the dialog and waits for the device lists. */
  async function open() {
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  const selects = () => [...el.querySelectorAll('select')] as HTMLSelectElement[];
  const options = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent?.trim());
  const toggle = (label: string) => el.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

  beforeEach(async () => {
    access = new FakeMidiAccess();
    access.inputs.set('in-1', device('in-1', 'Digital Piano'));
    access.outputs.set('out-1', device('out-1', 'Synth', ''));
    permission = 'granted';
    vi.spyOn(navigator.permissions, 'query').mockImplementation(async () => ({ state: permission }) as PermissionStatus);
    vi.spyOn(navigator, 'requestMIDIAccess').mockImplementation(async () => access as unknown as MIDIAccess);
    midi = {
      isInputDeviceSelected: vi.fn(() => false),
      isOutputDeviceSelected: vi.fn((d: unknown) => d === null),
      setInputDeviceEnabled: vi.fn(),
      setOutputDeviceEnabled: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MidiSetupComponent],
      providers: [{ provide: MidiServiceService, useValue: midi }],
    }).compileComponents();
    fixture = TestBed.createComponent(MidiSetupComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('renders nothing and asks for no MIDI access while closed', () => {
    expect(el.textContent?.trim()).toBe('');
    expect(navigator.requestMIDIAccess).not.toHaveBeenCalled();
  });

  describe('devices', () => {
    it('lists the MIDI inputs and outputs, PianoML being the default output', async () => {
      await open();
      const [input, output] = selects();
      expect(options(input)).toEqual(['-- Select a MIDI Input --', 'Digital Piano (Acme)']);
      expect(options(output)).toEqual(['PianoML — The app might play piano (not the keyboard)', 'Synth (Unknown)']);
      expect(output.selectedIndex).toBe(0);
    });

    it('says when no device is plugged in', async () => {
      access.inputs.clear();
      access.outputs.clear();
      await open();
      expect(el.textContent).toContain('No MIDI IN devices detected.');
      expect(el.textContent).toContain('No MIDI OUT devices detected.');
    });

    it('enables the chosen input', async () => {
      await open();
      const [input] = selects();
      input.value = 'in-1';
      input.dispatchEvent(new Event('change'));
      expect(midi.setInputDeviceEnabled).toHaveBeenCalledWith(access.inputs.get('in-1'), true);
    });

    it('enables the chosen output, or PianoML itself', async () => {
      await open();
      const [, output] = selects();
      output.value = 'out-1';
      output.dispatchEvent(new Event('change'));
      output.value = '__pianoml__';
      output.dispatchEvent(new Event('change'));
      expect(midi.setOutputDeviceEnabled.mock.calls).toEqual([[access.outputs.get('out-1'), true], [null, true]]);
    });

    it('ignores unknown device ids', async () => {
      await open();
      component.selectInputById('gone');
      component.selectOutputById('gone');
      expect(midi.setInputDeviceEnabled).not.toHaveBeenCalled();
      expect(midi.setOutputDeviceEnabled).not.toHaveBeenCalled();
    });

    it('shows the selected input', async () => {
      midi.isInputDeviceSelected.mockReturnValue(true);
      await open();
      expect(component.getSelectedInput()?.id).toBe('in-1');
    });

    it('refreshes the lists when a device is plugged in', async () => {
      await open();
      access.inputs.set('in-2', device('in-2', 'Controller'));
      access.dispatchEvent(new Event('statechange'));
      fixture.detectChanges();
      expect(options(selects()[0])).toContain('Controller (Acme)');
    });

    it('stops listening for devices once destroyed', async () => {
      await open();
      const remove = vi.spyOn(access, 'removeEventListener');
      fixture.destroy();
      expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function));
    });
  });

  describe('errors', () => {
    it('explains how to unblock MIDI when the browser denied it', async () => {
      permission = 'denied';
      await open();
      expect(el.textContent).toContain('MIDI access is blocked by your browser');
      expect(navigator.requestMIDIAccess).not.toHaveBeenCalled();
    });

    it('explains what to do when MIDI access fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.mocked(navigator.requestMIDIAccess).mockRejectedValue(new DOMException('denied', 'SecurityError'));
      await open();
      expect(el.textContent).toContain('MIDI access failed');
    });
  });

  describe('display options', () => {
    it.each([
      ['Toggle keyboard visibility', 'hideKeyboardChange'],
      ['Toggle fingering visibility', 'hideFingeringChange'],
      ['Toggle lyrics visibility', 'hideLyricsChange'],
      ['Toggle fingering and harmony visibility', 'hideFingeringAndHarmonyChange'],
    ] as const)('"%s" emits %s: true when switched on', async (label, output) => {
      await open();
      const emitted: boolean[] = [];
      component[output].subscribe((v: boolean) => emitted.push(v));
      const box = toggle(label);
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      box.checked = false;
      box.dispatchEvent(new Event('change'));
      expect(emitted).toEqual([true, false]);
    });

    it('reflects the current options', async () => {
      fixture.componentRef.setInput('hideKeyboard', true);
      fixture.componentRef.setInput('hideLyrics', true);
      await open();
      expect(toggle('Toggle keyboard visibility').checked).toBe(true);
      expect(toggle('Toggle lyrics visibility').checked).toBe(true);
      expect(toggle('Toggle fingering visibility').checked).toBe(false);
    });
  });

  describe('closing', () => {
    it('closes with the Close button or a backdrop click, not a click inside', async () => {
      await open();
      let closed = 0;
      component.closeModal.subscribe(() => closed++);
      (el.querySelector('.modal-content') as HTMLElement).click();
      expect(closed).toBe(0);
      (el.querySelector('.modal') as HTMLElement).click();
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')?.click();
      expect(closed).toBe(2);
    });
  });
});
