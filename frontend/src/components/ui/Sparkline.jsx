import React from 'react';
import { motion } from 'framer-motion';
import { drawPath } from '../../lib/motion';

/**
 * ONE sparkline. SVG path + 10% gradient fill, draws itself on mount.
 * Accepts raw numbers or {count|value} objects.
 */
export default function Sparkline({ data = [], color = 'var(--lime)', height = 36, animate = true }) {
  if (!data.length) return null;
  const w = 200, h = height;
  const vals = data.map(d => (typeof d === 'object' ? (d.count ?? d.value ?? 0) : d));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const pts = vals.map((v, i) => [
    (i / Math.max(vals.length - 1, 1)) * w,
    h - ((v - min) / span) * (h - 4) - 2,
  ]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dFill = `${d} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
      <path d={dFill} fill={color} opacity={0.1} />
      {animate ? (
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={drawPath}
          initial="hidden"
          animate="visible"
        />
      ) : (
        <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
