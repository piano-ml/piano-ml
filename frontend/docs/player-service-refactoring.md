# Refactorisation du PlayerService

## Vue d'ensemble

Le `PlayerService` a été refactorisé pour séparer les différentes responsabilités en services modulaires tout en partageant un état centralisé. Cette architecture améliore la maintenabilité, la testabilité et la lisibilité du code.

## Architecture

### Services créés

#### 1. **PlayerStateService** (`player-state.service.ts`)
Service central qui contient tout l'état partagé entre les différents services.

**Responsabilités :**
- Stockage de l'état OSMD (partition, curseur)
- Gestion des signals réactifs (measure, message, elapsedTime)
- État de lecture (duration, playConfiguration, currentMeasure)
- Tracking MIDI (lateNotes, midiPressedNotes, lastMidiEventTime)
- Préférences du clavier (leftmostKey, rightmostKey)
- Cache du facteur de temps pour optimiser les calculs

**Méthodes principales :**
- `getTimeFactor()` : Calcule le facteur de temps avec cache
- `invalidateTimeFactorCache()` : Invalide le cache
- `resetLateNotes()` : Réinitialise les notes en retard
- `reset()` : Réinitialise l'état de base

#### 2. **PlayerKeyboardService** (`player-keyboard.service.ts`)
Service responsable de la gestion du clavier visuel (manipulation DOM et highlighting).

**Responsabilités :**
- Gestion de l'élément DOM du clavier
- Cache des éléments DOM par note MIDI
- Highlighting des notes (allumage/extinction)
- Tracking des notes actives
- Chargement des préférences depuis localStorage

**Méthodes principales :**
- `setKeyboardElement(element)` : Configure l'élément DOM
- `lightNoteOnKeyboard(hand, note)` : Allume une note
- `removeMidiNoteFromKeyboard(midiNote)` : Éteint une note
- `removeAllNotesFromKeyboard()` : Éteint toutes les notes
- `reloadKeyboardPreferences()` : Recharge les préférences
- `cleanup()` : Nettoie les ressources

#### 3. **PlayerRepetitionService** (`player-repetition.service.ts`)
Service responsable de la gestion des répétitions et de la navigation dans la partition.

**Responsabilités :**
- Gestion des instructions de répétition (volta, da capo, etc.)
- Navigation dans les mesures (forward/backward)
- Tracking des passages de répétition
- Hydratation des instructions depuis OSMD

**Méthodes principales :**
- `reset()` : Réinitialise l'état des répétitions
- `hydrateRepetitionInstructions()` : Charge les instructions depuis OSMD
- `maybeMoveToMeasure(iterator)` : Gère les sauts de mesure
- `isFirstNoteOfMeasure(iterator)` : Détecte la première note
- `isLastNoteOfMeasure(iterator)` : Détecte la dernière note

#### 4. **PlayerAudioService** (`player-audio.service.ts`)
Service responsable de la gestion de l'audio (synthétiseurs et soundfonts).

**Responsabilités :**
- Initialisation et gestion du soundfont Spessasynth
- Initialisation et gestion du piano Tone.js
- Contrôle des notes MIDI (noteOn/noteOff)
- Changement de programmes MIDI

**Méthodes principales :**
- `initSoundFont()` : Initialise le soundfont
- `initPiano()` : Initialise le piano
- `stopAll()` : Arrête tous les sons
- `noteOn(channel, note, velocity)` : Déclenche une note
- `noteOff(channel, note)` : Arrête une note
- `pianoKeyDown/Up(params)` : Contrôle du piano

#### 5. **PlayerService** (refactorisé)
Service principal qui orchestre les autres services et maintient l'interface publique.

**Changements :**
- Injection des services spécialisés via le constructeur
- Délégation des appels aux services appropriés
- Conservation de l'API publique pour la compatibilité
- Getters/setters pour accéder à l'état partagé

## Bénéfices

### ✅ Séparation des responsabilités
Chaque service a un rôle clair et bien défini (Single Responsibility Principle).

### ✅ État partagé centralisé
Le `PlayerStateService` est la source unique de vérité, évitant la duplication d'état.

### ✅ Testabilité améliorée
Chaque service peut être testé indépendamment avec des mocks.

### ✅ Maintenabilité
Les modifications sont localisées dans le service concerné.

### ✅ Rétrocompatibilité
L'API publique du `PlayerService` reste inchangée.

### ✅ Performance
Cache et optimisations maintenues (DOM cache, time factor cache).

## Migration

La migration a été effectuée de manière incrémentale :

1. ✅ Création du `PlayerStateService` avec l'état partagé
2. ✅ Extraction du `PlayerKeyboardService`
3. ✅ Extraction du `PlayerRepetitionService`
4. ✅ Extraction du `PlayerAudioService`
5. ✅ Refactorisation du `PlayerService` pour déléguer
6. ✅ Validation (aucune erreur de compilation)

## Utilisation

Les composants Angular continuent d'injecter `PlayerService` comme avant :

```typescript
constructor(private playerService: PlayerService) {}
```

Toutes les méthodes publiques restent disponibles :

```typescript
this.playerService.play(config);
this.playerService.pause();
this.playerService.reset(config);
this.playerService.setOsmd(osmd);
// etc.
```

## Structure des fichiers

```
src/app/desktop/service/
├── player.service.ts              # Service principal (orchestration)
├── player-state.service.ts        # État centralisé
├── player-keyboard.service.ts     # Gestion du clavier visuel
├── player-repetition.service.ts   # Gestion des répétitions
└── player-audio.service.ts        # Gestion audio
```

## Prochaines étapes possibles

- [ ] Créer un `PlayerTransportService` pour la logique de scheduling Tone.js
- [ ] Ajouter des tests unitaires pour chaque service
- [ ] Documenter les interfaces TypeScript
- [ ] Créer des diagrammes de séquence pour les flux complexes
