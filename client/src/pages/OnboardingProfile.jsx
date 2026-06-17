import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/ui';

/**
 * OnboardingProfile — shown after first-time registration/Google sign-in
 * Lets the user set their display name, bio, and profile picture.
 * Accessible at route: /onboarding/profile
 */
export default function OnboardingProfile() {
  const { user, updateUser } = useAuth();
  const navigate             = useNavigate();
  const fileRef              = useRef(null);

  const [username, setUsername]   = useState(user?.username || '');
  const [bio, setBio]             = useState(user?.bio || '');
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return setError('Display name is required.');
    setError(''); setLoading(true);
    try {
      const fd = new FormData();
      fd.append('username', username.trim());
      fd.append('bio', bio);
      if (file) fd.append('profilePicture', file);
      const res = await userAPI.update(user._id, fd);
      updateUser(res.data.user);
      navigate('/onboarding/privacy', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile. Please try again.');
    } finally { setLoading(false); }
  };

  const handleSkip = () => navigate('/onboarding/privacy', { replace: true });

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="auth-logo">BuzzNet.</div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent, #3D9BF7)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700 }}>1</div>
          <div style={{ flex: 1, height: 2, background: 'var(--border, #2a2a2a)', maxWidth: 60 }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border, #2a2a2a)',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700 }}>2</div>
        </div>

        <div className="auth-title">Set up your profile</div>
        <div className="auth-sub">This is how others will see you on BuzzNet.</div>

        {error && <div className="error-msg">{error}</div>}

        {/* Avatar picker */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}>
            <Avatar src={preview || user?.profilePicture} username={username || 'U'} size={80} ring />
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              background: 'var(--accent, #3D9BF7)', borderRadius: '50%',
              width: 26, height: 26, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 16, color: '#fff',
              border: '2px solid var(--bg-card, #111)',
            }}>+</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, marginTop: -12 }}>
          Click to add a profile picture
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">DISPLAY NAME</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Your name (shown to others)"
              maxLength={50}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              BIO <span style={{ color: 'var(--text-muted)', textTransform: 'none', fontWeight: 400 }}>(OPTIONAL)</span>
            </label>
            <textarea
              className="form-input form-textarea"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell people a bit about yourself…"
              maxLength={150}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 3 }}>
              {bio.length}/150
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? 'Saving…' : 'Continue →'}
          </button>
        </form>

        <button
          onClick={handleSkip}
          style={{ width: '100%', marginTop: 10, background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '8px 0' }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}