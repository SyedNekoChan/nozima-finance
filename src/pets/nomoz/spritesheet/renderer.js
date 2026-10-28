import { renderSprite, paletteColor, SPRITE_W, SPRITE_H } from '../sprites.js';
import { fitsImage, frameAt, frameRect, normalizeManifest, selectClip } from './clips.js';
import { getSheetImage } from './loader.js';

/*
 * The sprite-sheet render path, selected by SPRITE_RENDERER in ../config.js.
 *
 * It wraps the procedural renderer instead of replacing it. Every frame the
 * procedural renderer still runs in full (pupil easing and gaze, the head
 * anchor the vanity items use, lighting, stress / glitch passes, effects,
 * cues, items), and when a clip applies it is handed a "body" hook that
 * paints the sheet frame where the procedural fur would go, plus any
 * `dynamic` procedural regions the clip keeps on top. When no clip
 * applies, or anything about the clip fails, it simply draws procedurally.
 *
 * Playback: one small controller per canvas context (a WeakMap entry, no
 * shared timers). It owns the active clip and its start time, keeps it
 * running while unrelated state (a blink, a gaze, a leg phase) changes,
 * switches only when the selected clip changes (a one-shot marked `lock`
 * finishes first), follows `next` when a one-shot ends, and schedules its
 * own redraws for the next frame boundary. Redraws it triggers are flagged
 * `replay`, so the pupil eases once per state change as before.
 */

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function createSheetRenderer({ manifest, fallback = renderSprite } = {}) {
  const man = normalizeManifest(manifest);
  // nothing usable registered: the procedural renderer, unchanged
  if (!man.select.length) return fallback;

  const states = new WeakMap();
  const bad = new Set(); // clip ids that failed once; drawn procedurally from then on

  const fail = (id, why) => {
    if (!bad.has(id)) console.warn(`[nomoz sheets] clip "${id}" disabled: ${why}`);
    bad.add(id);
  };

  function stateFor(ctx) {
    let c = states.get(ctx);
    if (!c) {
      c = { clip: null, target: undefined, shown: false, t0: 0, timer: 0, params: null, vanity: null, onReady: null };
      c.onReady = () => redraw(ctx, c);
      states.set(ctx, c);
    }
    return c;
  }

  const begin = (c, clip, now) => {
    c.clip = clip;
    c.t0 = now;
    c.shown = false; // the clock starts when its first frame is on screen
    return clip;
  };

  // Keeps, finishes or replaces the active clip for the selected one.
  function settle(c, wanted, now) {
    const tid = wanted ? wanted.id : null;
    const cur = c.clip;
    if (cur) {
      const finished = c.shown && !cur.loop && now - c.t0 >= cur.total;
      const nxt = finished && cur.next && !bad.has(cur.next) ? man.clips[cur.next] : null;
      if (nxt) {
        c.target = tid;
        return begin(c, nxt, now);
      }
      if (!finished && cur.lock && !cur.loop) return cur; // let it finish
    }
    if (tid === c.target) return cur;
    c.target = tid;
    return begin(c, wanted, now);
  }

  function makeBody(clip, sheet, image, index) {
    const rect = frameRect(sheet, clip.frames[index]);
    const [px, py] = clip.pivot || [sheet.frameWidth / 2, sheet.frameHeight];
    const [ax, ay] = clip.anchor || [SPRITE_W / 2, SPRITE_H];
    const ox = Math.round(ax - px);
    const oy = Math.round(ay - py);
    const { head, base, whiskers } = clip.dynamic;

    return {
      under: clip.under,
      paint(ac, info) {
        try {
          ac.imageSmoothingEnabled = false;
          ac.drawImage(image, rect.x, rect.y, rect.w, rect.h, ox, oy, rect.w, rect.h);
          const keep = [...base, ...head.map(([x, y, w, h]) => [info.hx + x, info.hy + y, w, h])];
          for (const [x, y, w, h] of keep) {
            ac.clearRect(x, y, w, h);
            for (let yy = Math.max(0, y); yy < Math.min(SPRITE_H, y + h); yy++) {
              for (let xx = Math.max(0, x); xx < Math.min(SPRITE_W, x + w); xx++) {
                const ch = info.grid[yy][xx];
                if (ch === '.') continue;
                ac.fillStyle = paletteColor(ch);
                ac.fillRect(xx, yy, 1, 1);
              }
            }
          }
          return { over: whiskers };
        } catch (err) {
          fail(clip.id, err.message);
          return false;
        }
      },
    };
  }

  function draw(ctx, c, replay) {
    clearTimeout(c.timer);
    c.timer = 0;

    const now = clock();
    const wanted = selectClip(man, c.params);
    const clip = settle(c, wanted && !bad.has(wanted.id) ? wanted : null, now);

    let body = null;
    let wait = Infinity;
    if (clip) {
      const sheet = man.sheets[clip.sheet];
      const entry = getSheetImage(sheet.src);
      if (entry.status === 'loading') {
        entry.listeners.add(c.onReady);
      } else if (entry.status === 'ready' && fitsImage(sheet, entry.image.naturalWidth, entry.image.naturalHeight)) {
        if (!c.shown) {
          c.shown = true;
          c.t0 = now;
        }
        const pos = prefersReducedMotion()
          ? { index: clip.still, wait: Infinity }
          : frameAt(clip, now - c.t0);
        body = makeBody(clip, sheet, entry.image, pos.index);
        wait = pos.wait;
      } else {
        fail(clip.id, entry.status === 'ready' ? 'the sheet is smaller than its frame grid' : 'the sheet failed to load');
      }
    }

    const params = replay ? { ...c.params, replay: true } : c.params;
    try {
      fallback(ctx, params, c.vanity, body);
    } catch (err) {
      if (!body) throw err;
      fail(clip.id, err.message);
      fallback(ctx, params, c.vanity, null);
      return;
    }

    if (body && wait < Infinity && ctx.canvas?.isConnected !== false) {
      c.timer = setTimeout(() => redraw(ctx, c), Math.max(16, Math.ceil(wait)));
    }
  }

  // A timer- or load-driven redraw of the last state.
  function redraw(ctx, c) {
    c.timer = 0;
    if (!c.params || ctx.canvas?.isConnected === false) return;
    try {
      draw(ctx, c, true);
    } catch (err) {
      console.warn('[nomoz sheets] redraw stopped:', err);
    }
  }

  return function renderSheetSprite(ctx, p, vanity) {
    const c = stateFor(ctx);
    c.params = p;
    c.vanity = vanity;
    try {
      draw(ctx, c, false);
    } catch (err) {
      // never leave the pet frozen: the procedural cat draws this frame
      console.warn('[nomoz sheets] falling back to procedural drawing:', err);
      fallback(ctx, p, vanity);
    }
  };
}
