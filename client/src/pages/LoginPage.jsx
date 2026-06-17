import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const USER_ID_REGEX    = /^[a-zA-Z0-9_]+$/;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  // ── Normal login ─────────────────────────────────────────────────────────────
  const [form, setForm]         = useState({ email: '', password: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const googleBtnRef            = useRef(null);

  // ── Google → full profile setup screen ──────────────────────────────────────
  const [googlePending, setGooglePending] = useState(null);
  const [setup, setSetup] = useState({ userId: '', username: '', bio: '', isPrivate: false });
  const [userIdErr, setUserIdErr]       = useState('');
  const [usernameErr, setUsernameErr]   = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [avatarFile, setAvatarFile]     = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const fileRef = useRef(null);

  // ── needs_password screen ────────────────────────────────────────────────────
  const [needsPassword, setNeedsPassword]   = useState(false);
  const [pendingEmail, setPendingEmail]     = useState('');
  const [newPass, setNewPass]               = useState('');
  const [confirmPass, setConfirmPass]       = useState('');
  const [setPassLoading, setSetPassLoading] = useState(false);

  // ── Render Google button after script loads ──────────────────────────────────
  // Using renderButton instead of prompt() so it ALWAYS works,
  // even after the user dismissed it once.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
        cancel_on_tap_outside: false,
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: googleBtnRef.current.offsetWidth || 320,
        });
      }
    };

    // Script might already be loaded
    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      // Wait for script to load
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    }
  }, []); // eslint-disable-line

  const handleGoogleCallback = async (response) => {
    setGLoading(true); setError('');
    try {
      const res = await authAPI.googleAuth({ idToken: response.credential });
      if (res.data.needs_user_id) {
        setGooglePending({
          googleId: res.data.googleId,
          email: res.data.email,
          suggestedName: res.data.suggestedName || '',
          picture: res.data.picture || '',
        });
        setSetup(s => ({ ...s, username: res.data.suggestedName || '' }));
        setAvatarPreview(res.data.picture || '');
        setGLoading(false);
        return;
      }
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Google sign-in failed. Please try again.');
    } finally { setGLoading(false); }
  };

  // ── Normal login ─────────────────────────────────────────────────────────────
  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await authAPI.login(form);
      if (res.data.needs_password) {
        setPendingEmail(res.data.email || form.email);
        setNeedsPassword(true);
        return;
      }
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Setup validators ─────────────────────────────────────────────────────────
  const validateUserId = (val) => {
    if (!val)                     { setUserIdErr('User ID is required.');               return false; }
    if (val.length < 5)           { setUserIdErr('Min 5 characters.');                  return false; }
    if (!USER_ID_REGEX.test(val)) { setUserIdErr('Only letters, numbers & _ allowed.'); return false; }
    setUserIdErr(''); return true;
  };
  const validateUsername = (val) => {
    if (!val || !val.trim()) { setUsernameErr('Display name is required.'); return false; }
    setUsernameErr(''); return true;
  };
  const handleSetupChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSetup(s => ({ ...s, [e.target.name]: val }));
    if (e.target.name === 'userId'   && userIdErr)   validateUserId(val);
    if (e.target.name === 'username' && usernameErr) validateUsername(val);
  };
  const handleAvatarFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  // ── Submit Google setup ──────────────────────────────────────────────────────
  const handleGoogleSetup = async (e) => {
    e.preventDefault();
    if (!validateUserId(setup.userId))    return;
    if (!validateUsername(setup.username)) return;
    setSetupLoading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('googleId',  googlePending.googleId);
      fd.append('email',     googlePending.email);
      fd.append('picture',   googlePending.picture);
      fd.append('userId',    setup.userId.trim());
      fd.append('username',  setup.username.trim());
      fd.append('bio',       setup.bio);
      fd.append('isPrivate', setup.isPrivate);
      if (avatarFile) fd.append('profilePicture', avatarFile);
      const res = await authAPI.googleSetup(fd);
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Setup failed. Please try again.');
    } finally { setSetupLoading(false); }
  };

  const resetSetup = () => {
    setGooglePending(null);
    setSetup({ userId: '', username: '', bio: '', isPrivate: false });
    setUserIdErr(''); setUsernameErr(''); setError('');
    setAvatarFile(null); setAvatarPreview('');
  };

  // ── Set password screen ──────────────────────────────────────────────────────
  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) return setError('Password must be at least 6 characters.');
    if (newPass !== confirmPass) return setError('Passwords do not match.');
    setSetPassLoading(true); setError('');
    try {
      const res = await authAPI.setPassword({ email: pendingEmail, password: newPass });
      login(res.data.token, res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set password. Please try again.');
    } finally { setSetPassLoading(false); }
  };

  // ── Google Full Setup Screen ─────────────────────────────────────────────────
  if (googlePending) return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="auth-logo">BuzzNet.</div>
        <div className="auth-title">Create your profile</div>
        <div className="auth-sub">
          Signed in as <strong>{googlePending.email}</strong>.<br />
          Fill in your details to finish setting up your BuzzNet account.
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleGoogleSetup}>
          {/* Profile picture */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar"
                  style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
                    border: '3px solid var(--accent, #3D9BF7)' }} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: '50%',
                  background: 'var(--surface-2, #1a1a1a)',
                  border: '3px dashed var(--border, #333)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>👤</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, right: 0,
                background: 'var(--accent, #3D9BF7)', borderRadius: '50%',
                width: 26, height: 26, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 15, color: '#fff',
                border: '2px solid var(--bg-card, #111)' }}>+</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
            {avatarFile ? avatarFile.name : 'Click to upload a profile photo (optional)'}
          </div>

          {/* User ID */}
          <div className="form-group">
            <label className="form-label">
              USER ID <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'none', fontWeight: 400 }}>(PERMANENT)</span>
            </label>
            <input className={`form-input${userIdErr ? ' input-error' : ''}`}
              name="userId" value={setup.userId} onChange={handleSetupChange}
              placeholder="e.g. cool_user42" autoComplete="off" required />
            <div style={{ fontSize: 11, color: userIdErr ? 'var(--danger,#e74c3c)' : 'var(--text-muted)', marginTop: 4 }}>
              {userIdErr || 'Min 5 chars · letters, numbers & _ only · cannot be changed later'}
            </div>
          </div>

          {/* Display Name */}
          <div className="form-group">
            <label className="form-label">DISPLAY NAME</label>
            <input className={`form-input${usernameErr ? ' input-error' : ''}`}
              name="username" value={setup.username} onChange={handleSetupChange}
              placeholder="Your name shown to others" required />
            {usernameErr && <div style={{ fontSize: 11, color: 'var(--danger,#e74c3c)', marginTop: 4 }}>{usernameErr}</div>}
          </div>

          {/* Bio */}
          <div className="form-group">
            <label className="form-label">
              BIO <span style={{ color: 'var(--text-muted)', textTransform: 'none', fontWeight: 400 }}>(OPTIONAL)</span>
            </label>
            <textarea className="form-input form-textarea"
              name="bio" value={setup.bio} onChange={handleSetupChange}
              placeholder="Tell people about yourself…" maxLength={150} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 3 }}>
              {setup.bio.length}/150
            </div>
          </div>

          {/* Privacy */}
          <div className="form-group">
            <label className="form-label">ACCOUNT PRIVACY</label>
            {[
              { val: false, icon: '🌍', title: 'Public',  desc: 'Anyone can see your posts and follow you.' },
              { val: true,  icon: '🔒', title: 'Private', desc: 'Only approved followers can see your posts.' },
            ].map(opt => (
              <div key={String(opt.val)}
                onClick={() => setSetup(s => ({ ...s, isPrivate: opt.val }))}
                style={{
                  display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                  marginBottom: 8, cursor: 'pointer',
                  border: `2px solid ${setup.isPrivate === opt.val ? 'var(--accent,#3D9BF7)' : 'var(--border,#2a2a2a)'}`,
                  background: setup.isPrivate === opt.val ? 'rgba(61,155,247,0.07)' : 'var(--surface-2,#1a1a1a)',
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 20 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {opt.title}
                    {setup.isPrivate === opt.val && (
                      <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--accent,#3D9BF7)',
                        color: '#fff', borderRadius: 20, padding: '1px 8px', fontWeight: 800 }}>Selected</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="btn btn-primary btn-full"
            style={{ marginTop: 4 }} disabled={setupLoading || !!userIdErr || !!usernameErr}>
            {setupLoading ? 'Creating account…' : 'Finish & Sign In 🎉'}
          </button>
        </form>

        <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={resetSetup}>
          ← Back
        </button>
      </div>
    </div>
  );

  // ── Set Password Screen ──────────────────────────────────────────────────────
  if (needsPassword) return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">BuzzNet.</div>
        <div className="auth-title">Set a Password</div>
        <div className="auth-sub">
          Your account <strong>{pendingEmail}</strong> was created with Google.
          Set a password to also enable email sign-in.
        </div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSetPassword}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="form-input" type="password" value={newPass}
              onChange={e => setNewPass(e.target.value)} placeholder="Min 6 characters" required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="form-input" type="password" value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)} placeholder="Re-enter password" required />
          </div>
          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 8 }} disabled={setPassLoading}>
            {setPassLoading ? 'Setting password…' : 'Set Password & Sign In'}
          </button>
        </form>
        <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }}
          onClick={() => { setNeedsPassword(false); setError(''); setNewPass(''); setConfirmPass(''); }}>
          ← Back to Sign In
        </button>
      </div>
    </div>
  );

  // ── Normal Login Screen ──────────────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">BuzzNet.</div>
        <div className="auth-title">Welcome back</div>
        <div className="auth-sub">Sign in to your account to continue.</div>

        {error && <div className="error-msg">{error}</div>}

        {/* Google sign-in button — rendered by Google SDK so it always works */}
        <div style={{ marginBottom: 16 }}>
          {gLoading ? (
            <div className="btn btn-secondary btn-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none', opacity: 0.7 }}>
              <span style={{ width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              Signing in…
            </div>
          ) : (
            <div ref={googleBtnRef} style={{ width: '100%', minHeight: 44 }} />
          )}
        </div>

        <div className="auth-divider">or sign in with email</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input id="login-email" className="form-input" type="email" name="email"
              placeholder="you@example.com" value={form.email} onChange={handleChange}
              autoComplete="email" required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input id="login-password" className="form-input" type="password" name="password"
              placeholder="••••••••" value={form.password} onChange={handleChange}
              autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}