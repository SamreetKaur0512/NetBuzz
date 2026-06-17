import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * OnboardingPrivacy — step 2 of onboarding
 * Lets the user choose Public or Private account visibility.
 * Accessible at route: /onboarding/privacy
 */
export default function OnboardingPrivacy() {
  const { user, updateUser } = useAuth();
  const navigate             = useNavigate();

  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      const fd = new FormData();
      fd.append('isPrivate', isPrivate);
      // Keep existing username/bio untouched — only update privacy
      fd.append('username', user?.username || '');
      const res = await userAPI.update(user._id, fd);
      updateUser(res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save. Please try again.');
    } finally { setLoading(false); }
  };

  const handleSkip = () => navigate('/', { replace: true });

  const options = [
    {
      val: false,
      icon: '🌍',
      title: 'Public',
      desc: 'Anyone can see your posts and follow you. Great for sharing with the world.',
    },
    {
      val: true,
      icon: '🔒',
      title: 'Private',
      desc: 'Only approved followers can see your posts. You control who follows you.',
    },
  ];

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="auth-logo">BuzzNet.</div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%',
            background: 'var(--text-muted, #555)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700 }}>✓</div>
          <div style={{ flex: 1, height: 2, background: 'var(--accent, #3D9BF7)', maxWidth: 60 }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent, #3D9BF7)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700 }}>2</div>
        </div>

        <div className="auth-title">Choose your privacy</div>
        <div className="auth-sub">You can always change this later in your profile settings.</div>

        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0' }}>
          {options.map(opt => (
            <div
              key={String(opt.val)}
              onClick={() => setIsPrivate(opt.val)}
              style={{
                display: 'flex', gap: 14, padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${isPrivate === opt.val ? 'var(--accent, #3D9BF7)' : 'var(--border, #2a2a2a)'}`,
                background: isPrivate === opt.val ? 'rgba(61,155,247,0.07)' : 'var(--surface-2, #1a1a1a)',
                transition: 'all 0.18s',
              }}
            >
              <div style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>{opt.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {opt.title}
                  {isPrivate === opt.val && (
                    <span style={{ fontSize: 11, background: 'var(--accent, #3D9BF7)', color: '#fff',
                      borderRadius: 20, padding: '1px 8px', fontWeight: 800 }}>Selected</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={handleSubmit}
          disabled={loading}
          style={{ marginTop: 4 }}
        >
          {loading ? 'Saving…' : 'Finish Setup 🎉'}
        </button>

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