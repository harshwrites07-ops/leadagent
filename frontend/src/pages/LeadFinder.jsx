import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Youtube, MessageSquare, Flame, Eye,
  CheckSquare, Square, Zap, MailPlus, AlertCircle,
  ChevronRight, Settings, Target, TrendingUp, Play, RotateCcw,
  ChevronDown, ChevronUp, Mail,
} from 'lucide-react';
import api, { formatNumber, tempLabel, tempClass } from '../utils/api';
import { useIsMobile } from '../components/ui/Layout';

const TABS = [
  { key: 'youtube',    label: 'YouTube Scraper',    icon: Youtube },
  { key: 'reddit',     label: 'Reddit Scraper',     icon: MessageSquare },
  { key: 'viral',      label: 'Viral Detector',     icon: Flame },
  { key: 'competitor', label: 'Competitor Spy',     icon: Eye },
];

const DEFAULT_SUBREDDITS = [
  'entrepreneur', 'smallbusiness', 'marketing', 'digitalmarketing',
  'YoutubeCreators', 'podcasting', 'SaaS', 'startups', 'ecommerce', 'freelance',
];

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  padding: '20px 24px',
};

const inputStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontFamily: 'var(--font-body)',
  width: '100%',
  outline: 'none',
};

const inputStyleMobile = {
  ...inputStyle,
  fontSize: 16,
  minHeight: 48,
  borderRadius: 8,
};

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
  color: 'var(--text-muted)', textTransform: 'uppercase',
  display: 'block', marginBottom: 6,
};

const thStyle = {
  padding: '10px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
  color: 'var(--text-muted)', textTransform: 'uppercase',
  textAlign: 'left', borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle',
};

const tempColors = {
  hot:  { bg: 'rgba(255,69,0,0.12)',   color: '#FF4500', border: 'rgba(255,69,0,0.3)' },
  warm: { bg: 'rgba(245,166,35,0.12)', color: '#F5A623', border: 'rgba(245,166,35,0.3)' },
  cold: { bg: 'rgba(0,184,212,0.12)',  color: '#00B8D4', border: 'rgba(0,184,212,0.3)' },
};

function TempBadge({ temp }) {
  const t = tempColors[temp] || tempColors.cold;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
      {(temp || 'cold').toUpperCase()}
    </span>
  );
}

const TabBar = ({ active, onChange }) => (
  <div className="tabs-scroll" style={{
    display: 'flex', gap: 4,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    padding: 4, borderRadius: 8, marginBottom: 24,
    width: 'fit-content', maxWidth: '100%',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
  }}>
    {TABS.map(({ key, label, icon: Icon }) => (
      <button key={key} onClick={() => onChange(key)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 6,
        fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)',
        border: 'none', cursor: 'pointer', transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        ...(active === key
          ? { background: 'rgba(255,69,0,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(255,69,0,0.25)' }
          : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }
        ),
      }}>
        <Icon size={13} />
        {label}
      </button>
    ))}
  </div>
);

const ApiKeyError = ({ navigate }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    style={{ ...card, borderColor: 'rgba(255,69,0,0.3)', background: 'rgba(255,69,0,0.05)', display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 16 }}>
    <AlertCircle size={20} style={{ color: '#FF4500', flexShrink: 0, marginTop: 2 }} />
    <div>
      <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>API Keys Not Configured</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>Configure YouTube or Reddit API keys in Settings to start scraping.</p>
      <button onClick={() => navigate('/settings')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
        <Settings size={13} /> Go to Settings
      </button>
    </div>
  </motion.div>
);

const LoadingProgress = ({ label = 'Scanning...' }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', marginTop: 16 }}>
    <div style={{ position: 'relative', width: 48, height: 48, marginBottom: 16 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--border-subtle)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
    </div>
    <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>{label}</p>
    <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>This may take 15–30 seconds...</p>
    <div style={{ width: 240, height: 3, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden', marginTop: 20 }}>
      <motion.div style={{ height: '100%', background: 'var(--gradient-orange)', borderRadius: 99 }}
        animate={{ width: ['10%', '85%'] }} transition={{ duration: 25, ease: 'easeInOut' }} />
    </div>
  </motion.div>
);

const SummaryBadges = ({ leads }) => {
  const hot = leads.filter(l => l.temperature === 'hot').length;
  const warm = leads.filter(l => l.temperature === 'warm').length;
  const cold = leads.filter(l => l.temperature === 'cold').length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Found <strong style={{ color: 'var(--text-primary)' }}>{leads.length}</strong> leads</span>
      <TempBadge temp="hot" /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{hot}</span>
      <TempBadge temp="warm" /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{warm}</span>
      <TempBadge temp="cold" /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{cold}</span>
    </div>
  );
};

const LeadScoreBar = ({ score }) => {
  const color = score >= 70 ? '#00E5A0' : score >= 45 ? '#F5A623' : '#FF4500';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: color, borderRadius: 99, width: `${score}%` }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', width: 20, textAlign: 'right' }}>{score}</span>
    </div>
  );
};

const BulkActionBar = ({ selectedIds, leads, onSelectAll, onClearAll, onBulkPitch, onBulkQueue }) => {
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
      <button onClick={allSelected ? onClearAll : onSelectAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 44 }}>
        {allSelected ? <CheckSquare size={13} style={{ color: 'var(--accent-primary)' }} /> : <Square size={13} />}
        {allSelected ? 'Deselect All' : 'Select All'}
      </button>
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selectedIds.size} selected</span>
            <button onClick={onBulkPitch} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', minHeight: 44 }}>
              <Zap size={11} /> Generate Pitches
            </button>
            <button onClick={onBulkQueue} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', minHeight: 44 }}>
              <MailPlus size={11} /> Add to Queue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Mobile Lead Card ─────────────────────────────────────────────────────────
const MobileLeadCard = ({ lead, navigate }) => {
  const [expanded, setExpanded] = useState(false);
  const t = tempColors[lead.temperature] || tempColors.cold;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--bg-card)', border: `1px solid ${lead.temperature === 'hot' ? 'rgba(255,69,0,0.3)' : 'var(--border-subtle)'}`,
        borderRadius: 8, marginBottom: 8, overflow: 'hidden',
        boxShadow: lead.temperature === 'hot' ? '0 2px 12px rgba(255,69,0,0.15)' : 'none',
      }}>
      <div style={{ padding: '12px 14px' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lead.thumbnail_url
            ? <img src={lead.thumbnail_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Youtube size={14} style={{ color: '#FF4500' }} /></div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.channel_name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <TempBadge temp={lead.temperature} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{formatNumber(lead.subscriber_count)}K subs</span>
              {lead.email && <span style={{ fontSize: 9, color: '#00E5A0', fontFamily: 'var(--font-mono)' }}>EMAIL</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: t.color, fontWeight: 700 }}>{lead.lead_score}</span>
            {expanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ borderTop: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div><p style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>AVG VIEWS</p><p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{formatNumber(lead.avg_views)}</p></div>
                <div><p style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>ENG RATE</p><p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{lead.engagement_rate != null ? `${Number(lead.engagement_rate).toFixed(2)}%` : '—'}</p></div>
                <div><p style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>SCORE</p><LeadScoreBar score={lead.lead_score ?? 0} /></div>
              </div>
              {(Array.isArray(lead.pain_points) ? lead.pain_points : []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(Array.isArray(lead.pain_points) ? lead.pain_points : []).slice(0, 3).map((p, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                      {typeof p === 'object' ? p.label : p}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigate(`/leads/${lead.id}`)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', minHeight: 44 }}>
                  View <ChevronRight size={11} />
                </button>
                <button onClick={() => navigate(`/pitch-generator?lead=${lead.id}`)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', minHeight: 44 }}>
                  <Zap size={11} /> Pitch
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const YTLeadRow = ({ lead, selected, onToggle, onViewDetails, onGeneratePitch }) => (
  <tr style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
    <td style={tdStyle}>
      <button onClick={() => onToggle(lead.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected ? 'var(--accent-primary)' : 'var(--text-muted)', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        {selected ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>
    </td>
    <td style={tdStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {lead.thumbnail_url
          ? <img src={lead.thumbnail_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-elevated)' }} />
          : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Youtube size={13} style={{ color: '#FF4500' }} /></div>
        }
        <div>
          <p style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>{lead.channel_name}</p>
          {lead.email && <span style={{ fontSize: 9, color: '#00E5A0', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>EMAIL FOUND</span>}
        </div>
      </div>
    </td>
    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{formatNumber(lead.subscriber_count ?? 0)}</td>
    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{formatNumber(lead.avg_views ?? 0)}</td>
    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{lead.engagement_rate != null ? `${Number(lead.engagement_rate).toFixed(2)}%` : '—'}</td>
    <td style={tdStyle}><TempBadge temp={lead.temperature} /></td>
    <td style={{ ...tdStyle, width: 100 }}><LeadScoreBar score={lead.lead_score ?? 0} /></td>
    <td style={{ ...tdStyle, maxWidth: 200 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(Array.isArray(lead.pain_points) ? lead.pain_points : []).slice(0, 3).map((p, i) => (
          <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
            {typeof p === 'object' ? p.label : p}
          </span>
        ))}
      </div>
    </td>
    <td style={tdStyle}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onViewDetails(lead)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>View <ChevronRight size={10} /></button>
        <button onClick={() => onGeneratePitch(lead)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none' }}><Zap size={10} /> Pitch</button>
      </div>
    </td>
  </tr>
);

const RedditLeadRow = ({ lead, selected, onToggle, onGeneratePitch }) => (
  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
    <td style={tdStyle}><button onClick={() => onToggle(lead.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{selected ? <CheckSquare size={14} /> : <Square size={14} />}</button></td>
    <td style={tdStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,69,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF4500', fontSize: 12, fontWeight: 700 }}>{(lead.reddit_username ?? lead.channel_name ?? 'U')[0].toUpperCase()}</div>
        <p style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>u/{lead.reddit_username ?? lead.channel_name}</p>
      </div>
    </td>
    <td style={tdStyle}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(123,97,255,0.12)', color: '#7B61FF', border: '1px solid rgba(123,97,255,0.25)', fontFamily: 'var(--font-mono)' }}>r/{lead.reddit_subreddit ?? '—'}</span></td>
    <td style={{ ...tdStyle, maxWidth: 200 }}><p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-primary)' }}>{lead.reddit_post_title ?? '—'}</p></td>
    <td style={{ ...tdStyle, maxWidth: 220 }}><p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderLeft: '2px solid var(--border-default)', paddingLeft: 8 }}>"{(lead.reddit_post_content ?? '').substring(0, 100)}"</p></td>
    <td style={tdStyle}><TempBadge temp={lead.temperature} /></td>
    <td style={tdStyle}><button onClick={() => onGeneratePitch(lead)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none' }}><Zap size={10} /> Pitch</button></td>
  </tr>
);

const ViralRow = ({ lead, selected, onToggle, onGeneratePitch }) => (
  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
    <td style={tdStyle}><button onClick={() => onToggle(lead.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{selected ? <CheckSquare size={14} /> : <Square size={14} />}</button></td>
    <td style={tdStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {lead.thumbnail_url && <img src={lead.thumbnail_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />}
        <p style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>{lead.channel_name}</p>
      </div>
    </td>
    <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#FF4500' }}>{lead.viral_multiplier ?? '—'}x</span><span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>normal</span></td>
    <td style={{ ...tdStyle, maxWidth: 240 }}><p style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.viral_video_title}</p></td>
    <td style={tdStyle}><span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,69,0,0.12)', color: '#FF4500', border: '1px solid rgba(255,69,0,0.3)', fontFamily: 'var(--font-mono)', fontWeight: 700, animation: 'statusPulse 2s ease-in-out infinite' }}>URGENT</span></td>
    <td style={tdStyle}><button onClick={() => onGeneratePitch(lead)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none' }}><Zap size={10} /> Pitch</button></td>
  </tr>
);

const LeadTable = ({ headers, children }) => (
  <div className="table-scroll" style={{ ...card, padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr style={{ background: 'var(--bg-elevated)' }}>{headers.map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

// ─── YouTube Tab ─────────────────────────────────────────────────────────────
const YoutubeTab = ({ navigate }) => {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ keyword: '', min_subs: 5000, max_subs: 200000, min_views: 1000, max_results: 50, country: '', emailOnly: true });
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [apiError, setApiError] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value }));
    setSearched(false);
  };

  const handleSearch = async e => {
    e.preventDefault();
    if (!form.keyword.trim()) { toast.error('Enter a keyword first'); return; }
    setLoading(true); setLeads([]); setSelected(new Set()); setApiError(false); setSearched(false);
    try {
      const { data } = await api.post('/leads/scrape/youtube', {
        keyword: form.keyword, minSubs: form.min_subs, maxSubs: form.max_subs,
        minViews: form.min_views, maxResults: form.max_results, country: form.country, emailOnly: form.emailOnly,
      });
      setLeads(data.leads ?? []); setSearched(true);
      toast.success(`Found ${data.leads?.length ?? 0} leads!`);
    } catch (err) {
      if (err.response?.status === 429 || err.message?.toLowerCase().includes('quota')) {
        toast.error('YouTube quota exceeded — resets at midnight Pacific Time.', { duration: 8000 });
      } else if (err.response?.status === 401 || err.message?.toLowerCase().includes('not configured')) {
        setApiError(true);
      } else {
        toast.error(err.message ?? 'Scrape failed');
      }
    } finally { setLoading(false); }
  };

  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const iStyle = isMobile ? inputStyleMobile : inputStyle;

  return (
    <div>
      <form onSubmit={handleSearch} style={{ ...card, padding: isMobile ? '14px' : '20px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>YOUTUBE LEAD SCRAPER</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr 1fr 1fr', gap: isMobile ? 10 : 12 }}>
          <div>
            <label style={labelStyle}>Keyword *</label>
            <input style={iStyle} name="keyword" placeholder="e.g. business automation" value={form.keyword} onChange={handleChange} required />
          </div>
          <div>
            <label style={labelStyle}>Min Subs</label>
            <input style={iStyle} type="number" name="min_subs" value={form.min_subs} onChange={handleChange} />
          </div>
          <div>
            <label style={labelStyle}>Max Subs</label>
            <input style={iStyle} type="number" name="max_subs" value={form.max_subs} onChange={handleChange} />
          </div>
          <div className={isMobile ? '' : ''}>
            <label style={labelStyle}>Max Results</label>
            <input style={iStyle} type="number" name="max_results" min={10} max={150} value={form.max_results} onChange={handleChange} />
          </div>
          {!isMobile && (
            <>
              <div><label style={labelStyle}>Min Views</label><input style={iStyle} type="number" name="min_views" value={form.min_views} onChange={handleChange} /></div>
              <div><label style={labelStyle}>Country</label><input style={iStyle} name="country" placeholder="US" value={form.country} onChange={handleChange} /></div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, background: form.emailOnly ? '#00E5A0' : 'var(--bg-elevated)', border: '1px solid var(--border-default)', transition: 'background 0.2s', cursor: 'pointer' }}
              onClick={() => setForm(f => ({ ...f, emailOnly: !f.emailOnly }))}>
              <div style={{ position: 'absolute', top: 2, left: form.emailOnly ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>Email required</span>
          </label>
          <button type="submit" disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: isMobile ? '12px 20px' : '9px 20px',
            width: isMobile ? '100%' : 'auto',
            justifyContent: 'center',
            borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
            background: 'var(--gradient-orange)', color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)',
            opacity: loading ? 0.7 : 1, minHeight: 48,
          }}><Search size={14} /> Find Leads</button>
        </div>
      </form>

      {apiError && <ApiKeyError navigate={navigate} />}
      {loading && <LoadingProgress label="Scanning YouTube channels..." />}

      <AnimatePresence>
        {!loading && searched && leads.length === 0 && !apiError && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ ...card, borderColor: 'rgba(245,166,35,0.3)', background: 'rgba(245,166,35,0.05)', display: 'flex', alignItems: 'flex-start', gap: 14, marginTop: 16 }}>
            <AlertCircle size={18} style={{ color: '#F5A623', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>0 leads found</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Try a broader keyword or wider subscriber range.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!loading && leads.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
            <SummaryBadges leads={leads} />
            <BulkActionBar selectedIds={selected} leads={leads}
              onSelectAll={() => setSelected(new Set(leads.map(l => l.id)))}
              onClearAll={() => setSelected(new Set())}
              onBulkPitch={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...selected] }), { loading: 'Generating...', success: 'Pitches queued!', error: 'Failed' })}
              onBulkQueue={() => toast.promise(api.post('/emails/queue/bulk', { lead_ids: [...selected] }), { loading: 'Adding...', success: 'Added to queue!', error: 'Failed' })}
            />
            {isMobile ? (
              <div>{leads.map(lead => <MobileLeadCard key={lead.id} lead={lead} navigate={navigate} />)}</div>
            ) : (
              <LeadTable headers={['', 'Channel', 'Subs', 'Avg Views', 'Eng Rate', 'Temp', 'Score', 'Pain Points', 'Actions']}>
                {leads.map(lead => (
                  <YTLeadRow key={lead.id} lead={lead} selected={selected.has(lead.id)} onToggle={toggleSelect}
                    onViewDetails={l => navigate(`/leads/${l.id}`)}
                    onGeneratePitch={l => navigate(`/pitch-generator?lead=${l.id}`)} />
                ))}
              </LeadTable>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Reddit Tab ──────────────────────────────────────────────────────────────
const RedditTab = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [keyword, setKeyword] = useState('');
  const [activeSubreddits, setActiveSubreddits] = useState(new Set(DEFAULT_SUBREDDITS));
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [apiError, setApiError] = useState(false);

  const toggleSub = sub => setActiveSubreddits(s => { const n = new Set(s); n.has(sub) ? n.delete(sub) : n.add(sub); return n; });

  const handleSearch = async e => {
    e.preventDefault();
    if (!keyword.trim()) { toast.error('Enter a keyword first'); return; }
    setLoading(true); setLeads([]); setSelected(new Set()); setApiError(false);
    try {
      const { data } = await api.post('/leads/scrape/reddit', { keyword, subreddits: [...activeSubreddits] });
      setLeads(data.leads ?? []);
      toast.success(`Found ${data.leads?.length ?? 0} Reddit leads!`);
    } catch (err) {
      if (err.response?.status === 401) setApiError(true);
      else toast.error(err.message ?? 'Scrape failed');
    } finally { setLoading(false); }
  };

  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <form onSubmit={handleSearch} style={{ ...card, padding: isMobile ? '14px' : '20px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>REDDIT LEAD SCRAPER</p>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Keyword *</label>
          <input style={isMobile ? inputStyleMobile : { ...inputStyle, maxWidth: 400 }} placeholder="e.g. struggling with email marketing" value={keyword} onChange={e => setKeyword(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>Subreddits</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEFAULT_SUBREDDITS.map(sub => (
              <button key={sub} type="button" onClick={() => toggleSub(sub)} style={{
                fontSize: 11, padding: '6px 10px', borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s', minHeight: 36,
                ...(activeSubreddits.has(sub)
                  ? { background: 'rgba(255,69,0,0.1)', border: '1px solid rgba(255,69,0,0.3)', color: 'var(--accent-primary)' }
                  : { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }),
              }}>r/{sub}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: loading ? 0.7 : 1, minHeight: 48, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
            <Search size={14} /> Find Leads
          </button>
        </div>
      </form>
      {apiError && <ApiKeyError navigate={navigate} />}
      {loading && <LoadingProgress label="Scanning Reddit threads..." />}
      <AnimatePresence>
        {!loading && leads.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
            <SummaryBadges leads={leads} />
            <BulkActionBar selectedIds={selected} leads={leads}
              onSelectAll={() => setSelected(new Set(leads.map(l => l.id)))}
              onClearAll={() => setSelected(new Set())}
              onBulkPitch={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...selected] }), { loading: 'Generating...', success: 'Pitches queued!', error: 'Failed' })}
              onBulkQueue={() => toast.promise(api.post('/emails/queue/bulk', { lead_ids: [...selected] }), { loading: 'Adding...', success: 'Added!', error: 'Failed' })}
            />
            <LeadTable headers={['', 'User', 'Subreddit', 'Post Title', 'Their Words', 'Temp', 'Actions']}>
              {leads.map(lead => (
                <RedditLeadRow key={lead.id} lead={lead} selected={selected.has(lead.id)} onToggle={toggleSelect}
                  onGeneratePitch={l => navigate(`/pitch-generator?lead=${l.id}`)} />
              ))}
            </LeadTable>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Viral Tab ───────────────────────────────────────────────────────────────
const ViralTab = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [apiError, setApiError] = useState(false);

  const handleDetect = async e => {
    e.preventDefault();
    if (!keyword.trim()) { toast.error('Enter a niche keyword'); return; }
    setLoading(true); setLeads([]); setSelected(new Set()); setApiError(false);
    try {
      const { data } = await api.post('/scraper/viral-detector', { keyword });
      setLeads(data.viral_leads ?? []);
      toast.success(`Found ${data.viral_leads?.length ?? 0} viral opportunities!`);
    } catch (err) {
      if (err.response?.status === 401) setApiError(true);
      else toast.error(err.message ?? 'Detection failed');
    } finally { setLoading(false); }
  };

  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <form onSubmit={handleDetect} style={{ ...card, padding: isMobile ? '14px' : '20px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>VIRAL OPPORTUNITY DETECTOR</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Identifies channels with a recent video performing far above their average.</p>
        <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          <input style={isMobile ? inputStyleMobile : { ...inputStyle, flex: 1, maxWidth: 400 }} placeholder="Niche keyword e.g. dropshipping" value={keyword} onChange={e => setKeyword(e.target.value)} required />
          <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 20px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: loading ? 0.7 : 1, minHeight: 48 }}>
            <Flame size={14} /> Detect Viral
          </button>
        </div>
      </form>
      {apiError && <ApiKeyError navigate={navigate} />}
      {loading && <LoadingProgress label="Detecting viral spikes..." />}
      <AnimatePresence>
        {!loading && leads.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Flame size={15} style={{ color: '#FF4500' }} />
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{leads.length} viral opportunities detected</span>
            </div>
            <BulkActionBar selectedIds={selected} leads={leads}
              onSelectAll={() => setSelected(new Set(leads.map(l => l.id)))}
              onClearAll={() => setSelected(new Set())}
              onBulkPitch={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...selected] }), { loading: 'Generating...', success: 'Queued!', error: 'Failed' })}
              onBulkQueue={() => toast.promise(api.post('/emails/queue/bulk', { lead_ids: [...selected] }), { loading: 'Adding...', success: 'Added!', error: 'Failed' })}
            />
            <LeadTable headers={['', 'Channel', 'Viral Multiplier', 'Viral Video', 'Urgency', 'Actions']}>
              {leads.map(lead => (
                <ViralRow key={lead.id} lead={lead} selected={selected.has(lead.id)} onToggle={toggleSelect}
                  onGeneratePitch={l => navigate(`/pitch-generator?lead=${l.id}`)} />
              ))}
            </LeadTable>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Competitor Tab ──────────────────────────────────────────────────────────
const CompetitorTab = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ competitor: '', keywords: '' });
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [apiError, setApiError] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSpy = async e => {
    e.preventDefault();
    if (!form.competitor.trim()) { toast.error('Enter a competitor name'); return; }
    setLoading(true); setLeads([]); setSelected(new Set()); setApiError(false);
    try {
      const { data } = await api.post('/scraper/competitor-spy', {
        competitor_name: form.competitor,
        competitor_keywords: form.keywords,
      });
      setLeads(data.leads ?? []);
      toast.success(`Found ${data.leads?.length ?? 0} competitor leads!`);
    } catch (err) {
      if (err.response?.status === 401) setApiError(true);
      else toast.error(err.message ?? 'Spy failed');
    } finally { setLoading(false); }
  };

  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const iStyle = isMobile ? inputStyleMobile : inputStyle;

  return (
    <div>
      <form onSubmit={handleSpy} style={{ ...card, padding: isMobile ? '14px' : '20px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>COMPETITOR SPY</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Find channels in your competitor's audience you haven't approached yet.</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>Competitor Name / Channel *</label><input style={iStyle} name="competitor" placeholder="e.g. vidIQ" value={form.competitor} onChange={handleChange} required /></div>
          <div><label style={labelStyle}>Keywords (comma-separated, optional)</label><input style={iStyle} name="keywords" placeholder="e.g. youtube growth, video editing" value={form.keywords} onChange={handleChange} /></div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 20px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: loading ? 0.7 : 1, minHeight: 48, width: isMobile ? '100%' : 'auto' }}>
            <Eye size={14} /> Spy
          </button>
        </div>
      </form>
      {apiError && <ApiKeyError navigate={navigate} />}
      {loading && <LoadingProgress label="Running competitor analysis..." />}
      <AnimatePresence>
        {!loading && leads.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
            <SummaryBadges leads={leads} />
            <BulkActionBar selectedIds={selected} leads={leads}
              onSelectAll={() => setSelected(new Set(leads.map(l => l.id)))}
              onClearAll={() => setSelected(new Set())}
              onBulkPitch={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...selected] }), { loading: 'Generating...', success: 'Queued!', error: 'Failed' })}
              onBulkQueue={() => toast.promise(api.post('/emails/queue/bulk', { lead_ids: [...selected] }), { loading: 'Adding...', success: 'Added!', error: 'Failed' })}
            />
            {isMobile ? (
              <div>{leads.map(lead => <MobileLeadCard key={lead.id} lead={lead} navigate={navigate} />)}</div>
            ) : (
              <LeadTable headers={['', 'Channel', 'Subs', 'Avg Views', 'Eng Rate', 'Temp', 'Score', 'Pain Points', 'Actions']}>
                {leads.map(lead => (
                  <YTLeadRow key={lead.id} lead={lead} selected={selected.has(lead.id)} onToggle={toggleSelect}
                    onViewDetails={l => navigate(`/leads/${l.id}`)}
                    onGeneratePitch={l => navigate(`/pitch-generator?lead=${l.id}`)} />
                ))}
              </LeadTable>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Quick Hunt Panel ─────────────────────────────────────────────────────────
const HUNT_NICHES = [
  { name: 'Business',    color: '#FF4500', bg: 'rgba(255,69,0,0.1)',    border: 'rgba(255,69,0,0.25)',    targets: [100, 300, 500] },
  { name: 'Finance',     color: '#F5A623', bg: 'rgba(245,166,35,0.1)',  border: 'rgba(245,166,35,0.25)',  targets: [100, 300, 500] },
  { name: 'Real Estate', color: '#00E5A0', bg: 'rgba(0,229,160,0.1)',   border: 'rgba(0,229,160,0.25)',   targets: [100, 200, 300] },
  { name: 'Fitness',     color: '#7B61FF', bg: 'rgba(123,97,255,0.1)',  border: 'rgba(123,97,255,0.25)',  targets: [100, 300, 500] },
  { name: 'SaaS & Tech', color: '#00B8D4', bg: 'rgba(0,184,212,0.1)',   border: 'rgba(0,184,212,0.25)',   targets: [100, 200, 300] },
  { name: 'Law',         color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)', targets: [50, 100, 200] },
  { name: 'Health',      color: '#4ECB71', bg: 'rgba(78,203,113,0.1)',  border: 'rgba(78,203,113,0.25)',  targets: [100, 200, 300] },
  { name: 'Education',   color: '#FFC107', bg: 'rgba(255,193,7,0.1)',   border: 'rgba(255,193,7,0.25)',   targets: [100, 200, 300] },
  { name: 'Podcasters',  color: '#E91E63', bg: 'rgba(233,30,99,0.1)',   border: 'rgba(233,30,99,0.25)',   targets: [100, 200, 300] },
];

function QuickHuntPanel() {
  const isMobile = useIsMobile();
  const [huntStatus, setHuntStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  const startHunt = async (niche, target) => {
    try {
      await api.post('/scraper/hunt', { niche, target });
      toast.success(`Hunting ${niche} leads — running in background`, { duration: 4000 });
      setPolling(true);
    } catch (e) {
      toast.error(e.message || 'Hunt failed');
    }
  };

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/scraper/hunt/status');
        setHuntStatus(data);
        if (!data.running) setPolling(false);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  return (
    <div style={{ ...card, marginBottom: 20, padding: isMobile ? '12px 14px' : '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={14} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>QUICK HUNT</span>
        </div>
        {huntStatus?.running && (
          <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#00E5A0', fontFamily: 'var(--font-mono)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0' }} />
            HUNTING {huntStatus.niche?.toUpperCase()} — {huntStatus.saved} SAVED
          </motion.div>
        )}
        {huntStatus && !huntStatus.running && huntStatus.saved > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>LAST: +{huntStatus.saved} {huntStatus.niche}</span>
        )}
      </div>

      <div className="hunt-niches-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 6 : 8 }}>
        {HUNT_NICHES.map(({ name, color, bg, border, targets }) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 0, background: bg, border: `1px solid ${border}`, borderRadius: 6, overflow: 'hidden' }}>
            <span style={{ padding: isMobile ? '8px 8px' : '6px 10px', fontSize: isMobile ? 10 : 11, fontWeight: 600, color, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>{isMobile ? name.split(' ')[0] : name}</span>
            {targets.slice(0, isMobile ? 2 : 3).map(t => (
              <button key={t} onClick={() => startHunt(name, t)} disabled={huntStatus?.running}
                style={{ padding: isMobile ? '8px 7px' : '6px 9px', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'transparent', border: `none`, borderLeft: `1px solid ${border}`, color: huntStatus?.running ? 'var(--text-muted)' : color, cursor: huntStatus?.running ? 'not-allowed' : 'pointer', minHeight: 36 }}>
                {t >= 1000 ? `${t / 1000}K` : t}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
        Numbers = target leads · Saves to DB · Background · Email required
      </p>
    </div>
  );
}

// ─── PowerMode Button ─────────────────────────────────────────────────────────
function PowerModeButton() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [pmStatus, setPmStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(async () => {
      try {
        const { data } = await api.get('/scraper/powermode/status');
        setPmStatus(data);
        if (!data.running && data.startedAt) {
          setPolling(false);
          if (data.saved > 0 && !data.stopped) {
            toast.success(`⚡ POWERMODE complete — ${data.saved} leads found!`, { duration: 6000 });
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [polling]);

  const handleStart = async () => {
    try {
      await api.post('/scraper/powermode/start');
      setPolling(true);
      const { data } = await api.get('/scraper/powermode/status');
      setPmStatus(data);
    } catch (e) {
      toast.error(e.message || 'PowerMode failed to start');
    }
  };

  const handleStop = async () => {
    try {
      await api.post('/scraper/powermode/stop');
      setPolling(false);
      setPmStatus(s => s ? { ...s, running: false, stopped: true } : s);
      toast('PowerMode stopped', { icon: '⏹' });
    } catch {}
  };

  const isRunning = pmStatus?.running;
  const isDone = pmStatus && !pmStatus.running && pmStatus.startedAt && !pmStatus.stopped && pmStatus.saved > 0;

  if (isRunning) {
    return (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ borderRadius: 10, background: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,69,0,0.5)', marginBottom: 20, overflow: 'hidden', boxShadow: '0 4px 32px rgba(255,69,0,0.25)', animation: 'borderPulse 2s ease-in-out infinite' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'linear-gradient(135deg, rgba(255,69,0,0.2), rgba(255,140,0,0.1))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}>
              <Zap size={18} style={{ color: '#FF4500' }} />
            </motion.div>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: isMobile ? 13 : 15, fontWeight: 800, color: '#FF4500', letterSpacing: '-0.02em' }}>POWERMODE ACTIVE</span>
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,69,0,0.7)' }}>— Finding...</motion.span>
          </div>
          <button onClick={handleStop} style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,69,0,0.15)', border: '1px solid rgba(255,69,0,0.4)', color: '#FF4500', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, minHeight: 36 }}>
            STOP
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--border-subtle)' }}>
          <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #FF4500, #FF8C00)' }}
            animate={{ width: `${pmStatus.keywordsTotal > 0 ? Math.max(5, (pmStatus.keywordsDone / pmStatus.keywordsTotal) * 100) : 5}%` }}
            transition={{ ease: 'easeOut' }} />
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: isMobile ? 'auto' : 150 }}>
          {/* Counter */}
          <div style={{ padding: isMobile ? '14px 18px' : '18px 24px', borderRight: isMobile ? 'none' : '1px solid rgba(255,69,0,0.15)', borderBottom: isMobile ? '1px solid rgba(255,69,0,0.1)' : 'none', display: 'flex', alignItems: isMobile ? 'center' : 'center', gap: isMobile ? 24 : 0, flexDirection: isMobile ? 'row' : 'column', minWidth: isMobile ? 'auto' : 130 }}>
            <motion.span key={pmStatus.total} initial={{ scale: 1.3 }} animate={{ scale: 1 }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 36 : 48, fontWeight: 700, lineHeight: 1, color: '#FF4500', letterSpacing: '-0.04em' }}>
              {pmStatus.total}
            </motion.span>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? 12 : 4, marginTop: isMobile ? 0 : 8 }}>
              {[['HOT', '#FF4500', pmStatus.stats.hot], ['WARM', '#F5A623', pmStatus.stats.warm], ['COLD', '#7B61FF', pmStatus.stats.cold], ['EMAIL', '#00E5A0', pmStatus.stats.withEmail]].map(([lbl, clr, val]) => (
                <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: clr }}>{lbl}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: clr, fontWeight: 700 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live feed */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px 4px', borderBottom: '1px solid rgba(255,69,0,0.08)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                {pmStatus.keywordsDone}/{pmStatus.keywordsTotal} KEYWORDS SEARCHED
                {pmStatus.currentKeywords?.length > 0 && !isMobile && ` — ${pmStatus.currentKeywords.slice(0, 3).join(', ')}`}
              </span>
            </div>
            <div style={{ overflow: 'auto', maxHeight: isMobile ? 100 : 120 }}>
              <AnimatePresence initial={false}>
                {(pmStatus.recentLeads || []).map((lead, i) => (
                  <motion.div key={`${lead.channel_id || lead.channel_name}-${i}`}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 16px', fontSize: 11 }}>
                    <span style={{ color: lead.temperature === 'hot' ? '#FF4500' : lead.temperature === 'warm' ? '#F5A623' : '#7B61FF', flexShrink: 0 }}>✓</span>
                    <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.channel_name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {lead.subscriber_count >= 1000000 ? `${(lead.subscriber_count / 1000000).toFixed(1)}M` : lead.subscriber_count >= 1000 ? `${Math.round(lead.subscriber_count / 1000)}K` : (lead.subscriber_count || '?')}
                    </span>
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{lead.temperature === 'hot' ? '🔥' : lead.temperature === 'warm' ? '🌡️' : '🧊'}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {(pmStatus.recentLeads || []).length === 0 && (
                <motion.p animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}
                  style={{ padding: '16px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  Scanning channels...
                </motion.p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.button
      onClick={handleStart}
      className="powermode-btn"
      whileHover={{ scale: 1.005, boxShadow: '0 8px 40px rgba(255,69,0,0.6)' }}
      whileTap={{ scale: 0.997 }}
      style={{
        width: '100%',
        height: isMobile ? 64 : 72,
        borderRadius: 10,
        background: isDone
          ? 'linear-gradient(135deg, #1a7a1a, #0d5c0d)'
          : 'linear-gradient(135deg, #FF4500 0%, #FF6B00 50%, #FF8C00 100%)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '0 20px' : '0 28px',
        marginBottom: 20,
        boxShadow: isDone ? '0 4px 24px rgba(0,229,160,0.3)' : '0 4px 24px rgba(255,69,0,0.4)',
        position: 'relative',
        overflow: 'hidden',
        backgroundSize: '200% 200%',
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.05, 0.1] }}
        transition={{ repeat: Infinity, duration: 3 }}
        style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.2), transparent 60%)', pointerEvents: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, zIndex: 1 }}>
        <motion.div animate={isDone ? {} : { scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          <Zap size={isMobile ? 22 : 26} style={{ color: '#fff' }} />
        </motion.div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: isMobile ? 15 : 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.2, margin: 0 }}>
            {isDone ? `⚡ Found ${pmStatus.saved} leads — Run again` : isMobile ? '⚡ POWERMODE' : 'POWERMODE — Find Best Leads Now'}
          </p>
          {!isMobile && (
            <p className="powermode-subtext" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '2px 0 0' }}>
              {isDone ? 'Click to run PowerMode again' : 'Instant • AI-Filtered • Top Quality'}
            </p>
          )}
        </div>
      </div>
      <div className="powermode-right" style={{ textAlign: 'right', zIndex: 1 }}>
        {!isDone && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>15 keywords in parallel</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>50–150 leads in ~60s</p>
          </>
        )}
      </div>
    </motion.button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function LeadFinder() {
  const [activeTab, setActiveTab] = useState('youtube');
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: isMobile ? 20 : 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Lead Finder</h1>
        {!isMobile && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' }}>DISCOVER AND QUALIFY LEADS — YOUTUBE · REDDIT · VIRAL · COMPETITOR</p>}
      </div>

      <PowerModeButton />
      <QuickHuntPanel />
      <TabBar active={activeTab} onChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {activeTab === 'youtube'    && <YoutubeTab navigate={navigate} />}
          {activeTab === 'reddit'     && <RedditTab />}
          {activeTab === 'viral'      && <ViralTab />}
          {activeTab === 'competitor' && <CompetitorTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
