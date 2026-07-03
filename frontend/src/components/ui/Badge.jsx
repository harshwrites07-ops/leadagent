import React from 'react';

/**
 * ONE badge system. Kinds: lime (machine/live) / coral (human/attention)
 * / ok / warn / bad / neutral / ghost. Pulse adds the status dot.
 *
 * <Badge kind="lime" pulse>Live</Badge>
 * <Badge kind="coral">3 unread</Badge>
 */
const kindClass = {
  lime: 'badge--lime',
  coral: 'badge--coral',
  ok: 'badge--ok',
  warn: 'badge--warn',
  bad: 'badge--bad',
  neutral: 'badge--neutral',
  ghost: 'badge--ghost',
};

export default function Badge({ kind = 'ghost', pulse = false, className = '', children, ...rest }) {
  const cls = ['badge', kindClass[kind] ?? 'badge--ghost', className].filter(Boolean).join(' ');
  const dotCls = kind === 'coral' ? 'dot dot--pulse-coral' : 'dot dot--pulse';
  return (
    <span className={cls} {...rest}>
      {pulse && <span className={dotCls} aria-hidden="true" />}
      {children}
    </span>
  );
}
