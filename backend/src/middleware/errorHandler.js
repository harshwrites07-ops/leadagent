function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // Chat endpoint errors must return { reply } so the frontend shows them inline
  if (req.path && req.path.includes('/assistant/chat')) {
    const msg = err.message || 'Unknown error';
    const isQuota = /exhausted|quota|resource_exhausted|429|limit/i.test(msg);
    return res.json({
      reply: isQuota
        ? 'All Gemini keys are at their daily limit. Add more keys in Settings → Integrations, or try again tomorrow.'
        : `Jack hit an error: ${msg.substring(0, 120)}. Try rephrasing your request.`,
    });
  }

  // Never propagate external API status codes (e.g. Gemini returning 404 for
  // "model not found" must not become our API's 404 — that confuses clients).
  const isExternalError = !!(err.isAxiosError || err.config?.url);
  const status = isExternalError ? 502 : (err.status || err.statusCode || 500);
  const message = isExternalError
    ? `AI service error: ${err.response?.data?.error?.message || err.message || 'External API failed'}`
    : (err.message || 'Internal server error');

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
