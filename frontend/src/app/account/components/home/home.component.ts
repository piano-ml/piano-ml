import { Component, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, effect, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterModule } from '@angular/router';
import { MidiServiceService } from '../../../shared/services/midi-service.service';
import { MidiStateEvent } from '../../../shared/model/webmidi';
import { Subject, takeUntil } from 'rxjs';
import { MidiSetupComponent } from '../../../desktop/components/midi-setup/midi-setup.component';

@Component({
  selector: 'app-account-home',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterModule, MidiSetupComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountHomeComponent implements OnDestroy {
  isLoggedIn$;
  userInfo: any = {};
  editMode = false;
  nameForm: FormGroup;
  keyboardPreferencesForm: FormGroup;
  keyboardEditMode = false;
  isMidiSetupOpen = false;
  
  private destroy$ = new Subject<void>();
  private midiListeningEnabled = signal<boolean>(false);
  focusedField: 'leftmostKey' | 'rightmostKey' | null = null;

  constructor(
    private authService: AuthService, 
    private fb: FormBuilder, 
    private router: Router, 
    private midiService: MidiServiceService,
    private cdr: ChangeDetectorRef
  ) {
    this.nameForm = this.fb.group({
      name: ['']
    });
    
    this.keyboardPreferencesForm = this.fb.group({
      leftmostKey: [21, [Validators.required, Validators.min(21), Validators.max(108)]],
      rightmostKey: [108, [Validators.required, Validators.min(21), Validators.max(108)]],
      drawFingering: [true],
      drawLyrics: [true],
      showKeyboard: [true]
    }, { validators: this.keyboardRangeValidator });
    this.isLoggedIn$ = this.authService.isLoggedIn;
    this.isLoggedIn$.pipe(takeUntil(this.destroy$)).subscribe(isLoggedIn => {
      if (!isLoggedIn) {
        this.router.navigate(['/account/login']);
      }
    });
    this.loadUserInfo();
    this.loadPreferences();
    
    // Effet pour écouter les événements MIDI uniquement quand l'édition est activée
    effect(() => {
      if (this.midiListeningEnabled()) {
        const midiEvent = this.midiService.midiEvent();
        console.log(midiEvent)
        if (midiEvent) {
          this.processMidiEvent(midiEvent);
        }
      } else {
        console.log('MIDI listening disabled');
      }
    });
  }

  loadUserInfo() {
    this.authService.getUserInfo().pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.userInfo = data;
      this.nameForm.patchValue({ name: data.name });
      this.cdr.markForCheck(); // Trigger change detection with OnPush
    });
  }

  enableEdit() {
    this.editMode = true;
    this.cdr.markForCheck();
  }

  cancelEdit() {
    this.editMode = false;
    this.nameForm.patchValue({ name: this.userInfo.name }); // Reset form
    this.cdr.markForCheck();
  }

  savename() {
    const newname = this.nameForm.value.name;
    this.authService.updateUserInfo({ name: newname }).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.userInfo.name = newname;
      this.editMode = false;
      this.cdr.markForCheck(); // Much more performant than window.location.reload()
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/account/login']);
  }

  loadPreferences() {
    const preferences = localStorage.getItem('preferences');
    if (preferences) {
      try {
        const parsedPreferences = JSON.parse(preferences);
        this.keyboardPreferencesForm.patchValue({
          leftmostKey: parsedPreferences.leftmostKey || 21,
          rightmostKey: parsedPreferences.rightmostKey || 108,
          drawFingering: parsedPreferences.drawFingering !== undefined ? parsedPreferences.drawFingering : true,
          drawLyrics: parsedPreferences.drawLyrics !== undefined ? parsedPreferences.drawLyrics : true,
          showKeyboard: parsedPreferences.showKeyboard !== undefined ? parsedPreferences.showKeyboard : true
        });
      } catch (error) {
        console.error('Error parsing keyboard preferences:', error);
      }
    }
  }

  enableKeyboardEdit() {
    this.keyboardEditMode = true;
    this.midiListeningEnabled.set(true);
    this.cdr.markForCheck();
  }

  openMidiSetup() {
    this.isMidiSetupOpen = true;
    this.cdr.markForCheck();
  }

  closeMidiSetup() {
    this.isMidiSetupOpen = false;
    this.cdr.markForCheck();
  }

  savePreferences() {
    if (this.keyboardPreferencesForm.valid) {
      const preferences = this.keyboardPreferencesForm.value;
      localStorage.setItem('preferences', JSON.stringify(preferences));
      this.keyboardEditMode = false;
      this.midiListeningEnabled.set(false);
      this.cdr.markForCheck();
    }
  }

  cancelKeyboardEdit() {
    this.keyboardEditMode = false;
    this.midiListeningEnabled.set(false);
    this.loadPreferences(); // Reset form values
    this.cdr.markForCheck();
  }

  keyboardRangeValidator(control: AbstractControl): ValidationErrors | null {
    const leftmost = control.get('leftmostKey')?.value;
    const rightmost = control.get('rightmostKey')?.value;
    
    if (leftmost && rightmost && leftmost >= rightmost) {
      return { invalidRange: true };
    }
    return null;
  }

  // Getters for template optimization
  get leftmostKeyValue(): number {
    return this.keyboardPreferencesForm.get('leftmostKey')?.value || 21;
  }

  get rightmostKeyValue(): number {
    return this.keyboardPreferencesForm.get('rightmostKey')?.value || 108;
  }

  get leftmostKeyControl() {
    return this.keyboardPreferencesForm.get('leftmostKey');
  }

  get rightmostKeyControl() {
    return this.keyboardPreferencesForm.get('rightmostKey');
  }

  get nameControl() {
    return this.nameForm.get('name');
  }

  get drawFingeringControl() {
    return this.keyboardPreferencesForm.get('drawFingering');
  }

  get drawLyricsControl() {
    return this.keyboardPreferencesForm.get('drawLyrics');
  }

  get showKeyboardControl() {
    return this.keyboardPreferencesForm.get('showKeyboard');
  }

  processMidiEvent(midiEvent: MidiStateEvent): void {
    console.log(midiEvent)
    if (midiEvent.type === 'down' && this.keyboardEditMode) {
      if (midiEvent.note < 60) {
      this.keyboardPreferencesForm.patchValue({
        ['leftmostKey' ]: midiEvent.note
      });
    } else {
      this.keyboardPreferencesForm.patchValue({
        ['rightmostKey']: midiEvent.note
      });
    }
    this.cdr.markForCheck();
    }
  }

  // onFieldFocus(fieldName: 'leftmostKey' | 'rightmostKey'): void {
  //   this.focusedField = fieldName;
  // }

  // onFieldBlur(): void {
  //   this.focusedField = null;
  // }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.midiListeningEnabled.set(false);
  }
}
