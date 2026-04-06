import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { Avatar, Icons, toast } from '../components/ui';

export default function SearchPage() {
  const navigate          = useNavigate();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef       = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await userAPI.search(query.trim());
        setUsers(res.data.users || []);
      } catch (e) {
        toast.error('Search failed');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto', padding: '24px 16px' }}>
      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: '10px 16px', marginBottom: 24,
      }}>
        <Icons.Search />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or @userid…"
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontSize: 15, color: 'var(--text-primary)',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>
            ×
          </button>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
          Searching…
        </div>
      )}

      {!loading && query && users.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
          No users found for "<strong>{query}</strong>"
        </div>
      )}

      {!loading && !query && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
          Search for people on BuzzNet
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {users.map(u => (
          <div
            key={u._id}
            onClick={() => navigate(`/profile/${u._id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <Avatar src={u.profilePicture} username={u.username} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{u.username}</div>
              <div style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 500 }}>
                @{u.userId || u.username}
              </div>
              {u.bio && (
                <div style={{
                  fontSize: 13, color: 'var(--text-muted)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {u.bio}
                </div>
              )}
            </div>
            {u.isPrivate && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <Icons.Lock />
              </span>
            )}
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {u.followers?.length || 0} followers
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}