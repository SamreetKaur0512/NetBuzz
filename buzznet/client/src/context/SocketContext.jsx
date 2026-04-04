import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [chatSocket, setChatSocket]       = useState(null);
  const [gameSocket, setGameSocket]       = useState(null);
  const [chatConnected, setChatConnected] = useState(false);
  const [gameConnected, setGameConnected] = useState(false);

  // ── Global notification queue ─────────────────────────────────────────────
  const [notifQueue, setNotifQueue] = useState([]);
  const [activeNotif, setActiveNotif] = useState(null);

  // Show next notif from queue
  useEffect(() => {
    if (!activeNotif && notifQueue.length > 0) {
      setActiveNotif(notifQueue[0]);
      setNotifQueue(prev => prev.slice(1));
    }
  }, [activeNotif, notifQueue]);

  const pushNotif = useCallback((notif) => {
    setNotifQueue(prev => [...prev, notif]);
  }, []);

  const dismissNotif = useCallback(() => {
    setActiveNotif(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setChatSocket(s => { s?.disconnect(); return null; });
      setGameSocket(s => { s?.disconnect(); return null; });
      setChatConnected(false);
      setGameConnected(false);
      return;
    }

    const chat = io(`${SERVER}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    chat.on('connect',    () => setChatConnected(true));
    chat.on('disconnect', () => setChatConnected(false));

    // ✅ Global socket notifications — work on ALL pages
    chat.on('followRequestAccepted', ({ by }) => {
      pushNotif({ type: 'followAccepted', username: by.username, picture: by.profilePicture });
    });
    chat.on('newFollower', ({ by }) => {
      pushNotif({ type: 'newFollower', username: by.username, picture: by.profilePicture });
    });
    chat.on('chatRequestAccepted', ({ by }) => {
      pushNotif({ type: 'messageAccepted', username: by.username, picture: by.profilePicture });
    });

    setChatSocket(chat);

    const game = io(`${SERVER}/game`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    game.on('connect',    () => setGameConnected(true));
    game.on('disconnect', () => setGameConnected(false));
    setGameSocket(game);

    return () => {
      chat.disconnect();
      game.disconnect();
    };
  }, [token, pushNotif]);

  return (
    <SocketContext.Provider value={{
      chatSocket, gameSocket, chatConnected, gameConnected,
      activeNotif, dismissNotif,
    }}>
      {children}

      {/* ── Global Notification Modal — shows on ANY page ── */}
      {activeNotif && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
          zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'24px', animation:'fadeIn 0.2s ease' }}>
          <div style={{ background:'var(--bg-card,#fff)', borderRadius:20,
            padding:'32px 28px', maxWidth:340, width:'100%', textAlign:'center',
            boxShadow:'0 8px 40px rgba(0,0,0,0.3)', animation:'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>
              {activeNotif.type === 'newFollower' ? '👤' : '🎉'}
            </div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:8,
              fontFamily:'var(--font-heading)', color:'var(--text-primary)' }}>
              {activeNotif.type === 'followAccepted' && 'Follow Request Accepted!'}
              {activeNotif.type === 'newFollower'    && 'New Follower!'}
              {activeNotif.type === 'messageAccepted' && 'Message Request Accepted!'}
            </div>
            <div style={{ fontSize:15, color:'var(--text-secondary)', marginBottom:24, lineHeight:1.6 }}>
              <strong>{activeNotif.username}</strong>{' '}
              {activeNotif.type === 'followAccepted'  && 'accepted your follow request. You can now see their posts!'}
              {activeNotif.type === 'newFollower'     && 'started following you!'}
              {activeNotif.type === 'messageAccepted' && 'accepted your message request. You can now chat!'}
            </div>
            {/* Show queue count if more waiting */}
            {notifQueue.length > 0 && (
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
                +{notifQueue.length} more notification{notifQueue.length > 1 ? 's' : ''}
              </div>
            )}
            <button className="btn btn-primary"
              style={{ padding:'10px 36px', fontSize:15, fontWeight:700 }}
              onClick={dismissNotif}>OK</button>
          </div>
        </div>
      )}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}