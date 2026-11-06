import { Component, useLayoutEffect, useRef, useState } from 'react';
import { cityLayout } from './layout.js';
import { createCityFrame } from './render.js';

/*
 * City mode's backdrop: the night city seen from a supertall tower (see
 * design.md, "City mode"). It takes the pet layer's place and keeps its
 * contract: absolute inset-0 inside the main area, z-0 beneath the tab
 * content, pointer-events: none, aria-hidden, nothing that can scroll.
 *
 * The scene is static (Phase 1). It is rendered once per size into a small
 * buffer of city pixels, in short slices so the UI never stalls, then drawn
 * onto a canvas the size of the layer in DEVICE pixels at a whole-number
 * scale, so every city pixel is the same crisp square on every screen. A
 * resize re-renders after a short pause; until then the last frame stays up.
 */

const SLICE_MS = 10; // work per slice before yielding to the page
const RESIZE_DELAY_MS = 160;

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

    const cancel = () => {
      if (job) {
        job.cancelled = true;
        clearTimeout(job.timer);
        job = null;
      }
    };

    const paint = (layout, rgba) => {
      const off = document.createElement('canvas');
      off.width = layout.w;
      off.height = layout.h;
      off.getContext('2d').putImageData(new ImageData(rgba, layout.w, layout.h), 0, 0);
      canvas.width = layout.devW;
      canvas.height = layout.devH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, layout.offsetX, layout.offsetY, layout.w * layout.scale, layout.h * layout.scale);
      canvas.dataset.cityPx = String(layout.scale);
      canvas.dataset.cityW = String(layout.w);
      canvas.dataset.cityH = String(layout.h);
      shown = layout;
      setReady(true);
    };

    const start = (layout) => {
      if (failed || sameLayout(layout, shown)) return;
      cancel();
      const me = { timer: 0, cancelled: false };
      job = me;
      let frame;
      try {
        frame = createCityFrame(layout.w, layout.h);
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
          if (!me.cancelled) paint(layout, rgba);
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
