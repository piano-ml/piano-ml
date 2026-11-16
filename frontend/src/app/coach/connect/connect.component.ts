import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { CoachService, type CoachPrompt } from '../../core/api';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { LOGIN_PATH, loginQueryParams } from '../../account/services/return-url';
import { CoachGrantsComponent } from '../../account/components/coach-grants/coach-grants.component';
import { environment } from '../../../environments/environment';
import { TOKEN_PLACEHOLDER, type SnippetKind, copyText, mcpUrl, renderPrompt, snippet } from './connect-snippets';

/** Localized title and description of the prompts the app knows; others show the catalog's English text. */
const PROMPT_LABELS: Record<string, { title: string; description: string }> = {
  coach_start: {
    title: $localize`:@@coach.prompt.coach_start.title:Start a coaching session`,
    description: $localize`:@@coach.prompt.coach_start.description:Where you stand, and one thing to practice today.`,
  },
  review_progress: {
    title: $localize`:@@coach.prompt.review_progress.title:Review my progress`,
    description: $localize`:@@coach.prompt.review_progress.description:A review of your last days of practice, without practicing.`,
  },
  practice_piece: {
    title: $localize`:@@coach.prompt.practice_piece.title:Practice a piece`,
    description: $localize`:@@coach.prompt.practice_piece.description:Work on one piece, its weakest passage first.`,
  },
  warm_up: {
    title: $localize`:@@coach.prompt.warm_up.title:Warm up`,
    description: $localize`:@@coach.prompt.warm_up.description:Scales and arpeggios suited to your level and your pieces.`,
  },
  find_new_piece: {
    title: $localize`:@@coach.prompt.find_new_piece.title:Find a new piece`,
    description: $localize`:@@coach.prompt.find_new_piece.description:Three suggestions at the right level, then the chosen one opens.`,
  },
};

const ARGUMENT_LABELS: Record<string, string> = {
  days: $localize`:@@coach.prompt.argument.days:Number of days`,
  piece: $localize`:@@coach.prompt.argument.piece:Piece (title, composer or both)`,
  minutes: $localize`:@@coach.prompt.argument.minutes:Minutes`,
  wish: $localize`:@@coach.prompt.argument.wish:What you would like`,
};

interface SnippetTab {
  kind: SnippetKind;
  label: string;
  note: string;
}

const TABS: SnippetTab[] = [
  {
    kind: 'generic',
    label: $localize`:@@coach.connect.tab.generic:Any MCP host`,
    note: $localize`:@@coach.connect.tab.generic.note:For any assistant with a setting to add a remote MCP server by URL and header.`,
  },
  {
    kind: 'json',
    label: $localize`:@@coach.connect.tab.json:JSON configuration`,
    note: $localize`:@@coach.connect.tab.json.note:For assistants configured with an mcpServers file, for example Claude Code, Cursor or Cline. Some hosts do not use "type", or name the keys differently: check their documentation.`,
  },
  {
    kind: 'bridge',
    label: $localize`:@@coach.connect.tab.bridge:Command-line bridge`,
    note: $localize`:@@coach.connect.tab.bridge.note:For assistants that can only start local servers, for example the Claude Desktop configuration file. Needs Node.js.`,
  },
];

/**
 * Connect an external AI assistant to PianoML (coach, issue #414): the MCP URL, an access token, configuration
 * snippets and the ready-made prompts, everything to copy from one page.
 */
@Component({
  selector: 'app-coach-connect',
  imports: [CoachGrantsComponent],
  templateUrl: './connect.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectComponent implements OnInit {
  private readonly coach = inject(CoachService);
  private readonly session = inject(SessionStorageService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly tabs = TABS;
  readonly url = signal('');
  readonly token = signal<string | null>(null);
  readonly tab = signal<SnippetKind>('generic');
  readonly prompts = signal<CoachPrompt[]>([]);
  readonly promptsFailed = signal(false);
  readonly values = signal<Record<string, Record<string, string>>>({});
  /** What was copied last (a key such as "url", "snippet" or a prompt id), and whether it worked. */
  readonly copied = signal<{ key: string; ok: boolean } | null>(null);

  readonly currentSnippet = computed(() =>
    snippet(this.tab(), { url: this.url(), token: this.token() ?? TOKEN_PLACEHOLDER }));
  readonly currentNote = computed(() => this.tabs.find(t => t.kind === this.tab())?.note ?? '');

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    if (!this.session.getUserId()) {
      void this.router.navigate([LOGIN_PATH], { queryParams: loginQueryParams(this.router.url) });
      return;
    }
    this.url.set(mcpUrl(environment.api, window.location.origin));
    this.coach.coachPromptsGet().subscribe({
      next: prompts => this.prompts.set(prompts),
      error: () => this.promptsFailed.set(true),
    });
  }

  title(prompt: CoachPrompt): string {
    return PROMPT_LABELS[prompt.id]?.title ?? prompt.title;
  }

  description(prompt: CoachPrompt): string {
    return PROMPT_LABELS[prompt.id]?.description ?? prompt.description;
  }

  argumentLabel(name: string, fallback: string | undefined): string {
    return ARGUMENT_LABELS[name] ?? fallback ?? name;
  }

  value(promptId: string, name: string): string {
    return this.values()[promptId]?.[name] ?? '';
  }

  setValue(promptId: string, name: string, value: string): void {
    this.values.update(all => ({ ...all, [promptId]: { ...all[promptId], [name]: value } }));
  }

  text(prompt: CoachPrompt): string {
    return renderPrompt(prompt, this.values()[prompt.id] ?? {});
  }

  async copy(key: string, text: string): Promise<void> {
    this.copied.set({ key, ok: await copyText(text) });
  }

  isCopied(key: string): boolean {
    const copied = this.copied();
    return copied?.key === key && copied.ok;
  }

  copyFailed(key: string): boolean {
    const copied = this.copied();
    return copied?.key === key && !copied.ok;
  }
}
