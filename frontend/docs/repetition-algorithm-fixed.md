# Algorithme de répétition/volta corrigé

## Principe de base

L'algorithme utilise un compteur de passage (`passCount`) qui commence à 1 et s'incrémente à chaque répétition.

### Correspondance passages/voltas
- **Pass 1** → joue **volta 1**
- **Pass 2** → joue **volta 2**
- **Pass 3** → joue **volta 3**
- etc.

## Structure des instructions de répétition

### Types d'instructions
1. **StartLine** (Begin) : Marque le début de la section répétée `|:`
2. **BackJumpLine** (End) : Marque la fin de la section et déclenche le retour `:|`
3. **Ending** (Begin/End) : Marque les voltas (1., 2., 3., etc.)

### AlignmentType
- **Begin** : Instruction au début de la mesure
- **End** : Instruction à la fin de la mesure

## Flux de l'algorithme

### Exemple : 2 voltas
```
Mesures: 0-11 [12] 13
         |:    :|¹  ²
```

#### Pass 1 (passCount = 1)
1. Mesures 0→11 : lecture normale
2. Mesure 12 (fin) : 
   - Détecte BackJumpLine (End)
   - Vérifie `passCount < maxEndingNumber` (1 < 2) ✓
   - **Action** : Jump back to measure 0
   - Incrémente `passCount = 2`

#### Pass 2 (passCount = 2)
1. Mesures 0→11 : lecture normale
2. Mesure 12 (début) :
   - Détecte Ending avec `endingIndices = [1]`
   - Vérifie `!endingIndices.includes(passCount)` (!includes(2)) ✓
   - Cherche Ending avec `endingIndices.includes(2)`
   - **Action** : Jump to measure 13
3. Mesure 13 : Continue normalement

## Code clé

### Détection du BackJump (fin de mesure)
```typescript
if (this.isLastNoteOfMeasure(iterator)) {
  const backJump = find BackJumpLine at END of measure
  
  if (backJump && passCount < maxEndingNumber) {
    backToMeasure(startLine)
    passCount++
  }
}
```

### Détection du skip d'ending (début de mesure)
```typescript
if (this.isFirstNoteOfMeasure(iterator)) {
  const currentEnding = find Ending at BEGIN of measure
  
  if (currentEnding && !includes(passCount)) {
    const targetEnding = find Ending with passCount
    nextToMeasure(targetEnding)
  }
}
```

## Cas supportés

### 2 voltas (standard)
```
|: A B C :|¹ :|²
```
- Pass 1: A B C 1 → back
- Pass 2: A B C (skip 1) → 2 → continue

### 3 voltas
```
|: A B C :|¹ :|² :|³
```
- Pass 1: A B C 1 → back
- Pass 2: A B C (skip 1) 2 → back
- Pass 3: A B C (skip 1,2) 3 → continue

### Voltas combinées
```
|: A B C :|¹'² :|³
```
- Pass 1: A B C 1,2 → back
- Pass 2: A B C 1,2 → back
- Pass 3: A B C (skip 1,2) 3 → continue

### Répétition simple (sans voltas)
```
|: A B C :|
```
- Pass 1: A B C → back (si passCount < 2)
- Pass 2: A B C → continue

## Fonctions utilitaires

### `backToMeasure(measureIndex)`
Recule le curseur jusqu'à la mesure spécifiée.

### `nextToMeasure(measureIndex)`
Avance le curseur jusqu'à la mesure spécifiée.

### `isLastNoteOfMeasure(iterator)`
Détecte si on est sur la dernière note d'une mesure.

### `isFirstNoteOfMeasure(iterator)`
Détecte si on est sur la première note d'une mesure.

## Points clés de l'implémentation

1. ✅ **passCount commence à 1** (pas 0) car on est déjà dans le premier passage
2. ✅ **BackJumpLine vérifié à la fin de mesure** pour déclencher le retour
3. ✅ **Ending vérifié au début de mesure** pour décider si on skip
4. ✅ **maxEndingNumber calculé dynamiquement** à partir de tous les endings
5. ✅ **Support de n'importe quel nombre de voltas** grâce à la logique générique

## Logs de débogage

Les logs affichent :
- `BackJump found at end of measure X, pass: Y`
- `Current ending: [numbers], max ending: Z, passCount: Y`
- `Jumping back to measure X, next pass will be Y`
- `Last ending reached (X), continuing forward`
- `At beginning of ending [X], current pass: Y`
- `Skipping ending [X], looking for ending Y`
- `Jumping to ending Y at measure Z`
- `Playing ending [X] for pass Y`
