import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { Avatar, LoadingCenter, toast } from '../components/ui';

export default function BlockedUsersPage() {
  const navigate              = useNavigate();
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState(null);

  useEffect(() => {
    userAPI.getBlockedUsers()
      .then(r => setBlocked(r.data.blockedUsers || []))
      .catch(() => toast.error('Failed to load blocked users'))
      .finally(() => setLoading(false));
  }, []);

  const handleUnblock = async (u) => {
    if (!window.confirm(`Unblock ${u.username}? They will be able to see your profile and message you again.`)) return;
    setUnblocking(u._id);
    try {
      await userAPI.block(u._id); // toggles unblock
      setBlocked(prev => prev.filter(b => b._id !== u._id));
      toast.success(`${u.username} unblocked.`);
    } catch (e) {
      toast.error('Failed to unblock.');
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <div style={{ width: '100%', padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-primary)', padding: 6, borderRadius: 8,
            display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Blocked Accounts</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Blocked users can't see your profile, posts, or message you.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingCenter />
      ) : blocked.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🚫</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>No blocked accounts</div>
          <div style={{ fontSize: 14 }}>People you block will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {blocked.map(u => (
            <div key={u._id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', borderRadius: 12,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {/* Avatar — clicking goes to their profile */}
              <div
                style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => navigate(`/profile/${u._id}`)}
              >
                <Avatar src={u.profilePicture} username={u.username} size={48} />
              </div>

              {/* Name */}
              <div
                style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                onClick={() => navigate(`/profile/${u._id}`)}
              >
                <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.username}
                </div>
                {u.userId && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {u.userId}
                  </div>
                )}
              </div>

              {/* Unblock button - red, solid */}
              <button
                onClick={() => handleUnblock(u)}
                disabled={unblocking === u._id}
                style={{
                  flexShrink: 0,
                  padding: '8px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: unblocking === u._id ? 'rgba(255,71,87,0.4)' : '#FF4757',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 13,
                  fontFamily: 'Poppins, sans-serif',
                  cursor: unblocking === u._id ? 'not-allowed' : 'pointer',
                  opacity: unblocking === u._id ? 0.6 : 1,
                  transition: 'all 0.15s',
                  boxShadow: unblocking === u._id ? 'none' : '0 3px 10px rgba(255,71,87,0.35)',
                  letterSpacing: '0.2px',
                }}
                onMouseEnter={e => {
                  if (unblocking !== u._id) {
                    e.currentTarget.style.background = '#e03344';
                    e.currentTarget.style.boxShadow = '0 5px 16px rgba(255,71,87,0.5)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#FF4757';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(255,71,87,0.35)';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                {unblocking === u._id ? 'Unblocking…' : '🚫 Unblock'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}