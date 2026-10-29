import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function read() {
  try {
    return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/*
 * The live prefers-reduced-motion setting. framer-motion's own hook reads the
 * setting once per mount, so turning the OS option on or off while the app is
 * open left the pet on the old policy (it kept blinking and walking) until a
 * reload. This one follows changes.
 */
export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(read);

  useEffect(() => {
    let mq;
    try {
      mq = matchMedia(QUERY);
    } catch {
      return undefined;
    }
    const on = () => setReduced(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else mq.removeListener(on);
    };
  }, []);

  return reduced;
}
