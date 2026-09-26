// =====================================================================
// DEV MENU — ثيمات المنيو (مصدر واحد للألوان: المنيو، صفحة الروابط، ومعاينة لوحة التحكم)
// كل ثيم = مجموعة CSS variables. الثيم الداكن هو شكل المنيو الأصلي بالضبط.
// =====================================================================
(function () {
  const THEMES = {
    dark: {
      name: 'داكن', tone: 'dark',
      vars: {
        bg: '#0b0b0b', 'body-fg': '#f5f5f5', fg: '#ffffff', fg2: '#d1d5db', fg3: '#9ca3af',
        surface: 'rgba(18, 18, 18, 0.8)', 'surface-line': 'rgba(255, 255, 255, 0.18)',
        header: 'rgba(15, 15, 15, 0.85)', 'header-line': 'rgba(255, 255, 255, 0.15)',
        chip: 'rgba(255, 255, 255, 0.1)', chip2: 'rgba(255, 255, 255, 0.2)',
        line: 'rgba(255, 255, 255, 0.2)', line2: 'rgba(255, 255, 255, 0.3)',
        'input-bg': 'rgba(0, 0, 0, 0.6)', 'ring-bg': 'rgba(0, 0, 0, 0.9)',
        modal: '#18181b', 'modal-head': 'rgba(24, 24, 27, 0.95)',
        'ov-in': 'rgba(10, 10, 10, 0.4)', 'ov-out': 'rgba(10, 10, 10, 0.85)', 'media-filter': 'brightness(0.75) contrast(1.05)',
        dot: 'rgba(255, 255, 255, 0.3)', 'img-line': 'rgba(255, 255, 255, 0.2)',
        'grp-bg': 'rgba(0, 0, 0, 0.3)', 'grp-fg': '#ffffff', 'grp-line': 'rgba(255, 255, 255, 0.25)',
        accent: '#ffffff', price: '#ffffff', 'sec-line': 'rgba(255, 255, 255, 0.3)'
      }
    },
    light: {
      name: 'فاتح', tone: 'light',
      vars: {
        bg: '#f6f6f3', 'body-fg': '#1c1b18', fg: '#16140f', fg2: '#45413a', fg3: '#6f6a61',
        surface: 'rgba(255, 255, 255, 0.9)', 'surface-line': 'rgba(0, 0, 0, 0.09)',
        header: 'rgba(255, 255, 255, 0.9)', 'header-line': 'rgba(0, 0, 0, 0.08)',
        chip: 'rgba(0, 0, 0, 0.05)', chip2: 'rgba(0, 0, 0, 0.09)',
        line: 'rgba(0, 0, 0, 0.11)', line2: 'rgba(0, 0, 0, 0.2)',
        'input-bg': 'rgba(255, 255, 255, 0.92)', 'ring-bg': '#ffffff',
        modal: '#ffffff', 'modal-head': 'rgba(255, 255, 255, 0.95)',
        'ov-in': 'rgba(246, 246, 243, 0.6)', 'ov-out': 'rgba(246, 246, 243, 0.94)', 'media-filter': 'none',
        dot: 'rgba(0, 0, 0, 0.25)', 'img-line': 'rgba(0, 0, 0, 0.08)',
        'grp-bg': 'rgba(255, 255, 255, 0.75)', 'grp-fg': '#16140f', 'grp-line': 'rgba(0, 0, 0, 0.12)',
        accent: '#16140f', price: '#16140f', 'sec-line': 'rgba(0, 0, 0, 0.18)'
      }
    },
    sand: {
      name: 'بيج دافئ', tone: 'light',
      vars: {
        bg: '#f1e7d6', 'body-fg': '#3a2b1c', fg: '#34261a', fg2: '#5b4633', fg3: '#85705a',
        surface: 'rgba(252, 246, 236, 0.9)', 'surface-line': 'rgba(90, 64, 38, 0.14)',
        header: 'rgba(248, 240, 226, 0.92)', 'header-line': 'rgba(90, 64, 38, 0.12)',
        chip: 'rgba(90, 64, 38, 0.07)', chip2: 'rgba(90, 64, 38, 0.12)',
        line: 'rgba(90, 64, 38, 0.16)', line2: 'rgba(90, 64, 38, 0.26)',
        'input-bg': 'rgba(252, 246, 236, 0.94)', 'ring-bg': '#fcf6ec',
        modal: '#fbf5ea', 'modal-head': 'rgba(251, 245, 234, 0.95)',
        'ov-in': 'rgba(241, 231, 214, 0.6)', 'ov-out': 'rgba(241, 231, 214, 0.94)', 'media-filter': 'sepia(0.15)',
        dot: 'rgba(90, 64, 38, 0.3)', 'img-line': 'rgba(90, 64, 38, 0.12)',
        'grp-bg': 'rgba(252, 246, 236, 0.8)', 'grp-fg': '#34261a', 'grp-line': 'rgba(90, 64, 38, 0.18)',
        accent: '#7a4f24', price: '#7a4f24', 'sec-line': 'rgba(122, 79, 36, 0.45)'
      }
    },
    forest: {
      name: 'أخضر داكن', tone: 'dark',
      vars: {
        bg: '#0c1b14', 'body-fg': '#eef3ec', fg: '#f7faf5', fg2: '#cdd9cf', fg3: '#93a898',
        surface: 'rgba(17, 41, 30, 0.82)', 'surface-line': 'rgba(214, 235, 220, 0.16)',
        header: 'rgba(13, 33, 24, 0.88)', 'header-line': 'rgba(214, 235, 220, 0.14)',
        chip: 'rgba(255, 255, 255, 0.1)', chip2: 'rgba(255, 255, 255, 0.2)',
        line: 'rgba(255, 255, 255, 0.2)', line2: 'rgba(255, 255, 255, 0.3)',
        'input-bg': 'rgba(6, 20, 14, 0.6)', 'ring-bg': 'rgba(8, 24, 17, 0.9)',
        modal: '#10261c', 'modal-head': 'rgba(16, 38, 28, 0.95)',
        'ov-in': 'rgba(8, 26, 18, 0.45)', 'ov-out': 'rgba(8, 26, 18, 0.88)', 'media-filter': 'brightness(0.7) saturate(0.9)',
        dot: 'rgba(214, 235, 220, 0.3)', 'img-line': 'rgba(214, 235, 220, 0.2)',
        'grp-bg': 'rgba(6, 20, 14, 0.35)', 'grp-fg': '#f7faf5', 'grp-line': 'rgba(214, 235, 220, 0.25)',
        accent: '#d9c48a', price: '#e8d9a8', 'sec-line': 'rgba(217, 196, 138, 0.45)'
      }
    }
  };

  // ألوان جاهزة لاختيار لون الهوية
  const PRESETS = ['#c9a227', '#e4572e', '#d6336c', '#2f9e44', '#1c7ed6', '#7048e8'];

  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const rgbOf = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function luminance(hex) {
    const [r, g, b] = rgbOf(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  }
  // لون النص فوق لون الهوية: أسود أو أبيض حسب الأوضح
  const textOn = (hex) => contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff';
  const rgba = (hex, a) => `rgba(${rgbOf(hex).join(', ')}, ${a})`;

  const themeKey = (t) => THEMES[t] ? t : 'dark';

  // كل المتغيرات النهائية لثيم + لون هوية اختياري
  function resolve(theme, accentColor) {
    const t = THEMES[themeKey(theme)];
    const v = { ...t.vars };
    if (isHex(accentColor)) {
      v.accent = accentColor;
      v['sec-line'] = accentColor;
      // لو اللون قريب من لون الخلفية نخلي الأسعار بلون النص حتى تبقى مقروءة
      v.price = contrast(accentColor, v.bg) >= 2.5 ? accentColor : v.fg;
    }
    v['accent-fg'] = textOn(v.accent);
    v['accent-glow'] = rgba(v.accent, 0.25);
    return { key: themeKey(theme), tone: t.tone, vars: v };
  }

  // يطبّق الثيم على عنصر (عادة body): متغيرات + class مثل theme-light و tone-light
  function apply(store, el = document.body) {
    const r = resolve(store && store.theme, store && store.accent_color);
    Object.keys(THEMES).forEach(k => el.classList.remove(`theme-${k}`));
    el.classList.remove('tone-light', 'tone-dark');
    el.classList.add(`theme-${r.key}`, `tone-${r.tone}`);
    Object.entries(r.vars).forEach(([k, val]) => el.style.setProperty(`--${k}`, val));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', r.vars.bg);
    return r;
  }

  window.DMTheme = { THEMES, PRESETS, resolve, apply, isHex, textOn };
})();
