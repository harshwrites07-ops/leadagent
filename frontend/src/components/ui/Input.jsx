import React from 'react';

/**
 * ONE input style. Label + input + inline error, on the .field/.input
 * CSS system. Errors render below the field, near the problem.
 *
 * <Input label="Channel URL" value={url} onChange={…} error={err} />
 * <Input as="textarea" label="Notes" rows={4} />
 */
export default function Input({
  label,
  error,
  hint,
  as = 'input',
  className = '',
  style,
  id,
  ...rest
}) {
  const inputId = id || (label ? `field-${label.replace(/\W+/g, '-').toLowerCase()}` : undefined);
  const Tag = as === 'textarea' ? 'textarea' : 'input';
  const cls = [as === 'textarea' ? 'textarea' : 'input', className].filter(Boolean).join(' ');

  return (
    <div className="field" style={style}>
      {label && <label className="field__label" htmlFor={inputId}>{label}</label>}
      <Tag
        id={inputId}
        className={cls}
        aria-invalid={error ? true : undefined}
        style={error ? { borderColor: 'var(--coral-border)' } : undefined}
        {...rest}
      />
      {error && (
        <span role="alert" style={{ fontSize: 11.5, color: 'var(--bad)', fontFamily: 'var(--f-mono)' }}>
          {error}
        </span>
      )}
      {!error && hint && (
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{hint}</span>
      )}
    </div>
  );
}
