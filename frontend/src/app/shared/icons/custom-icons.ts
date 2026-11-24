// Icônes personnalisées pour le projet
export interface CustomIcon {
  name: string;
  data: string;
}

// SVG content for piano keyboard icon (simplified, 3 white + 2 black keys)
export const keyboard: CustomIcon = {
  name: 'keyboard',
  data: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <!-- Simplified piano keyboard -->
    <g>
      <!-- Background frame -->
      <rect x="32" y="96" width="448" height="320" fill="#333" rx="16"/>
      
      <!-- White keys (3 keys) -->
      <rect x="48" y="112" width="144" height="288" fill="white" stroke="#333" stroke-width="4" rx="6"/>
      <rect x="192" y="112" width="144" height="288" fill="white" stroke="#333" stroke-width="4" rx="6"/>
      <rect x="336" y="112" width="128" height="288" fill="white" stroke="#333" stroke-width="4" rx="6"/>
      
      <!-- Black keys (2 keys) -->
      <rect x="158" y="112" width="84" height="180" fill="#1a1a1a" rx="5"/>
      <rect x="302" y="112" width="84" height="180" fill="#1a1a1a" rx="5"/>
    </g>
  </svg>`
};

// SVG content for right hand icon (FontAwesome faHand mirrored)
export const righthand: CustomIcon = {
  name: 'righthand',
  data: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <g transform="scale(-1, 1) translate(-512, 0)">
      <path fill="currentColor" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 176c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32L32 288c0 88.4 71.6 160 160 160l1.6 0c88.4 0 160-71.6 160-160l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208z"/>
    </g>
  </svg>`
};

// SVG content for left hand icon (FontAwesome faHand)
export const lefthand: CustomIcon = {
  name: 'lefthand',
  data: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 176c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32L32 288c0 88.4 71.6 160 160 160l1.6 0c88.4 0 160-71.6 160-160l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208z"/>
  </svg>`
};

// SVG content for the Remote coach icon: "AI" in a rounded square (ai-rectangle), stroked in the current color
export const aiRectangle: CustomIcon = {
  name: 'aiRectangle',
  data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <path stroke="currentColor" stroke-linecap="round" stroke-width="6" fill="none" d="M46 76L58.0844 52.2089C58.1495 52.0807 58.281 52 58.4248 52V52C58.5725 52 58.7069 52.0852 58.77 52.2187L70 76M52 70H63M81 76V52"/>
    <rect width="82" height="82" x="23" y="23" stroke="currentColor" stroke-width="6" rx="20" fill="none"/>
  </svg>`
};

// Export all custom icons
export const customIcons = {
  keyboard,
  lefthand,
  righthand,
  aiRectangle
};
