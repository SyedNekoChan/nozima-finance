import { rnd } from './rng.js';

/*
 * Ambient blinking: the small, constant life of an awake cat's eyes.
 *
 * Behaviors only blink inside their own scripts, so between them (and during
 * the many that never blink) the eyes could stay open for a minute or more.
 * This runs beside the behavior scheduler and, every few seconds, closes the
 * eyes for a moment, sometimes twice. It only ever touches eyes that are
 * plainly 'open': a behavior's own expression (closed, down, wide, happy, a
 * blink in progress) is never overridden, and it gives the eyes back only if
 * they are still the blink it made.
 *
 *   rng       () => [0, 1)
 *   getView   () => the current view ({ eyes, offscreen, sx }) or null
 *   apply     (patch) => void   (the same merge the scheduler uses)
 *   timing    AMBIENT.blink in ../config.js
 * Returns stop(): cancels the timer and reopens eyes it left closed.
 */
export function startAmbientBlink({ rng, getView, apply, timing }) {
  let timer = null;
  let holding = false; // true while the eyes are closed by this blinker
  let alive = true;

  const later = (fn, ms) => {
    timer = setTimeout(fn, Math.max(0, ms));
  };

  const open = () => {
    if (holding && getView()?.eyes === 'blink') apply({ eyes: 'open' });
    holding = false;
  };

  const idle = () => {
    const v = getView();
    return !!v && v.eyes === 'open' && !v.offscreen && v.sx !== null && v.sx !== undefined;
  };

  function blink(left) {
    if (!alive) return;
    if (!idle()) return void later(() => blink(0), rnd(rng, ...timing.retryMs));
    apply({ eyes: 'blink' });
    holding = true;
    later(() => {
      open();
      if (left > 0) later(() => blink(left - 1), timing.doubleGapMs);
      else later(() => blink(rng() < timing.doubleChance ? 1 : 0), rnd(rng, ...timing.everyMs));
    }, timing.closedMs);
  }

  later(() => blink(0), rnd(rng, ...timing.firstMs));

  return function stop() {
    alive = false;
    clearTimeout(timer);
    open();
  };
}
