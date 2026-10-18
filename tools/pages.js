// إعدادات كل صفحة (منقولة من tailwind.config اللي كان داخل كل صفحة)
const brand = { DEFAULT: '#384f3d', dark: '#2a3e2f', light: '#4a6650' };
module.exports = {
  login: {},
  links: {},
  pager: {},
  'pager-desk': {},
  waitlist: {
    colors: { sand: '#efe5dc', cream: '#faf6f1', ink: '#22362a', brand: { DEFAULT: '#384f3d', dark: '#2a3e2f' } }
  },
  'super-admin': {
    colors: { sand: '#efe5dc', cream: '#faf6f1', ink: '#22362a', brand },
    fontFamily: { logo: ['"Bagel Fat One"', '"IBM Plex Sans Arabic"', 'sans-serif'], serif: ['"Crimson Pro"', 'Georgia', 'serif'] }
  },
  admin: {
    colors: {
      sand: '#ece3d7', cream: '#fbf8f3', ink: '#22362a', brand, saffron: '#c9a227',
      amber: { 300: '#e3c66b', 400: '#d6b13f', 500: '#c9a227' },
      brick: '#a8432e'
    },
    fontFamily: {
      sans: ['SaudiRiyal', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      logo: ['"Bagel Fat One"', '"IBM Plex Sans Arabic"', 'sans-serif']
    }
  }
};
