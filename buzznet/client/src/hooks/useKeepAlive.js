// client/src/hooks/useKeepAlive.js
// Pings the Render backend every 14 minutes to prevent it from sleeping.
// Render free tier spins down after 15 min of inactivity — this keeps it warm.
// Import and call this once in your App.jsx.

import { useEffect } from 'react';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes

export default function useKeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch(`${SERVER}/api/health`)
        .then(() => console.log('[KeepAlive] Server pinged'))
        .catch(() => {}); // silently ignore failures
    };

    // Ping immediately on mount, then every 14 minutes
    ping();
    const interval = setInterval(ping, PING_INTERVAL);
    return () => clearInterval(interval);
  }, []);
}