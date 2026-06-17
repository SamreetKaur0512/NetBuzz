import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../services/api';
import { Avatar, LoadingCenter } from '../components/ui';

const typeLabel = {
  newFollower:     { emoji: '👤', text: 'started following you' },
  followAccepted:  { emoji: '🎉', text: 'accepted your follow request' },
  messageAccepted: { emoji: '💬', text: 'accepted your message request' },
};

export default function NotificationsPage() {
  const [notifs, setNotifs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate              = useNavigate();

  useEffect(() => {
    notificationAPI.getAll()
      .then(r => setNotifs(r.data.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Mark all as read when page opens
    notificationAPI.markAllRead().catch(() => {});
  }, []);

  const handleDelete = async (e, notifId) => {
    e.stopPropagation(); // prevent navigating to profile
    try {
      await notificationAPI.deleteOne(notifId);
      setNotifs(prev => prev.filter(n => n._id !== notifId));
    } catch (err) {
      console.error('Failed to delete notification');
    }
  };

  if (loading) return <LoadingCenter />;

  return (
    <div style={{ width: '100%', padding: '28px 40px' }}>
      <div style={{
        fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 900,
        marginBottom: 24, background: 'var(--grad-hero)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>
        Notifications
      </div>

      {notifs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div>No notifications yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifs.map(n => {
            const info = typeLabel[n.type] || { emoji: '🔔', text: 'notification' };
            return (
              <div key={n._id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 14,
                  background: n.read ? 'var(--bg-surface)' : 'rgba(255,215,0,0.07)',
                  border: `1.5px solid ${n.read ? 'var(--border)' : 'rgba(255,215,0,0.3)'}`,
                  cursor: 'pointer', transition: 'all 0.2s',
                  position: 'relative',
                }}
                onClick={() => navigate(`/profile/${n.fromUserId}`)}>

                {/* Avatar with emoji badge */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar src={n.fromPicture} username={n.fromUsername} size={46} />
                  <span style={{
                    position: 'absolute', bottom: -2, right: -2,
                    fontSize: 16, lineHeight: 1,
                  }}>{info.emoji}</span>
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
                  }}>
                    {n.fromUsername}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {info.text}
                  </div>
                </div>

                {/* Date */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(n.createdAt).toLocaleDateString()}
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--yellow)', flexShrink: 0,
                  }} />
                )}

                {/* ✅ Delete button */}
                <button
                  onClick={(e) => handleDelete(e, n._id)}
                  style={{
                    flexShrink: 0, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)',
                    fontSize: 18, fontWeight: 700, lineHeight: 1,
                    padding: '4px 6px', borderRadius: 6,
                    transition: 'color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--red)';
                    e.currentTarget.style.background = 'rgba(255,71,87,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'none';
                  }}
                  title="Remove notification">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}