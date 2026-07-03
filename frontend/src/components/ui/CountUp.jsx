import React, { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animated number — every data number in the app renders through this.
 * Monospace by default (mono law), counts up on mount / value change.
 *
 * <CountUp value={12480} prefix="$" />
 * <CountUp value={92.4} decimals={1} suffix="%" />
 * <CountUp value={3184} format={formatNumber} />
 */
export default function CountUp({
  value = 0,
  duration = 900,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  format, // optional (n) => string, overrides decimals
  mono = true,
  style,
  ...rest
}) {
  const target = typeof value === 'string'
    ? parseFloat(value.replace(/[^0-9.-]/g, '')) || 0
    : value || 0;
  const [display, setDisplay] = useState(prefersReducedMotion() ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let frame;
    let startTime = null;
    const timer = setTimeout(() => {
      const animate = (ts) => {
        if (!startTime) startTime = ts;
        const progress = Math.min((ts - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(from + (target - from) * eased);
        if (progress < 1) frame = requestAnimationFrame(animate);
        else fromRef.current = target;
      };
      frame = requestAnimationFrame(animate);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [target, duration, delay]);

  const text = format
    ? format(display)
    : display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span
      style={{
        fontFamily: mono ? 'var(--f-mono)' : undefined,
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
      {...rest}
    >
      {prefix}{text}{suffix}
    </span>
  );
}
