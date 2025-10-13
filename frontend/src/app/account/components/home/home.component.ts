import { Component, OnDestroy } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterModule } from '@angular/router';
import { MidiServiceService } from '../../../shared/services/midi-service.service';
import { MidiStateEvent } from '../../../shared/model/webmidi';

@Component({
  selector: 'app-account-home',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class AccountHomeComponent implements OnDestroy {
  isLoggedIn$;
  userInfo: any = {};
  editMode = false;
  nameForm: FormGroup;
  keyboardPreferencesForm: FormGroup;
  keyboardEditMode = false;
  
  midiFnHandle?: (e: MidiStateEvent) => void;
  focusedField: 'leftmostKey' | 'rightmostKey' | null = null;

  constructor(private authService: AuthService, private fb: FormBuilder, private router: Router, private midiService: MidiServiceService) {
    this.nameForm = this.fb.group({
      name: ['']
    });
    
    this.keyboardPreferencesForm = this.fb.group({
      leftmostKey: [21, [Validators.required, Validators.min(21), Validators.max(108)]],
      rightmostKey: [108, [Validators.required, Validators.min(21), Validators.max(108)]]
    }, { validators: this.keyboardRangeValidator });
    this.isLoggedIn$ = this.authService.isLoggedIn;
    this.isLoggedIn$.subscribe(isLoggedIn => {
      if (!isLoggedIn) {
        this.router.navigate(['/account/login']);
      }
    });
    this.loadUserInfo();
    this.loadKeyboardPreferences();
    this.setup();
  }

  loadUserInfo() {
    this.authService.getUserInfo().subscribe(data => {
      this.userInfo = data;
      this.nameForm.patchValue({ name: data.name });
    });
  }

  enableEdit() {
    this.editMode = true;
  }

  savename() {
    const newname = this.nameForm.value.name;
    this.authService.updateUserInfo({ name: newname }).subscribe(() => {
      this.userInfo.name = newname;
      this.editMode = false;
      window.location.reload();
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/account/login']);
  }

  loadKeyboardPreferences() {
    const preferences = localStorage.getItem('preferences');
    if (preferences) {
      try {
        const parsedPreferences = JSON.parse(preferences);
        this.keyboardPreferencesForm.patchValue({
          leftmostKey: parsedPreferences.leftmostKey || 21,
          rightmostKey: parsedPreferences.rightmostKey || 108
        });
      } catch (error) {
        console.error('Error parsing keyboard preferences:', error);
      }
    }
  }

  enableKeyboardEdit() {
    this.keyboardEditMode = true;
  }

  saveKeyboardPreferences() {
    if (this.keyboardPreferencesForm.valid) {
      const preferences = this.keyboardPreferencesForm.value;
      localStorage.setItem('preferences', JSON.stringify(preferences));
      this.keyboardEditMode = false;
    }
  }

  keyboardRangeValidator(control: AbstractControl): ValidationErrors | null {
    const leftmost = control.get('leftmostKey')?.value;
    const rightmost = control.get('rightmostKey')?.value;
    
    if (leftmost && rightmost && leftmost >= rightmost) {
      return { invalidRange: true };
    }
    return null;
  }

  setup() {
    if (this.midiFnHandle) {
      this.midiService.unsubscribe(this.midiFnHandle);
    }

    setTimeout(() => {
      this.midiFnHandle = this.midiService.subscribe((midiEvent) => this.processMidiEvent(midiEvent));
    }, 2000);
  }

  processMidiEvent(midiEvent: MidiStateEvent): void {
    console.log(midiEvent)
    if (midiEvent.type === 'down' && this.focusedField && this.keyboardEditMode) {
      this.keyboardPreferencesForm.patchValue({
        [this.focusedField]: midiEvent.note
      });
    }
  }

  onFieldFocus(fieldName: 'leftmostKey' | 'rightmostKey'): void {
    this.focusedField = fieldName;
  }

  onFieldBlur(): void {
    this.focusedField = null;
  }

  ngOnDestroy(): void {
    if (this.midiFnHandle) {
      this.midiService.unsubscribe(this.midiFnHandle);
    }
  }
}
