import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { userAPI, chatAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Avatar, Icons, LoadingCenter, Modal, toast } from '../components/ui';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

export default function ProfilePage() {
  const { id }                       = useParams();
  const { user, updateUser, logout } = useAuth();
  const navigate                     = useNavigate();
  const fileRef                      = useRef(null);

  const [profile, setProfile]   = useState(null);
  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', bio: '', isPrivate: false });
  const [editFile, setEditFile] = useState(null);
  const [editPreview, setEditPreview] = useState('');
  const [saving, setSaving]     = useState(false);
  const [isBlocked, setIsBlocked]         = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [followReqStatus, setFollowReqStatus] = useState(null);
  const [listModal, setListModal] = useState(null);

  // ── Change Password ────────────────────────────────────────────────────────
  const [setPassOpen, setSetPassOpen] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass]         = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passErr, setPassErr]         = useState('');
  const [passLoading, setPassLoading] = useState(false);

  // ── Delete Account ─────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting]           = useState(false);

  const isOwn = user?._id === id;

  const isFollowing = profile?.followers?.some(f =>
    (typeof f === 'object' ? f._id : f) === user?._id
  );

  useEffect(() => {
    setLoading(true);
    userAPI.getById(id)
      .then(uRes => {
        const u = uRes.data.user;
        setProfile(u);
        setIsBlocked(u.isBlockedByMe || false);
        setFollowReqStatus(u.followRequestStatus || null);
        setEditForm({ username: u.username, bio: u.bio || '', isPrivate: u.isPrivate || false });
        if (u.isBlockedByMe) return { data: { posts: [] } };
        return userAPI.getPosts(id).catch(() => ({ data: { posts: [] } }));
      })
      .then(pRes => setPosts(pRes.data.posts || []))
      .catch(e => toast.error(e.response?.data?.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [id]);

  // If viewing own profile and hasPassword isn't set yet, get it from /me
  useEffect(() => {
    if (!isOwn || !profile || profile.hasPassword !== undefined) return;
    userAPI.getMe()
      .then(res => {
        if (res.data.user?.hasPassword !== undefined)
          setProfile(p => ({ ...p, hasPassword: res.data.user.hasPassword }));
      })
      .catch(() => {});
  }, [isOwn, profile]);

  const handleFollow = async () => {
    try {
      if (isFollowing) {
        await userAPI.unfollow(id);
        setProfile(p => ({ ...p, followers: p.followers.filter(f => (typeof f === 'object' ? f._id : f) !== user._id) }));
        toast.info('Unfollowed');
      } else if (followReqStatus === 'pending') {
        await userAPI.cancelFollowRequest(id);
        setFollowReqStatus(null);
        toast.info('Follow request cancelled');
      } else {
        const res = await userAPI.follow(id);
        if (res.data.requested) { setFollowReqStatus('pending'); toast.success('Follow request sent!'); }
        else { setProfile(p => ({ ...p, followers: [...p.followers, user._id] })); toast.success('Following!'); }
      }
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const handleMessage = async () => {
    try {
      await chatAPI.sendRequest(id);
      toast.success('Message request sent!');
      navigate('/chat');
    } catch (e) {
      const data = e.response?.data || {};
      const msg  = data.message || '';
      if (data.already_connected) {
        toast.info('You can already message this user! Redirecting…');
        navigate('/chat');
      } else if (data.reverse_pending) {
        toast.info('This user already sent you a request — check your Requests tab!');
        navigate('/chat');
      } else if (msg.includes('already') || msg.includes('active')) {
        navigate('/chat');
      } else {
        toast.error(msg || 'Failed to send message request');
      }
    }
  };

  const handleBlock = async () => {
    if (!window.confirm(isBlocked ? `Unblock ${profile.username}?` : `Block ${profile.username}?`)) return;
    try {
      const res = await userAPI.block(id);
      setIsBlocked(res.data.blocked);
      setBlockMenuOpen(false);
      toast.info(res.data.message);
      if (res.data.blocked) navigate('/');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const openList = (type) => {
    if (profile.isPrivate && !isOwn && !isFollowing) return;
    const users = type === 'followers' ? profile.followers : profile.following;
    const populated = (users || []).filter(u => typeof u === 'object' && u._id);
    setListModal({ type, users: populated });
  };

  const handleEditFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setEditFile(f);
    setEditPreview(URL.createObjectURL(f));
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('username', editForm.username);
      fd.append('bio', editForm.bio);
      fd.append('isPrivate', editForm.isPrivate);
      if (editFile) fd.append('profilePicture', editFile);
      const res = await userAPI.update(id, fd);
      const updatedUser = res.data.user;
      setProfile(p => ({ ...p, ...updatedUser }));
      updateUser(updatedUser);
      toast.success('Profile updated!');
      setEditOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed');
    } finally { setSaving(false); }
  };

  // ── Change / Set Password ──────────────────────────────────────────────────
  const handleSetPassword = async () => {
    setPassErr('');
    if (newPass.length < 6)        return setPassErr('New password must be at least 6 characters.');
    if (newPass !== confirmPass)   return setPassErr('Passwords do not match.');
    if (profile.hasPassword && !currentPass) return setPassErr('Current password is required.');
    setPassLoading(true);
    try {
      await authAPI.changePassword({ currentPassword: currentPass, newPassword: newPass });
      setProfile(p => ({ ...p, hasPassword: true }));
      updateUser({ hasPassword: true });
      toast.success(profile.hasPassword ? 'Password changed successfully!' : 'Password set! You can now sign in with email too.');
      setSetPassOpen(false);
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (e) {
      setPassErr(e.response?.data?.message || 'Failed to update password.');
    } finally { setPassLoading(false); }
  };

  // ── Delete Account ─────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirm.toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    try {
      await userAPI.deleteAccount();
      logout();
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete account.');
      setDeleting(false);
    }
  };

  if (loading) return <LoadingCenter />;
  if (!profile) return <div className="empty-state">User not found.</div>;

  const followersCount = profile.followerCount ?? profile.followers?.length ?? 0;
  const followingCount = profile.followingCount ?? profile.following?.length ?? 0;
  const postsCount     = profile.postCount ?? posts.length;
  const canSeePosts    = !profile.isPrivate || isOwn || isFollowing;

  return (
    <div className="profile-page">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="profile-header">
        <div className="profile-avatar-wrap">
          <Avatar src={profile.profilePicture} username={profile.username} size={96} ring />
        </div>

        <div style={{ flex: 1 }}>
          <div className="profile-name">{profile.username}</div>

          {/* User ID row */}
          <div className="profile-handle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>User ID:</span>
            <span>@{profile.userId || profile.username}</span>
            {isOwn && (
              <span
                onClick={() => { navigator.clipboard.writeText(profile.userId || ''); toast.success('User ID copied!'); }}
                title="Click to copy"
                style={{ fontSize: 11, color: 'var(--primary)', cursor: 'pointer',
                  background: 'var(--surface-2,#1a1a1a)', borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
                📋 copy
              </span>
            )}
          </div>

          {profile.bio && <div className="profile-bio">{profile.bio}</div>}

          <div className="profile-stats">
            <div className="profile-stat">
              <div className="profile-stat-num">{postsCount}</div>
              <div className="profile-stat-label">posts</div>
            </div>
            <div className="profile-stat" onClick={() => canSeePosts && openList('followers')}
              style={{ cursor: canSeePosts ? 'pointer' : 'default' }}>
              <div className="profile-stat-num">{followersCount}</div>
              <div className="profile-stat-label">followers</div>
            </div>
            <div className="profile-stat" onClick={() => canSeePosts && openList('following')}
              style={{ cursor: canSeePosts ? 'pointer' : 'default' }}>
              <div className="profile-stat-num">{followingCount}</div>
              <div className="profile-stat-label">following</div>
            </div>
          </div>

          <div className="profile-actions">
            {isOwn ? (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
                  <Icons.Settings /> Edit Profile
                </button>

                <button className="btn btn-secondary btn-sm"
                  onClick={() => { setSetPassOpen(true); setPassErr(''); setCurrentPass(''); setNewPass(''); setConfirmPass(''); }}
                  style={{ borderColor: 'var(--accent, #3D9BF7)', color: 'var(--accent, #3D9BF7)' }}>
                  🔑 {profile.hasPassword ? 'Change Password' : 'Set Password'}
                </button>

                <button className="btn btn-sm"
                  onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); }}
                  style={{ background: 'rgba(231,76,60,0.10)', color: '#e74c3c',
                    border: '1.5px solid rgba(231,76,60,0.3)', borderRadius: 8,
                    padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  🗑️ Delete Account
                </button>

                {profile.isPrivate && (
                  <span className="tag tag-gold"><Icons.Lock /> Private</span>
                )}
              </>
            ) : (
              <>
                {!isBlocked && (
                  <>
                    <button
                      className={`btn btn-sm ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={handleFollow}>
                      {isFollowing ? 'Unfollow' : followReqStatus === 'pending' ? 'Requested ✕' : 'Follow'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleMessage}>
                      <Icons.Chat /> Message
                    </button>
                  </>
                )}
                <div style={{ position: 'relative' }}>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setBlockMenuOpen(v => !v)}
                    style={{ fontSize: 18, padding: '4px 8px' }}>⋯</button>
                  {blockMenuOpen && (
                    <div style={{
                      position: 'absolute', right: 0, top: '110%', zIndex: 100,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 10, minWidth: 140, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    }}>
                      <button onClick={handleBlock} style={{
                        width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                        textAlign: 'left', cursor: 'pointer', fontSize: 14,
                        color: isBlocked ? 'var(--primary)' : 'var(--danger, #e74c3c)',
                      }}>
                        {isBlocked ? '✅ Unblock' : '🚫 Block'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Post Grid ───────────────────────────────────────────────────── */}
      {isBlocked ? (
        <div className="private-badge">
          <Icons.Lock />
          <div style={{ fontWeight: 600, fontSize: 16 }}>You have blocked this user</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Unblock them to view their posts.</div>
        </div>
      ) : canSeePosts ? (
        posts.length > 0 ? (
          <div className="profile-grid">
            {posts.map(post => {
              const mediaUrl = post.mediaUrl?.startsWith('http') ? post.mediaUrl : `${SERVER}${post.mediaUrl}`;
              return (
                <div key={post._id} className="profile-grid-item">
                  {post.mediaType === 'video' ? (
                    <video src={mediaUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={mediaUrl} alt="post" />
                  )}
                  <div className="profile-grid-overlay">
                    <span><Icons.Heart filled /> {post.likes?.length || 0}</span>
                    <span><Icons.Comment /> {post.comments?.length || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><Icons.Image /></div>
            <div>No posts yet.</div>
          </div>
        )
      ) : (
        <div className="private-badge">
          <Icons.Lock />
          <div style={{ fontWeight: 600, fontSize: 16 }}>This account is private</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Follow to see their photos and videos.</div>
        </div>
      )}

      {/* ── Followers / Following Modal ──────────────────────────────── */}
      {listModal && (
        <Modal title={listModal.type === 'followers' ? 'Followers' : 'Following'} onClose={() => setListModal(null)}>
          {listModal.users.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>
              No {listModal.type} yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
              {listModal.users.map(u => (
                <div key={u._id}
                  onClick={() => { navigate(`/profile/${u._id}`); setListModal(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 10, cursor: 'pointer', background: 'var(--surface-2,#1a1a1a)', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <Avatar src={u.profilePicture} username={u.username} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--primary)' }}>@{u.userId || u.username}</div>
                    {u.bio && <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.bio}</div>}
                  </div>
                  {u.isPrivate && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🔒</span>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit Profile Modal ───────────────────────────────────────── */}
      {editOpen && (
        <Modal title="Edit Profile" onClose={() => setEditOpen(false)}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}>
              <Avatar src={editPreview || profile.profilePicture} username={profile.username} size={80} ring />
              <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)',
                borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Plus />
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleEditFile} />
          </div>
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="form-input" value={editForm.username}
              onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Bio</label>
            <textarea className="form-input form-textarea" value={editForm.bio}
              onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))} maxLength={150} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="editPrivate" checked={editForm.isPrivate}
              onChange={e => setEditForm(p => ({ ...p, isPrivate: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
            <label htmlFor="editPrivate" style={{ fontSize: 14, cursor: 'pointer' }}>Private account</label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-secondary btn-full" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-full" onClick={handleEditSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Change / Set Password Modal ──────────────────────────────── */}
      {setPassOpen && (
        <Modal
          title={profile.hasPassword ? 'Change Password' : 'Set a Password'}
          onClose={() => { setSetPassOpen(false); setCurrentPass(''); setNewPass(''); setConfirmPass(''); setPassErr(''); }}>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            {profile.hasPassword
              ? 'Enter your current password, then choose a new one. You can change it as many times as you like.'
              : 'Set a password to also be able to sign in with your email.'}
          </div>

          {passErr && <div className="error-msg" style={{ marginBottom: 12 }}>{passErr}</div>}

          {/* Current password — only shown when user already has a password.
              autoComplete="new-password" prevents browser from autofilling saved passwords. */}
          {profile.hasPassword && (
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                className="form-input"
                type="password"
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                placeholder="Enter your current password"
                autoComplete="new-password"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              className="form-input"
              type="password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder="Min 6 characters"
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              className="form-input"
              type="password"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-secondary btn-full"
              onClick={() => { setSetPassOpen(false); setCurrentPass(''); setNewPass(''); setConfirmPass(''); setPassErr(''); }}>
              Cancel
            </button>
            <button className="btn btn-primary btn-full" onClick={handleSetPassword} disabled={passLoading}>
              {passLoading ? 'Saving…' : (profile.hasPassword ? 'Change Password' : 'Set Password')}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete Account Modal ─────────────────────────────────────── */}
      {deleteOpen && (
        <Modal title="Delete Account" onClose={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>
          <div style={{ background: 'rgba(231,76,60,0.08)', border: '1.5px solid rgba(231,76,60,0.3)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#e74c3c', marginBottom: 6 }}>
              ⚠️ This action is permanent and cannot be undone
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              This will permanently delete your profile, all posts, messages, followers, and remove you from all searches.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">
              Type <strong style={{ color: '#e74c3c', letterSpacing: 1 }}>DELETE</strong> to confirm
            </label>
            <input className="form-input" value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE here" autoComplete="off"
              style={{ borderColor: deleteConfirm.toUpperCase() === 'DELETE' ? '#e74c3c' : undefined }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-secondary btn-full"
              onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirm.toUpperCase() !== 'DELETE' || deleting}
              style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none',
                background: deleteConfirm.toUpperCase() === 'DELETE' && !deleting ? '#e74c3c' : 'rgba(231,76,60,0.3)',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: deleteConfirm.toUpperCase() === 'DELETE' && !deleting ? 'pointer' : 'not-allowed' }}>
              {deleting ? 'Deleting…' : '🗑️ Delete My Account'}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}