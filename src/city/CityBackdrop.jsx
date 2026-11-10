import { Component, useLayoutEffect, useRef, useState } from 'react';
import { createCityAnimation } from './animate.js';
import { cityLayout } from './layout.js';
import { createCityFrame } from './render.js';

/*
 * City mode's backdrop: the night city seen from a supertall tower (see
 * design.md, "City mode"). It takes the pet layer's place and keeps its
 * contract: absolute inset-0 inside the main area, z-0 beneath the tab
 * content, pointer-events: none, aria-hidden, nothing that can scroll.
 *
 * The scene is rendered once per size into a small buffer of city pixels, in
 * short slices so the UI never stalls, then drawn onto a canvas the size of
 * the layer in DEVICE pixels at a whole-number scale, so every city pixel is
 * the same crisp square on every screen. A resize re-renders after a short
 * pause; until then the last frame stays up.
 *
 * Then the ambient animation (animate.js) runs on top of that baked frame:
 * it wakes only when something is due (never more than 12 times a second),
 * re-quantises only the pixels that move, and only the rectangle that changed
 * is uploaded and drawn, at the same whole-number scale. It stops while the
 * page is hidden (its clock stops too, so nothing jumps on return) and never
 * runs under prefers-reduced-motion, where the still frame is shown exactly;
 * that setting is followed live.
 */

const SLICE_MS = 10; // work per slice before yielding to the page
const RESIZE_DELAY_MS = 160;
const REDUCED = '(prefers-reduced-motion: reduce)';

function prefersReduced() {
  try {
    return typeof matchMedia === 'function' && matchMedia(REDUCED).matches;
  } catch {
    return false;
  }
}

function sameLayout(a, b) {
  return a && b && a.w === b.w && a.h === b.h && a.scale === b.scale && a.devW === b.devW && a.devH === b.devH;
}

function CityScene() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    let job = null; // { timer, cancelled }
    let shown = null; // layout of the frame on screen
    let pending = null; // layout waiting to be rendered
    let resizeTimer = 0;
    let failed = false;
    let reduced = prefersReduced();

    // the baked frame on screen: its layout, bytes, and (if captured) the frame for the animation
    let baked = null; // { layout, rgba, frame }
    const off = document.createElement('canvas'); // the city pixels, one per canvas pixel
    let offCtx = null;
    // animation
    let anim = null;
    let image = null; // ImageData over anim.rgba
    let timer = 0;
    let running = false;
    let clock = 0; // animation time, ms (stands still while paused)
    let wall = 0;
    let frames = 0;

    const setState = (state) => {
      canvas.dataset.cityAnim = state;
    };

    const cancel = () => {
      if (job) {
        job.cancelled = true;
        clearTimeout(job.timer);
        job = null;
      }
    };

    /* Draw city pixels [x, y, w, h] of the low-resolution canvas onto the screen canvas. */
    const blit = (layout, x, y, bw, bh) => {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const s = layout.scale;
      ctx.drawImage(off, x, y, bw, bh, layout.offsetX + x * s, layout.offsetY + y * s, bw * s, bh * s);
    };

    const paint = (layout, rgba, frame) => {
      stopAnim();
      anim = null;
      off.width = layout.w;
      off.height = layout.h;
      offCtx = off.getContext('2d');
      offCtx.putImageData(new ImageData(rgba, layout.w, layout.h), 0, 0);
      canvas.width = layout.devW;
      canvas.height = layout.devH;
      blit(layout, 0, 0, layout.w, layout.h);
      canvas.dataset.cityPx = String(layout.scale);
      canvas.dataset.cityW = String(layout.w);
      canvas.dataset.cityH = String(layout.h);
      shown = layout;
      baked = { layout, rgba: new Uint8ClampedArray(rgba), frame };
      setReady(true);
      startAnim();
    };

    /* ------------------------------------------------------------ */
    /* Animation                                                    */
    /* ------------------------------------------------------------ */

    const tick = () => {
      timer = 0;
      if (!running || !anim) return;
      const now = performance.now();
      clock += Math.min(now - wall, 2000);
      wall = now;
      let box = null;
      try {
        box = anim.update(clock);
      } catch (err) {
        console.warn('[city] animation stopped:', err);
        stopAnim();
        anim = null;
        setState('static');
        return;
      }
      if (box) {
        const { layout } = baked;
        const bw = box.x1 - box.x0 + 1;
        const bh = box.y1 - box.y0 + 1;
        offCtx.putImageData(image, 0, 0, box.x0, box.y0, bw, bh);
        blit(layout, box.x0, box.y0, bw, bh);
        frames++;
        canvas.dataset.cityFrames = String(frames);
      }
      schedule();
    };

    const schedule = () => {
      const due = anim.nextDue(clock);
      timer = setTimeout(tick, Math.max(0, due - clock));
    };

    function stopAnim() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = 0;
    }

    function runAnim() {
      if (running || !anim || reduced || document.hidden) {
        if (anim && !running) setState(reduced ? 'static' : 'paused');
        return;
      }
      running = true;
      wall = performance.now();
      setState('running');
      schedule();
    }

    function startAnim() {
      if (reduced || !baked) {
        setState('static');
        return;
      }
      if (!baked.frame) {
        // baked for reduced motion: bake again with what the animation needs
        const { layout } = baked;
        shown = null;
        start(layout);
        return;
      }
      if (!anim) {
        try {
          anim = createCityAnimation(baked.frame, baked.rgba, { seed: (Math.random() * 2 ** 31) | 0 });
          image = new ImageData(anim.rgba, baked.layout.w, baked.layout.h);
          clock = 0;
          // the animation keeps what it needs; the rest of the bake can go (re-baked if ever needed again)
          baked.frame = null;
        } catch (err) {
          console.warn('[city] animation could not be set up:', err);
          setState('static');
          return;
        }
      }
      runAnim();
    }

    /* Back to the baked frame exactly (reduced motion). */
    const showStill = () => {
      stopAnim();
      anim = null;
      if (!baked) return;
      offCtx.putImageData(new ImageData(new Uint8ClampedArray(baked.rgba), baked.layout.w, baked.layout.h), 0, 0);
      blit(baked.layout, 0, 0, baked.layout.w, baked.layout.h);
      setState('static');
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (running) {
          stopAnim();
          setState('paused');
        }
      } else runAnim();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let mq = null;
    const onMotion = () => {
      reduced = mq.matches;
      if (reduced) showStill();
      else startAnim();
    };
    try {
      mq = matchMedia(REDUCED);
      if (mq.addEventListener) mq.addEventListener('change', onMotion);
      else mq.addListener(onMotion);
    } catch {
      mq = null;
    }

    const start = (layout) => {
      if (failed || sameLayout(layout, shown)) return;
      cancel();
      const me = { timer: 0, cancelled: false };
      job = me;
      let frame;
      try {
        // what the animation needs is kept only when it will run
        frame = createCityFrame(layout.w, layout.h, { capture: !reduced });
      } catch (err) {
        failed = true;
        console.warn('[city] scene could not be set up:', err);
        return;
      }
      let row = 0;
      const step = () => {
        if (me.cancelled) return;
        try {
          const t0 = performance.now();
          while (row < layout.h && performance.now() - t0 < SLICE_MS) {
            frame.renderRows(row, row + 4);
            row += 4;
          }
          if (row < layout.h) {
            me.timer = setTimeout(step, 0);
            return;
          }
          const rgba = frame.finish();
          if (!me.cancelled) paint(layout, rgba, frame.dynamic ? frame : null);
        } catch (err) {
          failed = true;
          console.warn('[city] scene drawing stopped:', err);
        }
        if (job === me) job = null;
      };
      step();
    };

    const measure = (entry) => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      const dpr = window.devicePixelRatio || 1;
      // the exact device-pixel size when the browser reports one that agrees with the ratio
      // (device emulation can report CSS pixels here), else the CSS size times the ratio
      const dev = entry && entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
      const exact =
        dev && Math.abs(dev.inlineSize - rect.width * dpr) <= 2 && Math.abs(dev.blockSize - rect.height * dpr) <= 2;
      return cityLayout(rect.width, rect.height, dpr, exact ? dev.inlineSize : null, exact ? dev.blockSize : null);
    };

    // first frame straight away, later sizes after the resize settles
    const first = measure(null);
    if (first) start(first);

    const ro = new ResizeObserver((entries) => {
      const layout = measure(entries[entries.length - 1]);
      if (!layout || sameLayout(layout, shown) || sameLayout(layout, pending)) return;
      pending = layout;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(
        () => {
          pending = null;
          start(layout);
        },
        shown ? RESIZE_DELAY_MS : 0
      );
    });
    try {
      ro.observe(wrap, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(wrap);
    }

    return () => {
      ro.disconnect();
      clearTimeout(resizeTimer);
      cancel();
      stopAnim();
      anim = null;
      baked = null;
      document.removeEventListener('visibilitychange', onVisibility);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', onMotion);
        else mq.removeListener(onMotion);
      }
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      data-city=""
      data-city-ready={ready ? '' : undefined}
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-black"
    >
      <canvas
        ref={canvasRef}
        className="city-canvas"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  );
}

/* The city is cosmetic: if it throws, it is simply not there. */
class CityErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[city] backdrop disabled after an error:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function CityBackdrop() {
  return (
    <CityErrorBoundary>
      <CityScene />
    </CityErrorBoundary>
  );
}
