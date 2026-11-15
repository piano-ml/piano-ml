import { HttpErrorResponse } from '@angular/common/http';

/** The files a score page lets people download. "original" is the file uploaded at import (owner and admins). */
export type ScoreDownloadType = 'pdf' | 'musicxml' | 'midi' | 'original';

/** Extension of each generated file, matching the names the API gives them. */
const GENERATED_EXTENSIONS: Record<Exclude<ScoreDownloadType, 'original'>, string> = {
  pdf: 'pdf',
  musicxml: 'musicxml',
  midi: 'mid',
};

/** File extension of an original upload, from the content type the API serves it with. */
export function originalExtension(contentType: string | null | undefined): string {
  switch ((contentType ?? '').split(';')[0].trim().toLowerCase()) {
    case 'application/pdf': return 'pdf';
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'audio/midi': return 'midi';
    case 'application/vnd.recordare.musicxml+xml': return 'musicxml';
    case 'application/vnd.recordare.musicxml': return 'mxl';
    default: return 'bin';
  }
}

/**
 * The file name in a Content-Disposition header: the RFC 5987 `filename*=UTF-8''…` form first, then `filename="…"`.
 * Folders are dropped so a name can never point outside the download folder. null when there is none.
 */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  let name: string | null = null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[2].trim().replace(/^"(.*)"$/, '$1'));
    } catch {
      name = null;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
    name = plain ? (plain[2] ?? plain[1]).trim() : null;
  }
  const base = name?.split(/[\\/]/).pop()?.trim();
  return base ? base : null;
}

/**
 * Download file name: the one the API chose (`<slug>.<ext>`) when the browser lets us read it, otherwise the same
 * name built here from the score slug (its id when it has none), so files always stick to the slug.
 */
export function downloadFilename(
  score: { immutableSlug?: string | null; id?: string | null },
  type: ScoreDownloadType,
  contentType?: string | null,
  contentDisposition?: string | null,
): string {
  const fromServer = filenameFromContentDisposition(contentDisposition);
  if (fromServer) {
    return fromServer;
  }
  const base = score.immutableSlug?.trim() || score.id || 'score';
  return type === 'original'
    ? `${base}-original.${originalExtension(contentType)}`
    : `${base}.${GENERATED_EXTENSIONS[type]}`;
}

/** A message telling the user why a download failed and, where possible, what to do. */
export function downloadErrorMessage(error: unknown, label: string): string {
  const status = error instanceof HttpErrorResponse ? error.status : undefined;
  switch (status) {
    case 0:
      return `Could not download the ${label}: the server cannot be reached. Check your connection and try again.`;
    case 401:
      return `Please log in to download the ${label}.`;
    case 403:
      return `You are not allowed to download the ${label} of this score.`;
    case 404:
      return `The ${label} is not available for this score.`;
    default:
      return `Could not download the ${label}. Please try again later.`;
  }
}
