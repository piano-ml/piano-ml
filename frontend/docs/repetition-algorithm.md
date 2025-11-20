# Algorithme de gestion des répétitions musicales

## Vue d'ensemble

Cet algorithme gère la navigation dans une partition avec répétitions (reprises, volta brackets, etc.) en utilisant les instructions de répétition d'OpenSheetMusicDisplay.

## Structure des données

### Propriétés ajoutées au service

```typescript
// Set contenant toutes les instructions de répétition rencontrées
repetitionInstructions: Set<RepetitionInstruction>

// Map pour suivre le nombre de passages à chaque point de répétition
// Clé: numéro de mesure, Valeur: nombre de passages effectués
private repetitionPasses: Map<number, number>

// Mesure de départ de la section de répétition actuelle (null si aucune)
private repetitionStartMeasure: number | null
```

## Exemple de répétition

Considérons une partition avec la structure suivante :
```
Mesures: 0 1 2 3 4 5 6 7 8 9 10 11 [12] 13 14 15
                |__________________|1.  |2.
                ^                  ^    ^
            StartLine          Ending1  Ending2
                              BackJump
```

### Premier passage (pass 0)
- Jouer mesures 0 → 11
- Arriver à la mesure 12 (première volta)
- À la fin de 12 : rencontrer BackJumpLine
- Retourner à StartLine (mesure 0 ou début de section)
- Incrémenter `repetitionPasses[12] = 1`

### Deuxième passage (pass 1)
- Rejouer mesures 0 → 11
- Arriver à mesure 12 : détecter `repetitionPasses[12] >= 1`
- Sauter la mesure 12 (première volta)
- Continuer directement à la mesure 13 (deuxième volta)

## Algorithme détaillé

### Fonction `maybeMoveToMeasure(iterator)`

Cette fonction est appelée quand on atteint la première ou dernière note d'une mesure.

#### Cas 1 : Dernière note de mesure (`isLastNoteOfMeasure`)

**1. Détection de BackJumpLine (barre de reprise finale)**
```typescript
if (backJump found at current measure) {
  passCount = repetitionPasses.get(currentMeasure) || 0
  
  if (passCount < 1) {  // Premier passage
    - Incrémenter repetitionPasses[currentMeasure]
    - Trouver le StartLine correspondant
    - backToMeasure(startLineMeasure)
    - Marquer repetitionStartMeasure
    - RETURN (ne pas continuer)
  } else {  // Déjà répété
    - Continuer normalement (pas de saut)
  }
}
```

**2. Gestion des Endings (volta brackets)**
```typescript
if (ending found at current measure) {
  endingNumber = ending.endingIndices[0]  // 1, 2, 3, etc.
  currentPass = getCurrentRepetitionPass(currentMeasure)
  
  if (currentPass == 0 && endingNumber > 1) {
    // Premier passage mais on est sur 2e/3e volta
    - Trouver la dernière mesure de tous les endings
    - nextToMeasure(lastEndingMeasure + 1)
    - RETURN
  }
  
  if (currentPass > 0 && endingNumber == 1) {
    // Deuxième passage sur première volta
    - Sauter (continuer naturellement vers volta suivante)
    - RETURN
  }
}
```

#### Cas 2 : Première note de mesure (`isFirstNoteOfMeasure`)

```typescript
if (startLine found at current measure) {
  - Marquer repetitionStartMeasure = currentMeasure
  - Logger l'entrée dans la section de répétition
}
```

### Fonction utilitaire `getCurrentRepetitionPass(measureNumber)`

Détermine à quel passage on se trouve pour une mesure donnée :

```typescript
function getCurrentRepetitionPass(measureNumber): number {
  // Trouver le BackJumpLine le plus proche qui affecte cette mesure
  relevantJumps = repetitionInstructions
    .filter(instr => 
      instr.type == BackJumpLine && 
      instr.measureIndex >= measureNumber
    )
    .sort(by measureIndex)
  
  if (relevantJumps.length > 0) {
    nearestJump = relevantJumps[0]
    return repetitionPasses.get(nearestJump.measureIndex) || 0
  }
  
  return 0  // Pas de répétition affectant cette mesure
}
```

## Types d'instructions de répétition

D'après `RepetitionInstructionEnum` :
- **StartLine** (0) : Barre de reprise initiale `|:`
- **ForwardJump** (1) : Indication de saut vers l'avant
- **BackJumpLine** (2) : Barre de reprise finale `:|`
- **Ending** (3) : Volta bracket (1., 2., etc.)
- **DaCapo** : Retour au début (D.C.)
- **DalSegno** : Retour au signe (D.S.)
- **Fine** : Fin de la pièce
- **ToCoda** : Aller à la coda
- **Segno** : Marque de segno
- **Coda** : Section coda

## Réinitialisation

Dans la fonction `reset()`, on doit nettoyer :
```typescript
this.repetitionPasses.clear()
this.repetitionStartMeasure = null
this.repetitionInstructions.clear()
```

## Logs de débogage

L'algorithme produit des logs pour faciliter le débogage :
- `"Repeating: jumping back from measure X to Y (pass N)"`
- `"Already repeated measure X, continuing forward"`
- `"At ending N, current pass: M"`
- `"Skipping ending N, jumping to measure X"`
- `"On second pass, skipping first ending"`
- `"Entering repetition section at measure X"`

## Limitations et améliorations futures

### Actuellement supporté
- Répétitions simples avec barres de reprise
- Volta brackets (1., 2., etc.)
- Sections de répétition multiples

### À implémenter
- Da Capo (D.C.)
- Dal Segno (D.S.)
- Fine
- Coda / To Coda
- Répétitions imbriquées complexes
- Plus de 2 passages (volta 1., 2., 3., etc.)

## Exemple d'utilisation

```typescript
// Le service configure automatiquement les répétitions
// Pas besoin d'intervention manuelle

// À chaque note jouée, cursorMayBeAdvance() est appelé
// qui appelle ensuite maybeMoveToMeasure() si nécessaire

// L'algorithme gère automatiquement :
// - Les sauts arrière lors des reprises
// - Le skip des mauvaises volta brackets
// - Le comptage des passages
```
