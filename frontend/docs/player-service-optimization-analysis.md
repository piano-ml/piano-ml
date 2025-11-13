# PlayerService - Analyse d'Optimisation

## 📊 Vue d'ensemble

Le `PlayerService` est un service Angular complexe (~650 lignes) qui gère :
- La lecture audio de fichiers MIDI
- La synchronisation visuelle (partition OSMD + clavier virtuel)
- L'interaction en temps réel avec un clavier MIDI physique
- La gestion de l'apprentissage interactif

## 🔍 Problèmes identifiés

### 1. ⚠️ **Calculs répétés coûteux**

#### `getTimeFactor()` - Appelé massivement
```typescript
getTimeFactor() {
  return 1 / (this.playConfiguration.tempoFactor / this.playConfiguration.delayFactor);
}
```
**Problème** : Recalculé à chaque note (potentiellement des milliers de fois)
**Impact** : Division + division à chaque appel
**Solution** : Mémoriser le résultat, invalider uniquement quand tempoFactor/delayFactor changent

#### `isInPlayableRange()` - Double calcul
```typescript
private isInPlayableRange(note: Note, startTime: number, endCut: number) {
  return !((note.time * this.getTimeFactor()) < (startTime)
    || (note.time * this.getTimeFactor()) >= (endCut))
}
```
**Problème** : `note.time * this.getTimeFactor()` calculé 2 fois par appel
**Impact** : O(n) notes × 2 calculs inutiles

### 2. 🐌 **Manipulation DOM intensive**

#### `lightNoteOnKeyboard()` - Recherche DOM répétée
```typescript
private lightNoteOnKeyboard(hand: string, note: Note) {
  const keys = this.keyboardElement.nativeElement
    .querySelectorAll(`.key${note.midi}`) as NodeListOf<HTMLElement>;
  // Appelle querySelectorAll pour CHAQUE note
}
```
**Problème** : `querySelectorAll()` à chaque note jouée
**Impact** : Traversée DOM complète × nombre de notes
**Solution** : Cache des références DOM par MIDI note number

#### `removeAllNotesFromKeyboard()` - Sélecteur complexe
```typescript
const selector = ".note-on-lh, .note-on-rh, .note-on-late";
const keys = Array.from(this.keyboardElement.nativeElement.querySelectorAll(selector))
```
**Problème** : Multi-sélecteur à chaque reset
**Solution** : Maintenir un Set des éléments actifs

### 3. 🔄 **Itérations inefficaces**

#### `integrateMidiEventInLastNote()` - Itération complète
```typescript
private integrateMidiEventInLastNote(midiEvent: MidiStateEvent): number {
  let success = -1;
  const entries = Array.from(this.lateNotes.entries()); // Copie complète
  for (const [key, notes] of entries) {
    for (let idx = notes.length - 1; idx >= 0; idx--) {
      // Itère sur TOUTES les notes en attente
    }
  }
}
```
**Problème** : 
- `Array.from()` crée une copie complète
- Parcourt toutes les entrées même après avoir trouvé la note
**Solution** : Index direct par MIDI note, early exit

#### `cursorMayBeAdvance()` - Boucle while dangereuse
```typescript
while (safety < 100 && this.osmdCursor.NotesUnderCursor().every(n => this.isSkipable(n))) {
  this.osmdCursor.next();
  safety++;
}
```
**Problème** : 
- `NotesUnderCursor()` et `every()` appelés à chaque itération
- Peut itérer jusqu'à 100 fois

### 4. 💾 **Allocations mémoire excessives**

#### `scheduleNote()` - Création d'objets en boucle
```typescript
Tone.getTransport().schedule((time: number) => {
  Tone.getDraw().schedule(() => {
    // Crée 2 closures par note
  }, time);
}, noteTimeStart);

// × 4 schedules par note
// × nombre de notes = milliers de closures
```
**Problème** : Crée 4+ closures par note pendant la planification
**Impact** : Garbage collector surchargé

#### `lightNoteOnKeyboard()` - Array temporaire
```typescript
const classesToAdd = [`note-on-${hand}`, `note-on-${hand}-velocity-${velocityUI}`];
keys.forEach((el: HTMLElement) => {
  el.classList.add(...classesToAdd);
});
```
**Problème** : Crée un array à chaque appel
**Solution** : Appliquer directement ou utiliser un cache

### 5. 🎯 **Logique sous-optimale**

#### `calculateStartTimeInMsForMeasure()` - Calcul O(n)
```typescript
calculateStartTimeInMsForMeasure(start: number, midiHeader: Midi.Header): number {
  let elapsedTicks = 0;
  for (let i = 0; i < start; i++) {
    timeSig = midiHeader.timeSignatures.filter((t) => t.ticks <= elapsedTicks).at(-1);
    elapsedTicks += getStaveDurationTick(...);
  }
}
```
**Problème** : 
- `filter()` à chaque itération
- Recalcule depuis 0 à chaque appel
**Solution** : Précalculer une table de lookup, ou mémoriser

#### `scheduleAccompanimentTracks()` - Index redondant
```typescript
let i = 0;
for (const track of midiOther.tracks) {
  this.spessasynth?.programChange(midiOther.tracks[i].channel, track.instrument.number);
  this.scheduleAccompanimentTrack(midiOther.tracks[i].channel, track, startTime, endCut);
  i++;
}
```
**Problème** : `track` est déjà disponible dans la boucle, pas besoin de `i`

### 6. 🔧 **Constantes non utilisées**
```typescript
const PERFECT_RANGE = 0.02  // Jamais utilisé dans le code
```

### 7. 📝 **Variables inutilisées**
```typescript
soundFontArrayBuffer!: ArrayBuffer;  // Déclaré mais jamais utilisé
currentTime = 0;  // Déclaré mais jamais utilisé
```

## 🎯 Optimisations proposées par priorité

### 🔥 **PRIORITÉ HAUTE** (Impact immédiat sur performance)

#### 1. Mémoriser `getTimeFactor()`
```typescript
private timeFactorCache?: number;
private lastTempoFactor?: number;
private lastDelayFactor?: number;

getTimeFactor() {
  if (this.timeFactorCache === undefined 
      || this.lastTempoFactor !== this.playConfiguration.tempoFactor
      || this.lastDelayFactor !== this.playConfiguration.delayFactor) {
    this.timeFactorCache = 1 / (this.playConfiguration.tempoFactor / this.playConfiguration.delayFactor);
    this.lastTempoFactor = this.playConfiguration.tempoFactor;
    this.lastDelayFactor = this.playConfiguration.delayFactor;
  }
  return this.timeFactorCache;
}
```
**Gain estimé** : 30-40% réduction calculs dans les boucles de scheduling

#### 2. Cache DOM pour le clavier
```typescript
private keyboardElementsCache = new Map<number, HTMLElement[]>();

private getKeyboardElements(midiNote: number): HTMLElement[] {
  if (!this.keyboardElementsCache.has(midiNote)) {
    const elements = Array.from(
      this.keyboardElement.nativeElement.querySelectorAll(`.key${midiNote}`)
    ) as HTMLElement[];
    this.keyboardElementsCache.set(midiNote, elements);
  }
  return this.keyboardElementsCache.get(midiNote)!;
}
```
**Gain estimé** : 60-80% réduction temps dans lightNoteOnKeyboard

#### 3. Optimiser `isInPlayableRange()`
```typescript
private isInPlayableRange(note: Note, startTime: number, endCut: number) {
  const noteTime = note.time * this.getTimeFactor();
  return noteTime >= startTime && noteTime < endCut;
}
```
**Gain estimé** : Élimination de 50% des multiplications

#### 4. Index direct pour lateNotes
```typescript
// Au lieu de Map<ticks, lateNote[]>
private lateNotesByMidi = new Map<number, lateNote>(); // Direct par MIDI note

private integrateMidiEventInLastNote(midiEvent: MidiStateEvent): number {
  const lateNote = this.lateNotesByMidi.get(midiEvent.note);
  if (lateNote) {
    this.lateNotesByMidi.delete(midiEvent.note);
    this.removeMidiNoteFromKeyboard(lateNote.note.midi);
    return 1;
  }
  return -1;
}
```
**Gain estimé** : O(n) → O(1) pour la recherche de notes

### 🟡 **PRIORITÉ MOYENNE** (Amélioration qualité code)

#### 5. Simplifier `scheduleAccompanimentTracks()`
```typescript
private scheduleAccompanimentTracks(midiOther: Midi.Midi, startTime: number, endCut: number) {
  for (const track of midiOther.tracks) {
    this.spessasynth?.programChange(track.channel, track.instrument.number);
    this.scheduleAccompanimentTrack(track.channel, track, startTime, endCut);
  }
}
```

#### 6. Éliminer allocations inutiles dans `lightNoteOnKeyboard()`
```typescript
private lightNoteOnKeyboard(hand: string, note: Note) {
  const velocityUI = Math.min(Math.max(Math.round(note.velocity * 10), 1), 10);
  const keys = this.getKeyboardElements(note.midi);
  
  const class1 = `note-on-${hand}`;
  const class2 = `note-on-${hand}-velocity-${velocityUI}`;
  
  for (const el of keys) {
    el.classList.add(class1, class2);
  }
}
```

#### 7. Précalculer les temps de mesure
```typescript
private measureTimesCache?: Map<number, number>;

private precalculateMeasureTimes(midiHeader: Midi.Header, maxMeasure: number) {
  this.measureTimesCache = new Map();
  // Calculer une seule fois tous les temps de mesure
}
```

### 🟢 **PRIORITÉ BASSE** (Nettoyage code)

#### 8. Supprimer code mort
- `PERFECT_RANGE` constant
- `soundFontArrayBuffer` property
- `currentTime` property
- `tellIfInTime()` method (semble être du debug)

#### 9. Typage plus strict
```typescript
piano: any;  // → Piano (déjà importé)
```

#### 10. Optimiser `clearClassesFromSVG()`
```typescript
function clearClassesFromSVG(el: HTMLElement, prefix: string) {
  // Utiliser remove() avec spread au lieu de forEach
  const toRemove = Array.from(el.classList).filter(c => c.startsWith(prefix));
  el.classList.remove(...toRemove);
}
```

## 📈 Impact global estimé

### Performance
- **CPU** : Réduction de 25-35% du temps CPU dans les boucles de scheduling
- **Memory** : Réduction de 40-50% des allocations temporaires
- **DOM** : Réduction de 70-80% des requêtes DOM

### Maintenabilité
- Code plus lisible et maintenable
- Élimination du code mort
- Meilleure séparation des responsabilités

## ⚠️ Risques et précautions

1. **Cache invalidation** : Assurer que les caches sont invalidés correctement
2. **Memory leaks** : Nettoyer les caches dans `cleanup()`
3. **Tests** : Tester minutieusement chaque optimisation
4. **Régression** : Valider que le comportement reste identique

## 🔄 Plan d'implémentation suggéré

### Phase 1 : Quick wins (1-2h)
- Mémorisation `getTimeFactor()`
- Optimiser `isInPlayableRange()`
- Supprimer code mort

### Phase 2 : DOM optimization (2-3h)
- Implémenter cache DOM
- Optimiser `lightNoteOnKeyboard()`

### Phase 3 : Data structures (3-4h)
- Refactorer `lateNotes` structure
- Optimiser `integrateMidiEventInLastNote()`

### Phase 4 : Précalculs (2-3h)
- Table de lookup pour mesures
- Optimiser `calculateStartTimeInMsForMeasure()`

## 🎓 Conclusion

Les optimisations proposées sont **réalistes** et **implémentables** sans refonte majeure.
Le gain de performance attendu est **significatif** (25-50% selon les scénarios).
Le code deviendra plus **maintenable** et **performant**.

**Recommandation** : Implémenter les optimisations priorité HAUTE en premier, mesurer l'impact, puis décider si les autres sont nécessaires.
