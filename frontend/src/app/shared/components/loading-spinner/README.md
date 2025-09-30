# Global Loading Spinner

Un système de spinner de chargement global pour l'application Angular Piano-ML.

## Fonctionnalités

- **Activation automatique** : Se déclenche automatiquement lors des changements de route
- **Gestion du compteur** : Permet plusieurs appels simultanés de `show()` et `hide()`
- **Interface moderne** : Spinner avec animation CSS moderne et overlay avec effet de flou
- **Réactif** : Utilise les Angular Signals pour des performances optimales

## Composants

### LoadingService

Service principal qui gère l'état du chargement global.

**Méthodes disponibles :**

- `show()` : Affiche le spinner (incrémente le compteur)
- `hide()` : Cache le spinner (décrémente le compteur)
- `forceHide()` : Force l'arrêt du spinner (remet le compteur à 0)
- `isLoading` : Signal en lecture seule de l'état de chargement
- `loading` : Getter pour l'état actuel (boolean)

**Exemple d'utilisation :**

```typescript
import { LoadingService } from './shared/services/loading.service';

constructor(private loadingService: LoadingService) {}

async loadData() {
  this.loadingService.show();
  
  try {
    const data = await this.apiService.getData();
    // Traitement des données
  } finally {
    this.loadingService.hide();
  }
}
```

### LoadingSpinnerComponent

Composant qui affiche le spinner de chargement.

**Sélecteur :** `<app-loading-spinner>`

**Caractéristiques :**
- Overlay plein écran avec fond semi-transparent
- Effet de flou en arrière-plan (backdrop-filter)
- Animation de rotation fluide
- Text "Chargement..." personnalisable

### RouteLoadingService

Service qui gère automatiquement l'affichage du spinner lors des changements de route.

**Événements écoutés :**
- `NavigationStart` : Affiche le spinner
- `NavigationEnd` : Cache le spinner
- `NavigationCancel` : Cache le spinner
- `NavigationError` : Cache le spinner

## Installation

Le spinner est déjà intégré dans l'application :

1. **LoadingService** : Injecté automatiquement (`providedIn: 'root'`)
2. **LoadingSpinnerComponent** : Ajouté dans `app.component.html`
3. **RouteLoadingService** : Initialisé dans `app.component.ts`

## Personnalisation

### Modifier l'apparence

Editez `/src/app/shared/components/loading-spinner/loading-spinner.component.css` pour personnaliser :

- Couleurs du spinner
- Taille et vitesse d'animation
- Opacity et couleur de l'overlay
- Text de chargement

### Modifier la logique

Le service `LoadingService` peut être étendu pour ajouter :

- Délai minimum d'affichage
- Messages de chargement personnalisés
- Différents types de spinners

## Tests

Des tests unitaires sont inclus pour :
- `LoadingService` : Test des méthodes et de la logique de compteur
- `LoadingSpinnerComponent` : Test d'affichage/masquage du spinner

Exécuter les tests :
```bash
npm run test
```

## Architecture

```
app/
├── shared/
│   ├── components/
│   │   └── loading-spinner/
│   │       ├── loading-spinner.component.ts
│   │       ├── loading-spinner.component.html
│   │       ├── loading-spinner.component.css
│   │       └── loading-spinner.component.spec.ts
│   └── services/
│       ├── loading.service.ts
│       ├── loading.service.spec.ts
│       └── route-loading.service.ts
├── app.component.ts (initialise RouteLoadingService)
└── app.component.html (inclut LoadingSpinnerComponent)
```