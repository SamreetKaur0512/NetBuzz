import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const USER_ID_REGEX = /^[a-zA-Z0-9_]+$/;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const STEPS = ['Account', 'Profile', 'Privacy'];

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [step, setStep]   = useState(0);
  const [phase, setPhase] = useState('form'); // 'form' | 'otp'
  const [form, setForm]   = useState({ userId:'', username:'', email:'', password:'', bio:'', isPrivate:false });
  const [otp, setOtp]     = useState(['','','','','','']);
  const otpRefs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [focused, setFocused]   = useState('');
  const [userIdErr, setUserIdErr] = useState('');
  const [passStrength, setPassStrength] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [e.target.name]: val }));
    if (e.target.name === 'userId')   validateUserId(val);
    if (e.target.name === 'password') calcStrength(val);
    // NOTE: we intentionally do NOT call setError('') here.
    // Errors stay visible until the user fixes them and re-submits.
  };
  const validateUserId = (val) => {
    if (!val) { setUserIdErr(''); return; }
    if (val.length < 5) setUserIdErr('Min 5 characters');
    else if (!USER_ID_REGEX.test(val)) setUserIdErr('Only letters, numbers & _ allowed');
    else setUserIdErr('');
  };
  const calcStrength = (val) => {
    let s = 0;
    if (val.length >= 6) s++; if (val.length >= 10) s++;
    if (/[A-Z]/.test(val) || /[0-9]/.test(val)) s++;
    if (/[^a-zA-Z0-9]/.test(val)) s++;
    setPassStrength(s);
  };

  const validateStep = () => {
    setError('');
    if (step === 0) {
      if (!form.email || !form.password) return setError('Email and password are required.'), false;
      if (form.password.length < 6) return setError('Password must be at least 6 characters.'), false;
    }
    if (step === 1) {
      if (userIdErr) return setError(userIdErr), false;
      if (!form.userId || !form.username) return setError('User ID and display name are required.'), false;
    }
    return true;
  };

  const nextStep = () => { if (validateStep()) setStep(s => s + 1); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 2) { nextStep(); return; }
    // Last step — send OTP
    setError(''); setLoading(true);
    try {
      await authAPI.sendOtp(form);
      setPhase('otp');
      startCountdown();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send code.');
    } finally { setLoading(false); }
  };

  const startCountdown = () => {
    setCountdown(60);
    const t = setInterval(() => setCountdown(v => { if (v <= 1) { clearInterval(t); return 0; } return v - 1; }), 1000);
  };

  const handleOtpChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp]; next[i] = val.slice(-1); setOtp(next);
    if (val && i < 5) otpRefs[i + 1].current?.focus();
  };
  const handleOtpKey = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs[i - 1].current?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) return setError('Enter the complete 6-digit code.');
    setError(''); setLoading(true);
    try {
      const res = await authAPI.verifyOtp({ email: form.email, otp: code });
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code.');
      setOtp(['','','','','','']);
      otpRefs[0].current?.focus();
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    try {
      await authAPI.resendOtp({ email: form.email });
      setOtp(['','','','','','']);
      startCountdown();
    } catch (err) { setError('Failed to resend. Please try again.'); }
  };

  const handleGoogle = () => {
    if (!GOOGLE_CLIENT_ID) return setError('Google sign-in not configured yet.');
    setGLoading(true); setError('');
    window.google?.accounts?.id?.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const res = await authAPI.googleAuth({ idToken: response.credential });
          if (res.data.needs_user_id) {
            // New Google user — go to login page which shows the User ID setup screen
            navigate('/login', { state: { googlePending: { googleId: res.data.googleId, email: res.data.email, name: res.data.name, picture: res.data.picture } } });
            return;
          }
          login(res.data.token, res.data.user);
          navigate('/', { replace: true });
        } catch (err) { setError(err.response?.data?.message || 'Google sign-in failed.'); }
        finally { setGLoading(false); }
      },
    });
    window.google?.accounts?.id?.prompt(n => { if (n.isNotDisplayed() || n.isSkippedMoment()) { setGLoading(false); setError('Google sign-in was cancelled.'); } });
  };

  const floated = (name) => (name === 'bio' ? form[name].length > 0 : form[name]) || focused === name;
  const inputSt = (name) => ({
    width:'100%', padding: floated(name) ? '22px 14px 8px' : '17px 14px',
    borderRadius:10, border:`1.5px solid ${focused===name ? 'var(--yellow)' : (userIdErr&&name==='userId') ? '#FF4757' : 'var(--border)'}`,
    background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:15,
    outline:'none', transition:'border-color 0.18s, box-shadow 0.18s',
    boxSizing:'border-box', fontFamily:'Nunito, sans-serif',
    boxShadow: focused===name ? '0 0 0 3px rgba(255,215,0,0.10)' : 'none',
  });
  const labelSt = (name) => ({
    position:'absolute', left:14, top: floated(name) ? 7 : 17,
    fontSize: floated(name) ? 10 : 14, fontWeight: floated(name) ? 700 : 400,
    color: focused===name ? 'var(--yellow)' : (userIdErr&&name==='userId') ? '#FF4757' : 'var(--text-muted)',
    transition:'all 0.18s cubic-bezier(.4,0,.2,1)', pointerEvents:'none',
    letterSpacing: floated(name) ? '0.5px' : 0,
    textTransform: floated(name) ? 'uppercase' : 'none', zIndex:1,
  });
  const strengthLabel = ['','Weak','Fair','Good','Strong'];
  const strengthColor = ['','#FF4757','#F7A325','#3D9BF7','#00D68F'];

  // ── OTP Screen ───────────────────────────────────────────────────────────────
  if (phase === 'otp') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:'24px 16px' }}>
      <div style={{ width:'100%', maxWidth:420, background:'var(--bg-surface)', borderRadius:20, padding:'44px 40px 36px', boxShadow:'0 20px 60px rgba(30,35,64,0.13)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--grad-hero)' }} />
        <div style={{ textAlign:'center', marginBottom:8, fontFamily:'var(--font-display)', fontSize:40, fontStyle:'italic', fontWeight:700, background:'var(--grad-hero)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>BuzzNet.</div>

        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📧</div>
          <div style={{ fontSize:20, fontWeight:800, fontFamily:'Poppins, sans-serif', marginBottom:6 }}>Check your email</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.7 }}>
            We sent a 6-digit code to<br/>
            <strong style={{ color:'var(--yellow)' }}>{form.email}</strong>
          </div>
        </div>

        {error && <div style={{ background:'rgba(255,71,87,0.08)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:20, fontSize:13, color:'#FF4757', fontWeight:500 }}>{error}</div>}

        {/* OTP boxes */}
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:24 }}>
          {otp.map((digit, i) => (
            <input key={i} ref={otpRefs[i]}
              type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={e => handleOtpChange(i, e.target.value)}
              onKeyDown={e => handleOtpKey(i, e)}
              onFocus={() => setFocused(`otp${i}`)} onBlur={() => setFocused('')}
              style={{
                width:48, height:56, textAlign:'center', fontSize:24, fontWeight:800,
                fontFamily:'Poppins, sans-serif', borderRadius:12,
                border:`2px solid ${focused===`otp${i}` ? 'var(--yellow)' : digit ? 'var(--yellow)' : 'var(--border)'}`,
                background: digit ? 'rgba(255,215,0,0.06)' : 'var(--bg-elevated)',
                color:'var(--text-primary)', outline:'none',
                boxShadow: focused===`otp${i}` ? '0 0 0 3px rgba(255,215,0,0.12)' : 'none',
                transition:'all 0.15s',
              }} />
          ))}
        </div>

        <button onClick={handleVerify} disabled={loading} style={{ width:'100%', padding:'14px', background:loading ? 'rgba(255,215,0,0.4)' : 'var(--grad-yellow)', color:'#1a1d2e', border:'none', borderRadius:12, fontSize:15, fontWeight:800, fontFamily:'Poppins, sans-serif', cursor:loading?'not-allowed':'pointer', boxShadow:loading?'none':'0 4px 18px rgba(255,215,0,0.35)', marginBottom:16 }}>
          {loading ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span style={{ width:16, height:16, border:'2px solid #1a1d2e', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />Verifying…</span> : 'Verify & Create Account'}
        </button>

        <div style={{ textAlign:'center', fontSize:13, color:'var(--text-muted)' }}>
          Didn't get the code?{' '}
          <button onClick={handleResend} disabled={countdown > 0} style={{ background:'none', border:'none', cursor:countdown>0?'default':'pointer', color:countdown>0?'var(--text-muted)':'var(--yellow)', fontWeight:700, fontSize:13, padding:0 }}>
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
          </button>
        </div>
        <div style={{ textAlign:'center', marginTop:12 }}>
          <button onClick={() => { setPhase('form'); setStep(0); setOtp(['','','','','','']); setError(''); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:12, fontFamily:'Poppins, sans-serif' }}>← Change email</button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  // ── Registration Form ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:'24px 16px', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'fixed', top:'-20%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(155,89,255,0.07) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'fixed', bottom:'-20%', left:'-10%', width:450, height:450, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,215,0,0.07) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:440, background:'var(--bg-surface)', borderRadius:20, padding:'44px 40px 36px', boxShadow:'0 20px 60px rgba(30,35,64,0.13)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--grad-hero)', borderRadius:'20px 20px 0 0' }} />
        <div style={{ textAlign:'center', marginBottom:6, fontFamily:'var(--font-display)', fontSize:40, fontStyle:'italic', fontWeight:700, letterSpacing:'-1px', background:'var(--grad-hero)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', filter:'drop-shadow(0 0 16px rgba(255,215,0,0.3))' }}>BuzzNet.</div>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:19, fontWeight:800, fontFamily:'Poppins, sans-serif', marginBottom:3 }}>Create your account</div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>Join BuzzNet — it's free</div>
        </div>

        {/* Step 0 only: show Google button */}
        {step === 0 && (
          <>
            <button onClick={handleGoogle} disabled={gLoading} style={{ width:'100%', padding:'13px 16px', borderRadius:12, border:'1.5px solid var(--border)', background:'var(--bg-elevated)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, fontSize:14, fontWeight:700, fontFamily:'Poppins, sans-serif', color:'var(--text-primary)', marginBottom:16, transition:'all 0.18s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--yellow)'; e.currentTarget.style.background='var(--bg-base)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-elevated)'; }}>
              {gLoading ? <span style={{ width:18, height:18, border:'2px solid var(--text-muted)', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} /> : (
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.5 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.7 7.1 29.1 5 24 5 13 5 4 14 4 25s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.7 7.1 29.1 5 24 5 16.3 5 9.7 9 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 45c5 0 9.6-1.9 13-5l-6-5.2C29.3 36.6 26.8 37.5 24 37.5c-5.2 0-9.6-3.4-11.2-8.1l-6.5 5C9.6 41 16.3 45 24 45z"/>
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6 5.2C43 34.8 44 30.1 44 25c0-1.3-.1-2.6-.4-3.9z"/>
                </svg>
              )}
              Continue with Google
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'0 0 20px', color:'var(--text-muted)', fontSize:12 }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />or register with email<div style={{ flex:1, height:1, background:'var(--border)' }} />
            </div>
          </>
        )}

        {/* Step indicator */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:24, gap:0 }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, fontFamily:'Poppins, sans-serif', background: i<step ? 'var(--green)' : i===step ? 'var(--yellow)' : 'var(--bg-elevated)', color: i<=step ? '#1a1d2e' : 'var(--text-muted)', border: i===step ? '2px solid var(--yellow)' : i<step ? '2px solid var(--green)' : '2px solid var(--border)', transition:'all 0.3s', boxShadow: i===step ? '0 0 0 4px rgba(255,215,0,0.15)' : 'none' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div style={{ fontSize:10, marginTop:4, fontWeight:600, color: i===step ? 'var(--yellow)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{s}</div>
              </div>
              {i < STEPS.length-1 && <div style={{ flex:2, height:2, background: i<step ? 'var(--green)' : 'var(--border)', transition:'background 0.3s', marginBottom:18, marginTop:2 }} />}
            </React.Fragment>
          ))}
        </div>

        {error && <div style={{ background:'rgba(255,71,87,0.08)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:18, fontSize:13, color:'#FF4757', fontWeight:500 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {step === 0 && (
            <>
              <div style={{ position:'relative', marginBottom:18 }}>
                <label style={labelSt('email')}>Email address</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" required
                  onFocus={() => setFocused('email')} onBlur={() => setFocused('')} style={inputSt('email')} />
              </div>
              <div style={{ position:'relative', marginBottom:6 }}>
                <label style={labelSt('password')}>Password</label>
                <input name="password" type={showPass?'text':'password'} value={form.password} onChange={handleChange} autoComplete="new-password" required
                  onFocus={() => setFocused('password')} onBlur={() => setFocused('')} style={{ ...inputSt('password'), paddingRight:44 }} />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16, color:'var(--text-muted)', padding:4 }} tabIndex={-1}>{showPass?'🙈':'👁️'}</button>
              </div>
              {form.password && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                    {[1,2,3,4].map(i => <div key={i} style={{ flex:1, height:3, borderRadius:2, background: i<=passStrength ? strengthColor[passStrength] : 'var(--border)', transition:'background 0.2s' }} />)}
                  </div>
                  <div style={{ fontSize:11, color:strengthColor[passStrength], fontWeight:600 }}>{passStrength>0 && `Password strength: ${strengthLabel[passStrength]}`}</div>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div style={{ position:'relative', marginBottom:4 }}>
                <label style={labelSt('userId')}>User ID (permanent)</label>
                <input name="userId" value={form.userId} onChange={handleChange} autoComplete="off" required
                  onFocus={() => setFocused('userId')} onBlur={() => setFocused('')} style={inputSt('userId')} />
              </div>
              <div style={{ fontSize:11, color:userIdErr?'#FF4757':'var(--text-muted)', marginBottom:18, marginTop:4 }}>{userIdErr || 'Min 5 chars · letters, numbers & _ only · cannot be changed'}</div>
              <div style={{ position:'relative', marginBottom:18 }}>
                <label style={labelSt('username')}>Display name</label>
                <input name="username" value={form.username} onChange={handleChange} required
                  onFocus={() => setFocused('username')} onBlur={() => setFocused('')} style={inputSt('username')} />
              </div>
              <div style={{ position:'relative', marginBottom:18 }}>
                <label style={labelSt('bio')}>Bio (optional)</label>
                <textarea name="bio" value={form.bio} onChange={handleChange} maxLength={150}
                  onFocus={() => setFocused('bio')} onBlur={() => setFocused('')}
                  style={{ ...inputSt('bio'), resize:'none', minHeight:80, paddingTop: floated('bio')?22:17 }} />
                <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'right', marginTop:2 }}>{form.bio.length}/150</div>
              </div>
            </>
          )}

          {step === 2 && (
            <div style={{ padding:'8px 0' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:16, fontFamily:'Poppins, sans-serif' }}>Choose your privacy</div>
              {[{val:false,icon:'🌍',title:'Public',desc:'Anyone can see your posts and profile.'},{val:true,icon:'🔒',title:'Private',desc:'Only approved followers can see your posts.'}].map(opt => (
                <div key={String(opt.val)} onClick={() => setForm(p => ({ ...p, isPrivate:opt.val }))}
                  style={{ display:'flex', gap:14, padding:'16px 18px', borderRadius:14, marginBottom:12, border:`2px solid ${form.isPrivate===opt.val?'var(--yellow)':'var(--border)'}`, background: form.isPrivate===opt.val?'rgba(255,215,0,0.05)':'var(--bg-elevated)', cursor:'pointer', transition:'all 0.18s' }}>
                  <div style={{ fontSize:26, flexShrink:0 }}>{opt.icon}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, fontFamily:'Poppins, sans-serif', marginBottom:3 }}>
                      {opt.title}
                      {form.isPrivate===opt.val && <span style={{ marginLeft:8, fontSize:11, background:'var(--yellow)', color:'#1a1d2e', borderRadius:20, padding:'1px 8px', fontWeight:800 }}>Selected</span>}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{opt.desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4, textAlign:'center' }}>You can change this anytime in profile settings.</div>
            </div>
          )}

          <button type="submit" disabled={loading||(step===1&&!!userIdErr)} style={{ width:'100%', padding:'14px', marginTop:12, background:loading?'rgba(255,215,0,0.4)':'var(--grad-yellow)', color:'#1a1d2e', border:'none', borderRadius:12, fontSize:15, fontWeight:800, fontFamily:'Poppins, sans-serif', cursor:(loading||(step===1&&!!userIdErr))?'not-allowed':'pointer', boxShadow:loading?'none':'0 4px 18px rgba(255,215,0,0.35)', transition:'all 0.2s' }}>
            {loading ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span style={{ width:16, height:16, border:'2px solid #1a1d2e', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />{step<2?'Checking…':'Sending code…'}</span> : step<2 ? 'Continue →' : 'Send Verification Code'}
            </button>

          {step > 0 && (
            <button type="button" onClick={() => { setStep(s => s-1); setError(''); }} style={{ width:'100%', padding:'11px', marginTop:8, background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-muted)', fontFamily:'Poppins, sans-serif' }}>← Back</button>
          )}
        </form>

        <div style={{ textAlign:'center', fontSize:14, color:'var(--text-secondary)', marginTop:20 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color:'var(--yellow)', fontWeight:800, textDecoration:'none' }}>Sign in</Link>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}