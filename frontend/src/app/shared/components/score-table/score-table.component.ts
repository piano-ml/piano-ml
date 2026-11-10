import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapExclamationTriangleFill, bootstrapLockFill, bootstrapUnlockFill } from '@ng-icons/bootstrap-icons';
import { ScoreApiInfo } from '../../../core/api';

export interface ScoreTableAction {
  label: string;
  icon?: string;
  class?: string;
  callback: (score: ScoreApiInfo) => void;
}

/** Icon shown in a cell instead of text. `label` is its tooltip and what screen readers announce. */
export interface ScoreTableCellIcon {
  /** ng-icons name; it must be registered in this component's viewProviders */
  name: 'bootstrapLockFill' | 'bootstrapUnlockFill' | 'bootstrapExclamationTriangleFill';
  label: string;
  tone?: 'positive' | 'caution' | 'danger' | 'muted';
}

export interface ScoreTableColumn {
  key: string;
  label: string;
  visible: boolean;
  /** 'center' or 'right' — default is 'left' */
  align?: 'left' | 'center' | 'right';
  /** Narrow icon-only column: fixed small padding, centered, skips flush logic */
  narrow?: boolean;
  formatter?: (value: any, score: ScoreApiInfo) => string;
  /** Renders an icon instead of text (return null to fall back to the text value) */
  icon?: (value: any, score: ScoreApiInfo) => ScoreTableCellIcon | null;
}

export interface ScoreTableEvent {
  score: ScoreApiInfo;
  openInNewTab: boolean;
}

@Component({
  selector: 'app-score-table',
  imports: [CommonModule, NgIcon],
  viewProviders: [provideIcons({ bootstrapExclamationTriangleFill, bootstrapLockFill, bootstrapUnlockFill })],
  templateUrl: './score-table.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './score-table.component.css'
})
export class ScoreTableComponent implements OnInit {
  @Input() scores: ScoreApiInfo[] = [];
  @Input() loading = false;
  @Input() actions: ScoreTableAction[] = [];
  @Input() columns: ScoreTableColumn[] = [];
  @Input() emptyMessage = 'No scores found';
  @Input() loadingMessage = 'Loading...';
  @Input() showRowClick = true;

  @Output() scoreClick = new EventEmitter<ScoreTableEvent>();

  defaultColumns: ScoreTableColumn[] = [
    { key: 'title', label: 'Title', visible: true },
    { key: 'author', label: 'Author', visible: true },
    { key: 'genre', label: 'Genre', visible: true, formatter: (value) => value || 'N/A' },
    { key: 'grade', label: 'Difficulty', visible: true },
    { key: 'duration', label: 'Duration', visible: true, formatter: (value) => this.formatDuration(value) },
    { key: 'tracks_count', label: 'Tracks', visible: true, formatter: (value) => value || 'N/A' },
    { key: 'version', label: 'Version', visible: false, formatter: (value) => `v${value || 1}` },
    { key: 'uploaded_at', label: 'Uploaded', visible: false, formatter: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' }
  ];

  ngOnInit() {
    if (this.columns.length === 0) {
      this.columns = [...this.defaultColumns];
    }
  }

  getVisibleColumns(): ScoreTableColumn[] {
    return this.columns.filter(col => col.visible);
  }

  getCellValue(score: ScoreApiInfo, column: ScoreTableColumn): string {
    const value = this.getPropertyValue(score, column.key);
    return column.formatter ? column.formatter(value, score) : (value?.toString() || '');
  }

  getCellIcon(score: ScoreApiInfo, column: ScoreTableColumn): ScoreTableCellIcon | null {
    return column.icon ? column.icon(this.getPropertyValue(score, column.key), score) : null;
  }

  private getPropertyValue(obj: any, path: string): any {
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  getHeaderClass(column: ScoreTableColumn, isFirst: boolean, isLast: boolean): string {
    const base = 'pb-3 pt-1 text-xs font-semibold uppercase tracking-widest text-neutral-400';
    if (column.narrow) return `${base} px-2 text-center`;
    const pl = isFirst ? 'pl-3' : 'pl-3';
    const pr = isLast && this.actions.length === 0 ? 'pr-0' : 'pr-3';
    const align = column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left';
    return `${base} ${pl} ${pr} ${align}`;
  }

  getCellClass(column: ScoreTableColumn, isFirst: boolean, isLast: boolean): string {
    const base = 'py-2.5 text-sm text-neutral-300';
    if (column.narrow) return `${base} px-2 text-center`;
    const pl = isFirst ? 'pl-3' : 'pl-3';
    const pr = isLast && this.actions.length === 0 ? 'pr-0' : 'pr-3';
    const align = column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left';
    return `${base} ${pl} ${pr} ${align}`;
  }

  onRowClick(score: ScoreApiInfo, event: MouseEvent) {
    if (this.showRowClick) {
      this.scoreClick.emit({ score, openInNewTab: event.ctrlKey || event.metaKey });
    }
  }

  onActionClick(action: ScoreTableAction, score: ScoreApiInfo, event: Event) {
    event.stopPropagation();
    action.callback(score);
  }

  getButtonClass(action: ScoreTableAction): string {
    return action.class ?? 'btn-small';
  }



  formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
