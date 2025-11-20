# Exemple visuel de répétition musicale

## Structure de répétition avec volta brackets

```
Mesure :  0   1   2   3   4   5   6   7   8   9  10  11  [12] 13  14
Section:  A   A   A   B   B   B   C   C   C   D   D   D   1.  2.  E
Reprise: |:                                              :|
         ^                                               ^
      StartLine                                    BackJumpLine
         (mesure 0)                                  (mesure 12)
                                                     Ending 1     Ending 2
```

## Déroulement de la lecture

### 📍 Premier passage (Pass 0)

| Étape | Mesure actuelle | Action | État |
|-------|----------------|--------|------|
| 1 | 0 | Détection StartLine | `repetitionStartMeasure = 0` |
| 2 | 0→11 | Lecture normale | - |
| 3 | 12 (fin) | Détection BackJumpLine | `repetitionPasses[12] = 0` |
| 4 | 12 (fin) | `passCount < 1` → RÉPÉTER | `repetitionPasses[12] = 1` |
| 5 | → | `backToMeasure(0)` | Retour à la mesure 0 |

**Résultat:** Mesures jouées = `0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12`

---

### 📍 Deuxième passage (Pass 1)

| Étape | Mesure actuelle | Action | État |
|-------|----------------|--------|------|
| 1 | 0→11 | Lecture normale | - |
| 2 | 12 (fin) | Détection BackJumpLine | `repetitionPasses[12] = 1` |
| 3 | 12 (fin) | `passCount >= 1` → CONTINUER | Pas de saut |
| 4 | 12 (fin) | Détection Ending #1 | `currentPass = 1` |
| 5 | 12 (fin) | `currentPass > 0 && endingNumber == 1` | SKIP la mesure 12 |
| 6 | 13 | Entrer dans Ending #2 | - |
| 7 | 13→14 | Lecture normale | - |

**Résultat:** Mesures jouées = `0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14`

---

## Séquence complète de lecture

```
🎵 Lecture totale : 0 1 2 3 4 5 6 7 8 9 10 11 12 ↩ 0 1 2 3 4 5 6 7 8 9 10 11 ⤵ 13 14
                    └─────── Pass 0 ─────────┘   └───── Pass 1 ─────────┘ └─ Pass 1 ─┘
                                                                           (skip 12)
```

## Détails techniques de l'algorithme

### État de `repetitionPasses` au fil du temps

```typescript
// Début
repetitionPasses = {}

// Arrivée à la fin de mesure 12 (première fois)
repetitionPasses = { 12: 1 }

// Reste inchangé ensuite car on ne répète qu'une fois
```

### État de `repetitionInstructions`

Après `hydrateRepetitionInstructions()` à chaque mesure :

```typescript
repetitionInstructions = Set([
  { type: StartLine, measureIndex: 0 },
  { type: BackJumpLine, measureIndex: 12 },
  { type: Ending, measureIndex: 12, endingIndices: [1] },
  { type: Ending, measureIndex: 13, endingIndices: [2] }
])
```

## Cas d'usage avancés

### 🎼 Cas 1 : Répétition simple sans volta

```
|: A B C D :|
```

1. Premier passage : A B C D → retour
2. Deuxième passage : A B C D → continue

### 🎼 Cas 2 : Trois endings

```
|: A B C :|¹ :|² :|³
```

1. Pass 0 : A B C 1 → retour
2. Pass 1 : A B C (skip 1) 2 → retour  
3. Pass 2 : A B C (skip 1,2) 3 → continue

*Note: L'implémentation actuelle supporte principalement 2 endings, mais peut être étendue*

### 🎼 Cas 3 : Répétitions imbriquées

```
|: A |: B C :| D :|
```

Nécessite un compteur de passes par niveau de répétition (amélioration future).

## Code exemple pour tester

```typescript
// Simulation d'un passage de répétition
const service = new PlayerService(midiService);

// Setup
service.repetitionInstructions = new Set([
  { type: RepetitionInstructionEnum.StartLine, measureIndex: 0 },
  { type: RepetitionInstructionEnum.BackJumpLine, measureIndex: 12 },
  { type: RepetitionInstructionEnum.Ending, measureIndex: 12, endingIndices: [1] },
  { type: RepetitionInstructionEnum.Ending, measureIndex: 13, endingIndices: [2] }
]);

// Première arrivée à mesure 12
service.maybeMoveToMeasure(iterator); // → backToMeasure(0)
console.log(service.repetitionPasses); // { 12: 1 }

// Deuxième arrivée à mesure 12
service.maybeMoveToMeasure(iterator); // → skip to 13
console.log(service.repetitionPasses); // { 12: 1 }
```

## Diagramme de flux

```
                        ┌─────────────────────┐
                        │  Dernière note de   │
                        │      mesure ?       │
                        └──────────┬──────────┘
                                   │ Oui
                        ┌──────────▼──────────┐
                        │ BackJumpLine ici ?  │
                        └──────────┬──────────┘
                                   │ Oui
                        ┌──────────▼──────────┐
                        │ passCount < 1 ?     │
                        └──┬────────────────┬─┘
                    Oui    │                │ Non
                  ┌────────▼──────┐    ┌────▼────────┐
                  │ Incrémenter   │    │  Continuer  │
                  │   passCount   │    │ normalement │
                  └───────┬───────┘    └─────────────┘
                          │
                  ┌───────▼───────┐
                  │ backToMeasure │
                  │  (StartLine)  │
                  └───────────────┘
```
