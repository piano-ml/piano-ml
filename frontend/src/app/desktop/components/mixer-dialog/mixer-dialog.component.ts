import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapMusicNote, bootstrapMusicNoteList, bootstrapSpeedometer2 } from '@ng-icons/bootstrap-icons';
import { AudioMixerService, type MixerBus } from '../../service/audio-mixer.service';

interface MixerChannel {
  bus: MixerBus;
  icon: string;
  label: string;
  hint: string;
}

/**
 * The mixer dialog (opened from the workbench toolbar): one level per source of sound, the score (the notes the
 * app plays), the accompaniment (only when the score has one) and the metronome. Levels are kept by
 * AudioMixerService and apply to the notes scheduled from then on.
 */
@Component({
  selector: 'app-mixer-dialog',
  imports: [NgIcon],
  templateUrl: './mixer-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ bootstrapMusicNote, bootstrapMusicNoteList, bootstrapSpeedometer2 })],
})
export class MixerDialogComponent {
  private readonly mixer = inject(AudioMixerService);

  @Input() isOpen = false;
  /** Whether the score has accompaniment tracks: their channel shows only then. */
  @Input() set hasAccompaniment(value: boolean) {
    this.withAccompaniment.set(value);
  }
  @Output() closeModal = new EventEmitter<void>();

  private readonly withAccompaniment = signal(false);

  private readonly allChannels: readonly MixerChannel[] = [
    {
      bus: 'score',
      icon: 'bootstrapMusicNote',
      label: $localize`:@@mixer.score:Score`,
      hint: $localize`:@@mixer.score.hint:The notes the app plays`,
    },
    {
      bus: 'accompaniment',
      icon: 'bootstrapMusicNoteList',
      label: $localize`:@@mixer.accompaniment:Accompaniment`,
      hint: $localize`:@@mixer.accompaniment.hint:The other instruments of the piece`,
    },
    {
      bus: 'metronome',
      icon: 'bootstrapSpeedometer2',
      label: $localize`:@@mixer.metronome:Metronome`,
      hint: $localize`:@@mixer.metronome.hint:The count-in always plays at full volume`,
    },
  ];

  /** The channels this score has. */
  readonly channels = computed(() =>
    this.allChannels.filter(channel => channel.bus !== 'accompaniment' || this.withAccompaniment()));

  /** A bus's level in percent, for the slider. */
  percent(bus: MixerBus): number {
    return Math.round(this.mixer.levels()[bus] * 100);
  }

  setPercent(bus: MixerBus, value: string): void {
    const percent = Number(value);
    if (value.trim() !== '' && Number.isFinite(percent)) {
      this.mixer.setLevel(bus, percent / 100);
    }
  }

  reset(): void {
    this.mixer.reset();
  }

  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close(): void {
    this.closeModal.emit();
  }
}
