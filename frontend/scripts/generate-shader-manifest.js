#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SHADER_DIR = path.join(__dirname, '..', 'src', 'assets', 'shader');
const MANIFEST_PATH = path.join(SHADER_DIR, 'manifest.json');

/**
 * Scanne le répertoire des shaders et génère un manifeste automatiquement
 */
function generateShaderManifest() {
  console.log('🔍 Scanning shader directory:', SHADER_DIR);

  if (!fs.existsSync(SHADER_DIR)) {
    console.error('❌ Shader directory not found:', SHADER_DIR);
    process.exit(1);
  }

  const shaderFolders = fs.readdirSync(SHADER_DIR)
    .filter(item => {
      const fullPath = path.join(SHADER_DIR, item);
      return fs.statSync(fullPath).isDirectory() && /^\d+$/.test(item);
    })
    .map(Number)
    .sort((a, b) => a - b);

  console.log('📁 Found shader folders:', shaderFolders);

  const shaders = [];

  for (const folderId of shaderFolders) {
    const folderPath = path.join(SHADER_DIR, folderId.toString());
    const fragmentPath = path.join(folderPath, 'fragment_shader.glsl');
    const vertexPath = path.join(folderPath, 'vertex_shader.glsl');

    // Vérifier que les fichiers requis existent
    if (fs.existsSync(fragmentPath) && fs.existsSync(vertexPath)) {
      const shaderInfo = extractShaderInfo(folderId, fragmentPath);
      shaders.push(shaderInfo);
      console.log(`✅ Shader ${folderId}: ${shaderInfo.name}`);
    } else {
      console.warn(`⚠️ Shader ${folderId}: Missing required files (fragment_shader.glsl or vertex_shader.glsl)`);
    }
  }

  const manifest = {
    generated: new Date().toISOString(),
    shaders: shaders
  };

  // Écrire le manifeste
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`📝 Manifest generated with ${shaders.length} shaders:`, MANIFEST_PATH);
  
  return manifest;
}

/**
 * Extrait les informations d'un shader depuis ses commentaires
 */
function extractShaderInfo(id, fragmentPath) {
  const fragmentContent = fs.readFileSync(fragmentPath, 'utf8');
  
  // Extraire le nom et la description depuis les commentaires du fragment shader
  const lines = fragmentContent.split('\n').slice(0, 20); // On regarde les 20 premières lignes
  
  let name = `Shader ${id}`;
  let description = 'Generated shader';
  let author = 'Unknown';
  
  // Recherche de patterns dans les commentaires
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Patterns pour le nom
    if (trimmedLine.match(/^\/\/\s*(Title|Name|Shader):\s*(.+)$/i)) {
      name = RegExp.$2.trim();
    } else if (trimmedLine.match(/^\/\/\s*(.+)$/)) {
      const comment = RegExp.$1.trim();
      
      // Ignorer les lignes de séparation, URLs, et commentaires techniques
      if (comment.length < 50 && 
          !comment.includes('http') && 
          !comment.includes('://') && 
          !comment.includes('/') &&
          !comment.match(/^[\/\-\=\*\#]+$/) && // Ignore separator lines
          !comment.includes('License') &&
          !comment.includes('Inspired') &&
          !comment.includes('Increase') &&
          comment !== '' &&
          comment.length > 3 &&
          !comment.includes('@') &&
          !comment.includes('www.')) {
        
        // Prioriser les titres courts qui semblent être des noms de shaders
        if (name === `Shader ${id}` || 
            (comment.length < 30 && !comment.includes(' ') === false && comment.split(' ').length <= 4)) {
          // Si le commentaire semble être un titre (pas un nom de personne)
          if (!comment.match(/^[A-Za-z]+ [A-Za-z]+$/) || comment.includes('Trip') || comment.includes('Test')) {
            name = comment;
          }
        }
      }
    }
    
    // Patterns pour la description
    if (trimmedLine.match(/^\/\/\s*(Description|Desc):\s*(.+)$/i)) {
      description = RegExp.$2.trim();
    }
    
    // Patterns pour l'auteur
    if (trimmedLine.match(/^\/\/\s*(Author|By):\s*(.+)$/i)) {
      author = RegExp.$2.trim();
    } else if (trimmedLine.match(/^\/\/\s*([A-Za-z]+ [A-Za-z]+)\s*$/)) {
      // Détection automatique d'un nom d'auteur (prénom nom)
      const potentialAuthor = RegExp.$1.trim();
      if (author === 'Unknown' && potentialAuthor.split(' ').length === 2) {
        author = potentialAuthor;
      }
    }
  }
  
  // Détection automatique basée sur le contenu
  if (description === 'Generated shader') {
    if (fragmentContent.includes('galaxy') || fragmentContent.includes('star') || fragmentContent.includes('tunnel')) {
      description = 'Space-themed shader with stars and cosmic effects';
    } else if (fragmentContent.includes('color') || fragmentContent.includes('rainbow') || fragmentContent.includes('gradient')) {
      description = 'Colorful animated shader with dynamic gradients';
    } else if (fragmentContent.includes('wave') || fragmentContent.includes('sin') || fragmentContent.includes('cos')) {
      description = 'Wave-based animated shader';
    } else if (fragmentContent.includes('noise') || fragmentContent.includes('random')) {
      description = 'Procedural shader with noise effects';
    } else {
      description = 'Custom WebGL shader effect';
    }
  }
  
  return {
    id,
    name,
    description,
    author: author !== 'Unknown' ? author : undefined,
    files: {
      fragment: 'fragment_shader.glsl',
      vertex: 'vertex_shader.glsl'
    }
  };
}

// Exécution du script
if (require.main === module) {
  try {
    const manifest = generateShaderManifest();
    console.log('\n🎨 Shader manifest generated successfully!');
    console.log('Content preview:');
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.error('❌ Error generating shader manifest:', error.message);
    process.exit(1);
  }
}

module.exports = { generateShaderManifest, extractShaderInfo };