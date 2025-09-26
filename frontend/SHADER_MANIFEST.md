# 🎨 Shader Manifest Generator

Ce projet inclut un système automatique de génération de manifeste pour les shaders WebGL.

## Scripts NPM disponibles

### Scripts principaux
- `npm run shaders:manifest` - Génère le manifeste des shaders automatiquement
- `npm run shaders:watch` - Surveille les changements dans les shaders et régénère le manifeste
- `npm run dev` - Lance le développement avec surveillance des shaders
- `npm run build` - Build de production avec génération du manifeste
- `npm run build:prod` - Build optimisé avec manifeste

### Comment ça fonctionne

1. **Scan automatique** : Le script scanne le dossier `src/assets/shader/` à la recherche de dossiers numérotés (1, 2, 3, etc.)

2. **Validation** : Vérifie que chaque dossier contient `fragment_shader.glsl` et `vertex_shader.glsl`

3. **Extraction intelligente** : Analyse les commentaires des shaders pour extraire :
   - Nom du shader
   - Description
   - Auteur
   - Métadonnées

4. **Génération** : Crée automatiquement `src/assets/shader/manifest.json`

## Structure attendue

```
src/assets/shader/
├── 1/
│   ├── fragment_shader.glsl
│   └── vertex_shader.glsl
├── 2/
│   ├── fragment_shader.glsl
│   └── vertex_shader.glsl
├── 3/
│   ├── fragment_shader.glsl
│   └── vertex_shader.glsl
└── manifest.json (généré automatiquement)
```

## Format des commentaires dans les shaders

Pour une meilleure détection automatique, utilisez ces patterns dans vos shaders :

```glsl
// Title: Mon Super Shader
// Author: Votre Nom
// Description: Description détaillée du shader

// ou simplement :
// Mon Super Shader
// Description du shader
```

## Exemples d'utilisation

### Ajouter un nouveau shader
1. Créez un dossier `src/assets/shader/4/`
2. Ajoutez vos fichiers `.glsl`
3. Lancez `npm run shaders:manifest`
4. Le manifeste sera mis à jour automatiquement !

### Développement avec surveillance
```bash
npm run dev  # Lance le serveur + surveillance des shaders
```

### Build de production
```bash
npm run build  # Génère le manifeste puis build l'app
```

Le système détecte automatiquement tous les nouveaux shaders sans modification de code ! 🚀