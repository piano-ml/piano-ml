module.exports = {
    theme: {
      extend: {
        fontFamily: {
          customFont: [	"Swiss911"],
          // Add more custom font families as needed
        },
        fontSize: {
          'xs': ['0.875rem', { lineHeight: '1.3' }],     // 14px (augmenté de 12px)
          'sm': ['1rem', { lineHeight: '1.4' }],         // 16px (augmenté de 14px)
          'base': ['1.125rem', { lineHeight: '1.5' }],   // 18px (augmenté de 16px)
          'lg': ['1.25rem', { lineHeight: '1.5' }],      // 20px (augmenté de 18px)
          'xl': ['1.375rem', { lineHeight: '1.5' }],     // 22px (augmenté de 20px)
          '2xl': ['1.625rem', { lineHeight: '1.4' }],    // 26px (augmenté de 24px)
          '3xl': ['2rem', { lineHeight: '1.3' }],        // 32px (augmenté de 30px)
          //'4xl': ['2.5rem', { lineHeight: '1.2' }],      // 40px (augmenté de 36px)
          //'5xl': ['3.25rem', { lineHeight: '1.1' }],     // 52px (augmenté de 48px)
          //'6xl': ['4rem', { lineHeight: '1' }],          // 64px (augmenté de 60px)
        },
      },
    },
    // Other Tailwind configuration settings
  };