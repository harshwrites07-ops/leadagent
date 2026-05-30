import React from 'react';

function CardHead({ title, actions }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 14, borderBottom: '1px solid var(--line)', marginBottom: 16,
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--f-sans)' }}>
        {title}
      </span>
      {actions && <div style={{ display: 'flex', gap: 6 }}>{actions}</div>}
    </div>
  );
}

function CardBody({ children, style }) {
  return (
    <div style={{ padding: 0, ...style }}>
      {children}
    </div>
  );
}

export default function Card({ children, style, ...rest }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)', padding: 16,
      ...style,
    }} {...rest}>
      {children}
    </div>
  );
}

Card.Head = CardHead;
Card.Body = CardBody;
