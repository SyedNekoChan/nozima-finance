/*
 * What the world around the cat is doing, boiled down to a few events the attention layer may notice
 * (see ./attention.js). It reads only the mouse position and the tab's visibility, never any application data, and
 * only the mouse (touch scrolling and taps on the interface are not "something moving near the cat").
 *
 *   pointer-fast  the mouse has swept past quickly, within a few cat-widths, REPEATEDLY (three times inside fifteen
 *                 seconds: one incidental sweep is nothing)
 *   pointer-dwell the mouse has been resting close to the cat for a moment
 *   return        the tab is back in view after a while away
 *
 *   getRect  () => the cat's client rect | null
 * Returns { read() -> events since the last call, rect(), pointerPos() -> { x, y } | null (null once the mouse has left the page), stop() }.
 */
export function watchWorld({ getRect, win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null, clock = () => performance.now() }) {
  const queue = [];
  let px = null;
  let py = null;
  let pt = 0;
  let speed = 0;
  let nearSince = 0;
  let firedDwell = false;
  let sweeps = []; // when it swept past close by recently
  let hiddenAt = 0;

  const push = (e) => {
    if (queue.length < 6) queue.push(e);
  };

  function onMove(ev) {
    if (ev.pointerType && ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return;
    const t = clock();
    const r = getRect && getRect();
    if (px !== null && t > pt) {
      const v = (Math.hypot(ev.clientX - px, ev.clientY - py) / (t - pt)) * 1000;
      speed = speed * 0.5 + v * 0.5;
    }
    px = ev.clientX;
    py = ev.clientY;
    pt = t;
    if (!r || !r.width) return;
    const dist = Math.hypot(px - (r.x + r.width / 2), py - (r.y + r.height / 2)) / r.width; // in cat-widths
    // quick sweeps close by: one is incidental, three in fifteen seconds is somebody moving about near it
    if (speed > 900 && dist < 4.5 && (!sweeps.length || t - sweeps[sweeps.length - 1] > 700)) {
      sweeps = sweeps.filter((s) => t - s < 15000);
      sweeps.push(t);
      if (sweeps.length >= 3) {
        sweeps = [];
        push({ kind: 'pointer-fast', x: px, strength: 0.6 });
      }
    }
    // resting nearby for a moment
    if (dist < 2.2 && speed < 120) {
      if (!nearSince) nearSince = t;
      if (!firedDwell && t - nearSince > 1500) {
        firedDwell = true;
        push({ kind: 'pointer-dwell', x: px, strength: 0.6 });
      }
    } else if (dist > 3) {
      nearSince = 0;
      firedDwell = false;
    }
  }

  function onVisibility() {
    if (!doc) return;
    if (doc.hidden) hiddenAt = clock();
    else if (hiddenAt && clock() - hiddenAt > 8000) {
      hiddenAt = 0;
      push({ kind: 'return', x: null, strength: 0.5 });
    }
  }

  // the mouse left the page: there is nothing there to look at any more
  const onLeave = () => {
    px = null;
    py = null;
    nearSince = 0;
    firedDwell = false;
  };

  if (win) win.addEventListener('pointermove', onMove, { passive: true });
  if (doc) doc.addEventListener('visibilitychange', onVisibility);
  if (doc && doc.documentElement) doc.documentElement.addEventListener('mouseleave', onLeave);

  return {
    read() {
      return queue.splice(0, queue.length);
    },
    rect: () => (getRect ? getRect() : null),
    pointerPos: () => (px === null ? null : { x: px, y: py }),
    stop() {
      if (win) win.removeEventListener('pointermove', onMove);
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
      if (doc && doc.documentElement) doc.documentElement.removeEventListener('mouseleave', onLeave);
    },
  };
}
