// Icônes personnalisées pour le projet
export interface CustomIcon {
  name: string;
  data: string;
}

// SVG content for keyboard icon
export const keyboard: CustomIcon = {
  name: 'keyboard',
  data: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect y="40.257" fill="currentColor" width="512" height="431.489"/>
    <polygon fill="#3E3D43" points="208.389,297.128 240.635,297.128 240.635,471.747 271.971,471.747 271.971,297.128 304.206,297.128 304.206,40.253 208.389,40.253"/>
    <rect x="255.937" y="40.257" fill="currentColor" width="256.063" height="431.489"/>
    <polygon fill="#2B292C" points="304.204,40.257 304.204,297.124 271.971,297.124 271.971,471.747 255.937,471.747 255.937,40.257"/>
  </svg>`
};

// SVG content for left hand icon
export const lefthand: CustomIcon = {
  name: 'lefthand',
  data: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M9,2A1,1 0 0,1 10,3V7.5A0.5,0.5 0 0,0 10.5,8A0.5,0.5 0 0,0 11,7.5V3A1,1 0 0,1 12,2A1,1 0 0,1 13,3V7.5A0.5,0.5 0 0,0 13.5,8A0.5,0.5 0 0,0 14,7.5V3A1,1 0 0,1 15,2A1,1 0 0,1 16,3V7.5A0.5,0.5 0 0,0 16.5,8A0.5,0.5 0 0,0 17,7.5V5A1,1 0 0,1 18,4A1,1 0 0,1 19,5V12A6,6 0 0,1 13,18H9A4,4 0 0,1 5,14V10A1,1 0 0,1 6,9H7A1,1 0 0,1 8,10V12H9V3A1,1 0 0,1 9,2Z"/>
  </svg>`
};

// SVG content for right hand icon (mirrored left hand)
export const righthand: CustomIcon = {
  name: 'righthand',
  data: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M15,2A1,1 0 0,0 14,3V7.5A0.5,0.5 0 0,1 13.5,8A0.5,0.5 0 0,1 13,7.5V3A1,1 0 0,0 12,2A1,1 0 0,0 11,3V7.5A0.5,0.5 0 0,1 10.5,8A0.5,0.5 0 0,1 10,7.5V3A1,1 0 0,0 9,2A1,1 0 0,0 8,3V7.5A0.5,0.5 0 0,1 7.5,8A0.5,0.5 0 0,1 7,7.5V5A1,1 0 0,0 6,4A1,1 0 0,0 5,5V12A6,6 0 0,0 11,18H15A4,4 0 0,0 19,14V10A1,1 0 0,0 18,9H17A1,1 0 0,0 16,10V12H15V3A1,1 0 0,0 15,2Z"/>
  </svg>`
};

// Export all custom icons
export const customIcons = {
  keyboard,
  lefthand,
  righthand
};
