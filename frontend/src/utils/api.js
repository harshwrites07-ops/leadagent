import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 0, // no timeout — AI + scraping ops can take several minutes
  withCredentials: true,
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.data?.error) {
      err.message = err.response.data.error;
    }
    // Redirect to login on 401 (session expired)
    if (err.response?.status === 401 && err.response?.data?.code === 'UNAUTHENTICATED') {
      if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export const formatNumber = n => {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
};

export const formatDate = d => {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
};

export const tempLabel = t => {
  if (t === 'hot') return '🔥 HOT';
  if (t === 'warm') return '🌡️ WARM';
  return '🧊 COLD';
};

export const tempClass = t => {
  if (t === 'hot') return 'badge-hot';
  if (t === 'warm') return 'badge-warm';
  return 'badge-cold';
};

export const stageLabel = s => ({
  new_lead: 'New Lead',
  studying: 'Studying',
  pitch_ready: 'Pitch Ready',
  emailed: 'Emailed',
  opened: 'Opened',
  replied: 'Replied',
  call_booked: 'Call Booked',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  no_response: 'No Response',
}[s] || s);
