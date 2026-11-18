/** @type {import('tailwindcss').Config} */
// Colours and type come from the tokens in src/styles/index.css, so the
// whole app is retuned in one place (and per scene: Nomoz / City).
// One family (Geist, Geist Mono for metadata), one type scale below.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ground: token('ground'),
        raised: token('raised'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        'ink-3': token('ink-3'),
        accent: token('accent'),
        'on-accent': token('on-accent'),
        positive: token('positive'),
        caution: token('caution'),
        negative: token('negative'),
        rose: token('rose'),
      },
      borderColor: {
        line: 'rgb(255 255 255 / 0.08)',
        'line-strong': 'rgb(255 255 255 / 0.16)',
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      fontSize: {
        // one type scale for the whole app
        '2xs': ['12px', { lineHeight: '16px' }],
        xs: ['13px', { lineHeight: '18px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '26px' }],
        xl: ['22px', { lineHeight: '28px' }],
        '2xl': ['28px', { lineHeight: '34px' }],
        '3xl': ['36px', { lineHeight: '40px' }],
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [
    // `short:` desktop with little height (laptops: 1280x720, 1366x768, 1536x864): tighter
    // spacing and a side-by-side Dashboard, never smaller type. A variant, not a `screens`
    // entry: an object in `screens` would switch off every `max-*` variant.
    ({ addVariant }) => addVariant('short', '@media (min-width: 1024px) and (max-height: 880px)'),
  ],
}
