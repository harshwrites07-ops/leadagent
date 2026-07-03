import React from 'react';

/**
 * ONE card component. Elevation is a different surface shade, never
 * just a border. Variants: default (surface) / raised (surface-2) /
 * hero (surface-2 + lime wash — one per screen max).
 *
 * <Card variant="hero" className="bento__2x2">…</Card>
 */
export default function Card({ variant = 'default', className = '', style, children, ...rest }) {
  const cls = [
    'card',
    variant === 'raised' ? 'card--raised' : '',
    variant === 'hero' ? 'card--hero' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} style={style} {...rest}>
      {children}
    </div>
  );
}

function CardHead({ title, actions, className = '', ...rest }) {
  return (
    <div className={`card__head ${className}`.trim()} {...rest}>
      <span className="card__title">{title}</span>
      {actions && <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

function CardBody({ children, className = '', style, ...rest }) {
  return (
    <div className={`card__body ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  );
}

Card.Head = CardHead;
Card.Body = CardBody;
