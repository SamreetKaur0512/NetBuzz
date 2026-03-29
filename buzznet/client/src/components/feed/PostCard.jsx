import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'timeago.js';
import { Avatar, Icons, toast } from '../ui';
import { postAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const SERVER = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').replace(/\/$/, '');

const getMediaUrl = (mediaUrl) => {
  if (!mediaUrl) return '';
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) return mediaUrl;
  const cleanPath = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
  return `${SERVER}${cleanPath}`;
};

const normalizeUser = (u) =>
  u && typeof u === 'object' && (u.username || u._id) ? u : null;

/* ─── Shared styles ──────────────────────────────────────────────────────── */
const S = {
  bubbleComment: {
    background: '#f0f2f8', border: '1px solid #dde2f0',
    borderRadius: '0 12px 12px 12px', padding: '8px 13px',
    display: 'inline-block', maxWidth: '100%', wordBreak: 'break-word',
  },
  bubbleReply: {
    background: '#f4f6fb', border: '1px solid #e4e8f4',
    borderRadius: '0 10px 10px 10px', padding: '6px 11px',
    display: 'inline-block', maxWidth: '100%', wordBreak: 'break-word',
  },
  username:   { fontWeight: 800, fontSize: 13, cursor: 'pointer', marginRight: 6, color: '#1a1d2e', fontFamily: 'Poppins, sans-serif' },
  mention:    { color: '#3D9BF7', fontSize: 13, fontWeight: 700, marginRight: 4 },
  bodyText:   { fontSize: 13, color: '#2a2d3e', lineHeight: 1.5 },
  metaRow:    { display: 'flex', gap: 14, marginTop: 4, paddingLeft: 2, alignItems: 'center' },
  metaTime:   { fontSize: 11, color: '#9aa0b8', fontWeight: 500 },
  actionBtn:  { fontSize: 11, fontWeight: 700, color: '#9aa0b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Poppins, sans-serif' },
  deleteBtn:  { fontSize: 11, color: '#FF4757', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Poppins, sans-serif' },
  replyBox:   { flex: 1, display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 20, padding: '5px 12px', border: '1.5px solid #dde2f0' },
  replyInput: { flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: '#1a1d2e', fontFamily: 'Nunito, sans-serif' },
  postBtn: (active) => ({
    background: 'none', border: 'none', padding: '0 0 0 8px',
    cursor: active ? 'pointer' : 'default',
    color: active ? '#FFD700' : '#9aa0b8',
    fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', fontFamily: 'Poppins, sans-serif',
  }),
  viewRepliesBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
    cursor: 'pointer', color: '#3D9BF7', fontSize: 12, fontWeight: 700,
    fontFamily: 'Poppins, sans-serif', marginTop: 4,
  },
};

/* ─── ReplyRow ───────────────────────────────────────────────────────────── */
function ReplyRow({ reply, postId, commentId, postOwnerId, onDeleteSelf, level = 0 }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const myId     = user?._id?.toString();

  const [subReplies,     setSubReplies]     = useState(reply.replies || []);
  const [showSubReplies, setShowSubReplies] = useState(false);
  const [userCollapsed,  setUserCollapsed]  = useState(false);
  const [showInput,      setShowInput]      = useState(false);
  const [replyText,      setReplyText]      = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  const prevSubCount = React.useRef(subReplies.length);
  React.useEffect(() => {
    if (subReplies.length > prevSubCount.current && !userCollapsed) setShowSubReplies(true);
    prevSubCount.current = subReplies.length;
  }, [subReplies.length, userCollapsed]);

  const replyUser   = normalizeUser(reply.userId);
  const replyUserId = (reply.userId?._id || reply.userId)?.toString();
  const isOwn       = replyUserId === myId;
  const canDelete   = isOwn || postOwnerId === myId;

  const handleSubReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    const textToPost = replyText.trim();
    setReplyText(''); setShowInput(false);
    try {
      const res = await postAPI.replyComment(postId, commentId, {
        text: textToPost,
        replyToUser: reply.userId?._id || reply.userId,
        replyId: reply._id,
      });
      const serverReply = res.data.reply;
      const newSub = serverReply?._id ? {
        ...serverReply,
        userId: serverReply.userId && typeof serverReply.userId === 'object'
          ? serverReply.userId
          : { _id: user._id, username: user.username, userId: user.userId, profilePicture: user.profilePicture },
        replies: serverReply.replies || [],
      } : {
        _id: `temp-${Date.now()}`, text: textToPost, createdAt: new Date().toISOString(),
        userId: { _id: user._id, username: user.username, userId: user.userId, profilePicture: user.profilePicture },
        replyToUser: replyUser ? { _id: replyUser._id, username: replyUser.username } : null,
        replies: [],
      };
      setSubReplies(prev => [...prev, newSub]);
      setShowSubReplies(true); setUserCollapsed(false);
    } catch (err) { console.error(err); toast.error('Could not post reply'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteSubReply = async (subReplyId) => {
    try {
      await postAPI.deleteReply(postId, commentId, subReplyId);
      setSubReplies(prev => prev.filter(r => r._id !== subReplyId));
    } catch (err) { console.error(err); toast.error('Could not delete reply'); }
  };

  return (
    <div style={{ padding: '4px 0 4px 38px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ cursor: 'pointer', flexShrink: 0 }}
          onClick={() => navigate(`/profile/${replyUser?._id || replyUserId}`)}>
          <Avatar src={replyUser?.profilePicture} username={replyUser?.username || '?'} size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.bubbleReply}>
            <span style={S.username} onClick={() => navigate(`/profile/${replyUser?._id || replyUserId}`)}>
              {replyUser?.username || 'User'}
            </span>
            {reply.replyToUser?.username && <span style={S.mention}>@{reply.replyToUser.username} </span>}
            <span style={S.bodyText}>{reply.text}</span>
          </div>
          <div style={S.metaRow}>
            <span style={S.metaTime}>{format(reply.createdAt)}</span>
            {level < 3 && (
              <button style={S.actionBtn}
                onMouseEnter={e => e.target.style.color = '#FFD700'}
                onMouseLeave={e => e.target.style.color = '#9aa0b8'}
                onClick={() => setShowInput(v => !v)}>Reply</button>
            )}
            {canDelete && (
              <button style={S.deleteBtn} onClick={async () => {
                try { await postAPI.deleteReply(postId, commentId, reply._id); onDeleteSelf(reply._id); }
                catch (err) { console.error(err); toast.error('Could not delete reply'); }
              }}>Delete</button>
            )}
          </div>
        </div>
      </div>

      {showInput && (
        <form onSubmit={handleSubReply}
          style={{ display: 'flex', gap: 8, padding: '6px 0 2px 32px', alignItems: 'center' }}>
          <Avatar src={user?.profilePicture} username={user?.username || '?'} size={22} />
          <div style={S.replyBox}>
            <span style={{ ...S.mention, whiteSpace: 'nowrap' }}>@{replyUser?.username || 'user'} </span>
            <input value={replyText} onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubReply(e); }}
              placeholder="Add a reply…" autoFocus style={S.replyInput} />
            <button type="submit" disabled={!replyText.trim() || submitting}
              style={S.postBtn(replyText.trim() && !submitting)}>
              {submitting ? '…' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {subReplies.length > 0 && (
        <button style={{ ...S.viewRepliesBtn, marginLeft: 34 }}
          onClick={() => { const next = !showSubReplies; setShowSubReplies(next); setUserCollapsed(!next); }}>
          <span style={{ display: 'inline-block', width: 16, height: 1, background: '#3D9BF7' }} />
          {showSubReplies ? 'Hide replies' : `View ${subReplies.length} repl${subReplies.length > 1 ? 'ies' : 'y'}`}
        </button>
      )}

      {showSubReplies && subReplies.map((r, i) => (
        <ReplyRow key={r._id ? r._id.toString() : `sub-${i}-${level}`}
          reply={r} postId={postId} commentId={commentId} postOwnerId={postOwnerId}
          level={level + 1} onDeleteSelf={handleDeleteSubReply} />
      ))}
    </div>
  );
}

/* ─── CommentRow ─────────────────────────────────────────────────────────── */
function CommentRow({ comment, postId, postOwnerId, onDeleteComment }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const myId     = user?._id?.toString();

  const [replies,       setReplies]       = useState(comment.replies || []);
  const [showReplies,   setShowReplies]   = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [showInput,     setShowInput]     = useState(false);
  const [replyText,     setReplyText]     = useState('');
  const [submitting,    setSubmitting]    = useState(false);

  const prevReplyCount = React.useRef(replies.length);
  React.useEffect(() => {
    if (replies.length > prevReplyCount.current && !userCollapsed) setShowReplies(true);
    prevReplyCount.current = replies.length;
  }, [replies.length, userCollapsed]);

  const commentUser   = normalizeUser(comment.userId);
  const commentUserId = (comment.userId?._id || comment.userId)?.toString();
  const isOwn         = commentUserId === myId;
  const canDelete     = isOwn || postOwnerId === myId;

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await postAPI.replyComment(postId, comment._id, {
        text: replyText.trim(),
        replyToUser: comment.userId?._id || comment.userId,
      });
      const serverReply = res.data.reply;
      const newReply = serverReply?._id ? {
        ...serverReply,
        userId: serverReply.userId && typeof serverReply.userId === 'object'
          ? serverReply.userId
          : { _id: user._id, username: user.username, userId: user.userId, profilePicture: user.profilePicture },
        replies: serverReply.replies || [],
      } : {
        _id: `temp-${Date.now()}`, text: replyText.trim(), createdAt: new Date().toISOString(),
        userId: { _id: user._id, username: user.username, userId: user.userId, profilePicture: user.profilePicture },
        replyToUser: commentUser ? { _id: commentUser._id, username: commentUser.username } : null,
        replies: [],
      };
      setReplies(prev => [...prev, newReply]);
      setShowReplies(true); setReplyText(''); setShowInput(false);
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const handleDeleteReply = async (replyId) => {
    try {
      await postAPI.deleteReply(postId, comment._id, replyId);
      setReplies(prev => prev.filter(r => r._id !== replyId));
    } catch (err) { console.error(err); toast.error('Could not delete reply'); }
  };

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f8' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ cursor: 'pointer', flexShrink: 0 }}
          onClick={() => navigate(`/profile/${commentUser?._id || commentUserId}`)}>
          <Avatar src={commentUser?.profilePicture} username={commentUser?.username || '?'} size={30} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.bubbleComment}>
            <span style={S.username} onClick={() => navigate(`/profile/${commentUser?._id || commentUserId}`)}>
              {commentUser?.username || 'User'}
            </span>
            <span style={S.bodyText}>{comment.text}</span>
          </div>
          <div style={S.metaRow}>
            <span style={S.metaTime}>{format(comment.createdAt)}</span>
            <button style={S.actionBtn}
              onMouseEnter={e => e.target.style.color = '#FFD700'}
              onMouseLeave={e => e.target.style.color = '#9aa0b8'}
              onClick={() => setShowInput(v => !v)}>Reply</button>
            {canDelete && (
              <button style={S.deleteBtn} onClick={() => onDeleteComment(comment._id)}>Delete</button>
            )}
          </div>
        </div>
      </div>

      {showInput && (
        <form onSubmit={handleReply}
          style={{ display: 'flex', gap: 8, padding: '6px 0 2px 38px', alignItems: 'center' }}>
          <Avatar src={user?.profilePicture} username={user?.username || '?'} size={24} />
          <div style={S.replyBox}>
            <span style={{ ...S.mention, whiteSpace: 'nowrap' }}>@{commentUser?.username || 'user'} </span>
            <input value={replyText} onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleReply(e); }}
              placeholder="Add a reply…" autoFocus style={S.replyInput} />
            <button type="submit" disabled={!replyText.trim() || submitting}
              style={S.postBtn(replyText.trim() && !submitting)}>
              {submitting ? '…' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {replies.length > 0 && (
        <button style={{ ...S.viewRepliesBtn, marginLeft: 38 }}
          onClick={() => { const next = !showReplies; setShowReplies(next); setUserCollapsed(!next); }}>
          <span style={{ display: 'inline-block', width: 18, height: 1, background: '#3D9BF7' }} />
          {showReplies ? 'Hide replies' : `View ${replies.length} repl${replies.length > 1 ? 'ies' : 'y'}`}
        </button>
      )}

      {showReplies && replies.map((r, i) => (
        <ReplyRow key={r._id ? r._id.toString() : `r-${i}`}
          reply={r} postId={postId} commentId={comment._id}
          postOwnerId={postOwnerId} level={0} onDeleteSelf={handleDeleteReply} />
      ))}
    </div>
  );
}

/* ─── PostCard ───────────────────────────────────────────────────────────── */
export default function PostCard({ post, onUpdate }) {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [commentText,  setCommentText]  = useState('');
  const [showAll,      setShowAll]      = useState(false);
  const [likeLoading,  setLikeLoading]  = useState(false);
  const [comments,     setComments]     = useState(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [posting,      setPosting]      = useState(false);
  const [imgError,     setImgError]     = useState(false);

  const isLiked     = post.isLiked || post.likes?.map(String).includes(user?._id?.toString());
  const likesCount  = post.likesCount ?? post.likes?.length ?? 0;
  const mediaUrl    = getMediaUrl(post.mediaUrl);
  const postOwnerId = (post.userId?._id || post.userId)?.toString();
  const displayed   = showAll ? comments : comments.slice(-3);

  const handleLike = async () => {
    if (likeLoading) return;
    setLikeLoading(true);
    try {
      const res = await postAPI.like(post._id);
      onUpdate(post._id, { isLiked: res.data.liked, likesCount: res.data.likesCount });
    } catch (e) { console.error(e); }
    finally { setLikeLoading(false); }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || posting) return;
    setPosting(true);
    try {
      const res = await postAPI.comment(post._id, commentText);
      const newComment = {
        ...res.data.comment,
        userId: { _id: user._id, username: user.username, userId: user.userId, profilePicture: user.profilePicture },
        replies: [],
      };
      setComments(prev => [...prev, newComment]);
      setCommentText(''); setShowAll(true); setShowComments(true);
    } catch (e) { console.error(e); }
    finally { setPosting(false); }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await postAPI.deleteComment(post._id, commentId);
      setComments(prev => prev.filter(c => c._id !== commentId));
    } catch (e) { console.error(e); }
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await postAPI.delete(post._id);
      toast.success('Post deleted');
      onUpdate(post._id, null);
    } catch (e) { console.error(e); }
  };

  return (
    <article className="post-card" style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: '1px solid #edf0f8' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/profile/${postOwnerId}`)}>
          <Avatar src={post.userId?.profilePicture} username={post.userId?.username || '?'} size={40} />
        </div>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/profile/${postOwnerId}`)}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1d2e', fontFamily: 'Poppins, sans-serif' }}>
            {post.userId?.username || 'User'}
          </div>
          <div style={{ fontSize: 11, color: '#9aa0b8', marginTop: 1 }}>{format(post.createdAt)}</div>
        </div>
        {user?._id === postOwnerId && (
          <button onClick={handleDeletePost}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF4757',
              fontSize: 12, fontWeight: 700, fontFamily: 'Poppins, sans-serif', padding: '4px 8px', borderRadius: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Delete
          </button>
        )}
      </div>

      {/* ── Media — properly sized, Instagram-style ── */}
      {post.mediaUrl && (
        <div style={{
          width: '100%',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxHeight: 500,
          overflow: 'hidden',
        }}>
          {imgError ? (
            <div style={{ width: '100%', height: 200, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8, color: '#9aa0b8', background: '#f0f2f8' }}>
              <span style={{ fontSize: 36 }}>🖼️</span>
              <span style={{ fontSize: 13 }}>Media unavailable</span>
            </div>
          ) : post.mediaType === 'video' ? (
            <video
              src={mediaUrl}
              controls
              playsInline
              onError={() => setImgError(true)}
              style={{
                width: '100%',
                maxHeight: 500,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <img
              src={mediaUrl}
              alt="post"
              onError={() => setImgError(true)}
              style={{
                width: '100%',
                maxHeight: 500,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}
        </div>
      )}

      {/* ── Caption ── */}
      {post.caption && (
        <div style={{ padding: '10px 16px 4px', fontSize: 14, color: '#2a2d3e', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 800, marginRight: 7, color: '#1a1d2e', fontFamily: 'Poppins, sans-serif', cursor: 'pointer' }}
            onClick={() => navigate(`/profile/${postOwnerId}`)}>
            {post.userId?.username}
          </span>
          {post.caption}
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px 6px' }}>
        <button onClick={handleLike} disabled={likeLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10,
            border: 'none', background: isLiked ? 'rgba(255,71,87,0.08)' : 'none',
            color: isLiked ? '#FF4757' : '#9aa0b8', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s' }}>
          <Icons.Heart filled={isLiked} />
          <span>{likesCount}</span>
        </button>
        <button onClick={() => setShowComments(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10,
            border: 'none', background: showComments ? 'rgba(61,155,247,0.08)' : 'none',
            color: showComments ? '#3D9BF7' : '#9aa0b8', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s' }}>
          <Icons.Comment />
          <span>{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</span>
        </button>
      </div>

      {/* ── Comment input ── */}
      <div style={{ padding: '6px 14px 12px', borderTop: '1px solid #edf0f8' }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <Avatar src={user?.profilePicture} username={user?.username || '?'} size={30} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 24,
            padding: '7px 14px', border: `1.5px solid ${inputFocused ? '#FFD700' : '#dde2f0'}`,
            boxShadow: inputFocused ? '0 0 0 3px rgba(255,215,0,0.10)' : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s' }}>
            <input value={commentText} onChange={e => setCommentText(e.target.value)}
              onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter' && commentText.trim()) handleComment(e); }}
              placeholder="Add a comment…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 13, color: '#1a1d2e', fontFamily: 'Nunito, sans-serif' }} />
            {commentText.trim() && (
              <button onClick={handleComment} disabled={posting}
                style={{ background: 'linear-gradient(135deg,#FFD700,#F7A325)', color: '#1a1d2e', border: 'none',
                  borderRadius: 14, padding: '4px 13px', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                  fontFamily: 'Poppins, sans-serif', marginLeft: 8, whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(255,215,0,0.3)' }}>
                {posting ? '…' : 'Post'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Comments section ── */}
      {showComments && (
        <div style={{ borderTop: '1px solid #edf0f8', background: '#fafbff' }}>
          {comments.length > 3 && !showAll && (
            <button onClick={() => setShowAll(true)}
              style={{ display: 'block', width: '100%', padding: '9px 16px', background: 'none', border: 'none',
                borderBottom: '1px solid #edf0f8', color: '#3D9BF7', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Poppins, sans-serif', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              ↑ View all {comments.length} comments
            </button>
          )}
          {comments.length > 0 ? (
            <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'hidden', padding: '4px 14px 8px',
              scrollbarWidth: 'thin', scrollbarColor: '#FFD700 #f0f2f8' }}>
              {displayed.map(comment => (
                <CommentRow key={comment._id} comment={comment} postId={post._id}
                  postOwnerId={postOwnerId} onDeleteComment={handleDeleteComment} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '18px 16px', textAlign: 'center', color: '#9aa0b8', fontSize: 13 }}>
              No comments yet. Be the first! 💬
            </div>
          )}
          {showAll && comments.length > 3 && (
            <button onClick={() => setShowAll(false)}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'none', border: 'none',
                borderTop: '1px solid #edf0f8', color: '#9aa0b8', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
              Show less
            </button>
          )}
        </div>
      )}
    </article>
  );
}