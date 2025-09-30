import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private _isLoading = signal(false);
  private _loadingCounter = 0;

  /**
   * Signal de l'état de chargement en cours
   */
  readonly isLoading = this._isLoading.asReadonly();

  /**
   * Affiche le spinner de chargement
   */
  show(): void {
    this._loadingCounter++;
    this._isLoading.set(true);
  }

  /**
   * Cache le spinner de chargement
   * Utilise un compteur pour gérer les appels multiples
   */
  hide(): void {
    this._loadingCounter = Math.max(0, this._loadingCounter - 1);
    if (this._loadingCounter === 0) {
      this._isLoading.set(false);
    }
  }

  /**
   * Force l'arrêt du spinner de chargement
   */
  forceHide(): void {
    this._loadingCounter = 0;
    this._isLoading.set(false);
  }

  /**
   * Retourne l'état actuel du chargement
   */
  get loading(): boolean {
    return this._isLoading();
  }
}