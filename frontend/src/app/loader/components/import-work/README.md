# Import Work Component

Le composant `ImportWorkComponent` est une copie du composant `OpenComponent` dédiée à l'importation d'œuvres musicales. Il permet de charger et configurer des fichiers MIDI pour l'apprentissage du piano.

## Fonctionnalités

### 📁 **Import de fichiers MIDI**
- **Upload par glisser-déposer** : Interface moderne avec zone de drop
- **Sélection de fichier** : Bouton de parcours de fichiers
- **Formats supportés** : .MID, .MIDI, .KAR
- **Chargement depuis assets** : Possibilité de charger des fichiers prédéfinis

### 🎹 **Configuration des pistes**
- **Analyse automatique** : Détection des instruments et pistes
- **Sélection de pistes** : Choix des pistes à étudier (maximum 2)
- **Exclusion de percussion** : Les pistes de batterie sont automatiquement désactivées
- **Division des voix** : Option pour diviser une piste en voix séparées

### 📊 **Visualisation des données**
- **Tableau détaillé** des pistes avec :
  - Icône d'instrument (♩ pour mélodique, 🥁 pour percussion)
  - Nombre de notes par piste
  - Nom de l'instrument
  - Nom de la piste
  - Case à cocher pour l'étude

## Interface Utilisateur

### Zone de téléchargement
```html
<!-- Zone de drop moderne avec icône et instructions -->
<div class="dropzone">
  <ng-icon name="bootstrapFloppy" class="svg-icon"></ng-icon>
  <p>Click to upload or drag and drop</p>
  <p>.MID, .MIDI, .KAR</p>
</div>
```

### Tableau de configuration
- **Colonnes** : Type, Notes, Instrument, Track Name, Study
- **Interactions** : Sélection de pistes avec validation
- **Contraintes** : Maximum 2 pistes d'étude simultanées

### Options avancées
- **Split voices** : Disponible quand une seule piste est sélectionnée
- **Boutons d'action** : Load (charger) et Reset (réinitialiser)

## Utilisation

### Routage
```typescript
// Routes définies dans loader-routing.module.ts
{
  path: 'import-work',
  component: ImportWorkComponent
},
{
  path: 'import-work/:mbid',  // Avec MusicBrainz ID
  component: ImportWorkComponent
}
```

### Navigation
```typescript
// Navigation vers la page d'import
this.router.navigate(['/loader/import-work']);

// Navigation avec MusicBrainz ID
this.router.navigate(['/loader/import-work', musicBrainzId]);
```

### Intégration en tant que composant
```html
<app-import-work [fileParam]="filename" [mbid]="musicBrainzId"></app-import-work>
```

## Workflow d'utilisation

1. **Upload** : Glisser-déposer ou sélectionner un fichier MIDI
2. **Analyse** : Le fichier est automatiquement analysé
3. **Configuration** : Sélectionner les pistes à étudier (max 2)
4. **Options** : Activer "split voices" si nécessaire
5. **Chargement** : Cliquer "Load" pour démarrer l'étude

## Données de sortie

### LocalStorage
Le composant sauvegarde dans le localStorage :
```typescript
localStorage.setItem("score", JSON.stringify(midi.toJSON()));
localStorage.setItem("studies", JSON.stringify(studies));
localStorage.setItem("splitVoices", JSON.stringify(splitVoices));
```

### Navigation
Après configuration, redirige vers `/desktop` pour l'étude.

## Configuration technique

### Propriétés principales
```typescript
class ImportWorkComponent {
  @Input() fileParam: string     // Fichier à charger automatiquement
  @Input() mbid: string          // MusicBrainz Work ID
  midi: Midi.Midi               // Objet MIDI chargé
  fileName: string              // Nom du fichier
  checkboxGroup: FormGroup      // Formulaire de sélection
  studies: Array<number>        // Indices des pistes sélectionnées
  splitVoices: boolean          // Option de division des voix
  hasFile: boolean              // Fichier chargé ou non
}
```

### Méthodes clés
```typescript
onFileChange(event)       // Gestionnaire d'upload de fichier
openAsset(filename)       // Chargement depuis assets
enjoy(midi)              // Traitement du fichier MIDI chargé
initForm()               // Initialisation du formulaire
checkTrack(index)        // Validation des sélections de pistes
load()                   // Sauvegarde et navigation
```

## Différences avec OpenComponent

### Titre et description
- **Open** : "Open a file" / "Please select a file"
- **Import Work** : "Import Work" / "Please select a file to import"

### Sélecteur
- **Open** : `app-open`
- **Import Work** : `app-import-work`

### Utilisation
- **Open** : Composant général d'ouverture
- **Import Work** : Spécialisé pour l'import d'œuvres

## Gestion d'erreurs

### Types d'erreurs gérées
- **Fichier introuvable** : Erreur de fetch
- **Format invalide** : Erreur de parsing MIDI
- **Fichier corrompu** : Erreur de lecture

### Affichage des erreurs
```html
<app-modal 
  [isModalOpen]="isModalOpen" 
  [title]="modalTitle" 
  [content]="modalContent">
</app-modal>
```

## Styles

### Classes CSS personnalisées
```css
.svg-icon {
  width: 72px !important;
  height: 72px !important;
  margin: 12px;
}

th {
  font-weight: bold;
}
```

### Thème
- **Couleur principale** : `bg-neutral-700`
- **Design** : Cohérent avec les autres composants loader
- **Responsive** : Compatible mobile et desktop

## Extensibilité

### Ajout de fonctionnalités
- **Métadonnées** : Affichage d'informations supplémentaires
- **Prévisualisation** : Lecture audio des pistes
- **Export** : Sauvegarde dans différents formats
- **Validation** : Vérification de la qualité du fichier

### Intégration avec MusicBrainz
Le composant peut être étendu pour utiliser les données MusicBrainz :
```typescript
// Recherche de métadonnées basée sur le nom du fichier
searchMusicBrainzData(fileName: string) {
  // Utilisation du MusicbrainzService
}
```
