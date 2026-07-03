import React from 'react';
import CountUp from './CountUp';
import Sparkline from './Sparkline';

/**
 * ONE KPI tile. Mono label, counted-up mono value (serif only via the
 * page-level hero, never here), optional delta + sparkline.
 * Drop into a bento cell: <Stat className="bento__1x1" … />
 *
 * <Stat label="Emails sent" value={3184} spark={weekly} color="var(--lime)" />
 * <Stat label="Reply rate" value={4.2} decimals={1} suffix="%" color="var(--coral)" />
 */
export default function Stat({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  format,
  delta,          // e.g. "+12% this week"
  deltaDir,       // 'up' | 'down'
  spark,
  color,          // accent for value + sparkline (lime/coral/ok token)
  meta,
  className = '',
  style,
  ...rest
}) {
  return (
    <div className={`stat ${className}`.trim()} style={style} {...rest}>
      <div className="stat__label">{label}</div>
      <div className="stat__value stat__value--mono" style={color ? { color } : undefined}>
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} format={format} />
      </div>
      {delta && (
        <div className={`stat__delta${deltaDir === 'up' ? ' stat__delta--up' : deltaDir === 'down' ? ' stat__delta--down' : ''}`}>
          {delta}
        </div>
      )}
      {spark && (
        <div className="stat__spark">
          <Sparkline data={spark} color={color || 'var(--lime)'} />
        </div>
      )}
      {meta && <div className="stat__meta">{meta}</div>}
    </div>
  );
}
