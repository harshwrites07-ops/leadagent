// P0-3 — shared send-failure error taxonomy. Thrown at the point of failure
// in gmailService.js/emailService.js (where the real cause is known) and read
// back verbatim by the send routes — no post-hoc regex-sniffing of a generic
// Error's message string, which is how "Failed to send" ended up hiding the
// real cause from users in the first place.

const SEND_ERROR_MESSAGES = {
  NO_MAILBOX_CONNECTED:  'Connect a Gmail account in Settings to send.',
  OAUTH_TOKEN_EXPIRED:   'Gmail connection expired. Reconnect in Settings.',
  GMAIL_API_ERROR:       'Gmail rejected this send.',
  DAILY_LIMIT_REACHED:   'Daily send limit reached — resumes tomorrow.',
  MISSING_SENDER_IDENTITY: 'This email has no sender assigned.',
  INVALID_RECIPIENT:     'Recipient email is invalid.',
};

class SendError extends Error {
  // providerMessage: the raw detail from Gmail/SMTP, shown behind a
  // "Details" expander rather than as the headline (which is always the
  // fixed, user-facing SEND_ERROR_MESSAGES[code] copy).
  constructor(code, providerMessage = null, userMessage = null) {
    super(userMessage || SEND_ERROR_MESSAGES[code] || 'Send failed.');
    this.name = 'SendError';
    this.code = code;
    this.providerMessage = providerMessage;
  }
}

module.exports = { SendError, SEND_ERROR_MESSAGES };
