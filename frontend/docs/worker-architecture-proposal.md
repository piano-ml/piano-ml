# Architecture Hybride avec Web Worker - Proposition

## ❌ Pourquoi une migration complète n'est PAS possible

Le `PlayerService` actuel ne peut pas être migré vers un Web Worker car :

1. **APIs Audio** : `AudioContext`, `Tone.js`, `Piano`, `Synthetizer` nécessitent le main thread
2. **Manipulation DOM** : Accès direct aux éléments du clavier et de la partition
3. **Dépendances Angular** : Injection de dépendances, signals, effects

## ✅ Ce qui PEUT être fait : Architecture Hybride

### Parties déplaçables vers un Worker

Les **calculs MIDI** peuvent être isolés dans un worker :

#### 1. Calculs de timing MIDI
```typescript
// Dans le worker
- calculateStartTime()
- calculateEndTime()
- calculateStartTimeInMsForMeasure()
- getTimeFactor()
- getStaveDurationTick()
```

#### 2. Traitement MIDI
```typescript
// Dans le worker
- splitMidi()
- Parsing et manipulation des objets Midi.Midi
- Calculs de mesures (bars, ticks)
- Analyse des time signatures
```

#### 3. Logique de planification
```typescript
// Dans le worker
- Calculer tous les événements à planifier
- Générer la timeline complète
- Retourner les instructions de scheduling au main thread
```

### Architecture proposée

```
┌─────────────────────────────────────────────┐
│           Main Thread (Angular)              │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │      PlayerService (Slim)          │    │
│  │  - Audio (Tone.js, Piano, Synth)  │    │
│  │  - DOM manipulation                │    │
│  │  - OSMD cursor                     │    │
│  │  - Keyboard lighting               │    │
│  └────────────────────────────────────┘    │
│              ↕ (postMessage)                │
│  ┌────────────────────────────────────┐    │
│  │       WorkerAdapter                │    │
│  │  - Communication bridge            │    │
│  │  - Message serialization           │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│            Web Worker Thread                 │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │    MidiCalculationWorker           │    │
│  │  - MIDI parsing                    │    │
│  │  - Timing calculations             │    │
│  │  - Schedule generation             │    │
│  │  - Track splitting                 │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Bénéfices attendus

1. **Performance** : Calculs MIDI complexes n'impactent plus le main thread
2. **Responsiveness** : UI reste fluide pendant les calculs
3. **Isolation** : Logique métier séparée de la présentation

### Limitations

- Audio reste sur le main thread (obligatoire)
- DOM manipulation reste sur le main thread (obligatoire)
- Communication asynchrone entre threads (overhead)
- Sérialisation des messages (coût CPU)

### Gain estimé

- ⚡ **15-30%** de réduction de charge CPU sur le main thread
- 📊 Meilleure fluidité lors du parsing de gros fichiers MIDI
- 🎯 Mais **PAS** de gain sur l'audio rendering (impossible à déplacer)

## Conclusion

Une migration complète est **impossible** à cause des contraintes Web Audio API et DOM.
Une architecture hybride est **possible** mais avec des gains limités.

**Recommandation** : Ne pas migrer pour l'instant. Le gain ne justifie pas la complexité ajoutée.
Si des problèmes de performance apparaissent, cibler spécifiquement le parsing MIDI.
