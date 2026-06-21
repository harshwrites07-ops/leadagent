import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const NICHES = ['Finance','Business','Fitness','Tech','Education','Real Estate','Health','Cooking','Motivation','Marketing','Lifestyle','Gaming','Travel','Beauty','Entertainment','Sports','Other'];
const TRAITS = ['Direct and no-nonsense','Warm and friendly','Analytical and data-driven','Creative and energetic','Calm and thoughtful','Funny and casual','Professional and polished','Bold and confident','Laid-back and approachable'];
const PRICING = ['Under $500/month or project','$500 - $1,500/month','$1,500 - $3,500/month','$3,500 - $7,000/month','$7,000+/month','I work on project rates'];
const EXPERIENCE = [['just_starting','Just starting out (under 1 year)'],['getting_established','Getting established (1-3 years)'],['experienced','Experienced (3-5 years)'],['veteran','Veteran (5+ years)']];
const GOALS = [['get_reply','Start a conversation (get a reply)'],['book_call','Book a discovery call'],['close_deal','Close a deal directly']];
const STEPS = ['Tell us about yourself','Your work','How you communicate','Your story'];

function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 640);
  useEffect(() => { const fn = () => setM(window.innerWidth < 640); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  return m;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const isMobile = useMobile();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [direction, setDirection] = useState(1);

  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    service_type: '',
    one_liner: '',
    experience_years: '',
    best_result: '',
    target_niches: [],
    pricing_range: '',
    personality_traits: [],
    outreach_goal: '',
    origin_story: '',
    unique_difference: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleChip = (key, val, max = 99) => {
    setForm(f => {
      const arr = f[key];
      if (arr.includes(val)) return { ...f, [key]: arr.filter(x => x !== val) };
      if (arr.length >= max) return { ...f, [key]: [...arr.slice(1), val] };
      return { ...f, [key]: [...arr, val] };
    });
  };

  const canProceed = () => {
    if (step === 0) return form.full_name.trim() && form.service_type.trim() && form.experience_years;
    if (step === 1) return form.best_result.trim() && form.target_niches.length > 0 && form.pricing_range;
    if (step === 2) return form.personality_traits.length > 0 && form.outreach_goal;
    if (step === 3) return form.origin_story.trim() && form.unique_difference.trim();
    return true;
  };

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put('/auth/onboarding', {
        full_name: form.full_name,
        service_type: form.service_type,
        one_liner: form.one_liner,
        experience_years: form.experience_years,
        best_result: form.best_result,
        target_niches: form.target_niches,
        pricing_range: form.pricing_range,
        personality_traits: form.personality_traits,
        outreach_goal: form.outreach_goal,
        origin_story: form.origin_story,
        unique_difference: form.unique_difference,
        profile_completed: 1,
      });
      await refreshUser();
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => { setDirection(1); setStep(s => s + 1); };
  const goBack = () => { setDirection(-1); setStep(s => s - 1); };

  const skipOnboarding = async () => {
    try {
      await api.post('/auth/skip-onboarding');
      await refreshUser();
      navigate('/dashboard');
    } catch {}
  };

  const progress = (step / STEPS.length) * 100;

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}
        style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16,1,0.3,1] }}
          style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--lime-soft)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 36 }}
        >
          ⚡
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ fontFamily: 'var(--f-heading)', fontSize: 32, fontWeight: 800, marginBottom: 10 }}
        >
          Your profile is ready.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="muted"
          style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}
        >
          We've built your unique voice profile. Every email will sound exactly like you.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="btn btn--lime btn--lg"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => navigate('/')}
        >
          Start finding leads →
        </motion.button>
      </motion.div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center', background: 'var(--bg)', padding: isMobile ? '16px 12px 80px' : 24 }}>
      <div style={{ maxWidth: 560, width: '100%' }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/></svg>
            </div>
            <span className="muted mono" style={{ fontSize: 10, letterSpacing: '.1em' }}>VOICE PROFILE SETUP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="muted mono" style={{ fontSize: 10 }}>Step {step + 1} of {STEPS.length}</span>
            <button
              onClick={skipOnboarding}
              style={{ background: 'none', border: '1px solid var(--line-2)', borderRadius: 6, fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--f-sans)', whiteSpace: 'nowrap' }}
            >
              Skip
            </button>
          </div>
        </motion.div>

        {/* Progress bar */}
        <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-3)', marginBottom: 40, overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}
            style={{ height: '100%', background: 'var(--lime)', borderRadius: 2 }}
          />
        </div>

        {/* Card with step-switch animation */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: isMobile ? '20px 16px 20px' : '32px 32px 28px' }}
          >
            <p style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--lime)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>{STEPS[step]}</p>
            <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: 26, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 }}>
              {step === 0 && 'First, tell us about yourself.'}
              {step === 1 && 'Tell us about your work.'}
              {step === 2 && 'How do you communicate?'}
              {step === 3 && 'Almost done — your story.'}
            </h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
              {step === 0 && 'This helps us write emails that sound exactly like you.'}
              {step === 1 && 'The more specific you are, the more believable the emails.'}
              {step === 2 && "We'll match this tone in every email we write for you."}
              {step === 3 && 'The most effective emails have a real person behind them.'}
            </p>

            {step === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-2)' }}>What's your name?</label>
                  <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-2)' }}>What do you sell to YouTube creators?</label>
                  <input className="input" value={form.service_type} onChange={e => set('service_type', e.target.value)}
                    placeholder="e.g. video editing, thumbnail design, sponsorships, software, coaching..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-2)' }}>
                    Describe yourself in one sentence.
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{form.one_liner.length}/150</span>
                  </label>
                  <textarea className="input" rows={2} maxLength={150} value={form.one_liner} onChange={e => set('one_liner', e.target.value)}
                    style={{ resize: 'none' }} placeholder="e.g. I help finance creators look as professional as their ideas deserve" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>How long have you been doing this?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {EXPERIENCE.map(([val, label]) => (
                      <motion.label
                        key={val}
                        whileHover={{ scale: 1.01 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1px solid ${form.experience_years === val ? 'var(--lime-border)' : 'var(--line)'}`, borderRadius: 8, cursor: 'pointer', background: form.experience_years === val ? 'var(--lime-soft)' : 'transparent', transition: 'all .15s' }}
                      >
                        <input type="radio" checked={form.experience_years === val} onChange={() => set('experience_years', val)} style={{ accentColor: 'var(--lime)' }} />
                        <span style={{ fontSize: 13 }}>{label}</span>
                      </motion.label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-2)' }}>
                    What's your single best result for a client?
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{form.best_result.length}/300</span>
                  </label>
                  <textarea className="input" rows={3} maxLength={300} value={form.best_result} onChange={e => set('best_result', e.target.value)} style={{ resize: 'none' }}
                    placeholder={'Be specific. Numbers work best.\ne.g. Helped a fitness channel increase watch time by 60% in 30 days\nNo results yet? Tell us what result you WANT to achieve.'} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>Which YouTube niches do you love working with?</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {NICHES.map(n => (
                      <motion.button
                        key={n}
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => toggleChip('target_niches', n)}
                        style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer', border: `1px solid ${form.target_niches.includes(n) ? 'var(--lime-border)' : 'var(--line)'}`, background: form.target_niches.includes(n) ? 'var(--lime-soft)' : 'var(--surface-2)', color: form.target_niches.includes(n) ? 'var(--lime)' : 'var(--text-2)', fontWeight: form.target_niches.includes(n) ? 600 : 400, transition: 'all .15s' }}
                      >
                        {n}
                      </motion.button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-2)' }}>What's your typical pricing?</label>
                  <select className="input" value={form.pricing_range} onChange={e => set('pricing_range', e.target.value)}>
                    <option value="">Select a range...</option>
                    {PRICING.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Only used to calibrate your email tone — never shown to creators.</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>
                    How would your best friend describe you?
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>Pick up to 3</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {TRAITS.map(t => (
                      <motion.button
                        key={t}
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => toggleChip('personality_traits', t, 3)}
                        style={{ padding: '7px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer', border: `1px solid ${form.personality_traits.includes(t) ? 'var(--lime-border)' : 'var(--line)'}`, background: form.personality_traits.includes(t) ? 'var(--lime-soft)' : 'var(--surface-2)', color: form.personality_traits.includes(t) ? 'var(--lime)' : 'var(--text-2)', fontWeight: form.personality_traits.includes(t) ? 600 : 400, transition: 'all .15s' }}
                      >
                        {t}
                      </motion.button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>What's your main outreach goal?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {GOALS.map(([val, label]) => (
                      <motion.label
                        key={val}
                        whileHover={{ scale: 1.01 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1px solid ${form.outreach_goal === val ? 'var(--lime-border)' : 'var(--line)'}`, borderRadius: 8, cursor: 'pointer', background: form.outreach_goal === val ? 'var(--lime-soft)' : 'transparent', transition: 'all .15s' }}
                      >
                        <input type="radio" checked={form.outreach_goal === val} onChange={() => set('outreach_goal', val)} style={{ accentColor: 'var(--lime)' }} />
                        <span style={{ fontSize: 13 }}>{label}</span>
                      </motion.label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-2)' }}>
                    Why did you start doing this?
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{form.origin_story.length}/300</span>
                  </label>
                  <textarea className="input" rows={3} maxLength={300} value={form.origin_story} onChange={e => set('origin_story', e.target.value)} style={{ resize: 'none' }}
                    placeholder={'Keep it real and short.\ne.g. Started editing videos to pay for college. Now I help creators tell better stories.\nOR: Built a sponsorship agency because I saw creators leaving massive deals on the table.'} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-2)' }}>
                    What makes you different from everyone else who does what you do?
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{form.unique_difference.length}/300</span>
                  </label>
                  <textarea className="input" rows={3} maxLength={300} value={form.unique_difference} onChange={e => set('unique_difference', e.target.value)} style={{ resize: 'none' }}
                    placeholder={"Your honest answer.\ne.g. I only take 3 clients at a time so every creator gets my full attention.\nOR: I've worked with 200+ creators so I know what works in every niche."} />
                </div>
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--coral)' }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
          {step > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="btn btn--ghost"
              onClick={goBack}
            >
              ← Back
            </motion.button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <motion.button
              whileHover={canProceed() ? { scale: 1.02, y: -1 } : {}}
              whileTap={canProceed() ? { scale: 0.97 } : {}}
              className="btn btn--lime btn--lg"
              disabled={!canProceed()}
              onClick={goNext}
              style={{ opacity: canProceed() ? 1 : 0.45 }}
            >
              Continue →
            </motion.button>
          ) : (
            <motion.button
              whileHover={canProceed() && !saving ? { scale: 1.02, y: -1 } : {}}
              whileTap={canProceed() && !saving ? { scale: 0.97 } : {}}
              className="btn btn--lime btn--lg"
              disabled={!canProceed() || saving}
              onClick={finish}
              style={{ opacity: canProceed() && !saving ? 1 : 0.45, minWidth: 160 }}
            >
              {saving ? 'Building your profile...' : 'Finish setup →'}
            </motion.button>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>You can always complete the profile later from Settings</span>
        </div>
      </div>
    </div>
  );
}
