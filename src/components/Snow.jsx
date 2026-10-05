import { useEffect, useRef } from 'react';

// Cosmetic snow: sparse white dots on a fixed canvas behind all UI.
export default function Snow() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0;
    let h = 0;
    let flakes = [];
    let raf = 0;
    let last = 0;

    const make = (initial) => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : -4,
      r: 0.6 + Math.random() * 1.4,
      v: 14 + Math.random() * 28, // px/s
      d: (Math.random() - 0.5) * 14, // horizontal drift px/s
      a: 0.25 + Math.random() * 0.45,
    });

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const count = Math.min(90, Math.max(35, Math.round(w / 16)));
      flakes = Array.from({ length: count }, () => make(true));
      if (mq.matches) draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        ctx.globalAlpha = f.a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(f.x, f.y, f.r * 2, f.r * 2);
      }
    };

    const tick = (t) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.y += f.v * dt;
        f.x += f.d * dt;
        if (f.y > h || f.x < -4 || f.x > w + 4) {
          flakes[i] = make(false);
          if (f.x < -4 || f.x > w + 4) flakes[i].y = Math.random() * h;
        }
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (mq.matches || document.hidden) {
        if (mq.matches) ctx.clearRect(0, 0, w, h);
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', start);
    mq.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      mq.removeEventListener('change', start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 w-full h-full pointer-events-none select-none"
    />
  );
}
