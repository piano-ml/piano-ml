# Composant Link - Documentation

Le composant `LinkComponent` permet de rechercher et lier des œuvres musicales depuis la base de données MusicBrainz.

## Fonctionnalités

### 🔍 **Recherche Multiple**
- **Recherche rapide** : Recherche par mots-clés libres
- **Recherche avancée** : Recherche combinée par artiste + titre
- **Filtrage** : Option pour afficher seulement les chansons
- **Tri automatique** : Résultats triés par pertinence

### 📊 **Affichage des Résultats**
- **Tableau détaillé** avec colonnes :
  - Score de pertinence
  - Titre (avec désambiguïsation)
  - Type d'œuvre
  - Langue
  - Compositeurs
  - Paroliers
  - Nombre d'enregistrements
  - Actions

### 🎯 **Interface Utilisateur**
- **Design cohérent** avec le reste de l'application
- **États de chargement** avec spinner animé
- **Gestion d'erreurs** avec messages explicites
- **État vide** avec instructions d'utilisation
- **Boutons d'action** pour sélectionner les œuvres

## Utilisation

### Intégration dans un template

```html
<app-link></app-link>
```

### Intégration dans un module

```typescript
import { LinkComponent } from './loader/components/link/link.component';

@Component({
  imports: [LinkComponent],
  // ...
})
```

## Structure du Composant

### Propriétés principales

```typescript
class LinkComponent {
  searchQuery: string          // Terme de recherche rapide
  artistQuery: string          // Nom d'artiste pour recherche avancée
  titleQuery: string           // Titre pour recherche avancée
  loading: boolean             // État de chargement
  error: string | null         // Message d'erreur
  response: MusicBrainzWorksResponse | null  // Réponse complète de l'API
  displayedWorks: MusicBrainzWork[]          // Œuvres affichées (filtrées)
  showSongsOnly: boolean       // Filtre "chansons seulement"
}
```

### Méthodes principales

```typescript
searchWorks()                     // Recherche par mots-clés
searchByArtistAndTitle()          // Recherche avancée
updateDisplayedWorks()            // Met à jour l'affichage filtré
onWorkClick(work)                 // Gestionnaire de sélection d'œuvre
toggleSongsOnly()                 // Bascule le filtre chansons
clearSearch()                     // Efface la recherche
```

## Exemples d'utilisation

### Recherche simple

1. Tapez "Redemption Song" dans le champ de recherche rapide
2. Cliquez sur "Search" ou appuyez sur Entrée
3. Les résultats s'affichent triés par pertinence

### Recherche avancée

1. Entrez "Bob Marley" dans le champ Artist
2. Entrez "Redemption Song" dans le champ Title
3. Cliquez sur "Search" dans la section avancée
4. Obtenez des résultats plus précis

### Filtrage

- Utilisez le bouton "Songs Only" / "Show All Types" pour filtrer les types d'œuvres
- Par défaut, seules les chansons sont affichées

## Customisation

### Modifier le nombre de résultats

Dans le fichier TypeScript, modifiez la limite :

```typescript
this.musicbrainzService.searchWorks({ query: this.searchQuery, limit: 100 })
```

### Personnaliser l'action de sélection

Modifiez la méthode `onWorkClick()` :

```typescript
onWorkClick(work: MusicBrainzWork) {
  // Votre logique personnalisée ici
  console.log('Selected work:', work);
  
  // Exemple : Naviguer vers une page de détail
  this.router.navigate(['/work', work.id]);
  
  // Exemple : Émettre un événement
  // this.workSelected.emit(work);
}
```

### Ajouter des colonnes au tableau

Dans le template HTML, ajoutez des colonnes dans `<thead>` et `<tbody>` :

```html
<th class="border border-gray-300 px-4 py-2 text-left">ISWC</th>
```

```html
<td class="border border-gray-300 px-4 py-2">
  {{ work.iswcs?.join(', ') || 'N/A' }}
</td>
```

## Styles et Théming

Le composant utilise :
- **Tailwind CSS** pour le styling de base
- **Classes personnalisées** dans `link.component.css`
- **Couleurs cohérentes** avec le thème `neutral-700`
- **Animations** pour les états de chargement

### Modifier les couleurs

```css
/* Dans link.component.css */
.bg-neutral-700 {
  background-color: your-custom-color;
}
```

## États et Comportements

### États d'affichage

1. **État vide** : Aucune recherche effectuée
2. **Chargement** : Recherche en cours
3. **Résultats** : Œuvres trouvées
4. **Aucun résultat** : Recherche sans résultat
5. **Erreur** : Problème de connexion ou API

### Gestion des erreurs

- **Erreurs réseau** : Affichage d'un message d'erreur
- **API indisponible** : Message informatif
- **Recherche vide** : Validation côté client

## Dépendances

- `MusicbrainzService` : Service de recherche MusicBrainz
- `Router` : Navigation Angular
- `FormsModule` : Binding bidirectionnel
- `CommonModule` : Directives Angular de base

## Performance

- **Limite de résultats** : 50 par défaut (configurable)
- **Tri côté client** : Après réception des données
- **Filtrage réactif** : Mise à jour immédiate de l'affichage
- **Debouncing** : Peut être ajouté pour la recherche en temps réel

## Accessibilité

- **Labels explicites** sur tous les champs
- **États de focus** visuels
- **Messages d'erreur** informatifs
- **Navigation clavier** supportée
- **Titres de colonnes** sémantiques
