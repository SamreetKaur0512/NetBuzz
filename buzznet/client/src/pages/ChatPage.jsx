import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'timeago.js';
import { chatAPI, groupAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { Avatar, Icons, LoadingCenter, toast } from '../components/ui';

export default function ChatPage() {
  const { user }       = useAuth();
  const { chatSocket } = useSocket();
  const navigate       = useNavigate();

  const [tab, setTab]            = useState('dms');
  const [convos, setConvos]      = useState([]);
  const [groups, setGroups]      = useState([]);
  const [activeConvo, setActive] = useState(null);
  const [messages, setMessages]  = useState([]);
  const [text, setText]          = useState('');
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const [isTyping, setIsTyping]  = useState(false);
  const [typing,   setTyping]    = useState(false);
  const [mobileView, setMobileView] = useState('list');

  // Group info panel
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // New group modal
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName,    setGroupName]    = useState('');
  const [groupDesc,    setGroupDesc]    = useState('');
  const [creating,     setCreating]     = useState(false);

  // Invite modal (for existing group)
  const [showInvite,   setShowInvite]   = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviting,     setInviting]     = useState(false);

  // My pending invites
  const [myInvites,    setMyInvites]    = useState([]);
  const [showInvites,  setShowInvites]  = useState(false);

  // Accepted notification modal (persists until user clicks OK)
  const [acceptedNotif, setAcceptedNotif] = useState(null); // { type, username, picture }

  // Incoming message requests
  const [msgRequests,    setMsgRequests]    = useState([]);
  const [showMsgReqs,    setShowMsgReqs]    = useState(false);

  const [blockedUsers,    setBlockedUsers]    = useState([]);

  const messagesEndRef  = useRef(null);
  const typingTimer     = useRef(null);
  // Refs so socket handlers always have fresh values (avoids stale closure bug)
  const activeConvoRef  = useRef(null);
  const userRef         = useRef(user);

  // Keep refs in sync with latest state so socket handlers never see stale values
  useEffect(() => { activeConvoRef.current = activeConvo; }, [activeConvo]);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Helper: is the app tab currently visible and focused by the user? ────────
  // Used to prevent marking messages as "seen" when the tab is in background.
  const isAppVisible = () =>
    document.visibilityState === 'visible' && document.hasFocus();

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    chatAPI.getConvos()
      .then(r => setConvos(r.data.conversations || []))
      .catch(console.error)
      .finally(() => setLoadingConvos(false));
    chatAPI.getRequests()
      .then(r => setMsgRequests(r.data.requests || []))
      .catch(console.error);
    groupAPI.getMyGroups()
      .then(r => setGroups(r.data.groups || []))
      .catch(err => {
        console.error('Failed to load groups:', err);
        toast.error('Failed to load groups');
      });
    groupAPI.getMyInvites()
      .then(r => setMyInvites(r.data.invites || []))
      .catch(console.error);
    userAPI.getBlockedUsers()
      .then(r => setBlockedUsers(r.data.blockedUsers || []))
      .catch(console.error);
  }, []);

  // ── Socket listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatSocket) return;
    chatSocket.on('receiveMessage', (msg) => {
      const sid = msg.senderId?._id || msg.senderId?.toString();
      const isBlocked = blockedUsers.some(b => b._id?.toString() === sid?.toString());
      if (isBlocked) return;

      const myId = userRef.current?._id?.toString();
      const isIncoming = sid?.toString() !== myId;

      // Use ref so we always get the current activeConvo, not a stale closure
      const currentConvo = activeConvoRef.current;
      const isActiveChat = (
        currentConvo?.type === 'dm' &&
        currentConvo?.conversationId === msg.conversationId
      );

      // Only add to messages list if this chat is currently open
      if (isActiveChat) {
        setMessages(prev => prev.some(m => m._id === msg._id) ? prev : [...prev, msg]);
      }

      if (isActiveChat && isIncoming && isAppVisible()) {
        // Chat window open + tab visible + focused → mark as read immediately
        chatSocket.emit('markRead', { conversationId: msg.conversationId });
        setConvos(prev => prev.map(c =>
          c.conversationId === msg.conversationId
            ? { ...c, lastMessage: msg, unreadCount: 0 }
            : c
        ));
      } else if (isIncoming) {
        // Tab in background or different chat open → increment unread badge
        setConvos(prev => prev.map(c =>
          c.conversationId === msg.conversationId
            ? { ...c, lastMessage: msg, unreadCount: (c.unreadCount || 0) + 1 }
            : c
        ));
      } else {
        // Own message sent from another tab/device — just update lastMessage
        setConvos(prev => prev.map(c =>
          c.conversationId === msg.conversationId
            ? { ...c, lastMessage: msg }
            : c
        ));
      }
    });
    chatSocket.on('receiveGroupMessage', (msg) => {
      const gid = (msg.groupId?._id || msg.groupId)?.toString();
      const sid = (msg.senderId?._id || msg.senderId)?.toString();
      const isBlocked = blockedUsers.some(b => b._id?.toString() === sid);
      if (isBlocked) return;

      const myId = userRef.current?._id?.toString();
      const isIncoming = sid !== myId;

      // Use ref so we always get the current activeConvo
      const currentConvo = activeConvoRef.current;
      const isActive = currentConvo?.type === 'group' && currentConvo?._id === gid;

      if (isActive) {
        setMessages(prev => prev.some(m => m._id === msg._id) ? prev : [...prev, msg]);
        if (isIncoming && isAppVisible()) {
          chatSocket.emit('markGroupRead', { groupId: gid });
        }
      }

      setGroups(prev => prev.map(g => g._id === gid ? {
        ...g,
        lastMessage: msg,
        unreadCount: (isActive && isAppVisible())
          ? 0                                             // viewing & visible → 0
          : isActive
            ? (g.unreadCount || 0)                       // viewing but hidden → keep
            : isIncoming
              ? (g.unreadCount || 0) + 1                 // not viewing → +1
              : (g.unreadCount || 0),                    // own msg → no change
      } : g));
    });
    chatSocket.on('chatRequestAccepted', ({ by }) => {
      setAcceptedNotif({ type: 'message', username: by.username, picture: by.profilePicture });
      // Refresh conversations
      chatAPI.getConvos().then(r => setConvos(r.data.conversations || [])).catch(() => {});
    });

    chatSocket.on('chatRequest', (req) => {
      setMsgRequests(prev => prev.some(r => r._id === req.requestId) ? prev : [
        { _id: req.requestId, senderId: req.from, status: 'pending' }, ...prev
      ]);
      toast.info(`💬 Message request from ${req.from?.username}`);
    });
    chatSocket.on('groupInvite', (invite) => {
      setMyInvites(prev => [invite, ...prev]);
      toast.info(`📨 Group invite: "${invite.groupId?.name}" from ${invite.invitedBy?.username}`);
    });
    chatSocket.on('typing',      ({ conversationId }) => {
      if (activeConvoRef.current?.conversationId === conversationId) setIsTyping(true);
    });
    chatSocket.on('stopTyping',  ({ conversationId }) => {
      if (activeConvoRef.current?.conversationId === conversationId) setIsTyping(false);
    });
    chatSocket.on('messagesRead', ({ conversationId }) => {
      // Other person read our DM — mark all messages as read (shows ✓✓) live
      if (activeConvoRef.current?.conversationId === conversationId)
        setMessages(prev => prev.map(m => ({ ...m, read: true })));
    });

    // ── messageDeleted: real-time delete-for-everyone (DM) ─────────────────────
    chatSocket.on('messageDeleted', ({ messageId, conversationId }) => {
      const cur = activeConvoRef.current;
      if (cur?.type === 'dm' && cur?.conversationId === conversationId) {
        // Remove from open chat window + update sidebar preview
        setMessages(prev => {
          const updated = prev.filter(m => m._id !== messageId);
          const newLast = updated.length > 0 ? updated[updated.length - 1] : null;
          setConvos(cv => cv.map(c =>
            c.conversationId === conversationId
              ? { ...c, lastMessage: newLast }
              : c
          ));
          return updated;
        });
      } else {
        // Chat not open — just clear the preview in sidebar
        setConvos(prev => prev.map(c =>
          c.conversationId === conversationId && c.lastMessage?._id === messageId
            ? { ...c, lastMessage: null }
            : c
        ));
      }
    });

    // ── groupMessageDeleted socket also updates group sidebar preview ─────────
    // (groupMessageDeleted listener below handles this)

    // ── groupMessagesSeen: someone read our group message ────────────────────
    chatSocket.on('groupMessagesSeen', ({ groupId, messageIds, seenBy }) => {
      const cur = activeConvoRef.current;
      if (cur?.type === 'group' && cur?._id === groupId) {
        setMessages(prev => prev.map(m => {
          if (!messageIds.includes(m._id?.toString())) return m;
          const alreadyIn = (m.readBy || []).some(r =>
            (r._id || r)?.toString() === seenBy._id?.toString()
          );
          if (alreadyIn) return m;
          return { ...m, readBy: [...(m.readBy || []), seenBy] };
        }));
      }
    });

    // ── groupMessageDeleted: message deleted for everyone / unseen ────────────
    chatSocket.on('groupMessageDeleted', ({ messageId, groupId }) => {
      const cur = activeConvoRef.current;
      if (cur?.type === 'group' && cur?._id === groupId) {
        // Remove from open chat + update group sidebar preview
        setMessages(prev => {
          const updated = prev.filter(m => m._id !== messageId);
          const newLast = updated.length > 0 ? updated[updated.length - 1] : null;
          setGroups(g => g.map(gr => gr._id === groupId
            ? { ...gr, lastMessage: newLast }
            : gr
          ));
          return updated;
        });
      } else {
        // Group not open — clear preview in sidebar if it was the last message
        setGroups(g => g.map(gr =>
          gr._id === groupId && gr.lastMessage?._id === messageId
            ? { ...gr, lastMessage: null }
            : gr
        ));
      }
    });

    // ── groupMessageDeletedUnseen: sender gets info about unseen delete ───────
    chatSocket.on('groupMessageDeletedUnseen', ({ messageId, groupId, unseenCount, unseenUsers }) => {
      toast.success(`Deleted for ${unseenCount} member${unseenCount > 1 ? 's' : ''} who hadn't seen it`);
    });

    return () => {
      chatSocket.off('receiveMessage');    chatSocket.off('receiveGroupMessage');
      chatSocket.off('chatRequestAccepted'); chatSocket.off('chatRequest'); chatSocket.off('groupInvite');
      chatSocket.off('typing');            chatSocket.off('stopTyping');
      chatSocket.off('messagesRead');      chatSocket.off('messageDeleted');
      chatSocket.off('groupMessagesSeen');
      chatSocket.off('groupMessageDeleted');
      chatSocket.off('groupMessageDeletedUnseen');
    };
  }, [chatSocket]); // Only re-register when socket changes. Handlers use refs for fresh values.

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Mark messages as read when user returns focus to the app ─────────────
  // Fires when user switches back to this tab or brings the window to front.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible' && document.hasFocus() && activeConvo && chatSocket) {
        if (activeConvo.type === 'dm' && activeConvo.conversationId) {
          chatSocket.emit('markRead', { conversationId: activeConvo.conversationId });
        } else if (activeConvo.type === 'group' && activeConvo._id) {
          chatSocket.emit('markGroupRead', { groupId: activeConvo._id });
        }
      }
    };
    // visibilitychange fires when switching tabs
    document.addEventListener('visibilitychange', handleVisible);
    // focus fires when switching windows/apps
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [activeConvo, chatSocket]);

  // ── Open DM ──────────────────────────────────────────────────────────────────
  const openConvo = useCallback(async (convo) => {
    setActive({ type: 'dm', ...convo });
    setMobileView('chat'); setShowGroupInfo(false);
    setLoadingMsgs(true); setMessages([]);
    if (chatSocket) {
      chatSocket.emit('joinRoom', { conversationId: convo.conversationId });
      // Only mark as read if the user is actually looking at the app
      if (isAppVisible()) {
        chatSocket.emit('markRead', { conversationId: convo.conversationId });
      }
    }
    try { const r = await chatAPI.getMessages(convo.conversationId); setMessages(r.data.messages || []); }
    catch (e) { console.error(e); } finally { setLoadingMsgs(false); }
    setConvos(prev => prev.map(c => c.conversationId === convo.conversationId ? { ...c, unreadCount: 0 } : c));
  }, [chatSocket]);

  // ── Open Group ───────────────────────────────────────────────────────────────
  const openGroup = useCallback(async (group) => {
    setActive({ type: 'group', ...group });
    setMobileView('chat'); setShowGroupInfo(false);
    setLoadingMsgs(true); setMessages([]);
    if (chatSocket) {
      chatSocket.emit('joinGroup', { groupId: group._id });
      // Only mark as read if the user is actually looking at the app
      if (isAppVisible()) {
        chatSocket.emit('markGroupRead', { groupId: group._id });
      }
    }
    try { const r = await groupAPI.getMessages(group._id); setMessages(r.data.messages || []); }
    catch (e) { console.error(e); } finally { setLoadingMsgs(false); }
    setGroups(prev => prev.map(g => g._id === group._id ? { ...g, unreadCount: 0 } : g));
  }, [chatSocket]);

  // ── Remove member ─────────────────────────────────────────────────────────
  const handleRemoveMember = async (memberId, memberName) => {
    if (!activeConvo || !window.confirm(`Remove ${memberName} from the group?`)) return;
    try {
      const r = await groupAPI.removeMember(activeConvo._id, memberId);
      setActive(prev => ({ ...prev, members: r.data.group.members, admins: r.data.group.admins }));
      setGroups(prev => prev.map(g => g._id === activeConvo._id ? { ...g, ...r.data.group } : g));
      toast.info(`${memberName} removed.`);
    } catch (e) { toast.error(e.response?.data?.message || 'Cannot remove this member'); }
  };

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim() || !activeConvo || !chatSocket) return;
    if (activeConvo.type === 'group') {
      chatSocket.emit('sendGroupMessage', { groupId: activeConvo._id, messageText: text.trim() });
      setText('');
    } else {
      chatSocket.emit('sendMessage', { receiverId: activeConvo.partnerId, messageText: text.trim() }, (ack) => {
        if (ack && !ack.success) {
          toast.error(ack.message || 'Failed to send message');
        }
      });
      chatSocket.emit('stopTyping', { conversationId: activeConvo.conversationId });
      setText('');
    }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (!chatSocket || !activeConvo || activeConvo.type === 'group') return;
    if (!typing) { setTyping(true); chatSocket.emit('typing', { conversationId: activeConvo.conversationId }); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setTyping(false);
      chatSocket.emit('stopTyping', { conversationId: activeConvo.conversationId });
    }, 1500);
  };

  // ── Create group (no members at creation) ────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreating(true);
    try {
      const r = await groupAPI.create({ name: groupName.trim(), description: groupDesc.trim() });
      setGroups(prev => [r.data.group, ...prev]);
      setShowNewGroup(false); setGroupName(''); setGroupDesc('');
      setTab('groups');
      openGroup(r.data.group);
      toast.success('Group created! Invite members using their User ID.');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setCreating(false); }
  };

  // ── Accept / Decline message request ─────────────────────────────────────────
  const handleAcceptMsgReq = async (requestId) => {
    try {
      await chatAPI.acceptRequest(requestId);
      const req = msgRequests.find(r => r._id === requestId);
      setMsgRequests(prev => prev.filter(r => r._id !== requestId));
      toast.success('Message request accepted');
      // Refresh full convo list so new convo appears with partnerInfo
      const r = await chatAPI.getConvos();
      setConvos(r.data.conversations || []);
      setShowMsgReqs(false);
      // Auto-open the new conversation
      if (req) {
        const newConvo = (r.data.conversations || []).find(c =>
          c.partnerId?.toString() === req.senderId?._id?.toString()
        );
        if (newConvo) openConvo(newConvo);
      }
    } catch (e) { toast.error('Failed to accept request'); }
  };

  const handleDeclineMsgReq = async (requestId) => {
    try {
      await chatAPI.rejectRequest(requestId);
      setMsgRequests(prev => prev.filter(r => r._id !== requestId));
      toast.info('Request declined');
    } catch (e) { toast.error('Failed'); }
  };

  // ── Send invite ───────────────────────────────────────────────────────────────
  const handleSendInvite = async () => {
    if (!inviteUserId.trim() || !activeConvo) return;
    setInviting(true);
    try {
      const cleanId = inviteUserId.trim().replace(/^@/, '');
      await groupAPI.invite(activeConvo._id, cleanId);
      toast.success('Invite sent!');
      setShowInvite(false); setInviteUserId('');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to send invite'); }
    finally { setInviting(false); }
  };

  // ── Accept / Decline invite ───────────────────────────────────────────────────
  const handleAcceptInvite = async (inviteId, groupData) => {
    try {
      const r = await groupAPI.acceptInvite(inviteId);
      setMyInvites(prev => prev.filter(i => i._id !== inviteId));
      setGroups(prev => {
        const exists = prev.find(g => g._id === r.data.group._id);
        return exists ? prev.map(g => g._id === r.data.group._id ? r.data.group : g) : [r.data.group, ...prev];
      });
      toast.success(`Joined "${groupData?.name}"!`);
      setShowInvites(false);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await groupAPI.declineInvite(inviteId);
      setMyInvites(prev => prev.filter(i => i._id !== inviteId));
      toast.info('Invite declined');
    } catch (e) { toast.error('Failed'); }
  };

  // ── Leave group ───────────────────────────────────────────────────────────────
  const handleDeleteMessage = async (messageId, scope) => {
    try {
      if (activeConvo.type === 'group') {
        await groupAPI.deleteMessage(activeConvo._id, messageId, scope);

        if (scope === 'self' || scope === 'everyone') {
          // Remove message from view
          setMessages(prev => {
            const updated = prev.filter(m => m._id !== messageId);
            // Update group preview with the new last message
            const newLast = updated.length > 0 ? updated[updated.length - 1] : null;
            setGroups(g => g.map(gr => gr._id === activeConvo._id
              ? { ...gr, lastMessage: newLast }
              : gr
            ));
            return updated;
          });
          toast.success(scope === 'everyone' ? 'Deleted for everyone' : 'Deleted for you');
        }
        // 'unseen': sender keeps seeing it, toast from groupMessageDeletedUnseen socket event
      } else {
        // DM
        await chatAPI.deleteMessage(messageId, scope);
        setMessages(prev => {
          const updated = prev.filter(m => m._id !== messageId);
          // Update DM conversation preview with new last message
          const newLast = updated.length > 0 ? updated[updated.length - 1] : null;
          setConvos(cv => cv.map(c => c.conversationId === activeConvo.conversationId
            ? { ...c, lastMessage: newLast }
            : c
          ));
          return updated;
        });
        toast.success(scope === 'everyone' ? 'Deleted for everyone' : 'Deleted for you');
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete');
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeConvo || !window.confirm(`Leave "${activeConvo.name}"?`)) return;
    try {
      await groupAPI.leave(activeConvo._id);
      setGroups(prev => prev.filter(g => g._id !== activeConvo._id));
      setActive(null); setMobileView('list');
      toast.info('Left group');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleDeleteGroup = async () => {
    if (!activeConvo || !window.confirm(`Delete "${activeConvo.name}"? This cannot be undone.`)) return;
    try {
      await groupAPI.deleteGroup(activeConvo._id);
      setGroups(prev => prev.filter(g => g._id !== activeConvo._id));
      setActive(null); setMobileView('list');
      toast.info('Group deleted');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const isGroupAdmin = activeConvo?.type === 'group' &&
    activeConvo?.admins?.some(a => (a._id || a).toString() === user?._id);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="chat-page">

      {/* ── Sidebar ── */}
      <div className={`chat-sidebar${mobileView === 'chat' ? ' hidden' : ''}`}>
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title">Messages</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" style={{ position: 'relative', fontSize: 12, padding: '4px 10px', lineHeight: 1.3, overflow: 'visible' }}
              onClick={() => setShowMsgReqs(true)}>
              <div>Requests</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }}></div>
              {msgRequests.length > 0 && (
                <span style={{ position: 'absolute', top: -8, right: -8, background: '#e74c3c',
                  color: '#fff', borderRadius: '50%', minWidth: 18, height: 18, fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, padding: '0 3px', zIndex: 10, lineHeight: 1 }}>
                  {msgRequests.length}
                </span>
              )}
            </button>
            {myInvites.length > 0 && (
              <button className="btn btn-secondary btn-sm" style={{ position: 'relative', fontSize: 12, padding: '4px 10px' }}
                onClick={() => setShowInvites(true)}>
                Invites
                <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--yellow)',
                  color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {myInvites.length}
                </span>
              </button>
            )}
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setShowNewGroup(true)}>
              + New Group
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[['dms','Chats'],['groups','Groups']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid var(--yellow)' : '2px solid transparent',
              color: tab === t ? 'var(--yellow)' : 'var(--text-muted)',
              fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontSize: 13,
            }}>{label}</button>
          ))}
        </div>

        <div className="chat-list">
          {tab === 'dms' && (
            <>
              {loadingConvos && <LoadingCenter />}
              {!loadingConvos && convos.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No conversations yet.<br />Visit a profile to start chatting.
                </div>
              )}
              {convos.map(c => (
                <div key={c.conversationId}
                  className={`chat-list-item${activeConvo?.conversationId === c.conversationId ? ' active' : ''}`}
                  onClick={() => openConvo(c)}>
                  <Avatar src={c.partnerInfo?.profilePicture} username={c.partnerInfo?.username || '?'} size={42} />
                  <div className="chat-list-info">
                    <div className="chat-list-name">{c.partnerInfo?.username || 'Chat'}</div>
                    <div className="chat-list-preview">{c.lastMessage?.messageText || 'No messages yet'}</div>
                  </div>
                  {c.unreadCount > 0 && <span className="chat-unread">{c.unreadCount}</span>}
                </div>
              ))}
            </>
          )}
          {tab === 'groups' && (
            <>
              {groups.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No groups yet.<br />Click "+ New Group" to create one.
                </div>
              )}
              {groups.map(g => (
                <div key={g._id}
                  className={`chat-list-item${activeConvo?._id === g._id ? ' active' : ''}`}
                  onClick={() => openGroup(g)}>
                  <div style={{ width:42, height:42, borderRadius:'50%', background:'var(--yellow)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#fff', fontWeight:700, fontSize:17, flexShrink:0 }}>
                    {g.name[0].toUpperCase()}
                  </div>
                  <div className="chat-list-info">
                    <div className="chat-list-name">{g.name}</div>
                    <div className="chat-list-preview">
                      {g.lastMessage?.messageText || `${g.members?.length||0} members`}
                    </div>
                  </div>
                  {g.unreadCount > 0 && <span className="chat-unread">{g.unreadCount}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Chat Window ── */}
      <div className={`chat-window${mobileView === 'chat' ? ' active' : ''}`}>
        {activeConvo ? (
          <>
            {/* Header */}
            <div className="chat-window-header">
              <button className="btn btn-icon btn-ghost" onClick={() => { setMobileView('list'); setShowGroupInfo(false); }}>
                <Icons.ArrowLeft />
              </button>
              {activeConvo.type === 'group' ? (
                <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--yellow)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontWeight:700, fontSize:15, flexShrink:0 }}>
                  {activeConvo.name[0].toUpperCase()}
                </div>
              ) : (
                <Avatar src={activeConvo.partnerInfo?.profilePicture} username={activeConvo.partnerInfo?.username||'?'} size={36} />
              )}
              <div style={{ flex:1, marginLeft:10, cursor: activeConvo.type==='group' ? 'pointer':'default' }}
                onClick={() => activeConvo.type==='group' && setShowGroupInfo(v => !v)}>
                <div style={{ fontSize:14, fontWeight:600 }}>
                  {activeConvo.type==='group' ? activeConvo.name : (activeConvo.partnerInfo?.username||'Chat')}
                </div>
                {activeConvo.type==='group' && (
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {activeConvo.members?.length||0} members · tap for info
                  </div>
                )}
              </div>
              {activeConvo.type==='group' && (
                <div style={{ display:'flex', gap:6 }}>
                  {activeConvo.type === 'group' && (
                    <button className="btn btn-sm btn-secondary"
                      onClick={() => { setShowInvite(true); setShowGroupInfo(false); }}>
                      + Invite
                    </button>
                  )}
                  {isGroupAdmin && activeConvo.createdBy?._id === user?._id && (
                    <button className="btn btn-sm btn-ghost"
                      style={{ color:'var(--red)', fontSize:12 }}
                      onClick={handleDeleteGroup}>
                      Delete Group
                    </button>
                  )}
                  <button className="btn btn-sm btn-ghost"
                    style={{ color:'var(--red)', fontSize:12 }}
                    onClick={handleLeaveGroup}>
                    Leave
                  </button>
                </div>
              )}
            </div>

            {/* Group info panel */}
            {showGroupInfo && activeConvo.type==='group' && (
              <div style={{ background:'var(--bg-elevated)', borderBottom:'1px solid var(--border)', padding:'12px 16px' }}>
                {activeConvo.description && (
                  <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:10 }}>{activeConvo.description}</div>
                )}
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:8 }}>
                  MEMBERS ({activeConvo.members?.length||0})
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {(activeConvo.members||[]).map((m, idx) => {
                    const mid   = typeof m==='object' ? (m._id||m.userId||idx) : m;
                    const mname = typeof m==='object' ? (m.username||'User') : String(m).slice(-6);
                    const mpic  = typeof m==='object' ? m.profilePicture : null;
                    const midStr = mid?.toString?.()||String(idx);
                    const isAdmin = activeConvo.admins?.some(a => (a._id||a)?.toString()===midStr);
                    const creatorId = (typeof activeConvo?.createdBy === 'object'
                      ? activeConvo?.createdBy?._id
                      : activeConvo?.createdBy)?.toString?.();
                    return (
                      <div key={midStr+idx}
                        style={{ display:'flex', alignItems:'center', gap:6,
                        background:'var(--bg-surface)', borderRadius:20, padding:'4px 6px 4px 4px' }}>
                        <div onClick={() => mid && navigate(`/profile/${mid}`)}
                          style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                          <Avatar src={mpic} username={mname} size={24} />
                          <span style={{ fontSize:13 }}>{mname}</span>
                          {isAdmin && <span style={{ fontSize:10, color:'var(--yellow)', fontWeight:700 }}>ADMIN</span>}
                        </div>
                        {midStr !== user?._id && midStr !== creatorId && !isAdmin && (
                          <button
                            onClick={() => handleRemoveMember(midStr, mname)}
                            style={{ background:'none', border:'none', cursor:'pointer',
                              color:'var(--red)', fontSize:14, padding:'0 2px',
                              lineHeight:1, marginLeft:2 }}
                            title="Remove member">✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="chat-messages">
              {loadingMsgs && <LoadingCenter />}
              {messages.map((msg, i) => {
                const isOut   = (msg.senderId?._id || msg.senderId) === user?._id;

                // ── DM: simple read flag ─────────────────────────────────────
                const isRead = !!msg.read;

                // ── Group: who has seen this message ─────────────────────────
                // readBy is populated array of {_id, username, profilePicture}
                const myIdStr      = user?._id?.toString();
                const readByUsers  = (msg.readBy || []).filter(r =>
                  (r._id || r)?.toString() !== myIdStr  // exclude self
                );
                const groupMembers = activeConvo?.members || [];
                const otherMembers = groupMembers.filter(m =>
                  (m._id || m)?.toString() !== myIdStr
                );
                // "Delete for everyone" blocked only when ALL other members have seen it
                const allOthersSeen = otherMembers.length > 0 &&
                  otherMembers.every(m =>
                    readByUsers.some(r =>
                      (r._id || r)?.toString() === (m._id || m)?.toString()
                    )
                  );

                // DM: can delete for everyone only if receiver hasn't read it
                // Group: can delete for everyone only if NO ONE has seen it yet
                //        can delete for unseen only if SOME (not all) have seen it
                const anyOtherSeen    = readByUsers.length > 0;
                const canDeleteEveryoneGroup = isOut && activeConvo?.type === 'group' && !anyOtherSeen;
                const canDeleteUnseen        = isOut && activeConvo?.type === 'group' && anyOtherSeen && !allOthersSeen;
                const canDeleteEveryone      = isOut && (
                  activeConvo?.type === 'group' ? canDeleteEveryoneGroup : !isRead
                );

                return (
                  <div key={msg._id || i} className={`chat-msg${isOut ? ' outgoing' : ''}`}
                    style={{ alignItems: 'flex-end' }}
                    onMouseEnter={e => {
                      const wrap = e.currentTarget.querySelector('.msg-delete-wrap');
                      if (wrap) wrap.style.opacity = '1';
                    }}
                    onMouseLeave={e => {
                      const wrap = e.currentTarget.querySelector('.msg-delete-wrap');
                      if (wrap) wrap.style.opacity = '0';
                    }}
                  >
                    {!isOut && <Avatar src={msg.senderId?.profilePicture} username={msg.senderId?.username || '?'} size={28} />}
                    <div style={{ position: 'relative', maxWidth: '100%' }}>
                      {activeConvo.type === 'group' && !isOut && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 600 }}>
                          {msg.senderId?.username}
                        </div>
                      )}
                      <div className="chat-bubble">{msg.messageText}</div>

                      {/* Time + read receipt + delete options */}
                      <div className="chat-time" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isOut ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                        <span>{format(msg.createdAt)}</span>
                        {isOut && activeConvo.type !== 'group' && (
                          <span style={{ fontSize: 10 }}>{isRead ? '✓✓' : '✓'}</span>
                        )}
                        {/* Group "Seen by" — shows avatars of who read it, only on own messages */}
                        {isOut && activeConvo.type === 'group' && readByUsers.length > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                            title={`Seen by: ${readByUsers.map(r => r.username || 'User').join(', ')}`}>
                            {readByUsers.slice(0, 3).map((r, idx) => (
                              <Avatar
                                key={(r._id || r)?.toString() || idx}
                                src={r.profilePicture}
                                username={r.username || '?'}
                                size={12}
                              />
                            ))}
                            {readByUsers.length > 3 && (
                              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{readByUsers.length - 3}</span>
                            )}
                          </span>
                        )}

                        {/* Delete buttons — appear on hover */}
                        <span
                          className="msg-delete-wrap"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: 0, transition: 'opacity 0.15s' }}
                        >
                          {/* Delete for me — always available for everyone */}
                          <button
                            onClick={() => handleDeleteMessage(msg._id, 'self')}
                            style={{
                              background: 'none', border: '1px solid rgba(255,71,87,0.3)',
                              cursor: 'pointer', fontSize: 10, fontWeight: 800,
                              color: '#FF4757', fontFamily: 'Poppins, sans-serif',
                              padding: '2px 7px', borderRadius: 6,
                              transition: 'all 0.15s', lineHeight: 1.4, whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.12)'; e.currentTarget.style.borderColor = '#FF4757'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'rgba(255,71,87,0.3)'; }}
                            title="Delete for me"
                          >
                            Delete for me
                          </button>

                          {/* Delete for everyone — no one has seen it yet */}
                          {canDeleteEveryone && (
                            <button
                              onClick={() => handleDeleteMessage(msg._id, 'everyone')}
                              style={{
                                background: '#FF4757', border: 'none',
                                cursor: 'pointer', fontSize: 10, fontWeight: 800,
                                color: '#fff', fontFamily: 'Poppins, sans-serif',
                                padding: '2px 7px', borderRadius: 6,
                                transition: 'all 0.15s', lineHeight: 1.4, whiteSpace: 'nowrap',
                                boxShadow: '0 2px 6px rgba(255,71,87,0.3)',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#e03344'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(255,71,87,0.45)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#FF4757'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(255,71,87,0.3)'; }}
                              title="Delete for everyone — no one has read this yet"
                            >
                              Delete for everyone
                            </button>
                          )}

                          {/* Delete for unseen — some seen, some not → delete only for those who haven't seen */}
                          {canDeleteUnseen && (
                            <button
                              onClick={() => handleDeleteMessage(msg._id, 'unseen')}
                              style={{
                                background: '#F7A325', border: 'none',
                                cursor: 'pointer', fontSize: 10, fontWeight: 800,
                                color: '#1a1d2e', fontFamily: 'Poppins, sans-serif',
                                padding: '2px 7px', borderRadius: 6,
                                transition: 'all 0.15s', lineHeight: 1.4, whiteSpace: 'nowrap',
                                boxShadow: '0 2px 6px rgba(247,163,37,0.3)',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#e09010'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#F7A325'; }}
                              title={`Delete for ${otherMembers.length - readByUsers.length} member(s) who haven't seen it yet`}
                            >
                              Delete for unseen
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isTyping && <div className="chat-typing">typing…</div>}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={sendMessage}>
              <input className="chat-input" value={text} onChange={handleTyping} placeholder="Message…" />
              <button type="submit" className="btn btn-primary btn-icon" disabled={!text.trim()}><Icons.Send /></button>
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <Icons.Chat />
            <div style={{ fontWeight:600 }}>Your messages</div>
            <div style={{ fontSize:13 }}>Select a conversation or group to start chatting.</div>
          </div>
        )}
      </div>

      {/* ── Create New Group Modal ── */}
      {showNewGroup && (
        <div style={{ position:'fixed', inset:0, background:'rgba(20,24,60,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:28,
            width:'90%', maxWidth:420, display:'flex', flexDirection:'column', gap:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:700, fontSize:18 }}>Create New Group</div>
            <input className="chat-input" placeholder="Group name *" value={groupName}
              onChange={e => setGroupName(e.target.value)} style={{ width:'100%' }} />
            <input className="chat-input" placeholder="Description (optional)" value={groupDesc}
              onChange={e => setGroupDesc(e.target.value)} style={{ width:'100%' }} />
            <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px 12px',
              background:'var(--bg-elevated)', borderRadius:8 }}>
              💡 After creating, use <strong>"+ Invite"</strong> to add members by their User ID
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }}
                onClick={() => { setShowNewGroup(false); setGroupName(''); setGroupDesc(''); }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1 }}
                disabled={!groupName.trim()||creating} onClick={handleCreateGroup}>
                {creating ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite Member Modal ── */}
      {/* Accepted notification modal — stays until user clicks OK */}
      {acceptedNotif && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg-card)', borderRadius:20, padding:'32px 28px',
            maxWidth:340, width:'90%', textAlign:'center', boxShadow:'0 8px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>
              Request Accepted!
            </div>
            <div style={{ fontSize:15, color:'var(--text-secondary)', marginBottom:24, lineHeight:1.6 }}>
              <strong>{acceptedNotif.username}</strong> accepted your message request.<br/>
              You can now chat with them!
            </div>
            <button className="btn btn-primary" style={{ padding:'10px 36px', fontSize:15, fontWeight:700 }}
              onClick={() => setAcceptedNotif(null)}>
              OK
            </button>
          </div>
        </div>
      )}

      {showInvite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(20,24,60,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:28,
            width:'90%', maxWidth:400, display:'flex', flexDirection:'column', gap:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:700, fontSize:18 }}>Invite to "{activeConvo?.name}"</div>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>
              Enter their <strong>User ID</strong> — shown as @userid on their profile.
            </div>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)',
                color:'var(--text-muted)', fontSize:15, pointerEvents:'none' }}>@</span>
              <input className="chat-input" placeholder="userid" value={inviteUserId}
                onChange={e => setInviteUserId(e.target.value.replace(/^@/, ''))}
                style={{ width:'100%', paddingLeft:28 }} autoFocus />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }}
                onClick={() => { setShowInvite(false); setInviteUserId(''); }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1 }}
                disabled={!inviteUserId.trim()||inviting} onClick={handleSendInvite}>
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Message Requests Modal ── */}
      {showMsgReqs && (
        <div style={{ position:'fixed', inset:0, background:'rgba(20,24,60,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:28,
            width:'90%', maxWidth:440, display:'flex', flexDirection:'column', gap:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.3)', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontWeight:700, fontSize:18 }}>Message Requests</div>
            {msgRequests.length === 0 && (
              <div style={{ textAlign:'center', color:'var(--text-muted)', padding:20 }}>No pending requests</div>
            )}
            {msgRequests.map(req => (
              <div key={req._id} style={{ display:'flex', alignItems:'center', gap:12,
                padding:'12px 14px', borderRadius:12, background:'var(--bg-elevated)',
                border:'1px solid var(--border)' }}>
                <Avatar src={req.senderId?.profilePicture} username={req.senderId?.username||'?'} size={40} />
                <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                  <div style={{ fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.senderId?.username||'User'}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>wants to message you</div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button className="btn btn-sm btn-primary"
                    onClick={() => handleAcceptMsgReq(req._id)}>Accept</button>
                  <button className="btn btn-sm btn-ghost"
                    style={{ color:'var(--red)' }}
                    onClick={() => handleDeclineMsgReq(req._id)}>Decline</button>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => setShowMsgReqs(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ── My Invites Modal ── */}
      {showInvites && (
        <div style={{ position:'fixed', inset:0, background:'rgba(20,24,60,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:28,
            width:'90%', maxWidth:440, display:'flex', flexDirection:'column', gap:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.3)', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontWeight:700, fontSize:18 }}>Group Invites</div>
            {myInvites.length === 0 && (
              <div style={{ textAlign:'center', color:'var(--text-muted)', padding:20 }}>No pending invites</div>
            )}
            {myInvites.map(inv => (
              <div key={inv._id} style={{ display:'flex', alignItems:'center', gap:12,
                padding:'12px 14px', borderRadius:12, background:'var(--bg-elevated)',
                border:'1px solid var(--border)' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--yellow)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontWeight:700, fontSize:16, flexShrink:0 }}>
                  {inv.groupId?.name?.[0]?.toUpperCase()||'G'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{inv.groupId?.name||'Group'}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                    Invited by {inv.invitedBy?.username}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-sm btn-primary"
                    onClick={() => handleAcceptInvite(inv._id, inv.groupId)}>Accept</button>
                  <button className="btn btn-sm btn-ghost"
                    style={{ color:'var(--red)' }}
                    onClick={() => handleDeclineInvite(inv._id)}>Decline</button>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => setShowInvites(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}