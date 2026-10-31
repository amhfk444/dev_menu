// إعدادات كل صفحة (منقولة من tailwind.config اللي كان داخل كل صفحة)
const brand = { DEFAULT: '#384f3d', dark: '#2a3e2f', light: '#4a6650' };
module.exports = {
  index: {
    colors: { brand: { DEFAULT: '#233d2c', dark: '#15271b' }, ink: '#1b3022', sand: '#f6f3ec', gold: { DEFAULT: '#c9a227', deep: '#8a6d0f' } },
    fontFamily: { sans: ['SaudiRiyal', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'] }
  },
  login: {},
  links: {},
  pager: {},
  'pager-desk': {},
  loyalty: {},
  waitlist: {
    colors: { sand: '#efe5dc', cream: '#faf6f1', ink: '#22362a', brand: { DEFAULT: '#384f3d', dark: '#2a3e2f' } }
  },
  'super-admin': {
    colors: { sand: '#efe5dc', cream: '#faf6f1', ink: '#22362a', brand },
    fontFamily: { logo: ['"Bagel Fat One"', '"IBM Plex Sans Arabic"', 'sans-serif'], serif: ['"Crimson Pro"', 'Georgia', 'serif'] }
  },
  admin: {
    colors: {
      // ألوان Shopify Polaris (@shopify/polaris-tokens 9.4.2): خلفية رمادية، أسطح بيضاء، نص #303030، والأخضر للأساسي
      sand: '#f1f1f1', cream: '#ffffff', ink: '#303030', brand, saffron: '#c9a227',
      amber: { 300: '#e3c66b', 400: '#d6b13f', 500: '#c9a227' },
      brick: '#c70a24'
    },
    fontFamily: {
      sans: ['SaudiRiyal', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      logo: ['"Bagel Fat One"', '"IBM Plex Sans Arabic"', 'sans-serif']
    }
  }
};
