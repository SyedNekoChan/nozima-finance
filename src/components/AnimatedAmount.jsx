import { useLayoutEffect, useRef, useState } from 'react';
import { formatAmount } from '../lib/currency.js';
import { figure } from '../lib/format.js';
import { DUR } from '../lib/motion.js';
import useTweenedText from '../hooks/useTweenedText.js';

/*
 * Money figures, everywhere in the app.
 *
 * Every amount is one unbreakable line that never runs past its container:
 *   1. it is set at its designed size whenever it fits (ordinary amounts);
 *   2. an amount too long for the space steps its font size down just enough
 *      to fit, never below 12px;
 *   3. only past that floor may the currency code go to the next line, and
 *      the figure break between digit groups (after a comma), never between
 *      two digits.
 * All digits always show; nothing is truncated; the text read out is the
 * exact amount, and it is also the element's tooltip.
 */
const MIN_PX = 12;
const ZWSP = '​';

const codeOf = (currency) => (formatAmount(0, currency).match(/([A-Z]{3})$/) || [])[1] || '';

/*
 * Fits `ref`'s text to its container. `texts` are the strings it will show
 * (the final value and, while a figure eases, the one it eases from): the
 * size is chosen for the widest of them, so no frame of the animation spills.
 * Returns true when even the floor size needs line breaks (step 3).
 */
function useFit(ref, innerRef, texts) {
  const [wrap, setWrap] = useState(false);
  const key = texts.join('|');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const fit = (candidates) => {
      const inner = innerRef?.current;
      const saved = inner ? inner.textContent : null;
      el.style.fontSize = '';
      el.style.whiteSpace = 'nowrap';
      const base = parseFloat(getComputedStyle(el).fontSize) || 16;
      let scale = 1;
      for (const t of candidates) {
        if (inner && t != null) inner.textContent = t;
        const avail = el.clientWidth;
        const need = el.scrollWidth;
        if (avail > 0 && need > avail + 0.5) scale = Math.min(scale, avail / need);
      }
      if (inner && saved != null) inner.textContent = saved;
      if (scale < 1) {
        let px = Math.max(MIN_PX, Math.floor(base * scale * 0.99 * 100) / 100);
        el.style.fontSize = `${px}px`;
        // parts with their own minimum size (the code) do not scale linearly: refine until it fits
        for (let i = 0; i < 4 && px > MIN_PX && el.scrollWidth > el.clientWidth + 0.5; i++) {
          px = Math.max(MIN_PX, Math.floor(px * (el.clientWidth / el.scrollWidth) * 0.99 * 100) / 100);
          el.style.fontSize = `${px}px`;
        }
        const tooLong = px <= MIN_PX && el.scrollWidth > el.clientWidth + 0.5;
        el.style.whiteSpace = tooLong ? 'normal' : 'nowrap';
        setWrap(tooLong);
      } else {
        setWrap(false);
      }
    };
    fit(texts);
    // once the figure has eased to its value, fit it alone
    const settle = texts.length > 1 ? setTimeout(() => fit(texts.slice(0, 1)), DUR.data * 1000 + 60) : 0;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fit(texts.slice(0, 1)));
    }) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return wrap;
}

// break opportunities between digit groups, for the rare amount that cannot fit on one line
// (never <wbr>: Chrome breaks at it even under white-space: nowrap)
const groupBreaks = (text) => text.replace(/,/g, `,${ZWSP}`);

/*
 * A money figure that eases between values instead of snapping (320ms,
 * zero React renders per frame). Formatting still goes through
 * formatAmount, so any currency code the app handles works unchanged.
 *
 * split: the figure and its currency code are set separately, the code
 * smaller and quieter (`codeClassName`). `sign` forces a leading + / −.
 */
export default function AnimatedAmount({ value, currency = 'UZS', className = '', split = false, codeClassName = '', sign = false }) {
  const v = Number(value) || 0;
  const signed = (text, n) => (sign && n > 0 ? `+${text}` : text);
  const show = (n) => (split ? signed(figure(n, currency), n) : signed(formatAmount(n, currency), n));
  const outerRef = useRef(null);
  const from = useRef(v);
  const texts = from.current === v ? [show(v)] : [show(v), show(from.current)];
  from.current = v;
  const wrapRef = useRef(false);
  const [wrapKey, setWrapKey] = useState(false);
  // the wrap state is part of the reset key: switching it rewrites the text at once, with or without group breaks
  const textRef = useTweenedText(v, (n) => (wrapRef.current ? groupBreaks(show(n)) : show(n)), `${currency}|${wrapKey}`);
  const wrap = useFit(outerRef, textRef, texts);
  wrapRef.current = wrap;
  if (wrap !== wrapKey) setWrapKey(wrap);
  const exact = signed(formatAmount(v, currency), v);

  if (!split) {
    return (
      <span ref={outerRef} title={exact} className={`tnum inline-block max-w-full align-bottom whitespace-nowrap ${className}`}>
        <span ref={textRef} />
      </span>
    );
  }

  const code = codeOf(currency);
  return (
    <span ref={outerRef} title={exact} className={`tnum inline-block max-w-full align-bottom whitespace-nowrap ${className}`}>
      <span ref={textRef} />
      {code && (
        <>
          {wrap ? ZWSP : null}
          <span className={`ml-[0.3em] ${codeClassName || 'text-[max(12px,0.5em)] font-mono font-normal tracking-wide text-ink-3 align-[0.15em]'}`}>{code}</span>
        </>
      )}
    </span>
  );
}

/* the same, without the tween: rows, lists, anything static */
export function Amount({ value, currency = 'UZS', className = '', codeClassName = 'ml-1 font-mono text-[max(12px,0.72em)] text-ink-3', sign }) {
  const v = Number(value) || 0;
  const code = codeOf(currency);
  let text = figure(v, currency);
  if (sign === '+') text = `+${text}`;
  if (sign === '-') text = `−${text.replace(/^−/, '')}`;
  const ref = useRef(null);
  const wrap = useFit(ref, null, [`${text}${code}`]);
  const exact = `${text} ${code}`.trim();
  return (
    <span ref={ref} title={exact} className={`tnum inline-block max-w-full align-bottom whitespace-nowrap ${className}`}>
      <span>{wrap ? groupBreaks(text) : text}</span>
      {code && (
        <>
          {wrap ? ZWSP : null}
          <span className={codeClassName}>{code}</span>
        </>
      )}
    </span>
  );
}
