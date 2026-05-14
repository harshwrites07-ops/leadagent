import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Upload, List, Loader2, Copy, Check, Users, Eye,
  TrendingUp, Clock, Mail, MessageSquare, BookOpen, Star,
  ChevronDown, ChevronUp, Download, Zap, AlertCircle,
  Youtube, ExternalLink, BarChart2, Calendar,
} from 'lucide-react';
import api, { formatNumber } from '../utils/api';

function parseFileUrls(file) {
  return new Promise((resolve, reject) => {
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = e => {
        const urls = e.target.result.split('\n').map(l => l.split(',')[0].replace(/["']/g, '').trim()).filter(v => v && v.length > 3);
        resolve(urls);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          const urls = rows.map(r => String(r[0] || '').trim()).filter(v => v && v.length > 3);
          resolve(urls);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    }
  });
}

function exportToCsv(results) {
  const rows = [['Channel', 'Subscribers', 'Avg Views', 'Email Found', 'Subject', 'Email Body', 'Instagram DM']];
  results.forEach(r => {
    rows.push([r.channel.channel_name, r.channel.subscriber_count, r.channel.avg_views, r.channel.email || '', r.email.subject, r.email.body.replace(/\n/g, ' '), r.dm.replace(/\n/g, ' ')]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `channel_analyzer_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Copy failed'); }
  };
  return (
    <button onClick={copy} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
      fontSize: 11, fontFamily: 'var(--font-mono)',
      background: copied ? 'rgba(0,229,160,0.12)' : 'var(--bg-elevated)',
      color: copied ? '#00E5A0' : 'var(--text-secondary)',
      border: `1px solid ${copied ? 'rgba(0,229,160,0.3)' : 'var(--border-default)'}`,
      transition: 'all 0.15s',
    }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function StatBadge({ icon: Icon, label, value, color = 'var(--text-secondary)' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '10px 14px', background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)', borderRadius: 8, minWidth: 80,
    }}>
      <Icon size={13} style={{ color, marginBottom: 2 }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

const tempColors = {
  hot:  { bg: 'rgba(255,69,0,0.1)',   color: '#FF4500', border: 'rgba(255,69,0,0.3)' },
  warm: { bg: 'rgba(245,166,35,0.1)', color: '#F5A623', border: 'rgba(245,166,35,0.3)' },
  cold: { bg: 'rgba(0,184,212,0.1)',  color: '#00B8D4', border: 'rgba(0,184,212,0.3)' },
};

function ResultCard({ result, index }) {
  const [studyOpen, setStudyOpen] = useState(false);
  const [savedCrm, setSavedCrm] = useState(false);
  const { channel, deep_study, email, dm, subject_variants } = result;

  const painPoints = (() => { try { return JSON.parse(channel.pain_points || '[]'); } catch { return []; } })();
  const recentVideos = (() => { try { return JSON.parse(channel.recent_videos || '[]'); } catch { return []; } })();
  const tc = tempColors[channel.temperature] || tempColors.cold;

  const handleSaveCrm = async () => {
    try {
      await api.post('/analyzer/save-to-crm', { lead_id: result.lead_id });
      setSavedCrm(true);
      toast.success(`${channel.channel_name} added to CRM`);
    } catch (e) { toast.error(e.message); }
  };

  const sectionLabel = {
    fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
    letterSpacing: '0.16em', color: 'var(--text-muted)', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: 6,
  };

  const divider = { borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.05 }}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        {channel.thumbnail_url
          ? <img src={channel.thumbnail_url} alt={channel.channel_name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Youtube size={22} style={{ color: '#FF4500' }} /></div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{channel.channel_name}</h3>
            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
              {channel.temperature?.toUpperCase()}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 9, fontFamily: 'var(--font-mono)', background: 'rgba(255,69,0,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(255,69,0,0.2)' }}>
              SCORE: {channel.lead_score}
            </span>
          </div>
          {channel.channel_handle && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{channel.channel_handle}</p>}
          {channel.email && (
            <p style={{ fontSize: 11, color: '#00E5A0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Mail size={10} /> {channel.email}
            </p>
          )}
        </div>
        <a href={`https://youtube.com/${channel.channel_handle || 'channel/' + channel.channel_id}`} target="_blank" rel="noreferrer"
          style={{ color: 'var(--text-muted)', flexShrink: 0, transition: 'color 0.15s' }}>
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <StatBadge icon={Users}    label="Subscribers" value={formatNumber(channel.subscriber_count)} color="#FF4500" />
        <StatBadge icon={Eye}      label="Avg Views"   value={formatNumber(channel.avg_views)}        color="#00E5A0" />
        <StatBadge icon={TrendingUp} label="Engagement" value={`${channel.engagement_rate}%`}         color="#F5A623" />
        <StatBadge icon={Clock}    label="Upload Freq" value={channel.upload_frequency_days ? `${channel.upload_frequency_days}d` : 'N/A'} color="#7B61FF" />
        <StatBadge icon={Calendar} label="Since Upload" value={channel.days_since_upload != null ? `${channel.days_since_upload}d` : 'N/A'} color="#00B8D4" />
        <StatBadge icon={BarChart2} label="Total Videos" value={formatNumber(channel.total_videos)}   color="var(--text-secondary)" />
      </div>

      {/* Pain points */}
      {painPoints.length > 0 && (
        <div style={{ ...divider, borderTop: '1px solid var(--border-subtle)' }}>
          <p style={sectionLabel}>Pain Points Detected</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {painPoints.map((p, i) => (
              <span key={i} style={{
                padding: '2px 8px', borderRadius: 99, fontSize: 10, fontFamily: 'var(--font-mono)',
                ...(p.severity === 'critical'
                  ? { background: 'rgba(255,69,0,0.1)', color: '#FF4500', border: '1px solid rgba(255,69,0,0.3)' }
                  : p.severity === 'high'
                  ? { background: 'rgba(245,166,35,0.1)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' }
                  : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }),
              }}>
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent videos */}
      {recentVideos.length > 0 && (
        <div style={{ ...divider }}>
          <p style={sectionLabel}>Last {recentVideos.length} Videos</p>
          <div style={{ marginTop: 8, maxHeight: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentVideos.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{v.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{formatNumber(v.views)} views</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Deep Study */}
      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={() => setStudyOpen(o => !o)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={12} style={{ color: '#7B61FF' }} />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>AI DEEP STUDY</span>
          </div>
          {studyOpen ? <ChevronUp size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />}
        </button>
        {studyOpen && (
          <div style={{ padding: '0 20px 16px' }}>
            <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.7, background: 'var(--bg-elevated)', borderRadius: 6, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>{deep_study}</pre>
          </div>
        )}
      </div>

      {/* Subject variants */}
      <div style={divider}>
        <p style={sectionLabel}><Star size={10} /> Subject Line Variants</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {subject_variants.filter(Boolean).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', width: 14, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
              <CopyButton text={s} label="" />
            </div>
          ))}
        </div>
      </div>

      {/* Email body */}
      <div style={divider}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={sectionLabel}><Mail size={10} /> Cold Email</p>
          <CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy Email" />
        </div>
        {email.subject && (
          <p style={{ fontSize: 11, color: 'var(--accent-primary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Subject: {email.subject}</p>
        )}
        <textarea style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 6, padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)', lineHeight: 1.7, resize: 'vertical',
          outline: 'none',
        }} rows={8} defaultValue={email.body} />
      </div>

      {/* Instagram DM */}
      <div style={divider}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={sectionLabel}><MessageSquare size={10} /> Instagram DM</p>
          <CopyButton text={dm} label="Copy DM" />
        </div>
        <textarea style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 6, padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)', lineHeight: 1.7, resize: 'vertical',
          outline: 'none',
        }} rows={4} defaultValue={dm} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 20px' }}>
        <button onClick={handleSaveCrm} disabled={savedCrm} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 6, cursor: savedCrm ? 'default' : 'pointer',
          fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 500,
          ...(savedCrm
            ? { background: 'rgba(0,229,160,0.1)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.3)' }
            : { background: 'var(--gradient-orange)', color: '#fff', border: 'none' }),
        }}>
          {savedCrm ? <><Check size={12} /> In CRM</> : <><Star size={12} /> Save to CRM</>}
        </button>
        {channel.email && (
          <button style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)',
            background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)',
          }}>
            <Mail size={12} /> Send Email
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChannelAnalyzer() {
  const [mode, setMode] = useState('single');
  const [singleUrl, setSingleUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [fileUrls, setFileUrls] = useState([]);
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef(null);

  const getUrlList = () => {
    if (mode === 'single') return [singleUrl.trim()].filter(Boolean);
    if (mode === 'paste') return pasteText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    return fileUrls;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const urls = await parseFileUrls(file);
      setFileUrls(urls);
      toast.success(`Loaded ${urls.length} channels from ${file.name}`);
    } catch { toast.error('Could not parse file — check the format'); }
  };

  const handleProcess = useCallback(async () => {
    const urls = getUrlList();
    if (!urls.length) { toast.error('Enter at least one channel URL'); return; }
    setProcessing(true); setResults([]); setErrors([]); setProgress({ current: 0, total: urls.length });
    for (let i = 0; i < urls.length; i++) {
      setProgress({ current: i + 1, total: urls.length });
      try {
        const { data } = await api.post('/analyzer/channel', { url: urls[i] });
        setResults(prev => [...prev, data.result]);
      } catch (e) {
        const msg = e.response?.data?.error || e.message || 'Unknown error';
        setErrors(prev => [...prev, { url: urls[i], error: msg }]);
        toast.error(`${urls[i].substring(0, 40)}: ${msg}`, { duration: 5000 });
        if (msg.includes('quota')) break;
      }
    }
    setProcessing(false);
  }, [mode, singleUrl, pasteText, fileUrls]);

  const urlCount = getUrlList().length;

  const inputStyle = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 6, padding: '9px 12px', color: 'var(--text-primary)',
    fontSize: 13, fontFamily: 'var(--font-body)', width: '100%', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Channel Analyzer</h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' }}>
          SCRAPE YOUTUBE CHANNEL — AI OUTREACH EMAILS + INSTAGRAM DMS
        </p>
      </div>

      {/* Input card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '20px 24px', marginBottom: 16 }}>
        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: 3, borderRadius: 7, width: 'fit-content', marginBottom: 20 }}>
          {[
            { key: 'single', icon: Search, label: 'Single URL' },
            { key: 'paste',  icon: List,   label: 'Paste Multiple' },
            { key: 'file',   icon: Upload, label: 'Upload File' },
          ].map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setMode(key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 5,
              fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer',
              transition: 'all 0.15s',
              ...(mode === key
                ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
                : { background: 'transparent', color: 'var(--text-muted)' }),
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {mode === 'single' && (
          <div style={{ marginBottom: 16 }}>
            <input style={inputStyle} placeholder="https://youtube.com/@MrBeast  or  @handle  or  channel URL"
              value={singleUrl} onChange={e => setSingleUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !processing && handleProcess()} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
              Accepts: full YouTube URL, @handle, /channel/UC..., or custom URL
            </p>
          </div>
        )}

        {mode === 'paste' && (
          <div style={{ marginBottom: 16 }}>
            <textarea style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, resize: 'vertical' }}
              rows={6} placeholder={'https://youtube.com/@MrBeast\nhttps://youtube.com/@mkbhd\n@veritasium'}
              value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              {getUrlList().length} channels detected · One URL per line
            </p>
          </div>
        )}

        {mode === 'file' && (
          <div onClick={() => fileRef.current?.click()} style={{
            border: '2px dashed var(--border-default)', borderRadius: 8, padding: '32px 24px',
            textAlign: 'center', cursor: 'pointer', marginBottom: 16, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(255,69,0,0.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'transparent'; }}>
            <Upload size={26} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            {fileName ? (
              <>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>{fileName}</p>
                <p style={{ color: '#00E5A0', fontSize: 11, marginTop: 4, fontFamily: 'var(--font-mono)' }}>{fileUrls.length} channels loaded</p>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Drop your Excel or CSV file here</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Column A = YouTube URL or @handle · .xlsx and .csv supported</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleProcess} disabled={processing || urlCount === 0} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 6,
            cursor: (processing || urlCount === 0) ? 'not-allowed' : 'pointer',
            background: 'var(--gradient-orange)', color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)',
            opacity: (processing || urlCount === 0) ? 0.6 : 1,
          }}>
            {processing
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing {progress.current}/{progress.total}...</>
              : <><Zap size={14} /> Analyze {urlCount > 1 ? `${urlCount} Channels` : 'Channel'}</>
            }
          </button>
          {results.length > 0 && (
            <button onClick={() => exportToCsv(results)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 6,
              cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-body)',
            }}>
              <Download size={13} /> Export {results.length} Results
            </button>
          )}
        </div>

        {/* Progress bar */}
        {processing && progress.total > 1 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>Analyzing channel {progress.current} of {progress.total}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div style={{ width: '100%', height: 3, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
              <motion.div style={{ height: '100%', background: 'var(--gradient-orange)', borderRadius: 99 }}
                animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                transition={{ duration: 0.4 }} />
            </div>
          </div>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background: 'rgba(255,69,0,0.05)', border: '1px solid rgba(255,69,0,0.25)', borderRadius: 8, padding: '14px 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#FF4500', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={12} /> {errors.length} error{errors.length > 1 ? 's' : ''}
          </p>
          {errors.map((e, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{e.url}:</span> {e.error}
            </p>
          ))}
        </div>
      )}

      {/* Loading state */}
      {processing && results.length === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '48px 24px', textAlign: 'center', marginBottom: 16 }}>
          <Loader2 size={30} style={{ color: 'var(--accent-primary)', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>Scraping channel data...</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>This takes 5–15 seconds per channel</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.18em' }}>
              {results.length} CHANNEL{results.length > 1 ? 'S' : ''} ANALYZED
            </p>
            {results.length > 1 && (
              <button onClick={() => exportToCsv(results)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)',
              }}>
                <Download size={11} /> Export All as CSV
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: results.length > 1 ? 'repeat(auto-fit, minmax(440px, 1fr))' : '1fr', gap: 20 }}>
            {results.map((r, i) => <ResultCard key={r.lead_id ?? i} result={r} index={i} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!processing && results.length === 0 && errors.length === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '48px 24px', textAlign: 'center', opacity: 0.6 }}>
          <Youtube size={38} style={{ color: '#FF4500', margin: '0 auto 16px', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Enter a YouTube channel URL above and click Analyze</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Works with @handles, channel URLs, and bulk uploads</p>
        </div>
      )}
    </div>
  );
}
