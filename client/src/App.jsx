import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Sidebar from './components/layout/Sidebar';
import { ToastContainer } from './components/ui';

// Pages
import LoginPage    from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomeFeed     from './pages/HomeFeed';
import ProfilePage  from './pages/ProfilePage';
import UploadPost   from './pages/UploadPost';
import ChatPage     from './pages/ChatPage';
import GameLobby          from './pages/GameLobby';
import GameRoom           from './pages/GameRoom';
import SearchPage         from './pages/SearchPage';
import BlockedUsersPage    from './pages/BlockedUsersPage';
import FollowRequestsPage  from './pages/FollowRequestsPage';


// ── Protected layout wrapper ──────────────────────────────────
//────────────────
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

          <ToastContainer />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}