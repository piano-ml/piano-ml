import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api';

export interface ScoreTableAction {
  label: string;
  icon?: string;
  class?: string;
  callback: (score: ScoreApiInfo) => void;
}

export interface ScoreTableColumn {
  key: string;
  label: string;
  visible: boolean;
  formatter?: (value: any, score: ScoreApiInfo) => string;
}

@Component({
  selector: 'app-score-table',
  imports: [CommonModule],
  templateUrl: './score-table.component.html',
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
  @Input() tableClass = 'table-auto border-collapse border border-gray-400 w-full';
  @Input() rowClass = 'cursor-pointer hover:bg-gray-600 transition-colors';

  @Output() scoreClick = new EventEmitter<ScoreApiInfo>();

  defaultColumns: ScoreTableColumn[] = [
    { key: 'title', label: 'Title', visible: true },
    { key: 'author', label: 'Author', visible: true },
    { key: 'genre', label: 'Genre', visible: true, formatter: (value) => value || 'N/A' },
    { key: 'grade', label: 'Difficulty', visible: true, formatter: (value) => this.getDifficultyText(value) },
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

  private getPropertyValue(obj: any, path: string): any {
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  onRowClick(score: ScoreApiInfo) {
    if (this.showRowClick) {
      this.scoreClick.emit(score);
    }
  }

  onActionClick(action: ScoreTableAction, score: ScoreApiInfo, event: Event) {
    event.stopPropagation(); // Empêcher la propagation vers le clic de ligne
    action.callback(score);
  }

  getButtonClass(action: ScoreTableAction): string {
    if (action.class) {
      return action.class;
    }
    
    // Classes par défaut basées sur le type d'action
    const baseClass = 'px-2 py-1 text-white rounded text-xs focus:outline-none focus:ring-1 transition-colors';
    
    if (action.label.toLowerCase().includes('delete') || action.icon === '🗑️') {
      return `${baseClass} bg-red-500 hover:bg-red-600 focus:ring-red-400`;
    }
    
    return `${baseClass} bg-blue-500 hover:bg-blue-600 focus:ring-blue-400`;
  }

  getDifficultyText(grade: number | null | undefined): string {
    if (!grade) return 'N/A';
    const difficulties = ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert', 'Master'];
    return difficulties[grade - 1] || `Grade ${grade}`;
  }

  formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
