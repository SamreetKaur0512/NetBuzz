import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Sidebar from './components/layout/Sidebar';
import { ToastContainer } from './components/ui';

// ── Lazy-loaded pages (each becomes its own JS chunk — faster initial load) ───
const LoginPage           = lazy(() => import('./pages/LoginPage'));
const RegisterPage        = lazy(() => import('./pages/RegisterPage'));
const HomeFeed            = lazy(() => import('./pages/HomeFeed'));
const ProfilePage         = lazy(() => import('./pages/ProfilePage'));
const UploadPost          = lazy(() => import('./pages/UploadPost'));
const ChatPage            = lazy(() => import('./pages/ChatPage'));
const GameLobby           = lazy(() => import('./pages/GameLobby'));
const GameRoom            = lazy(() => import('./pages/GameRoom'));
const SearchPage          = lazy(() => import('./pages/SearchPage'));
const BlockedUsersPage    = lazy(() => import('./pages/BlockedUsersPage'));
const FollowRequestsPage  = lazy(() => import('./pages/FollowRequestsPage'));

// ── Suspense fallback — shown while any lazy page loads ───────────────────────
const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <div className="spinner" style={{ width: 36, height: 36 }} />
  </div>
);

// ── Protected layout wrapper ──────────────────────────────────────────────────
function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

// ── Guest-only wrapper ────────────────────────────────────────────────────────
function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Guest routes */}
            <Route element={<GuestOnly />}>
              <Route path="/login"    element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Protected routes */}
            <Route element={<ProtectedLayout />}>
              <Route index              element={<HomeFeed />} />
              <Route path="/upload"     element={<UploadPost />} />
              <Route path="/profile/:id" element={<ProfilePage />} />
              <Route path="/chat"       element={<ChatPage />} />
              <Route path="/games"           element={<GameLobby />} />
              <Route path="/games/:roomCode" element={<GameRoom />} />
              <Route path="/search"          element={<SearchPage />} />
              <Route path="/blocked"          element={<BlockedUsersPage />} />
              <Route path="/follow-requests"   element={<FollowRequestsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>

          <ToastContainer />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}