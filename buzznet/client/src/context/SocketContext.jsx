import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [chatSocket, setChatSocket] = useState(null);
  const [gameSocket, setGameSocket] = useState(null);
  const [chatConnected, setChatConnected] = useState(false);
  const [gameConnected, setGameConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setChatSocket(s => { s?.disconnect(); return null; });
      setGameSocket(s => { s?.disconnect(); return null; });
      setChatConnected(false);
      setGameConnected(false);
      return;
    }

    // ── Chat namespace ────────────────────────────────────────────────────
    const chat = io(`${SERVER}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    chat.on('connect',    () => setChatConnected(true));
    chat.on('disconnect', () => setChatConnected(false));
    setChatSocket(chat);

    // ── Game namespace ────────────────────────────────────────────────────
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
  }, [token]);

  return (
    <SocketContext.Provider value={{
      chatSocket,
      gameSocket,
      chatConnected,
      gameConnected,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be inside SocketProvider');
  return ctx;
};