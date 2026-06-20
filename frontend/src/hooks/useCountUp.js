import { useEffect, useState } from 'react';

export function useCountUp(target, duration = 1200, delay = 0) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!target || target === 0) {
      setValue(0);
      return;
    }

    let startTime = null;
    let frame;
    const start = 0;
    const end = typeof target === 'string'
      ? parseFloat(target.replace(/[^0-9.]/g, ''))
      : target;

    const timer = setTimeout(() => {
      const animate = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(start + (end - start) * eased));
        if (progress < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, duration, delay]);

  return value;
}
