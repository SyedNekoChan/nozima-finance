import { Component, useLayoutEffect, useRef, useState } from 'react';
import { ANIM, createCityAnimation } from './animate.js';
import { createAtmosphere } from './atmos.js';
import { cityLayout } from './layout.js';
import { createCityFrame } from './render.js';

/*
 * City mode's backdrop: the night city seen from a supertall tower (see
 * design.md, "City mode"). It takes the pet layer's place and keeps its
 * contract: absolute inset-0 inside the main area, z-0 beneath the tab
 * content, pointer-events: none, aria-hidden, nothing that can scroll.
 *
 * Two canvases:
 *
 *   city        the pixel art. Rendered once per size into a small buffer of
 *               city pixels (in short slices, so the UI never stalls) and drawn
 *               at a whole-number scale with no smoothing, so every city pixel
 *               is the same crisp square on every screen. Only its light
 *               sources ever change (animate.js): windows, beacons, traffic.
 *   atmosphere  the air and light over it (atmos.js): mist, haze, light shafts,
 *               glow. Computed on a coarse grid; the canvas IS that grid, laid
 *               exactly over the city and stretched smoothly by the browser
 *               (on the GPU, no redraw), screen-blended, so it only adds light
 *               and never shifts, blurs or re-dithers a pixel of the art.
 *
 * While the page is visible both are updated about 12 times a second (only the
 * city's changed rectangle is redrawn). The animation stops while the page is
 * hidden (its clock stops too, so nothing jumps on return) and never runs under
 * prefers-reduced-motion, where the still city and a still atmosphere are shown;
 * that setting is followed live. A resize re-renders after a short pause.
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
  const airRef = useRef(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const airCanvas = airRef.current;
    if (!wrap || !canvas || !airCanvas) return undefined;

    let job = null; // { timer, cancelled }
    let shown = null; // layout of the frame on screen
    let pending = null; // layout waiting to be rendered
    let resizeTimer = 0;
    let failed = false;
    let reduced = prefersReduced();

    // the baked frame on screen: its layout and bytes
    let baked = null; // { layout, rgba }
    const off = document.createElement('canvas'); // the city pixels, one per canvas pixel
    let offCtx = null;
    let airCtx = null;
    let airImage = null;
    // animation
    let anim = null;
    let air = null;
    let image = null; // ImageData over anim.rgba
    let timer = 0;
    let running = false;
    let clock = 0; // animation time, ms (stands still while paused)
    let wall = 0;
    let frames = 0;

    const setState = (state) => {
      canvas.dataset.cityAnim = state;
    };

    /* Draw city pixels [x, y, w, h] of the low-resolution canvas onto the screen canvas. */
    const blit = (layout, x, y, bw, bh) => {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const s = layout.scale;
      ctx.drawImage(off, x, y, bw, bh, layout.offsetX + x * s, layout.offsetY + y * s, bw * s, bh * s);
    };

    /* The atmosphere at time t: one cell per canvas pixel; the browser stretches it smoothly. */
    const drawAir = (t) => {
      if (!air || !baked) return;
      air.update(t, anim ? anim.lights() : []);
      airCtx.putImageData(airImage, 0, 0);
    };

    /* Lay the atmosphere's grid exactly over the city pixels it was computed for. */
    const placeAir = (layout) => {
      const dpr = layout.devW / Math.max(1, wrap.getBoundingClientRect().width);
      const span = (air.cell * layout.scale) / dpr; // CSS px per cell
      airCanvas.width = air.w;
      airCanvas.height = air.h;
      airCanvas.style.left = `${layout.offsetX / dpr}px`;
      airCanvas.style.top = `${layout.offsetY / dpr}px`;
      airCanvas.style.width = `${air.w * span}px`;
      airCanvas.style.height = `${air.h * span}px`;
      airCtx = airCanvas.getContext('2d');
      airImage = new ImageData(air.rgba, air.w, air.h);
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
      baked = { layout, rgba: new Uint8ClampedArray(rgba) };
      air = null;
      clock = 0;
      setReady(true);
      setState('static');
      // the atmosphere, then the animation, each in its own slice so the page never stalls
      const me = { timer: 0, cancelled: false };
      job = me;
      me.timer = setTimeout(() => {
        if (me.cancelled) return;
        try {
          air = createAtmosphere(frame, { seed: (Math.random() * 2 ** 31) | 0 });
          placeAir(layout);
          drawAir(0);
        } catch (err) {
          console.warn('[city] atmosphere could not be set up:', err);
          air = null;
        }
        if (reduced) {
          if (job === me) job = null;
          return;
        }
        me.timer = setTimeout(() => {
          if (me.cancelled) return;
          if (job === me) job = null;
          try {
            anim = createCityAnimation(frame, rgba, { seed: (Math.random() * 2 ** 31) | 0 });
            image = new ImageData(anim.rgba, layout.w, layout.h);
          } catch (err) {
            console.warn('[city] animation could not be set up:', err);
            anim = null;
            return;
          }
          runAnim();
        }, 0);
      }, 0);
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
      try {
        const box = anim.update(clock);
        if (box) {
          const { layout } = baked;
          const bw = box.x1 - box.x0 + 1;
          const bh = box.y1 - box.y0 + 1;
          offCtx.putImageData(image, 0, 0, box.x0, box.y0, bw, bh);
          blit(layout, box.x0, box.y0, bw, bh);
        }
        drawAir(clock);
      } catch (err) {
        console.warn('[city] animation stopped:', err);
        stopAnim();
        anim = null;
        setState('static');
        return;
      }
      frames++;
      canvas.dataset.cityFrames = String(frames);
      timer = setTimeout(tick, Math.max(0, ANIM.minFrameMs - (performance.now() - now)));
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
      timer = setTimeout(tick, ANIM.minFrameMs);
    }

    /* Reduced motion: back to the still city and a still atmosphere, exactly. */
    const showStill = () => {
      stopAnim();
      anim = null;
      if (!baked) return;
      offCtx.putImageData(new ImageData(new Uint8ClampedArray(baked.rgba), baked.layout.w, baked.layout.h), 0, 0);
      blit(baked.layout, 0, 0, baked.layout.w, baked.layout.h);
      drawAir(0);
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
      else if (baked) {
        // the animation's state was let go: bake again with it
        const { layout } = baked;
        shown = null;
        start(layout);
      }
    };
    try {
      mq = matchMedia(REDUCED);
      if (mq.addEventListener) mq.addEventListener('change', onMotion);
      else mq.addListener(onMotion);
    } catch {
      mq = null;
    }

    /* ------------------------------------------------------------ */
    /* Baking                                                       */
    /* ------------------------------------------------------------ */

    const cancel = () => {
      if (job) {
        job.cancelled = true;
        clearTimeout(job.timer);
        job = null;
      }
    };

    const start = (layout) => {
      if (failed || sameLayout(layout, shown)) return;
      cancel();
      const me = { timer: 0, cancelled: false };
      job = me;
      let frame;
      try {
        frame = createCityFrame(layout.w, layout.h, { capture: true });
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
          if (job === me) job = null;
          if (!me.cancelled) paint(layout, rgba, frame);
        } catch (err) {
          failed = true;
          console.warn('[city] scene drawing stopped:', err);
          if (job === me) job = null;
        }
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
      air = null;
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
      <canvas ref={canvasRef} className="city-canvas" style={{ opacity: ready ? 1 : 0 }} />
      <canvas ref={airRef} className="city-air" data-city-air="" style={{ opacity: ready ? 1 : 0 }} />
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
