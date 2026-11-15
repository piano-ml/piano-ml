import { Pipe, type PipeTransform } from '@angular/core';
import { type Mode, keyName, modeName, noteName } from './music-names';

/** `{{ 'F#' | noteName }}`: "F♯", "Fa♯", "Fis". See {@link noteName}. */
@Pipe({ name: 'noteName' })
export class NoteNamePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return noteName(value);
  }
}

/** `{{ score.fullKey | keyName }}`: "B♭ major", "Si♭ mayor", "B-Dur". See {@link keyName}. */
@Pipe({ name: 'keyName' })
export class KeyNamePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return keyName(value);
  }
}

/** `{{ 'minor' | modeName }}`: "minor", "menor", "Moll". */
@Pipe({ name: 'modeName' })
export class ModeNamePipe implements PipeTransform {
  transform(value: Mode): string {
    return modeName(value);
  }
}
