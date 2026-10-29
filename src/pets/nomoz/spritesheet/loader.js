/*
 * Sprite-sheet image loading. One shared entry per image URL:
 *
 *   { status: 'loading' | 'ready' | 'failed', image, listeners }
 *
 * Loading never blocks or throws. A renderer that finds an entry still
 * loading holds the frame on screen (never the procedural cat) and adds a
 * listener to redraw when it settles; a failed entry is permanent for the
 * page (no retry storms).
 */
const cache = new Map();

export function getSheetImage(src) {
  let entry = cache.get(src);
  if (entry) return entry;

  entry = { status: 'loading', image: null, listeners: new Set() };
  cache.set(src, entry);

  const settle = (status, image = null) => {
    if (entry.status !== 'loading') return;
    entry.status = status;
    entry.image = image;
    const listeners = [...entry.listeners];
    entry.listeners.clear();
    for (const fn of listeners) {
      try {
        fn(entry);
      } catch (err) {
        console.warn('[nomoz sheets] listener failed:', err);
      }
    }
  };

  if (typeof Image === 'undefined') {
    settle('failed');
    return entry;
  }

  try {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) settle('ready', img);
      else settle('failed');
    };
    img.onerror = () => {
      console.warn(`[nomoz sheets] could not load ${src}`);
      settle('failed');
    };
    img.src = src;
  } catch (err) {
    console.warn(`[nomoz sheets] could not load ${src}:`, err);
    settle('failed');
  }
  return entry;
}
