import { CommonModule } from '@angular/common';
import { Component, Input, type OnInit } from '@angular/core';
import { HostListener } from '@angular/core';
import type { MidiStateEvent } from '../../../shared/model/webmidi';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../../shared/services/midi-service.service';


@Component({
  selector: 'app-modal',
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css'
})
export class ModalComponent implements OnInit  {


  @Input() title = '';
  @Input() content = '';
  @Input() isModalOpen = false;

  constructor(private midiService: MidiServiceService) {

  }

  midiFnHandler!: (e: MidiStateEvent) => void;


  openModal() {
    this.midiFnHandler =  this.midiService.subscribe((midiEvent) => this.processMidiEvent(midiEvent))
    this.isModalOpen = true;
  }

  ngOnInit(): void {
    setTimeout(() => {
      this.midiFnHandler = this.midiService.subscribe((midiEvent) => this.processMidiEvent(midiEvent))
    }, 1000)

  }

  closeModal() {
    this.midiService.unsubscribe(this.midiFnHandler);
    this.isModalOpen = false;
  }

  @HostListener('document:keypress', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    this.closeModal();
  }

  processMidiEvent(midiEvent: MidiStateEvent): void {
    this.closeModal();
  }

}
