import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Avatar, Icons } from '../ui';
import { userAPI, notificationAPI } from '../../services/api';

const NAV = [
  { to: '/',             icon: Icons.Home,   label: 'Home'          },
  { to: '/upload',       icon: Icons.Plus,   label: 'Create'        },
  { to: '/search',       icon: Icons.Search, label: 'Search'        },
  { to: '/chat',         icon: Icons.Chat,   label: 'Messages'      },
  { to: '/notifications',icon: Icons.Bell,   label: 'Notifications' },
  { to: '/games',        icon: Icons.Game,   label: 'Games'         },
  { to: '/blocked',      icon: Icons.Lock,   label: 'Blocked'       },
];

export default function Sidebar() {
  const { user, logout }    = useAuth();
  const { notifQueue, activeNotif } = useSocket();
  const navigate            = useNavigate();
  const [followReqCount, setFollowReqCount] = useState(0);
  const [unreadNotifs,   setUnreadNotifs]   = useState(0);
  const [menuOpen,       setMenuOpen]       = useState(false);

  useEffect(() => {
    if (!user) return;
    userAPI.getFollowRequests()
      .then(r => setFollowReqCount(r.data.requests?.length || 0))
      .catch(() => {});
    notificationAPI.getAll()
      .then(r => setUnreadNotifs(r.data.unreadCount || 0))
      .catch(() => {});
    const t = setInterval(() => {
      userAPI.getFollowRequests()
        .then(r => setFollowReqCount(r.data.requests?.length || 0))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    if (activeNotif) setUnreadNotifs(p => p + 1);
  }, [activeNotif]);

  const handleNavClick = () => setMenuOpen(false);

  return (
    <>
      <button className="hamburger-btn" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
        <span /><span /><span />
      </button>

      {menuOpen && <div className="hamburger-overlay" onClick={() => setMenuOpen(false)} />}

      <nav className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">BuzzNet.</div>

        {/* --- Sab kuch ab is NAV-ITEMS div ke andar hai --- */}
        <div className="nav-items" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
          
          {/* Main Navigation Links */}
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => {
                if (to === '/notifications') setUnreadNotifs(0);
                handleNavClick();
              }}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon />
                {to === '/notifications' && unreadNotifs > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4,
                    background: 'var(--red)', color: '#fff', borderRadius: '50%',
                    width: 16, height: 16, fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </div>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}

          {/* Profile Link */}
          {user && (
            <NavLink to={`/profile/${user._id}`}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={handleNavClick}>
              <Icons.User />
              <span className="nav-label">Profile</span>
            </NavLink>
          )}

          {/* Follow Requests Link */}
          {user && (
            <NavLink to="/follow-requests"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={handleNavClick}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                {followReqCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4,
                    background: 'var(--red)', color: '#fff', borderRadius: '50%',
                    width: 16, height: 16, fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {followReqCount}
                  </span>
                )}
              </div>
              <span className="nav-label">Requests
                <p style={{ fontSize: 13, color:'dodgerblue', fontWeight: 400, margin: 0 }}>
                  follow req. for private users
                </p>
              </span>
            </NavLink>
          )}

          {/* User Info Section (Now Inside Scroll) */}
          {user && (
            <div className="sidebar-user" 
              style={{ marginTop: '20px', cursor: 'pointer' }}
              onClick={() => { navigate(`/profile/${user._id}`); handleNavClick(); }}>
              <Avatar src={user.profilePicture} username={user.username} size={36} />
              <div className="sidebar-user-info">
                <div className="sidebar-user-name" style={{ fontWeight: 'bold' }}>{user.username}</div>
                <div className="sidebar-user-handle">@{user.userId || user.username}</div>
              </div>
            </div>
          )}

          {/* Logout Button (Now Inside Scroll) */}
          <button className="nav-item" 
            style={{ margin: '10px 0', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => { logout(); handleNavClick(); }} title="Log out">
            <Icons.Logout />
            <span className="nav-label">Log out</span>
          </button>

          {/* Extra Space at Bottom (Taaki laptop bar cover na kare) */}
          <div style={{ height: '80px', flexShrink: 0 }}></div>

        </div> {/* --- NAV-ITEMS yahan band ho raha hai --- */}
      </nav>
    </>
  );
}