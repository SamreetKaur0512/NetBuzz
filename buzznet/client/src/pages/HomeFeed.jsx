import React, { useState, useEffect, useCallback, useRef } from 'react';
import { postAPI } from '../services/api';
import PostCard from '../components/feed/PostCard';
import { LoadingCenter, Spinner } from '../components/ui';

export default function HomeFeed() {
  const [tab, setTab] = useState('explore');

  // Explore state
  const [explorePosts,   setExplorePosts]   = useState([]);
  const [explorePage,    setExplorePage]    = useState(1);
  const [exploreMore,    setExploreMore]    = useState(true);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreInit,    setExploreInit]    = useState(true);

  // Following state
  const [feedPosts,   setFeedPosts]   = useState([]);
  const [feedPage,    setFeedPage]    = useState(1);
  const [feedMore,    setFeedMore]    = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedInit,    setFeedInit]    = useState(true);

  const exploreLoaderRef  = useRef(null);
  const feedLoaderRef     = useRef(null);

  // ── Fetch explore ──────────────────────────────────────────────────────────
  const fetchExplore = useCallback(async (pg) => {
    if (exploreLoading) return;
    setExploreLoading(true);
    try {
      const res = await postAPI.getExplore(pg);
      const newPosts = res.data.posts || [];
      setExplorePosts(prev => pg === 1 ? newPosts : [...prev, ...newPosts]);
      setExploreMore(newPosts.length >= 12);
    } catch (e) { console.error('Explore error:', e); }
    finally { setExploreLoading(false); setExploreInit(false); }
  }, []); // eslint-disable-line

  // ── Fetch following feed ───────────────────────────────────────────────────
  const fetchFeed = useCallback(async (pg) => {
    if (feedLoading) return;
    setFeedLoading(true);
    try {
      const res = await postAPI.getFeed(pg);
      const { posts: newPosts, pagination } = res.data;
      setFeedPosts(prev => pg === 1 ? newPosts : [...prev, ...newPosts]);
      setFeedMore(pagination?.hasNext || false);
    } catch (e) { console.error('Feed error:', e); }
    finally { setFeedLoading(false); setFeedInit(false); }
  }, []); // eslint-disable-line

  // Load explore on mount, following lazily on first tab switch
  useEffect(() => { fetchExplore(1); }, []); // eslint-disable-line
  useEffect(() => {
    if (tab === 'following' && feedInit) fetchFeed(1);
  }, [tab]); // eslint-disable-line

  // ── Infinite scroll for explore ────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'explore') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && exploreMore && !exploreLoading) {
          const next = explorePage + 1;
          setExplorePage(next);
          fetchExplore(next);
        }
      }, { threshold: 0.1 }
    );
    if (exploreLoaderRef.current) observer.observe(exploreLoaderRef.current);
    return () => observer.disconnect();
  }, [tab, exploreMore, exploreLoading, explorePage, fetchExplore]);

  // ── Infinite scroll for feed ───────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'following') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && feedMore && !feedLoading) {
          const next = feedPage + 1;
          setFeedPage(next);
          fetchFeed(next);
        }
      }, { threshold: 0.1 }
    );
    if (feedLoaderRef.current) observer.observe(feedLoaderRef.current);
    return () => observer.disconnect();
  }, [tab, feedMore, feedLoading, feedPage, fetchFeed]);

  const handleUpdate = (setter) => (postId, updates) => {
    setter(prev => prev.map(p => p._id === postId ? { ...p, ...updates } : p));
  };

  return (
    <div className="feed-page">
      {/* ── Tab bar ── */}
      <div style={{
  display: 'flex', borderBottom: '2px solid var(--border)',
  marginBottom: 20, position: 'sticky', top: 0,
  background: 'var(--bg-base)', zIndex: 50,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}}>
        {[
          { key: 'explore',   label: 'Explore' },
          { key: 'following', label: 'Posts of people you follow' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '12px 8px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 14, fontWeight: tab === key ? 700 : 500,
            color: tab === key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s', marginBottom: -1,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Explore tab ── */}
      {tab === 'explore' && (
        <>
          {exploreInit ? <LoadingCenter /> : (
            <>
              {explorePosts.length === 0 && !exploreLoading && (
                <div className="empty-state">
                  <div className="empty-state-icon">🌍</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nothing to explore yet</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Be the first to post!</div>
                </div>
              )}
              {explorePosts.map(post => (
                <PostCard key={post._id} post={post} onUpdate={handleUpdate(setExplorePosts)} />
              ))}
              <div ref={exploreLoaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {exploreLoading && <Spinner size={24} />}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Following feed tab ── */}
      {tab === 'following' && (
        <>
          {feedInit ? <LoadingCenter /> : (
            <>
              {feedPosts.length === 0 && !feedLoading && (
                <div className="empty-state">
                  <div className="empty-state-icon">📸</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No posts yet</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    Follow people to see their posts here.
                  </div>
                </div>
              )}
              {feedPosts.map(post => (
                <PostCard key={post._id} post={post} onUpdate={handleUpdate(setFeedPosts)} />
              ))}
              <div ref={feedLoaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {feedLoading && <Spinner size={24} />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}