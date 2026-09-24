import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useFinanceStore from '../hooks/useFinanceStore.js';
import { isSpecialDate } from '../lib/date.js';

const SPHERE_ARGS = [2, 64, 64];

/*
 * Deterministic hashing so a transaction's visual contribution is a
 * pure function of its own identity (id + type), not of insertion
 * order or Math.random() — the same transaction always produces the
 * same displacement, so deleting it (and recomputing from the
 * remaining list) exactly removes that contribution and nothing else.
 */
function hashString(str) {
  let h = 2166136261;

  for (
    let i = 0;
    i < str.length;
    i++
  ) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

// mulberry32: small, fast, deterministic PRNG seeded from a 32-bit int.
function seededRandom(seed) {
  let t = seed;

  return function next() {
    t = (t + 0x6d2b79f5) | 0;

    let r = Math.imul(
      t ^ (t >>> 15),
      1 | t
    );

    r =
      (r +
        Math.imul(
          r ^ (r >>> 7),
          61 | r
        )) ^
      r;

    return (
      ((r ^ (r >>> 14)) >>> 0) /
      4294967296
    );
  };
}

function seededUnitVector(rng) {
  const u = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);

  return new THREE.Vector3(
    r * Math.cos(theta),
    r * Math.sin(theta),
    u
  );
}

function randomUnitVector() {
  // uniform sphere sampling
  const u = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);

  return new THREE.Vector3(
    r * Math.cos(theta),
    r * Math.sin(theta),
    u
  );
}

function heartTarget(base) {
  const { x, y, z } = base;

  let newX = x;
  const newY = y * 0.9 - 0.15;
  const newZ = z;

  if (y > 0.3) {
    const t = THREE.MathUtils.smoothstep(y, 0.3, 1.0);
    newX =
      x +
      Math.sign(x || 1) * 0.5 * t -
      x * t;
  }

  return new THREE.Vector3(
    newX,
    newY,
    newZ
  );
}

const MAX_OFFSET_PER_VERTEX = 0.9;

/*
 * ONE transaction's deterministic contribution to the deformation
 * field, written directly into `offsets` (a plain Float32Array,
 * length = vertexCount * 3 — full XYZ per vertex, not just a scalar
 * along the normal, so non-radial shear/twist components are
 * possible). Everything here is derived purely from `tx` (its id,
 * type, amount) via seededRandom — never from Math.random() or from
 * when/where in the list the transaction sits — so the same
 * transaction always contributes the exact same shape, and
 * removing it from the source list (see computeDeformationField)
 * removes exactly this and nothing else.
 *
 * Each type combines a few distinct primitives differently so the
 * *pattern*, not just the sign/magnitude, differs per type:
 *
 * - INCOME:   an outward radial spike at a hashed target, PLUS a
 *             tangential swirl around that same target (a twist,
 *             not just a bump) — reads as a sharp asymmetric horn.
 * - EXPENSE:  an inward radial dent at a hashed target, PLUS a
 *             smaller secondary "satellite" dent offset from the
 *             first — reads as a lopsided caved-in crater cluster.
 * - TRANSFER: a directional wave/shear along a hashed axis, applied
 *             globally (every vertex, via its OWN base position, not
 *             a single target) — reads as the whole sphere warping
 *             along a slanted band rather than one spot.
 * - OVERSPEND: EXPENSE's crater-cluster signature, but harder and
 *             with an added inward shear component, since it's an
 *             expense that broke the budget; the violent glitch
 *             remains a SEPARATE transient effect layered on top at
 *             render time, not part of this persistent field.
 */
function addTransactionContribution(
  offsets,
  basePositions,
  baseNormals,
  vertexCount,
  tx
) {
  const seed = hashString(
    `${tx.id}:${tx.type}`
  );

  const rng = seededRandom(seed);

  const amountScale =
    THREE.MathUtils.clamp(
      Math.log10(
        1 + (Number(tx.amount) || 0)
      ) / 7,
      0.3,
      1.4
    );

  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpTangent =
    new THREE.Vector3();
  const tmpContribution =
    new THREE.Vector3();

  if (tx.type === 'TRANSFER') {
    // Directional wave/shear along a hashed axis: every vertex is
    // nudged both along its own normal AND tangentially, based on
    // its position's projection onto a random axis+phase unique to
    // this transaction — a slanted warp band across the whole
    // sphere, not a single localized mark.
    const axis = seededUnitVector(rng);
    const frequency =
      3 + rng() * 3;
    const phase =
      rng() * Math.PI * 2;
    const amplitude =
      0.05 * amountScale;

    for (
      let i = 0;
      i < vertexCount;
      i++
    ) {
      const i3 = i * 3;

      tmpB.set(
        basePositions[i3],
        basePositions[i3 + 1],
        basePositions[i3 + 2]
      );

      tmpN.set(
        baseNormals[i3],
        baseNormals[i3 + 1],
        baseNormals[i3 + 2]
      );

      const proj =
        tmpB.dot(axis);

      const wave =
        Math.sin(
          proj * frequency + phase
        ) * amplitude;

      // Tangent: perpendicular to both the vertex normal and the
      // wave axis, giving a genuine shear component instead of pure
      // radial displacement.
      tmpTangent
        .crossVectors(
          tmpN,
          axis
        )
        .normalize();

      tmpContribution
        .copy(tmpN)
        .multiplyScalar(wave)
        .addScaledVector(
          tmpTangent,
          wave * 0.6
        );

      offsets[i3] =
        THREE.MathUtils.clamp(
          offsets[i3] +
            tmpContribution.x,
          -MAX_OFFSET_PER_VERTEX,
          MAX_OFFSET_PER_VERTEX
        );

      offsets[i3 + 1] =
        THREE.MathUtils.clamp(
          offsets[i3 + 1] +
            tmpContribution.y,
          -MAX_OFFSET_PER_VERTEX,
          MAX_OFFSET_PER_VERTEX
        );

      offsets[i3 + 2] =
        THREE.MathUtils.clamp(
          offsets[i3 + 2] +
            tmpContribution.z,
          -MAX_OFFSET_PER_VERTEX,
          MAX_OFFSET_PER_VERTEX
        );
    }

    return;
  }

  // INCOME / EXPENSE / OVERSPEND: one or two localized primitives
  // centered on hashed target point(s), each with both a radial
  // (normal) component and a tangential swirl/shear component so the
  // result isn't purely a round radial bump.
  const isIncome = tx.type === 'INCOME';

  const primaryTarget =
    seededUnitVector(rng);

  const primarySpread = 5 + rng() * 3;

  const primaryIntensity =
    (isIncome ? 0.55 : -0.5) *
    amountScale;

  const swirlStrength =
    (rng() - 0.5) *
    0.5 *
    amountScale;

  // EXPENSE/OVERSPEND additionally get a smaller secondary dent
  // offset from the first, for an asymmetric, lopsided cluster
  // rather than one clean crater. INCOME stays a single sharp horn.
  const hasSecondary = !isIncome;

  const secondaryTarget = hasSecondary
    ? seededUnitVector(rng)
    : null;

  const secondarySpread = 8 + rng() * 4;

  const secondaryIntensity =
    hasSecondary
      ? -0.28 * amountScale
      : 0;

  for (
    let i = 0;
    i < vertexCount;
    i++
  ) {
    const i3 = i * 3;

    tmpN.set(
      baseNormals[i3],
      baseNormals[i3 + 1],
      baseNormals[i3 + 2]
    );

    const distPrimary =
      tmpN.distanceTo(primaryTarget);

    const falloffPrimary = Math.exp(
      -distPrimary *
        distPrimary *
        primarySpread
    );

    let radial =
      primaryIntensity *
      falloffPrimary;

    if (hasSecondary) {
      const distSecondary =
        tmpN.distanceTo(
          secondaryTarget
        );

      const falloffSecondary =
        Math.exp(
          -distSecondary *
            distSecondary *
            secondarySpread
        );

      radial +=
        secondaryIntensity *
        falloffSecondary;
    }

    // Tangential swirl around the primary target: a rotation-like
    // nudge perpendicular to the normal, scaled by the same falloff,
    // so the affected patch twists rather than just bulging/caving
    // symmetrically.
    tmpTangent
      .crossVectors(
        tmpN,
        primaryTarget
      )
      .normalize();

    const swirl =
      swirlStrength *
      falloffPrimary;

    tmpContribution
      .copy(tmpN)
      .multiplyScalar(radial)
      .addScaledVector(
        tmpTangent,
        swirl
      );

    offsets[i3] =
      THREE.MathUtils.clamp(
        offsets[i3] +
          tmpContribution.x,
        -MAX_OFFSET_PER_VERTEX,
        MAX_OFFSET_PER_VERTEX
      );

    offsets[i3 + 1] =
      THREE.MathUtils.clamp(
        offsets[i3 + 1] +
          tmpContribution.y,
        -MAX_OFFSET_PER_VERTEX,
        MAX_OFFSET_PER_VERTEX
      );

    offsets[i3 + 2] =
      THREE.MathUtils.clamp(
        offsets[i3 + 2] +
          tmpContribution.z,
        -MAX_OFFSET_PER_VERTEX,
        MAX_OFFSET_PER_VERTEX
      );
  }
}

/*
 * Rebuild the ENTIRE deformation field from scratch, from the current
 * transaction list — the field is always exactly the sum of each
 * transaction's own deterministic contribution (see
 * addTransactionContribution above), never an incrementally-mutated
 * buffer. This is what makes delete exact: removing a transaction
 * from `transactions` and recomputing yields precisely the field
 * that transaction's absence implies, with no residue and no
 * dependence on add/delete order (each contribution is keyed by the
 * transaction's own id+type, not by position in the list).
 *
 * OVERSPEND-classified events aren't a separate transaction type in
 * the store (they're EXPENSE transactions that happened to cross the
 * budget at save time) — the persistent field therefore treats every
 * EXPENSE identically regardless of whether it triggered OVERSPEND;
 * only the one-shot glitch (driven by anomalyEvent, not by this
 * field) is specific to the triggering transaction.
 */
function computeDeformationField(
  transactions,
  basePositions,
  baseNormals,
  vertexCount
) {
  const offsets = new Float32Array(
    vertexCount * 3
  );

  for (
    let t = 0;
    t < transactions.length;
    t++
  ) {
    const tx = transactions[t];

    if (
      tx.type !== 'INCOME' &&
      tx.type !== 'EXPENSE' &&
      tx.type !== 'TRANSFER'
    ) {
      continue;
    }

    addTransactionContribution(
      offsets,
      basePositions,
      baseNormals,
      vertexCount,
      tx
    );
  }

  return offsets;
}

// Lightweight fingerprint of the transaction list so the deformation
// field is only recomputed when the underlying activity actually
// changes (add/delete/edit), never every frame or every render.
function fingerprintTransactions(
  transactions
) {
  let fp = '';

  for (
    let i = 0;
    i < transactions.length;
    i++
  ) {
    const tx = transactions[i];

    fp +=
      tx.id +
      ':' +
      tx.type +
      ':' +
      tx.amount +
      '|';
  }

  return fp;
}

function SpherePoints() {
  const pointsRef = useRef();
  const geomRef = useRef();
  const materialRef = useRef();

  const anomalyEvent = useFinanceStore(
    (s) => s.anomalyEvent
  );

  const clearAnomalyEvent = useFinanceStore(
    (s) => s.clearAnomalyEvent
  );

  /*
   * Persistent STATE (not the one-shot event): re-derived from
   * budget/spend on every render. Drives an ongoing "living" idle
   * reaction — ambient breathing gets stronger and less regular
   * while over budget — fully independent of anomalyEvent, so it
   * cannot repeat-fire and needs no clearing.
   */
  const isOverBudget = useFinanceStore(
    (s) => s.getIsOverBudgetThisMonth()
  );

  /*
   * Source of truth for the persistent shape: the CURRENT full
   * transaction list. The deformation field below is always a pure
   * function of this list (see computeDeformationField) — never an
   * incrementally-mutated buffer — so add/delete/edit are all
   * handled correctly by simply recomputing from whatever this
   * selector currently returns, with no dependence on order.
   */
  const transactions = useFinanceStore(
    (s) => s.transactions
  );

  const geometry = useMemo(
    () => new THREE.SphereGeometry(...SPHERE_ARGS),
    []
  );

  const basePositions = useMemo(
    () =>
      geometry.attributes.position.array.slice(),
    [geometry]
  );

  const baseNormals = useMemo(
    () =>
      geometry.attributes.normal.array.slice(),
    [geometry]
  );

  const vertexCount =
    basePositions.length / 3;

  /*
   * PERSISTENT deformation field, derived fresh from `transactions`
   * whenever the list actually changes (fingerprinted below so an
   * unrelated re-render — e.g. the clock tick in Header — doesn't
   * trigger a recompute), never mutated frame-to-frame. Read every
   * frame inside useFrame exactly like basePositions/baseNormals: a
   * stable input alongside idle breathing. Because it's always
   * rebuilt from the CURRENT transaction list rather than
   * incrementally accumulated, deleting a transaction and letting
   * this recompute yields exactly the field implied by the remaining
   * activity — no residue, no drift, no dependence on add/delete
   * order (each transaction's own contribution is keyed by its id).
   */
  const transactionsFingerprint =
    useMemo(
      () =>
        fingerprintTransactions(
          transactions
        ),
      [transactions]
    );

  const deformationField = useMemo(
    () =>
      computeDeformationField(
        transactions,
        basePositions,
        baseNormals,
        vertexCount
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      transactionsFingerprint,
      basePositions,
      baseNormals,
      vertexCount,
    ]
  );

  const eventsRef = useRef([]);
  const glitchUntilRef = useRef(0);
  const rotationRef = useRef(0);

  // Heart morph state:
  // null = not running,
  // otherwise seconds elapsed since trigger.
  const heartRef = useRef(
    isSpecialDate(new Date()) ? 0 : null
  );

  // Calendar day on which the heart animation last played.
  const heartPlayedDateRef = useRef(
    isSpecialDate(new Date())
      ? new Date().toDateString()
      : null
  );

  // Throttle calendar checks instead of
  // running them every frame.
  const lastDateCheckRef = useRef(0);

  const tmpVec = useMemo(
    () => new THREE.Vector3(),
    []
  );

  const tmpBase = useMemo(
    () => new THREE.Vector3(),
    []
  );

  const tmpNormal = useMemo(
    () => new THREE.Vector3(),
    []
  );

  const tmpTarget = useMemo(
    () => new THREE.Vector3(),
    []
  );

  useEffect(() => {
    if (!anomalyEvent) return;

    /*
     * The persistent shape (deformationField, above) is now derived
     * directly from the transaction list, recomputed automatically
     * whenever `transactions` changes — this effect no longer needs
     * to (and must not) mutate any buffer itself for INCOME/EXPENSE/
     * TRANSFER/OVERSPEND; the store update that produced this event
     * already updated `transactions`, which the useMemo above will
     * pick up on its own. This effect's only remaining job is
     * OVERSPEND's separate, transient glitch and CELEBRATE's
     * separate, transient one-shot reaction — neither of which is
     * part of the persistent field.
     */
    if (anomalyEvent.type === 'OVERSPEND') {
      /*
       * Strong TRANSIENT glitch (violent jitter + 15% shrink),
       * layered on top of the persistent field at render time (see
       * useFrame below) — decays after 3s, while the persistent dent
       * this same transaction contributes to deformationField remains
       * for as long as the transaction itself remains in the ledger.
       */
      glitchUntilRef.current =
        performance.now() + 3000;
    } else if (
      anomalyEvent.type === 'CELEBRATE'
    ) {
      // CELEBRATE is not a financial-history event (no store action
      // currently dispatches it) — kept as the original one-shot,
      // fully-transient reaction via eventsRef, unrelated to the
      // persistent deformation field above.
      eventsRef.current.push({
        type: 'CELEBRATE',
        target: randomUnitVector(),
        life: 1.0,
        duration: 2.0,
        intensity: 0.6,
      });
    }

    clearAnomalyEvent();
  }, [
    anomalyEvent,
    clearAnomalyEvent,
  ]);

  useFrame((state, delta) => {
    const geom = geomRef.current;

    if (!geom) return;

    const posAttr =
      geom.attributes.position;

    const time =
      state.clock.elapsedTime;

    const isGlitching =
      performance.now() 
      glitchUntilRef.current;

    // Rotation: frozen during glitch. Slightly faster, still linear,
    // while the persistent over-budget state holds — restrained
    // "alive" motion, not a spring/bounce.
    if (!isGlitching) {
      const revolutionSeconds =
        isOverBudget ? 30 : 45;

      rotationRef.current +=
        delta *
        ((Math.PI * 2) /
          revolutionSeconds);
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y =
        rotationRef.current;
    }

    // Advance and prune financial-event reactions.
    const events = eventsRef.current;

    for (
      let i = events.length - 1;
      i >= 0;
      i--
    ) {
      events[i].life -=
        delta / events[i].duration;

      if (events[i].life <= 0) {
        events.splice(i, 1);
      }
    }

    // Re-arm the heart sequence at most once per
    // special calendar day.
    const nowMs =
      performance.now();

    if (
      nowMs -
        lastDateCheckRef.current >
      1000
    ) {
      lastDateCheckRef.current =
        nowMs;

      const today = new Date();

      const todayStr =
        today.toDateString();

      if (
        isSpecialDate(today) &&
        heartPlayedDateRef.current !==
          todayStr &&
        heartRef.current === null
      ) {
        heartRef.current = 0;
        heartPlayedDateRef.current =
          todayStr;
      }
    }

    // Heart morph timeline:
    // 0-3 morph in,
    // 3-8 hold,
    // 8-11 morph out,
    // then done.
    let heartT =
      heartRef.current;

    let morphProgress = 0;

    if (heartT !== null) {
      heartT += delta;
      heartRef.current = heartT;

      if (heartT < 3) {
        morphProgress =
          heartT / 3;
      } else if (heartT < 8) {
        morphProgress = 1;
      } else if (heartT < 11) {
        morphProgress =
          1 -
          (heartT - 8) / 3;
      } else {
        morphProgress = 0;
        heartRef.current = null;
      }
    }

    for (
      let i = 0;
      i < vertexCount;
      i++
    ) {
      const i3 = i * 3;

      tmpBase.set(
        basePositions[i3],
        basePositions[i3 + 1],
        basePositions[i3 + 2]
      );

      tmpNormal.set(
        baseNormals[i3],
        baseNormals[i3 + 1],
        baseNormals[i3 + 2]
      );

      // Idle breathing. Persistent over-budget STATE (not the
      // one-shot event) widens and roughens this, so the sphere reads
      // as "currently living in an anomalous state" continuously,
      // distinct from the sharp one-shot OVERSPEND glitch below.
      const breathAmplitude =
        isOverBudget ? 0.07 : 0.03;

      const breathSpeed =
        isOverBudget ? 0.9 : 0.5;

      const idleDisp =
        Math.sin(
          time * breathSpeed +
            tmpBase.x * 2 +
            tmpBase.y * 2
        ) * breathAmplitude;

      /*
       * Persistent shape, derived fresh from the current transaction
       * list (see deformationField above) — read here as a stable
       * XYZ offset alongside idle breathing, exactly like
       * basePositions/baseNormals. This is the vertex's evolving
       * "shape", separate from the moment-to-moment idle wobble
       * above: it only changes when the transaction list itself
       * changes (add/delete/edit), never inside this per-frame loop,
       * so reading it here every frame cannot itself cause drift —
       * and because it's a full XYZ vector (not a single scalar
       * along the normal), it can carry the tangential swirl/shear
       * components that make the shape non-radial.
       */
      const dfi3 = i * 3;

      tmpVec
        .copy(tmpBase)
        .addScaledVector(
          tmpNormal,
          idleDisp
        );

      tmpVec.x +=
        deformationField[dfi3];
      tmpVec.y +=
        deformationField[dfi3 + 1];
      tmpVec.z +=
        deformationField[dfi3 + 2];

      // Financial-event reactions still active in eventsRef are, as
      // of the persistent-accumulation model above, CELEBRATE only —
      // INCOME/EXPENSE/TRANSFER/OVERSPEND no longer push a transient
      // entry here (their effect is the permanent offset applied
      // above instead).
      for (
        let e = 0;
        e < events.length;
        e++
      ) {
        const ev =
          events[e];

        tmpVec.addScaledVector(
          tmpNormal,
          ev.intensity * ev.life
        );
      }

      // Overspend glitch: jitter + shrink, layered ON TOP OF the
      // persistently-displaced shape (tmpVec as already computed
      // above), NOT a reset back to the raw base sphere — the
      // permanent dent from this same OVERSPEND event must still be
      // visible once the glitch itself ends. The 15% shrink is now a
      // uniform scale of the CURRENT (persistent-offset-inclusive)
      // vector rather than of the raw base, so it still reads as
      // "shrink" during the glitch while preserving the evolving
      // shape underneath once isGlitching ends.
      if (isGlitching) {
        const jitter =
          0.15 * Math.random() -
          0.075;

        tmpVec.addScaledVector(
          tmpNormal,
          jitter
        );

        tmpVec.multiplyScalar(0.85);
      }

      // Heart morph.
      if (morphProgress > 0) {
        tmpTarget.copy(
          heartTarget(tmpBase)
        );

        tmpVec.lerp(
          tmpTarget,
          morphProgress
        );
      }

      posAttr.setXYZ(
        i,
        tmpVec.x,
        tmpVec.y,
        tmpVec.z
      );
    }

    posAttr.needsUpdate = true;

    if (materialRef.current) {
      materialRef.current.opacity = isGlitching
        ? 0.9
        : isOverBudget
        ? 0.75
        : 0.6;
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();

      if (materialRef.current) {
        materialRef.current.dispose();
      }
    };
  }, [geometry]);

  /*
   * `size.width` (CSS pixels) and `viewport.width` (world units) are
   * both already known to react-three-fiber for the SAME canvas, so
   * their ratio gives an exact world-units-per-CSS-pixel conversion
   * with no separate trigonometry to keep in sync with the camera.
   * BLUR_MAX_PX matches the larger of the two blur classes actually
   * applied below (blur-lg, the over-budget state) so the margin
   * covers the worst case regardless of which state is active.
   */
  const { viewport, size } = useThree();

  const worldUnitsPerPixel =
    viewport.width / size.width;

  const BLUR_MAX_PX = 16; // Tailwind blur-lg

  const blurMarginWorld =
    BLUR_MAX_PX * worldUnitsPerPixel;

  const usableHalfWidth = Math.max(
    0,
    viewport.width / 2 -
      blurMarginWorld
  );

  const sphereRadius = Math.min(
    2,
    usableHalfWidth
  );

  const offsetX = Math.min(
    2.5,
    Math.max(
      0,
      usableHalfWidth - sphereRadius
    )
  );

  const sphereScale =
    sphereRadius / 2;

  return (
    <points
      ref={pointsRef}
      position={[offsetX, 0, 0]}
      scale={sphereScale}
    >
      <primitive
        object={geometry}
        ref={geomRef}
        attach="geometry"
      />

      <pointsMaterial
        ref={materialRef}
        size={0.07}
        color="#888888"
        sizeAttenuation
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </points>
  );
}

/*
 * Persistent status readout. Purely level-based (re-reads store state
 * on every render) — completely separate from anomalyEvent, so it
 * can never repeat-fire and needs no dismiss/clear. It is the
 * design.md "[ ! OVER BUDGET ! ]" indicator, now surfaced once at the
 * app shell so it stays visible across Dashboard/Ledger/Calendar/
 * Accounts without duplicating the anomaly component per page.
 * AsciiProgressBar (Dashboard's budget bar) intentionally no longer
 * renders this same string, so this is the single authoritative
 * OVER BUDGET indicator on every screen including Dashboard.
 *
 * Positioned as a small fixed terminal readout rather than a toast:
 * top-anchored, inset from the edges by viewport-relative spacing
 * plus safe-area insets on all three sides so it never touches the
 * screen edge (or sits under a notch/rounded corner) on any phone,
 * sized with clamp-style responsive text so it stays legible without
 * becoming either a tiny effect or an oversized banner, and sits at
 * z-20 — above ordinary tab content (z-10) but below Header (z-30),
 * Footer (z-50) and Modal (z-50), so it never covers navigation or
 * dialogs.
 */
function OverBudgetIndicator({ isOverBudget }) {
  if (!isOverBudget) return null;

  return (
    <div
      className="absolute z-20 pointer-events-none flex justify-center"
      style={{
        top: 'max(0.375rem, env(safe-area-inset-top))',
        left: 'max(0.5rem, env(safe-area-inset-left))',
        right: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <span
        className="font-mono font-bold uppercase tracking-widest text-white bg-black border border-white px-1.5 py-px whitespace-nowrap brutalist-overbudget-pulse"
        style={{
          fontSize: 'clamp(0.5rem, 2.2vw, 0.65rem)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        [ ! OVER BUDGET ! ]
      </span>
    </div>
  );
}

export default function Anomaly() {
  const isOverBudget = useFinanceStore(
    (s) => s.getIsOverBudgetThisMonth()
  );

  return (
    <>
      {/*
        Ambient sphere layer stays at z-0 (behind every tab's z-10
        content), exactly as design.md specifies — a background
        presence, not a foreground one.
      */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute inset-0 !pointer-events-none transition-none ${
            isOverBudget
              ? 'blur-lg opacity-70'
              : 'blur-md opacity-45'
          }`}
        >
          <Canvas
            style={{
              pointerEvents: 'none',
            }}
            camera={{
              position: [0, 0, 6],
              fov: 60,
            }}
            dpr={[1, 1.5]}
            gl={{
              antialias: false,
            }}
          >
            <SpherePoints />
          </Canvas>
        </div>
      </div>

      {/*
        The status readout is a SEPARATE top-level layer (its own
        stacking context, z-20) rather than nested inside the z-0
        sphere wrapper above — nesting it there would have capped its
        effective stacking order at z-0, hiding it behind every tab's
        z-10 content on Dashboard/Ledger/Calendar/Accounts alike.
      */}
      <OverBudgetIndicator isOverBudget={isOverBudget} />
    </>
  );
}
