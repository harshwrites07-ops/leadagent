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
    marginBottom: 36,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 },
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

export default function TermsOfService() {
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

        <h1 style={S.h1}>Terms of Service</h1>
        <p style={S.updated}>Last updated: June 1, 2026</p>

        <p style={S.p}>
          Please read these Terms of Service ("Terms") carefully before using ContentCrafterzz Outreach OS ("the Service") operated by ContentCrafterzz ("we", "us", or "our"). By accessing or using the Service, you agree to be bound by these Terms.
        </p>

        <hr style={S.divider} />

        <h2 style={S.h2}>1. Use of the Service</h2>
        <p style={S.p}>ContentCrafterzz Outreach OS provides tools for finding creator leads, generating AI-powered outreach emails, and managing client relationships. You agree to use the Service only for lawful business outreach purposes.</p>

        <h2 style={S.h2}>2. Acceptable Use</h2>
        <p style={S.p}>You must not use the Service to:</p>
        <ul style={S.ul}>
          <li>Send spam, unsolicited bulk emails, or emails that violate CAN-SPAM, GDPR, or applicable anti-spam laws</li>
          <li>Impersonate other individuals or organisations</li>
          <li>Harvest or scrape data in violation of third-party terms of service</li>
          <li>Attempt to gain unauthorised access to any system or network</li>
          <li>Use the Service for any illegal purpose</li>
          <li>Resell or sublicense the Service without written permission</li>
        </ul>
        <p style={S.p}>
          You are solely responsible for the content of emails sent through the Service. We are a sending platform and are not liable for the content of your outreach.
        </p>

        <h2 style={S.h2}>3. Accounts and Security</h2>
        <p style={S.p}>
          You are responsible for maintaining the security of your account credentials. You must notify us immediately of any unauthorised access. We reserve the right to suspend accounts that violate these Terms.
        </p>

        <h2 style={S.h2}>4. Subscription and Billing</h2>
        <ul style={S.ul}>
          <li>A 14-day free trial is provided upon signup with no credit card required</li>
          <li>After the trial, continued use requires an active paid subscription</li>
          <li>Subscriptions are billed monthly in advance and automatically renew</li>
          <li>All payments are processed by Stripe and are subject to Stripe's terms</li>
          <li>Refunds are provided at our discretion within 7 days of a charge if you contact us</li>
          <li>Cancellation takes effect at the end of the current billing period</li>
        </ul>

        <h2 style={S.h2}>5. AI-Generated Content</h2>
        <p style={S.p}>
          The Service uses AI models (including Google Gemini) to generate pitch emails and outreach content. You retain ownership of the output but are solely responsible for reviewing and approving any AI-generated content before sending. We make no warranties about the accuracy, quality, or effectiveness of AI-generated content.
        </p>

        <h2 style={S.h2}>6. Email Deliverability</h2>
        <p style={S.p}>
          We provide email sending infrastructure as a tool. We do not guarantee deliverability, open rates, or reply rates. Sending volumes, email content, and domain reputation are factors outside our control. You are responsible for complying with your email provider's terms when connecting Gmail or SMTP accounts.
        </p>

        <h2 style={S.h2}>7. Intellectual Property</h2>
        <p style={S.p}>
          The ContentCrafterzz platform, including its design, code, and branding, is owned by ContentCrafterzz and protected by intellectual property law. You may not copy, modify, or redistribute any part of the platform without written permission.
        </p>

        <h2 style={S.h2}>8. Disclaimers</h2>
        <p style={S.p}>
          THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR PRODUCE ANY PARTICULAR BUSINESS RESULT.
        </p>

        <h2 style={S.h2}>9. Limitation of Liability</h2>
        <p style={S.p}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, CONTENTCRAFTERZZ SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID IN THE 3 MONTHS PRECEDING THE CLAIM.
        </p>

        <h2 style={S.h2}>10. Termination</h2>
        <p style={S.p}>
          We reserve the right to suspend or terminate your account at any time for violation of these Terms, without prior notice. You may cancel your account at any time from the Settings page. Upon termination, your data will be deleted within 30 days.
        </p>

        <h2 style={S.h2}>11. Changes to Terms</h2>
        <p style={S.p}>
          We may update these Terms from time to time. Continued use of the Service after changes are posted constitutes acceptance of the new Terms. We will notify users of material changes via email.
        </p>

        <h2 style={S.h2}>12. Governing Law</h2>
        <p style={S.p}>
          These Terms are governed by applicable law. Any disputes shall be resolved through binding arbitration or in the courts of competent jurisdiction.
        </p>

        <h2 style={S.h2}>13. Contact</h2>
        <p style={S.p}>
          For questions about these Terms, contact us at: <a href="mailto:harshwrites07@gmail.com" style={{ color: 'var(--lime)' }}>harshwrites07@gmail.com</a>
        </p>

        <hr style={S.divider} />
        <div style={S.footer}>
          <Link to="/privacy" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>← Back to app</Link>
        </div>
      </div>
    </div>
  );
}
