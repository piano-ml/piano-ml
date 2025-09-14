# MusicBrainz Service

Service Angular pour interagir avec l'API publique de MusicBrainz et rechercher des œuvres musicales.

## Installation

Le service est déjà configuré et peut être injecté dans n'importe quel composant :

```typescript
import { MusicbrainzService } from './shared/services/musicbrainz.service';

constructor(private musicbrainzService: MusicbrainzService) {}
```

## Fonctionnalités

### Recherche de base

```typescript
// Recherche simple par mots-clés
this.musicbrainzService.searchWorks({ query: 'redemption song' })
  .subscribe(response => {
    console.log(`Trouvé ${response.count} œuvres`);
    console.log(response.works);
  });
```

### Recherche par titre

```typescript
// Recherche exacte par titre
this.musicbrainzService.searchWorksByTitle('Redemption Song')
  .subscribe(response => {
    console.log(response.works);
  });
```

### Recherche par artiste et titre

```typescript
// Recherche combinée artiste + titre
this.musicbrainzService.searchWorksByArtistAndTitle('Bob Marley', 'Redemption Song')
  .subscribe(response => {
    console.log(response.works);
  });
```

### Pagination

```typescript
// Recherche avec pagination
this.musicbrainzService.searchWorks({ 
  query: 'redemption', 
  limit: 10, 
  offset: 20 
}).subscribe(response => {
  console.log(response.works);
});
```

## Utilitaires

### Extraire les compositeurs

```typescript
const work = response.works[0];
const composers = this.musicbrainzService.getComposers(work);
console.log('Compositeurs:', composers);
```

### Extraire les paroliers

```typescript
const lyricists = this.musicbrainzService.getLyricists(work);
console.log('Paroliers:', lyricists);
```

### Obtenir les enregistrements

```typescript
const recordings = this.musicbrainzService.getRecordings(work);
console.log('Enregistrements:', recordings);
```

### Filtrer par type

```typescript
// Obtenir seulement les chansons
const songs = this.musicbrainzService.getSongsOnly(response.works);

// Filtrer par type personnalisé
const instrumentals = this.musicbrainzService.filterByType(response.works, 'Instrumental');
```

### Trier par pertinence

```typescript
const sortedWorks = this.musicbrainzService.sortByRelevance(response.works);
```

## Structure des données

### MusicBrainzWork

```typescript
interface MusicBrainzWork {
  id: string;                    // ID unique MusicBrainz
  score: number;                 // Score de pertinence (0-100)
  title: string;                 // Titre de l'œuvre
  type?: string;                 // Type (Song, Instrumental, etc.)
  language?: string;             // Code de langue
  iswcs?: string[];             // Codes ISWC
  aliases?: MusicBrainzAlias[]; // Alias/titres alternatifs
  relations?: MusicBrainzRelation[]; // Relations (compositeurs, etc.)
  languages?: string[];          // Langues multiples
  disambiguation?: string;       // Texte de désambiguïsation
}
```

### MusicBrainzWorksResponse

```typescript
interface MusicBrainzWorksResponse {
  created: string;    // Date de création de la réponse
  count: number;      // Nombre total de résultats
  offset: number;     // Décalage de pagination
  works: MusicBrainzWork[]; // Tableau des œuvres
}
```

## Exemple d'utilisation complète

```typescript
import { Component, OnInit } from '@angular/core';
import { MusicbrainzService, MusicBrainzWork } from '../shared/services/musicbrainz.service';

@Component({
  selector: 'app-music-search',
  template: `
    <input [(ngModel)]="searchTerm" (keyup.enter)="search()">
    <button (click)="search()">Rechercher</button>
    
    <div *ngFor="let work of works">
      <h3>{{ work.title }}</h3>
      <p>Score: {{ work.score }}</p>
      <p>Compositeurs: {{ getComposers(work).join(', ') }}</p>
      <p>Enregistrements: {{ getRecordings(work).length }}</p>
    </div>
  `
})
export class MusicSearchComponent {
  searchTerm = '';
  works: MusicBrainzWork[] = [];

  constructor(private musicbrainzService: MusicbrainzService) {}

  search() {
    this.musicbrainzService.searchWorksByTitle(this.searchTerm)
      .subscribe(response => {
        // Filtrer seulement les chansons et trier par pertinence
        this.works = this.musicbrainzService.sortByRelevance(
          this.musicbrainzService.getSongsOnly(response.works)
        );
      });
  }

  getComposers(work: MusicBrainzWork): string[] {
    return this.musicbrainzService.getComposers(work);
  }

  getRecordings(work: MusicBrainzWork) {
    return this.musicbrainzService.getRecordings(work);
  }
}
```

## Notes importantes

- L'API MusicBrainz a des limites de taux (rate limiting)
- Le service inclut un User-Agent approprié pour respecter les conditions d'utilisation
- Les erreurs sont gérées et remontées via les observables
- Le service supporte la pagination pour les grandes recherches
- Les données sont typées pour une meilleure expérience de développement

## Respect des conditions d'utilisation

Ce service respecte les conditions d'utilisation de MusicBrainz :
- User-Agent personnalisé identifiant l'application
- Gestion appropriée des erreurs et timeouts
- Pas de cache local des données (respecte la fraîcheur des données)
