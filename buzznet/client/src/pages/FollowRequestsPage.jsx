import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { Avatar, LoadingCenter, toast } from '../components/ui';

export default function FollowRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(null);

  useEffect(() => {
    userAPI.getFollowRequests()
      .then(r => setRequests(r.data.requests || []))
      .catch(() => toast.error('Failed to load requests'))
      .finally(() => setLoading(false));
  }, []);

  const handle = async (requestId, action, senderName) => {
    setActing(requestId);
    try {
      if (action === 'accept') {
        await userAPI.acceptFollowRequest(requestId);
        toast.success(`${senderName} is now following you`);
      } else {
        await userAPI.rejectFollowRequest(requestId);
        toast.info('Request rejected');
      }
      setRequests(prev => prev.filter(r => r._id !== requestId));
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setActing(null); }
  };

  return (
   <div style={{ width: '100%', padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', padding: 6, borderRadius: 8,
          display: 'flex', alignItems: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Follow Requests</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            People who want to follow your private account
          </p>
        </div>
      </div>

      {loading ? <LoadingCenter /> : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>👥</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>No pending requests</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {requests.map(req => (
            <div key={req._id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 12,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              <div style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => navigate(`/profile/${req.senderId._id}`)}>
                <Avatar src={req.senderId.profilePicture} username={req.senderId.username} size={48} />
              </div>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${req.senderId._id}`)}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{req.senderId.username}</div>
                <div style={{ fontSize: 12, color: 'var(--yellow)' }}>@{req.senderId.userId || req.senderId.username}</div>
                {req.senderId.bio && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {req.senderId.bio}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button disabled={acting === req._id}
                  onClick={() => handle(req._id, 'accept', req.senderId.username)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: 'none',
                    background: 'var(--yellow)', color: '#fff',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    opacity: acting === req._id ? 0.6 : 1,
                  }}>
                  {acting === req._id ? '…' : 'Confirm'}
                </button>
                <button disabled={acting === req._id}
                  onClick={() => handle(req._id, 'reject', req.senderId.username)}
                  style={{
                    padding: '7px 16px', borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    opacity: acting === req._id ? 0.6 : 1,
                  }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}