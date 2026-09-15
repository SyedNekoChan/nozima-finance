import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useFinanceStore from '../hooks/useFinanceStore.js';
import { isSpecialDate } from '../lib/date.js';

const SPHERE_ARGS = [2, 64, 64];

function randomUnitVector() {
  // uniform sphere sampling
  const u = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), u);
}

function heartTarget(base) {
  const { x, y, z } = base;
  let newX = x;
  const newY = y * 0.9 - 0.15;
  const newZ = z;
  if (y > 0.3) {
    const t = THREE.MathUtils.smoothstep(y, 0.3, 1.0);
    newX = x + Math.sign(x || 1) * 0.5 * t - x * t;
  }
  return new THREE.Vector3(newX, newY, newZ);
}

function SpherePoints() {
  const pointsRef = useRef();
  const geomRef = useRef();
  const materialRef = useRef();

  const anomalyEvent = useFinanceStore((s) => s.anomalyEvent);
  const clearAnomalyEvent = useFinanceStore((s) => s.clearAnomalyEvent);

  const geometry = useMemo(() => new THREE.SphereGeometry(...SPHERE_ARGS), []);
  const basePositions = useMemo(() => geometry.attributes.position.array.slice(), [geometry]);
  const baseNormals = useMemo(() => geometry.attributes.normal.array.slice(), [geometry]);
  const vertexCount = basePositions.length / 3;

  const eventsRef = useRef([]); // active { type, target: Vector3, life, duration, intensity }
  const glitchUntilRef = useRef(0); // performance.now() ms timestamp
  const rotationRef = useRef(0);

  // heart morph state: null = not running, else seconds elapsed since trigger
  const heartRef = useRef(isSpecialDate(new Date()) ? 0 : null);
  // calendar day (toDateString) the heart last played on — plays once per
  // special day even if the tab stays open across midnight or is reloaded
  // later the same day
  const heartPlayedDateRef = useRef(isSpecialDate(new Date()) ? new Date().toDateString() : null);
  // throttle the calendar check instead of running it every frame
  const lastDateCheckRef = useRef(0);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpBase = useMemo(() => new THREE.Vector3(), []);
  const tmpNormal = useMemo(() => new THREE.Vector3(), []);
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!anomalyEvent) return;
    const target = randomUnitVector();
    let duration = 2.5;
    let intensity = 0;
    if (anomalyEvent.type === 'INCOME') { intensity = 0.8; duration = 2.5; }
    else if (anomalyEvent.type === 'EXPENSE') { intensity = -0.5; duration = 2.5; }
    else if (anomalyEvent.type === 'TRANSFER') { intensity = 0.3; duration = 3.0; }
    else if (anomalyEvent.type === 'OVERSPEND') {
      intensity = -0.6; duration = 3.0;
      glitchUntilRef.current = performance.now() + 3000; // extend/start glitch window
    } else if (anomalyEvent.type === 'CELEBRATE') { intensity = 0.6; duration = 2.0; }

    eventsRef.current.push({ type: anomalyEvent.type, target, life: 1.0, duration, intensity });
    clearAnomalyEvent();
  }, [anomalyEvent, clearAnomalyEvent]);

  useFrame((state, delta) => {
    const geom = geomRef.current;
    if (!geom) return;
    const posAttr = geom.attributes.position;
    const time = state.clock.elapsedTime;
    const isGlitching = performance.now() < glitchUntilRef.current;

    // rotation: frozen during glitch
    if (!isGlitching) {
      rotationRef.current += delta * ((Math.PI * 2) / 45);
    }
    if (pointsRef.current) pointsRef.current.rotation.y = rotationRef.current;

    // advance & prune financial-event reactions
    const events = eventsRef.current;
    for (let i = events.length - 1; i >= 0; i--) {
      events[i].life -= delta / events[i].duration;
      if (events[i].life <= 0) events.splice(i, 1);
    }

    // re-arm the heart sequence at most once per special calendar day;
    // checked periodically (not every frame) so a tab left open across
    // midnight still catches the date change
    const nowMs = performance.now();
    if (nowMs - lastDateCheckRef.current > 1000) {
      lastDateCheckRef.current = nowMs;
      const today = new Date();
      const todayStr = today.toDateString();
      if (
        isSpecialDate(today) &&
        heartPlayedDateRef.current !== todayStr &&
        heartRef.current === null
      ) {
        heartRef.current = 0;
        heartPlayedDateRef.current = todayStr;
      }
    }

    // heart morph timeline: 0-3 morph in, 3-8 hold, 8-11 morph out, then done
    let heartT = heartRef.current;
    let morphProgress = 0;
    if (heartT !== null) {
      heartT += delta;
      heartRef.current = heartT;
      if (heartT < 3) morphProgress = heartT / 3;
      else if (heartT < 8) morphProgress = 1;
      else if (heartT < 11) morphProgress = 1 - (heartT - 8) / 3;
      else { morphProgress = 0; heartRef.current = null; }
    }

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      tmpBase.set(basePositions[i3], basePositions[i3 + 1], basePositions[i3 + 2]);
      tmpNormal.set(baseNormals[i3], baseNormals[i3 + 1], baseNormals[i3 + 2]);

      // idle breathing
      const idleDisp = Math.sin(time * 0.5 + tmpBase.x * 2 + tmpBase.y * 2) * 0.03;
      tmpVec.copy(tmpBase).addScaledVector(tmpNormal, idleDisp);

      // financial-event reactions layer on top, unaffected by the heart morph
      for (let e = 0; e < events.length; e++) {
        const ev = events[e];
        if (ev.type === 'CELEBRATE') {
          tmpVec.addScaledVector(tmpNormal, ev.intensity * ev.life);
          continue;
        }
        const dist = tmpNormal.distanceTo(ev.target);
        const spread = ev.type === 'TRANSFER' ? 3 : 12;
        const falloff = Math.exp(-dist * dist * spread);
        tmpVec.addScaledVector(tmpNormal, ev.intensity * falloff * ev.life);
      }

      // overspend glitch: jitter + shrink (never applies during heart morph target,
      // but can still co-occur — glitch is on the sphere's own base displacement)
      if (isGlitching) {
        const jitter = 0.15 * Math.random() - 0.075;
        tmpVec.copy(tmpBase).addScaledVector(tmpNormal, jitter);
        tmpVec.multiplyScalar(0.85);
      }

      // heart morph: geometric lerp toward the heart target, layered last so
      // financial events remain visible as texture on top of the heart shape
      if (morphProgress > 0) {
        tmpTarget.copy(heartTarget(tmpBase));
        tmpVec.lerp(tmpTarget, morphProgress);
      }

      posAttr.setXYZ(i, tmpVec.x, tmpVec.y, tmpVec.z);
    }
    posAttr.needsUpdate = true;

    if (materialRef.current) {
      materialRef.current.opacity = isGlitching ? 0.9 : 0.6;
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      if (materialRef.current) materialRef.current.dispose();
    };
  }, [geometry]);

  return (
    <points ref={pointsRef} position={[2.5, 0, 0]}>
      <primitive object={geometry} ref={geomRef} attach="geometry" />
      <pointsMaterial
        ref={materialRef}
        size={0.04}
        color="#888888"
        sizeAttenuation
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </points>
  );
}

export default function Anomaly() {
  return (
    <div className="absolute inset-0 z-0 !pointer-events-none blur-2xl opacity-30 mix-blend-screen overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
      >
        <SpherePoints />
      </Canvas>
    </div>
  );
}
