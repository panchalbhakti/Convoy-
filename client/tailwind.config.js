/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'system-ui', 'sans-serif'] },
      // Compact, modern scale (px, so it does not balloon with the browser root size)
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13.5px', '19px'],
        base: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['19px', '26px'],
        '2xl': ['22px', '28px'],
        '3xl': ['28px', '34px'],
        '4xl': ['36px', '40px'],
        '5xl': ['48px', '50px'],
        '6xl': ['58px', '60px'],
      },
      colors: {
        paper: '#F6F4EE',
        sand: '#ECE8DD',
        ink: { DEFAULT: '#0F1B2D', soft: '#5B6577' },
        teal: { DEFAULT: '#1F7A72', dark: '#155C56', light: '#DDF1EC' },
        alert: '#D92D20',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,27,45,.04), 0 6px 20px -10px rgba(15,27,45,.14)',
        float: '0 10px 32px -8px rgba(15,27,45,.28)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
