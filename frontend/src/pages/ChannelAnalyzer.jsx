import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import api, { formatNumber } from '../utils/api';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Copy failed'); }
  };
  return (
    <button className="btn btn--ghost btn--sm" onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} size={11} style={{ color: copied ? 'var(--ok)' : undefined }} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function ResultDossier({ result, navigate }) {
  const [studyOpen, setStudyOpen] = useState(false);
  const [savedCrm, setSavedCrm] = useState(false);
  const { channel, deep_study, email, dm, subject_variants } = result;

  const painPoints = (() => { try { return JSON.parse(channel.pain_points || '[]'); } catch { return []; } })();
  const recentVideos = (() => { try { return JSON.parse(channel.recent_videos || '[]'); } catch { return []; } })();

  const handleSaveCrm = async () => {
    try {
      await api.post('/analyzer/save-to-crm', { lead_id: result.lead_id });
      setSavedCrm(true);
      toast.success(`${channel.channel_name} added to CRM`);
    } catch (e) { toast.error(e.message); }
  };

  const handleSendEmail = async () => {
    try {
      if (!savedCrm) {
        await api.post('/analyzer/save-to-crm', { lead_id: result.lead_id });
        setSavedCrm(true);
      }
      await api.post(`/emails/queue/${result.lead_id}`, {
        subject: email?.subject, body: email?.body,
      });
      toast.success(`Email queued for ${channel.channel_name}`);
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const scoreNum = channel.lead_score ?? 0;
  const scoreBadge = scoreNum >= 90 ? 'coral' : scoreNum >= 80 ? 'lime' : '';

  return (
    <div className="dossier">
      {/* Hero (left, sticky) */}
      <div className="dossier__hero">
        <div className="dossier__channel-img">
          {channel.thumbnail_url
            ? <img src={channel.thumbnail_url} alt={channel.channel_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-md)' }} />
            : (channel.channel_name || '?')[0].toUpperCase()
          }
        </div>

        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <span className={`badge badge--${scoreBadge || 'lime'}`}>
            {scoreBadge === 'coral' ? 'A+' : scoreNum >= 80 ? 'A' : 'B'} score · {scoreNum}
          </span>
          {channel.temperature && (
            <span className={`badge badge--${channel.temperature === 'hot' ? 'coral' : channel.temperature === 'warm' ? 'warn' : ''}`}>
              {channel.temperature}
            </span>
          )}
        </div>

        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>{channel.channel_name}</div>
        <div className="mono muted" style={{ fontSize: 11.5 }}>{channel.channel_handle || ''}</div>
        {channel.description && (
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10 }}>
            {channel.description.slice(0, 160)}
          </div>
        )}

        <div className="dossier__metric-grid">
          <div className="dossier__metric"><div className="dossier__metric-l">Subs</div><div className="dossier__metric-v">{formatNumber(channel.subscriber_count ?? 0)}</div></div>
          <div className="dossier__metric"><div className="dossier__metric-l">Avg views</div><div className="dossier__metric-v">{formatNumber(channel.avg_views ?? 0)}</div></div>
          <div className="dossier__metric"><div className="dossier__metric-l">Engagement</div><div className="dossier__metric-v">{channel.engagement_rate != null ? `${channel.engagement_rate}%` : '—'}</div></div>
          <div className="dossier__metric"><div className="dossier__metric-l">Upload rate</div><div className="dossier__metric-v">{channel.upload_frequency_days ? `${channel.upload_frequency_days}d` : '—'}</div></div>
          <div className="dossier__metric"><div className="dossier__metric-l">Last upload</div><div className="dossier__metric-v">{channel.days_since_upload != null ? `${channel.days_since_upload}d` : '—'}</div></div>
          <div className="dossier__metric"><div className="dossier__metric-l">Videos</div><div className="dossier__metric-v">{formatNumber(channel.total_videos ?? 0)}</div></div>
        </div>

        {channel.email && (
          <>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 18, marginBottom: 8 }}>Contact</div>
            <div style={{ padding: 10, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'var(--f-mono)', fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{channel.email}</span>
              <Icon name="check" size={11} style={{ color: 'var(--ok)' }} />
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Verified via Hunter · Apollo · domain MX check</div>
          </>
        )}

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn--primary"
            disabled={savedCrm}
            onClick={handleSaveCrm}
            style={savedCrm ? { background: 'rgba(var(--ok-rgb),0.1)', color: 'var(--ok)', borderColor: 'rgba(var(--ok-rgb),0.3)' } : {}}
          >
            <Icon name={savedCrm ? 'check' : 'star'} size={12} />
            {savedCrm ? 'In CRM' : 'Save to CRM'}
          </button>
          {channel.email && (
            <button className="btn btn--ghost" onClick={handleSendEmail}>
              <Icon name="mail" size={12} />Send Email
            </button>
          )}
          <button className="btn btn--coral" onClick={() => navigate(`/pitch?lead=${result.lead_id}`)}>
            <Icon name="sparkle" size={12} />Draft pitch
          </button>
        </div>
      </div>

      {/* Body (right) */}
      <div>
        {/* What the agent learned */}
        {deep_study && (
          <div className="dossier__section">
            <h3>
              What the agent learned{' '}
              <span className="muted">Gemini · AI analysis</span>
            </h3>
            <button
              onClick={() => setStudyOpen(o => !o)}
              className="btn btn--ghost btn--sm"
              style={{ marginBottom: studyOpen ? 12 : 0 }}
            >
              <Icon name={studyOpen ? 'chevd' : 'chev'} size={11} />
              {studyOpen ? 'Collapse' : 'Read full analysis'}
            </button>
            {studyOpen && (
              <pre style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap', fontFamily: 'var(--f-mono)', lineHeight: 1.7, background: 'var(--bg-2)', borderRadius: 'var(--r)', padding: '12px 14px', border: '1px solid var(--line)', marginTop: 8 }}>
                {deep_study}
              </pre>
            )}
          </div>
        )}

        {/* Recommended angles (subject variants) */}
        {subject_variants?.filter(Boolean).length > 0 && (
          <div className="dossier__section">
            <h3>Recommended angles <span className="muted">ranked by predicted reply rate</span></h3>
            {subject_variants.filter(Boolean).map((s, i) => (
              <div key={i} className={`angle ${i === 0 ? 'angle--top' : ''}`}>
                <div className="angle__head">
                  <span className="angle__score">{95 - i * 8}/100</span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{s}</span>
                  {i === 0 && <span className="badge badge--coral">Recommended</span>}
                  <CopyButton text={s} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent uploads */}
        {recentVideos.length > 0 && (
          <div className="dossier__section">
            <h3>Recent uploads <span className="muted">last {recentVideos.length}</span></h3>
            {recentVideos.map((v, i) => (
              <div key={i} className="vid-row">
                <div className="vid-thumb">▶</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="vid-title">{v.title}</div>
                  <div className="vid-meta">{formatNumber(v.views)} views</div>
                </div>
                <div className="muted mono" style={{ fontSize: 10.5, alignSelf: 'center' }}>
                  <Icon name="eye" size={11} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pain points / Audience signal */}
        {painPoints.length > 0 && (
          <div className="dossier__section">
            <h3>Audience signal <span className="muted">from comment analysis</span></h3>
            <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {painPoints.map((p, i) => (
                <span key={i} className="chan" style={{ padding: '4px 9px', fontSize: 11.5 }}>
                  {typeof p === 'object' ? p.label : p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cold email */}
        {email?.body && (
          <div className="dossier__section">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Cold email</h3>
              <CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} />
            </div>
            {email.subject && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--lime)', marginBottom: 8 }}>Subject: {email.subject}</div>
            )}
            <textarea
              className="input"
              rows={8}
              defaultValue={email.body}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, lineHeight: 1.7, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Instagram DM */}
        {dm && (
          <div className="dossier__section">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Instagram DM</h3>
              <CopyButton text={dm} />
            </div>
            <textarea
              className="input"
              rows={4}
              defaultValue={dm}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, lineHeight: 1.7, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChannelAnalyzer() {
  const navigate = useNavigate();
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

  const handleFileChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const { default: XLSX } = await import('xlsx');
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          const urls = rows.map(r => String(r[0] || '').trim()).filter(v => v && v.length > 3);
          setFileUrls(urls);
          toast.success(`Loaded ${urls.length} channels from ${file.name}`);
        } catch { toast.error('Could not parse file'); }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      const reader = new FileReader();
      reader.onload = ev => {
        const urls = ev.target.result.split('\n').map(l => l.split(',')[0].replace(/["']/g, '').trim()).filter(v => v && v.length > 3);
        setFileUrls(urls);
        toast.success(`Loaded ${urls.length} channels from ${file.name}`);
      };
      reader.readAsText(file);
    }
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

  const exportToCsv = () => {
    const rows = [['Channel', 'Subscribers', 'Avg Views', 'Email Found', 'Subject', 'Email Body', 'Instagram DM']];
    results.forEach(r => {
      rows.push([r.channel.channel_name, r.channel.subscriber_count, r.channel.avg_views, r.channel.email || '', r.email?.subject || '', (r.email?.body || '').replace(/\n/g, ' '), (r.dm || '').replace(/\n/g, ' ')]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `channel_analyzer_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="page">
      {/* Page nav */}
      <div className="row" style={{ marginBottom: 20, gap: 8 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/leads')}>
          <Icon name="chev" size={12} style={{ transform: 'rotate(180deg)' }} />Back to Lead Finder
        </button>
        <span className="muted" style={{ fontSize: 12 }}>·</span>
        <span className="mono muted" style={{ fontSize: 11.5 }}>Channel Analyzer · AI-powered dossier</span>
        <div style={{ flex: 1 }} />
        {results.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={exportToCsv}>
            <Icon name="download" size={12} />Export CSV
          </button>
        )}
        {results.length > 0 && (
          <button className="btn btn--coral" onClick={() => navigate(`/pitch?lead=${results[0]?.lead_id}`)}>
            <Icon name="sparkle" size={12} />Draft pitch with this brief
          </button>
        )}
      </div>

      {/* Input card */}
      {(!results.length && !processing) && (
        <div className="pm" style={{ marginBottom: 20 }}>
          <div className="pm__head">
            <div className="pm__icon"><Icon name="eye" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="pm__title">Channel Analyzer</div>
              <div className="pm__sub">Paste a YouTube URL. The agent scrapes, enriches, and writes your outreach.</div>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="tabs" style={{ marginBottom: 16 }}>
            {[
              { key: 'single', label: 'Single URL',      sub: 'one channel' },
              { key: 'paste',  label: 'Paste Multiple',  sub: 'line by line' },
              { key: 'file',   label: 'Upload File',     sub: '.xlsx · .csv' },
            ].map(t => (
              <div key={t.key} className={`tab ${mode === t.key ? 'is-active' : ''}`} onClick={() => setMode(t.key)} style={{ padding: '8px 14px' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{t.label}</div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>{t.sub}</div>
              </div>
            ))}
          </div>

          {mode === 'single' && (
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="field__label">YouTube URL or @handle</div>
              <input
                className="input"
                placeholder="https://youtube.com/@MrBeast  or  @handle  or  channel URL"
                value={singleUrl}
                onChange={e => setSingleUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !processing && handleProcess()}
              />
              <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Accepts: full YouTube URL, @handle, /channel/UC..., or custom URL</div>
            </div>
          )}

          {mode === 'paste' && (
            <div className="field" style={{ marginBottom: 16 }}>
              <div className="field__label">Channel URLs — one per line</div>
              <textarea
                className="input"
                rows={6}
                placeholder={'https://youtube.com/@MrBeast\nhttps://youtube.com/@mkbhd\n@veritasium'}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, lineHeight: 1.7, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
              />
              <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>{getUrlList().length} channels detected</div>
            </div>
          )}

          {mode === 'file' && (
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed var(--line-2)', borderRadius: 'var(--r)', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
            >
              <Icon name="upload" size={26} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }} />
              {fileName ? (
                <>
                  <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13 }}>{fileName}</div>
                  <div className="mono" style={{ color: 'var(--ok)', fontSize: 11, marginTop: 4 }}>{fileUrls.length} channels loaded</div>
                </>
              ) : (
                <>
                  <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }}>Drop your Excel or CSV file here</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Column A = YouTube URL or @handle · .xlsx and .csv supported</div>
                </>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>
          )}

          <button className="pm__cta" onClick={handleProcess} disabled={processing || urlCount === 0}>
            {processing
              ? <><span className="dot dot--pulse" style={{ background: '#0a0a0c', width: 8, height: 8 }} /> Analyzing {progress.current}/{progress.total}...</>
              : <><Icon name="bolt" size={16} />Analyze {urlCount > 1 ? `${urlCount} Channels` : 'Channel'}</>
            }
          </button>
        </div>
      )}

      {/* Progress */}
      {processing && (
        <div className="card" style={{ marginBottom: 20, textAlign: 'center', padding: '48px 24px' }}>
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 12 }}>
            <span className="dot dot--pulse" />
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Scraping channel data... ({progress.current}/{progress.total})</span>
          </div>
          {progress.total > 1 && (
            <div style={{ maxWidth: 400, margin: '0 auto' }}>
              <div style={{ height: 3, background: 'var(--line)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--lime)', borderRadius: 99, width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.4s' }} />
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>This takes 5–15 seconds per channel</div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--coral-border)', background: 'var(--coral-soft)', marginBottom: 16 }}>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <Icon name="x" size={12} style={{ color: 'var(--coral)' }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--coral)' }}>{errors.length} error{errors.length > 1 ? 's' : ''}</span>
          </div>
          {errors.map((e, i) => (
            <div key={i} className="muted" style={{ fontSize: 11 }}>
              <span style={{ color: 'var(--text-2)' }}>{e.url}: </span>{e.error}
            </div>
          ))}
        </div>
      )}

      {/* Results — single dossier layout */}
      {results.length === 1 && (
        <ResultDossier result={results[0]} navigate={navigate} />
      )}

      {/* Results — multiple cards */}
      {results.length > 1 && (
        <>
          <div className="section-head">
            <h3>{results.length} channels analyzed</h3>
            <button className="btn btn--ghost btn--sm" onClick={exportToCsv}>
              <Icon name="download" size={11} />Export All CSV
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 20 }}>
            {results.map((r, i) => (
              <ResultDossier key={r.lead_id ?? i} result={r} navigate={navigate} />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!processing && results.length === 0 && errors.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', opacity: 0.6 }}>
          <Icon name="youtube" size={38} style={{ color: 'var(--coral)', margin: '0 auto 16px', display: 'block', opacity: 0.5 }} />
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>Enter a YouTube channel URL above and click Analyze</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Works with @handles, channel URLs, and bulk uploads</div>
        </div>
      )}
    </div>
  );
}
