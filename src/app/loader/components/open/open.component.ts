import { CommonModule } from '@angular/common';
// biome-ignore lint/style/useImportType: <explanation>
import { Component, Input, type OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import * as Midi from '@tonejs/midi';
// biome-ignore lint/style/useImportType:  Angular API
import { type FormGroup, type FormArray, ReactiveFormsModule, FormBuilder } from '@angular/forms'
// biome-ignore lint/style/useImportType: Angular API
import { ActivatedRoute, Router } from '@angular/router';
import { ModalComponent } from "../../../desktop/components/modal/modal.component";
import { bootstrapFloppy } from '@ng-icons/bootstrap-icons';
import { NgIcon, provideIcons } from '@ng-icons/core';

@Component({
  selector: 'app-open',
  imports: [CommonModule, ReactiveFormsModule, ModalComponent, NgIcon],
  templateUrl: './open.component.html',
  styleUrl: './open.component.css',
  viewProviders: [provideIcons({ bootstrapFloppy })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenComponent implements OnInit {

  @Input()
  fileParam = "";

  loaded = false;
  hasFile = false;
  ready = false;
  midi: Midi.Midi | undefined;
  fileName = "";
  midiName = "";
  checkboxGroup!: FormGroup;
  checkboxes: Array<boolean> = [];
  checkedNumber = 0;
  studies: Array<number> = [];
  splitVoices = false;
  error: Error | undefined;
  isModalOpen = false;
  modalTitle = '';
  modalContent = '';



  constructor(
    private fb: FormBuilder,
    private route: Router,
    private activatedRoute: ActivatedRoute,
    private changeDetector: ChangeDetectorRef
  ) {
    const state = this.route.getCurrentNavigation()?.extras.state;

    if (state) {
      this.error = state['errorInfo'];
      this.modalContent = this.error?.message || '';
      this.modalTitle = this.error?.name || '';
      console.error(this.error);
      this.isModalOpen = true;
    }

    this.activatedRoute.params.subscribe(params => {
      this.openAsset(params['filename']);
    });




  }
  ngOnInit(): void {
    if (this.fileParam) {
      this.openAsset(this.fileParam);
      
    }
  }

  openAsset(filename: string) {
    if (filename) {

      fetch(`/assets/midi/${filename}`)
      .then(response => {
        if (!response.ok) {
        throw new Error(`Failed to fetch MIDI file: ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        this.fileName = filename;
        const midi = new Midi.Midi(arrayBuffer);
        this.enjoy(midi);
        this.changeDetector.detectChanges();
      })
      .catch(error => {
        console.error('Error loading MIDI file:', error);
        this.error = error;
        this.modalContent = error.message;
        this.modalTitle = 'Error';
        this.isModalOpen = true;
      });
    }
  }

  initForm() {

    this.checkedNumber = 0;
    this.studies = [];
    this.splitVoices = false;

    this.checkboxGroup = this.fb.group({
      checkboxes: this.fb.array(this.checkboxes.map(x => false))
    });
    const fa = this.checkboxGroup.controls['checkboxes'] as FormArray;
    for (let i = 0; i < fa.controls.length; i++) {
      if (this.midi?.tracks[i].instrument.percussion) {
        fa.controls[i].disable();
      }
      if (this.countStudyTrack() < 2 && !this.midi?.tracks[i].instrument.percussion) {
        fa.controls[i].setValue(true);
      }
    }
    for (let i = 0; i < fa.controls.length; i++) {
      if (fa.controls[i].value) {
        this.studies.push(i);
      }
    }
    // if only one voice activate split voice option by default
    //this.splitVoices = fa.controls.filter(control => control.value === true).length === 1;
  }

  splitVoicesChecked() {
    this.splitVoices = !this.splitVoices;
  }

  onFileChange(event: HTMLInputElement) {
    const input = event;
    if (input?.files && input.files.length > 0) {
      const file = input.files[0];
      this.fileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        const midi = new Midi.Midi(e.target?.result as ArrayBuffer)
        if (!midi.header.name) {
          midi.header.name = this.fileName;
        }
        this.enjoy(midi);
      };

      reader.readAsArrayBuffer(file);
    }
  }

  load() {
    this.midi?.tracks[0]
    this.midi?.tracks[1]
    if (this.midi) {
      localStorage.setItem("score", JSON.stringify(this.midi.toJSON()));
      localStorage.setItem("studies", JSON.stringify(this.studies));
      localStorage.setItem("splitVoices", JSON.stringify(this.splitVoices));
    }
    this.route.navigate(['/desktop']);
  }


  reverseInPlace(array: Array<number>) {
    let i = 0;
    const n = array.length;
    const middle = Math.floor(n / 2);
    let temp = null;
    for (; i < middle; i += 1) {
      temp = array[i];
      array[i] = array[n - 1 - i];
      array[n - 1 - i] = temp;
    }
    return array;
  }


  reset() {
    this.hasFile = false;
  }

  enjoy(midi: Midi.Midi) {
    midi.tracks = midi.tracks.filter(track => track.notes.length > 0);

    this.checkboxes = [];
    for (let i = 0; i < midi.tracks.length; i++) {
      this.checkboxes.push(false);
    }

    if (!midi.name || midi.name.trim() === "") {
      this.midiName = this.fileName;
      midi.name = this.fileName;
      console.log("name:", midi.name)
    }

    this.midi = midi;
    this.hasFile = true;
    this.initForm();
  }

  countStudyTrack() {
    return this.checkboxGroup.controls['checkboxes'].value.filter((x: boolean) => x === true).length;
  }

  checkTrack(i: number) {

    const count = this.countStudyTrack();
    const fa = this.checkboxGroup.controls['checkboxes'] as FormArray;

    if (count >= 2) {
      for (let i = 0; i < fa.controls.length; i++) {
        if (!fa.controls[i].value) {
          fa.controls[i].disable();
        }
      }
    } else {
      for (let i = 0; i < fa.controls.length; i++) {
        if (!fa.controls[i].value && !this.midi?.tracks[i].instrument.percussion) {
          fa.controls[i].enable();
        }
      }
    }
    this.studies = [];

    for (let i = 0; i < fa.controls.length; i++) {
      if (fa.controls[i].value) {
        this.studies.push(i);
      }
    }
    // TODO this is a not so bad default but make reversion possible in UI checkbox should be better
    this.reverseInPlace(this.studies);

  }
}
