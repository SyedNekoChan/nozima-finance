import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SCENE_W, SCENE_H, drawScene } from './scene.js';

const MAX_SCALE = 8;

// Draws one scene state at a whole-number scale that fits the container.
export default function SceneCanvas({ scene, frame = 0, label }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(3);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fit = () => {
      const next = Math.max(2, Math.min(MAX_SCALE, Math.floor(el.clientWidth / SCENE_W)));
      setScale((s) => (s === next ? s : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawScene(ctx, scene, frame);
  }, [scene, frame, scale]);

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        width={SCENE_W}
        height={SCENE_H}
        style={{ width: SCENE_W * scale, height: SCENE_H * scale, imageRendering: 'pixelated' }}
        className="block border border-gray-800"
      />
    </div>
  );
}
