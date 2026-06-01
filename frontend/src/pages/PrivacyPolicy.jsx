import React from 'react';
import { Link } from 'react-router-dom';

const S = {
  page: {
    minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'var(--f-sans)', padding: '48px 24px 80px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  wrap: { maxWidth: 720, width: '100%' },
  back: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: 'var(--text-3)', fontSize: 13, textDecoration: 'none',
    marginBottom: 36, transition: 'color 0.15s',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40,
  },
  logoIcon: {
    width: 36, height: 36, borderRadius: 9, background: 'var(--lime)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontWeight: 900, fontSize: 13, color: '#0a0a0c' },
  logoName: { fontWeight: 700, fontSize: 15, color: 'var(--text)', margin: 0 },
  logoSub: { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', margin: 0, fontFamily: 'var(--f-mono)' },
  h1: { fontFamily: 'var(--f-serif)', fontSize: 36, fontStyle: 'italic', color: 'var(--text)', margin: '0 0 8px' },
  updated: { color: 'var(--text-3)', fontSize: 13, margin: '0 0 40px' },
  h2: { fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '32px 0 10px' },
  p: { color: 'var(--text-2)', fontSize: 14, lineHeight: 1.75, margin: '0 0 16px' },
  ul: { color: 'var(--text-2)', fontSize: 14, lineHeight: 1.75, paddingLeft: 20, margin: '0 0 16px' },
  divider: { border: 'none', borderTop: '1px solid var(--line)', margin: '32px 0' },
  footer: { color: 'var(--text-4)', fontSize: 12, marginTop: 48, display: 'flex', gap: 16, flexWrap: 'wrap' },
};

export default function PrivacyPolicy() {
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <Link to="/" style={S.back}>← Back to app</Link>

        <div style={S.logo}>
          <div style={S.logoIcon}><span style={S.logoText}>CC</span></div>
          <div>
            <p style={S.logoName}>ContentCrafterzz</p>
            <p style={S.logoSub}>OUTREACH OS</p>
          </div>
        </div>

        <h1 style={S.h1}>Privacy Policy</h1>
        <p style={S.updated}>Last updated: June 1, 2026</p>

        <p style={S.p}>
          ContentCrafterzz ("we", "us", or "our") operates the ContentCrafterzz Outreach OS platform. This Privacy Policy explains how we collect, use, and protect your information when you use our service.
        </p>

        <hr style={S.divider} />

        <h2 style={S.h2}>1. Information We Collect</h2>
        <p style={S.p}>We collect information you provide directly to us, including:</p>
        <ul style={S.ul}>
          <li>Account information: name, email address, password (hashed), phone number</li>
          <li>Profile information: agency name, role, portfolio URL, pricing range</li>
          <li>Payment information: processed securely by Stripe — we never store card numbers</li>
          <li>Usage data: leads found, emails sent, CRM activity, and platform interactions</li>
          <li>Gmail OAuth tokens: only if you connect a Gmail account for sending (stored encrypted)</li>
        </ul>

        <h2 style={S.h2}>2. How We Use Your Information</h2>
        <ul style={S.ul}>
          <li>To provide and operate the ContentCrafterzz Outreach OS service</li>
          <li>To generate AI-powered pitch emails and lead analysis on your behalf</li>
          <li>To process payments and manage your subscription</li>
          <li>To send transactional emails (verification, password reset, billing receipts)</li>
          <li>To improve the platform based on aggregate usage patterns</li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2 style={S.h2}>3. Data We Access on Your Behalf</h2>
        <p style={S.p}>
          When you connect a Gmail account, we request permission to send emails on your behalf. We do not read your personal inbox, store your email content beyond what is necessary for outreach tracking, or use your data for any purpose other than operating the service you requested.
        </p>

        <h2 style={S.h2}>4. Data Sharing</h2>
        <p style={S.p}>We do not sell your personal information. We share data only with:</p>
        <ul style={S.ul}>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Google</strong> — Gmail OAuth and YouTube API usage</li>
          <li><strong>Twilio</strong> — SMS OTP verification (phone numbers only)</li>
          <li><strong>Anthropic / Google AI</strong> — AI pitch generation (lead channel data is sent to generate pitches; no personal user account data is shared)</li>
        </ul>

        <h2 style={S.h2}>5. Data Retention</h2>
        <p style={S.p}>
          We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us. Lead data, emails, and CRM records are deleted within 30 days of account closure.
        </p>

        <h2 style={S.h2}>6. Security</h2>
        <p style={S.p}>
          We use industry-standard security measures including encrypted passwords (bcrypt), HTTPS-only transport, HttpOnly session cookies, and rate limiting on authentication endpoints. No method of transmission over the internet is 100% secure.
        </p>

        <h2 style={S.h2}>7. Your Rights</h2>
        <p style={S.p}>Depending on your location, you may have the right to:</p>
        <ul style={S.ul}>
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to or restrict certain processing</li>
          <li>Data portability (export your leads and data as CSV)</li>
        </ul>

        <h2 style={S.h2}>8. Cookies</h2>
        <p style={S.p}>
          We use a single session cookie (<code>ccz.sid</code>) strictly for authentication. We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
        </p>

        <h2 style={S.h2}>9. Children's Privacy</h2>
        <p style={S.p}>
          ContentCrafterzz is not directed to children under 16. We do not knowingly collect personal information from children.
        </p>

        <h2 style={S.h2}>10. Changes to This Policy</h2>
        <p style={S.p}>
          We may update this Privacy Policy from time to time. We will notify you of significant changes by email or via an in-app notice. Continued use of the service after changes constitutes acceptance of the updated policy.
        </p>

        <h2 style={S.h2}>11. Contact Us</h2>
        <p style={S.p}>
          For privacy-related questions or data requests, contact us at: <a href="mailto:harshwrites07@gmail.com" style={{ color: 'var(--lime)' }}>harshwrites07@gmail.com</a>
        </p>

        <hr style={S.divider} />
        <div style={S.footer}>
          <Link to="/terms" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Terms of Service</Link>
          <Link to="/" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>← Back to app</Link>
        </div>
      </div>
    </div>
  );
}
