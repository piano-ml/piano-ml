import { HttpErrorResponse } from '@angular/common/http';
import { downloadErrorMessage, downloadFilename, filenameFromContentDisposition, originalExtension } from './score-download';

describe('score downloads', () => {
  describe('originalExtension', () => {
    it('maps the content types the API serves originals with', () => {
      expect(originalExtension('application/pdf')).toBe('pdf');
      expect(originalExtension('image/png')).toBe('png');
      expect(originalExtension('image/jpeg')).toBe('jpg');
      expect(originalExtension('audio/midi')).toBe('midi');
      expect(originalExtension('application/vnd.recordare.musicxml+xml')).toBe('musicxml');
      expect(originalExtension('Application/Vnd.Recordare.Musicxml; charset=UTF-8')).toBe('mxl');
      expect(originalExtension('')).toBe('bin');
      expect(originalExtension(null)).toBe('bin');
      expect(originalExtension(undefined)).toBe('bin');
    });
  });

  describe('filenameFromContentDisposition', () => {
    it('prefers the UTF-8 filename* form', () => {
      expect(filenameFromContentDisposition(`attachment; filename="=?UTF-8?Q?x?="; filename*=UTF-8''gymnop%C3%A9die.pdf`)).toBe('gymnopédie.pdf');
    });

    it('reads a quoted or bare filename', () => {
      expect(filenameFromContentDisposition('attachment; filename="satie.mid"')).toBe('satie.mid');
      expect(filenameFromContentDisposition('attachment; filename=satie.mid; size=4')).toBe('satie.mid');
    });

    it('drops folders, and falls back on a malformed filename*', () => {
      expect(filenameFromContentDisposition('attachment; filename="../../etc/passwd"')).toBe('passwd');
      expect(filenameFromContentDisposition('attachment; filename="a\\\\b.pdf"')).toBe('b.pdf');
      expect(filenameFromContentDisposition(`attachment; filename*=UTF-8''%E0%A4%A; filename="safe.pdf"`)).toBe('safe.pdf');
    });

    it('is null without a usable name', () => {
      expect(filenameFromContentDisposition(null)).toBeNull();
      expect(filenameFromContentDisposition(undefined)).toBeNull();
      expect(filenameFromContentDisposition('')).toBeNull();
      expect(filenameFromContentDisposition('inline')).toBeNull();
      expect(filenameFromContentDisposition('attachment; filename=""')).toBeNull();
      expect(filenameFromContentDisposition('attachment; filename="folder/"')).toBeNull();
    });
  });

  describe('downloadFilename', () => {
    const score = { immutableSlug: 'fox-toby-my-castle-town', id: 'sc1' };

    it('builds <slug>.<ext> for generated files', () => {
      expect(downloadFilename(score, 'pdf')).toBe('fox-toby-my-castle-town.pdf');
      expect(downloadFilename(score, 'musicxml')).toBe('fox-toby-my-castle-town.musicxml');
      expect(downloadFilename(score, 'midi')).toBe('fox-toby-my-castle-town.mid');
    });

    it('builds <slug>-original.<ext> for the upload, from its content type', () => {
      expect(downloadFilename(score, 'original', 'image/png')).toBe('fox-toby-my-castle-town-original.png');
      expect(downloadFilename(score, 'original')).toBe('fox-toby-my-castle-town-original.bin');
    });

    it('takes the server name first, then the id, then a generic name', () => {
      expect(downloadFilename(score, 'pdf', 'application/pdf', 'attachment; filename="server.pdf"')).toBe('server.pdf');
      expect(downloadFilename({ immutableSlug: '  ', id: 'sc1' }, 'pdf')).toBe('sc1.pdf');
      expect(downloadFilename({}, 'midi')).toBe('score.mid');
    });
  });

  describe('downloadErrorMessage', () => {
    const http = (status: number) => new HttpErrorResponse({ status });

    it('tells each failure apart', () => {
      expect(downloadErrorMessage(http(0), 'PDF')).toContain('cannot be reached');
      expect(downloadErrorMessage(http(401), 'original file')).toBe('Please log in to download the original file.');
      expect(downloadErrorMessage(http(403), 'PDF')).toBe('You are not allowed to download the PDF of this score.');
      expect(downloadErrorMessage(http(404), 'MIDI')).toBe('The MIDI is not available for this score.');
      expect(downloadErrorMessage(http(500), 'MIDI')).toBe('Could not download the MIDI. Please try again later.');
      expect(downloadErrorMessage(new Error('boom'), 'MIDI')).toBe('Could not download the MIDI. Please try again later.');
    });
  });
});
