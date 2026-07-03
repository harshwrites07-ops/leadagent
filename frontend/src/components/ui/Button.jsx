import React from 'react';

/**
 * ONE button system. Variants: primary (lime) / secondary / ghost /
 * coral (human action) / danger. Sizes: sm / md / lg.
 * Full state set (hover/focus/active/disabled) lives in index.css `.btn`.
 *
 * <Button variant="primary" loading={saving}>Launch PowerMode</Button>
 */
const variantClass = {
  primary: 'btn--primary',
  secondary: '',
  ghost: 'btn--ghost',
  coral: 'btn--coral',
  danger: 'btn--danger',
};
const sizeClass = { sm: 'btn--sm', md: '', lg: 'btn--lg' };

export default function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const cls = [
    'btn',
    variantClass[variant] ?? '',
    sizeClass[size] ?? '',
    loading ? 'btn--loading' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
