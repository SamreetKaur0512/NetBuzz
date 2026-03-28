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
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [gLoading, setGLoading]   = useState(false);
  const [showPass, setShowPass]   = useState(false);
  const [focused, setFocused]     = useState('');
  const [userIdErr, setUserIdErr] = useState('');
  const [passStrength, setPassStrength] = useState(0);
  const [countdown, setCountdown] = useState(0);

  // ── Google sign-in pending setup (inline, no navigate needed) ───────────────
  const [googlePending,    setGooglePending]    = useState(null);
  const [gSetup,           setGSetup]           = useState({ userId: '', username: '', bio: '', isPrivate: false });
  const [gUserIdErr,       setGUserIdErr]       = useState('');
  const [gUsernameErr,     setGUsernameErr]     = useState('');
  const [gSetupLoading,    setGSetupLoading]    = useState(false);
  const googleBtnRef = useRef(null);

  // ── Profile photo (picked at Step 1, uploaded at OTP verify) ─────────────
  const [avatarFile, setAvatarFile]       = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const fileRef    = useRef(null);
  const gFileRef   = useRef(null); // separate ref for google setup avatar
  const [gAvatarFile, setGAvatarFile]       = useState(null);
  const [gAvatarPreview, setGAvatarPreview] = useState('');
  const cardRef = useRef(null);

  const scrollCardTop = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [e.target.name]: val }));
    if (e.target.name === 'userId')   validateUserId(val);
    if (e.target.name === 'password') calcStrength(val);
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
    // Do NOT clear existing errors here — let them persist until fixed
    if (step === 0) {
      if (!form.email || !form.password) { setError('Email and password are required.'); scrollCardTop(); return false; }
      if (form.password.length < 6) { setError('Password must be at least 6 characters.'); scrollCardTop(); return false; }
    }
    if (step === 1) {
      if (userIdErr) { setError(userIdErr); scrollCardTop(); return false; }
      if (!form.userId || !form.username) { setError('User ID and display name are required.'); scrollCardTop(); return false; }
    }
    // Only clear error when validation passes
    setError('');
    return true;
  };

  const nextStep = () => { if (validateStep()) setStep(s => s + 1); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 2) { nextStep(); return; }
    // Last step — send OTP
    setLoading(true);
    try {
      await authAPI.sendOtp(form);
      setPhase('otp');
      startCountdown();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send code.');
      scrollCardTop();
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

  // Send OTP + profile picture together as FormData
  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Enter the complete 6-digit code.'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('email', form.email);
      fd.append('otp', code);
      if (avatarFile) fd.append('profilePicture', avatarFile);
      const res = await authAPI.verifyOtp(fd);
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code.');
      scrollCardTop();
      setOtp(['','','','','','']);
      otpRefs[0].current?.focus();
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await authAPI.resendOtp({ email: form.email });
      setOtp(['','','','','','']);
      startCountdown();
    } catch (err) { setError('Failed to resend. Please try again.'); }
  };

  // Render / re-render the Google button — works even after the user cancelled
  const initGoogleBtn = React.useCallback(() => {
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
    try { window.google.accounts.id.cancel(); } catch (_) {}
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      cancel_on_tap_outside: false,
      callback: async (response) => {
        setGLoading(true); setError('');
        try {
          const res = await authAPI.googleAuth({ idToken: response.credential });
          if (res.data.needs_user_id) {
            // Show setup screen INLINE — no navigate, stays on RegisterPage
            setGooglePending({ googleId: res.data.googleId, email: res.data.email, picture: res.data.picture || '' });
            setGSetup(s => ({ ...s, username: res.data.suggestedName || '' }));
            setGAvatarPreview(res.data.picture || '');
            return;
          }
          login(res.data.token, res.data.user);
          navigate('/', { replace: true });
        } catch (err) {
          setError(err.response?.data?.message || 'Google sign-in failed.');
        } finally { setGLoading(false); }
      },
    });
    if (googleBtnRef.current) {
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: 'outline', size: 'large',
        text: 'continue_with', shape: 'rectangular',
        width: googleBtnRef.current.offsetWidth || 320,
      });
    }
  }, [login, navigate]);

  // Load Google script once and init button on mount / when setup screen closes
  React.useEffect(() => {
    if (googlePending || phase === 'otp') return; // not on setup or OTP screen
    if (window.google?.accounts?.id) {
      initGoogleBtn();
    } else {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (!existing) {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = initGoogleBtn;
        document.head.appendChild(s);
      } else {
        const iv = setInterval(() => {
          if (window.google?.accounts?.id) { clearInterval(iv); initGoogleBtn(); }
        }, 100);
        return () => clearInterval(iv);
      }
    }
  }, [googlePending, phase, initGoogleBtn]);

  // Google setup handlers
  const validateGUserId = (val) => {
    if (!val) { setGUserIdErr('User ID is required.'); return false; }
    if (val.length < 5) { setGUserIdErr('Min 5 characters.'); return false; }
    if (!USER_ID_REGEX.test(val)) { setGUserIdErr('Only letters, numbers & _ allowed.'); return false; }
    setGUserIdErr(''); return true;
  };
  const validateGUsername = (val) => {
    if (!val || !val.trim()) { setGUsernameErr('Display name is required.'); return false; }
    setGUsernameErr(''); return true;
  };
  const handleGSetupChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setGSetup(s => ({ ...s, [e.target.name]: val }));
    if (e.target.name === 'userId'   && gUserIdErr)   validateGUserId(val);
    if (e.target.name === 'username' && gUsernameErr) validateGUsername(val);
  };
  const handleGAvatarFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    setGAvatarFile(f); setGAvatarPreview(URL.createObjectURL(f));
  };
  const handleGoogleSetupSubmit = async (e) => {
    e.preventDefault();
    if (!validateGUserId(gSetup.userId)) return;
    if (!validateGUsername(gSetup.username)) return;
    setGSetupLoading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('googleId',  googlePending.googleId);
      fd.append('email',     googlePending.email);
      fd.append('picture',   googlePending.picture);
      fd.append('userId',    gSetup.userId.trim());
      fd.append('username',  gSetup.username.trim());
      fd.append('bio',       gSetup.bio);
      fd.append('isPrivate', gSetup.isPrivate);
      if (gAvatarFile) fd.append('profilePicture', gAvatarFile);
      const res = await authAPI.googleSetup(fd);
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Setup failed. Please try again.');
      scrollCardTop();
    } finally { setGSetupLoading(false); }
  };

  const handleAvatarFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
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

  // ── Google Setup Screen (inline, shown when new Google user needs profile) ───
  if (googlePending) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:'24px 16px' }}>
      <div ref={cardRef} style={{ width:'100%', maxWidth:460, background:'var(--bg-surface)', borderRadius:20, padding:'44px 40px 36px', boxShadow:'0 20px 60px rgba(30,35,64,0.13)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--grad-hero)' }} />
        <div style={{ textAlign:'center', fontFamily:'var(--font-display)', fontSize:36, fontStyle:'italic', fontWeight:700, background:'var(--grad-hero)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', marginBottom:4 }}>BuzzNet.</div>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:'Poppins, sans-serif' }}>Create your profile</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>Signed in as <strong>{googlePending.email}</strong></div>
        </div>

        {error && <div style={{ background:'rgba(255,71,87,0.08)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#FF4757', fontWeight:500 }}>{error}</div>}

        <form onSubmit={handleGoogleSetupSubmit}>
          {/* Avatar */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:18 }}>
            <div style={{ position:'relative', cursor:'pointer' }} onClick={() => gFileRef.current?.click()}>
              {gAvatarPreview
                ? <img src={gAvatarPreview} alt="avatar" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--accent,#3D9BF7)' }} />
                : <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--bg-elevated)', border:'3px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>👤</div>
              }
              <div style={{ position:'absolute', bottom:0, right:0, background:'var(--accent,#3D9BF7)', borderRadius:'50%', width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#fff', border:'2px solid var(--bg-surface)' }}>+</div>
            </div>
            <input ref={gFileRef} type="file" accept="image/*" hidden onChange={handleGAvatarFile} />
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:5 }}>{gAvatarFile ? gAvatarFile.name : 'Profile photo (optional)'}</div>
          </div>

          {/* User ID */}
          <div className="form-group">
            <label className="form-label">USER ID <span style={{ color:'var(--text-muted)', fontSize:11, textTransform:'none', fontWeight:400 }}>(PERMANENT)</span></label>
            <input className={`form-input${gUserIdErr ? ' input-error' : ''}`} name="userId" value={gSetup.userId} onChange={handleGSetupChange} placeholder="e.g. cool_user42" autoComplete="off" required />
            <div style={{ fontSize:11, color: gUserIdErr ? 'var(--danger,#e74c3c)' : 'var(--text-muted)', marginTop:4 }}>{gUserIdErr || 'Min 5 chars · letters, numbers & _ only · cannot be changed'}</div>
          </div>

          {/* Display Name */}
          <div className="form-group">
            <label className="form-label">DISPLAY NAME</label>
            <input className={`form-input${gUsernameErr ? ' input-error' : ''}`} name="username" value={gSetup.username} onChange={handleGSetupChange} placeholder="Your name shown to others" required />
            {gUsernameErr && <div style={{ fontSize:11, color:'var(--danger,#e74c3c)', marginTop:4 }}>{gUsernameErr}</div>}
          </div>

          {/* Bio */}
          <div className="form-group">
            <label className="form-label">BIO <span style={{ color:'var(--text-muted)', textTransform:'none', fontWeight:400 }}>(OPTIONAL)</span></label>
            <textarea className="form-input form-textarea" name="bio" value={gSetup.bio} onChange={handleGSetupChange} placeholder="Tell people about yourself…" maxLength={150} />
            <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'right', marginTop:3 }}>{gSetup.bio.length}/150</div>
          </div>

          {/* Privacy */}
          <div className="form-group">
            <label className="form-label">ACCOUNT PRIVACY</label>
            {[{val:false,icon:'🌍',title:'Public',desc:'Anyone can see your posts and follow you.'},{val:true,icon:'🔒',title:'Private',desc:'Only approved followers can see your posts.'}].map(opt => (
              <div key={String(opt.val)} onClick={() => setGSetup(s => ({ ...s, isPrivate: opt.val }))}
                style={{ display:'flex', gap:12, padding:'12px 14px', borderRadius:10, marginBottom:8, cursor:'pointer',
                  border:`2px solid ${gSetup.isPrivate===opt.val ? 'var(--accent,#3D9BF7)' : 'var(--border,#2a2a2a)'}`,
                  background: gSetup.isPrivate===opt.val ? '#f5fc6f' : '#9bfc74', transition:'all 0.15s' }}>
                <span style={{ fontSize:20 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary,#fff)' }}>
                    {opt.title}{gSetup.isPrivate===opt.val && <span style={{ marginLeft:8, fontSize:11, background:'var(--accent,#3D9BF7)', color:'#fff', borderRadius:20, padding:'1px 8px', fontWeight:800 }}>Selected</span>}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-muted,#aaa)' }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop:4 }} disabled={gSetupLoading || !!gUserIdErr || !!gUsernameErr}>
            {gSetupLoading ? 'Creating account…' : 'Finish & Sign In 🎉'}
          </button>
        </form>
        <button className="btn btn-secondary btn-full" style={{ marginTop:10 }}
          onClick={() => { setGooglePending(null); setGSetup({ userId:'', username:'', bio:'', isPrivate:false }); setGUserIdErr(''); setGUsernameErr(''); setError(''); setGAvatarFile(null); setGAvatarPreview(''); }}>
          ← Back
        </button>
      </div>
    </div>
  );

  // ── OTP Screen ───────────────────────────────────────────────────────────────
  if (phase === 'otp') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:'24px 16px' }}>
      <div ref={cardRef} style={{ width:'100%', maxWidth:420, background:'var(--bg-surface)', borderRadius:20, padding:'44px 40px 36px', boxShadow:'0 20px 60px rgba(30,35,64,0.13)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--grad-hero)' }} />
        <div style={{ textAlign:'center', marginBottom:8, fontFamily:'var(--font-display)', fontSize:40, fontStyle:'italic', fontWeight:700, background:'var(--grad-hero)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>BuzzNet.</div>

        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📧</div>
          <div style={{ fontSize:20, fontWeight:800, fontFamily:'Poppins, sans-serif', marginBottom:6 }}>Check your email</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.7 }}>
            We sent a 6-digit code to<br/>
            <strong style={{ color:'var(--yellow)' }}>{form.email}</strong>
          </div>
        </div>

        {/* Profile photo — pick or change before confirming */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:20 }}>
          <div style={{ position:'relative', display:'inline-block', cursor:'pointer' }}
            onClick={() => fileRef.current?.click()}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar"
                style={{ width:64, height:64, borderRadius:'50%', objectFit:'cover',
                  border:'3px solid var(--yellow)' }} />
            ) : (
              <div style={{ width:64, height:64, borderRadius:'50%',
                background:'var(--bg-elevated)', border:'3px dashed var(--border)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>👤</div>
            )}
            <div style={{ position:'absolute', bottom:0, right:0,
              background:'var(--yellow)', borderRadius:'50%',
              width:20, height:20, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:12, color:'#1a1d2e',
              border:'2px solid var(--bg-surface)' }}>+</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:5 }}>
            {avatarFile ? avatarFile.name : 'Add a profile photo (optional)'}
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

      <div ref={cardRef} style={{ width:'100%', maxWidth:440, background:'var(--bg-surface)', borderRadius:20, padding:'44px 40px 36px', boxShadow:'0 20px 60px rgba(30,35,64,0.13)', border:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--grad-hero)', borderRadius:'20px 20px 0 0' }} />
        <div style={{ textAlign:'center', marginBottom:6, fontFamily:'var(--font-display)', fontSize:40, fontStyle:'italic', fontWeight:700, letterSpacing:'-1px', background:'var(--grad-hero)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', filter:'drop-shadow(0 0 16px rgba(255,215,0,0.3))' }}>BuzzNet.</div>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:19, fontWeight:800, fontFamily:'Poppins, sans-serif', marginBottom:3 }}>Create your account</div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>Join BuzzNet — it's free</div>
        </div>

        {/* Step 0 only: show Google button */}
        {step === 0 && (
          <>
            {/* Google button rendered by SDK — always works, even after cancel */}
            {gLoading ? (
              <div style={{ width:'100%', padding:'13px 16px', borderRadius:12, border:'1.5px solid var(--border)', background:'var(--bg-elevated)', display:'flex', alignItems:'center', justifyContent:'center', gap:10, fontSize:14, fontWeight:700, color:'var(--text-muted)', marginBottom:16, opacity:0.7 }}>
                <span style={{ width:18, height:18, border:'2px solid var(--text-muted)', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />
                Signing in…
              </div>
            ) : (
              <div ref={googleBtnRef} style={{ width:'100%', minHeight:44, marginBottom:16 }} />
            )}
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
              {/* Profile photo picker */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:20 }}>
                <div style={{ position:'relative', display:'inline-block', cursor:'pointer' }}
                  onClick={() => fileRef.current?.click()}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="avatar"
                      style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover',
                        border:'3px solid var(--yellow)' }} />
                  ) : (
                    <div style={{ width:72, height:72, borderRadius:'50%',
                      background:'var(--bg-elevated)', border:'3px dashed var(--border)',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>👤</div>
                  )}
                  <div style={{ position:'absolute', bottom:0, right:0,
                    background:'var(--yellow)', borderRadius:'50%',
                    width:22, height:22, display:'flex', alignItems:'center',
                    justifyContent:'center', fontSize:13, color:'#1a1d2e',
                    border:'2px solid var(--bg-surface)' }}>+</div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:5, textAlign:'center' }}>
                  {avatarFile ? avatarFile.name : 'Profile photo (optional) — click to upload'}
                </div>
              </div>

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
                  style={{ display:'flex', gap:14, padding:'16px 18px', borderRadius:14, marginBottom:12, border:`2px solid ${form.isPrivate===opt.val?'var(--yellow)':'var(--border)'}`, background: form.isPrivate===opt.val?'rgba(255,215,0,0.12)':'var(--bg-elevated)', cursor:'pointer', transition:'all 0.18s' }}>
                  <div style={{ fontSize:26, flexShrink:0 }}>{opt.icon}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, fontFamily:'Poppins, sans-serif', marginBottom:3, color:'var(--text-primary, #fff)' }}>
                      {opt.title}
                      {form.isPrivate===opt.val && <span style={{ marginLeft:8, fontSize:11, background:'var(--yellow)', color:'#1a1d2e', borderRadius:20, padding:'1px 8px', fontWeight:800 }}>Selected</span>}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-muted, #aaa)', lineHeight:1.5 }}>{opt.desc}</div>
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