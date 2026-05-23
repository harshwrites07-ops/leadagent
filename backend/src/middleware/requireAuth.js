const { getUserById } = require('../models/database');

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }
  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ success: false, error: 'Session invalid', code: 'UNAUTHENTICATED' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }
  const user = getUserById(req.session.userId);
  if (!user || !user.is_admin) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  req.user = user;
  next();
}

module.exports = { requireAuth, requireAdmin };
