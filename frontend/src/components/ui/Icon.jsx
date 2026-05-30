import React from 'react';

const PATHS = {
  home:      <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>,
  users:     <><circle cx="9" cy="9" r="3.2"/><path d="M3 19c.5-3 3-5 6-5s5.5 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M16 14c2 0 4 1.2 5 3.5"/></>,
  rocket:    <><path d="M5 19c1-3 3-5 6-6"/><path d="M14 4c3 0 6 3 6 6-2 4-5 7-9 9l-3-3c2-4 5-7 9-9 0 0-2-2-3-3z"/><circle cx="15" cy="9" r="1.4"/></>,
  flow:      <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6h4a4 4 0 0 1 4 4M8 18h4a4 4 0 0 0 4-4"/></>,
  inbox:     <><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6h18v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></>,
  sparkle:   <><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2"/></>,
  bar:       <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  flame:     <><path d="M12 3c.5 4 4 4 4 9a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/></>,
  plus:      <><path d="M12 5v14M5 12h14"/></>,
  chev:      <><path d="m9 6 6 6-6 6"/></>,
  chevd:     <><path d="m6 9 6 6 6-6"/></>,
  search:    <><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></>,
  bell:      <><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2H4.5z"/><path d="M10 21h4"/></>,
  help:      <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17v.5"/></>,
  filter:    <><path d="M3 5h18l-7 8v6l-4 2v-8z"/></>,
  sort:      <><path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4"/></>,
  play:      <><path d="m7 5 12 7-12 7z"/></>,
  pause:     <><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></>,
  mail:      <><path d="M3 6h18v12H3z"/><path d="m3 7 9 7 9-7"/></>,
  youtube:   <><rect x="2" y="6" width="20" height="12" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></>,
  globe:     <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
  star:      <><path d="m12 3 2.6 5.6 6.2.7-4.6 4.2 1.2 6L12 16.7 6.6 19.5l1.2-6L3.2 9.3l6.2-.7z"/></>,
  reply:     <><path d="M9 5 3 11l6 6M3 11h12a6 6 0 0 1 6 6"/></>,
  settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  cmd:       <><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></>,
  arrowUp:   <><path d="M12 19V5M5 12l7-7 7 7"/></>,
  arrowDown: <><path d="M12 5v14M5 12l7 7 7-7"/></>,
  arrowR:    <><path d="M5 12h14M13 5l7 7-7 7"/></>,
  check:     <><path d="m5 12 5 5 9-11"/></>,
  x:         <><path d="m6 6 12 12M6 18 18 6"/></>,
  clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  target:    <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>,
  bolt:      <><path d="M13 3 4 14h7l-1 7 9-11h-7z"/></>,
  link:      <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></>,
  moreH:     <><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/></>,
  sliders:   <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></>,
  eye:       <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  pen:       <><path d="m4 20 4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/></>,
  layers:    <><path d="m12 4 9 5-9 5-9-5z"/><path d="m3 14 9 5 9-5M3 19l9 5 9-5"/></>,
  cpu:       <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  user:      <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  shield:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  upload:    <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  download:  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  copy:      <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  refresh:   <><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-.3-4.2L23 10"/></>,
  zap:       <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></>,
  trending:  <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
};

export default function Icon({ name, size = 16, className = '', style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ic ${className}`}
      style={style}
    >
      {PATHS[name] || null}
    </svg>
  );
}
