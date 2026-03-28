# Vibe — React Frontend

Social media app frontend connecting to the MERN backend.

## Stack
- React 18
- React Router v6
- Axios
- Socket.io-client v4

## Setup

```bash
cd client
npm install
cp .env.example .env   # set REACT_APP_SERVER_URL
npm start
```

## Folder Structure

```
client/src/
├── App.jsx                      # Router + layout wrapper
├── index.js / index.css         # Entry point + global design system
├── context/
│   ├── AuthContext.jsx          # JWT auth state + login/logout
│   └── SocketContext.jsx        # Socket.io /chat and /game namespaces
├── services/
│   └── api.js                   # Axios instance + all API methods
├── components/
│   ├── layout/
│   │   └── Sidebar.jsx          # Responsive sidebar nav
│   ├── ui/
│   │   └── index.jsx            # Avatar, Spinner, Toast, Modal, Icons
│   └── feed/
│       └── PostCard.jsx         # Like, comment, media card
└── pages/
    ├── LoginPage.jsx
    ├── RegisterPage.jsx
    ├── HomeFeed.jsx             # Infinite scroll feed
    ├── ProfilePage.jsx          # Follow/unfollow, edit profile, post grid
    ├── UploadPost.jsx           # Drag-and-drop media upload
    ├── ChatPage.jsx             # Real-time DM with Socket.io
    ├── GameLobby.jsx            # Browse/create game rooms
    └── GameRoom.jsx             # Full in-game screen (quiz/puzzle)
```

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | LoginPage | Email + password auth |
| `/register` | RegisterPage | Create account with private toggle |
| `/` | HomeFeed | Infinite scroll, like, comment |
| `/profile/:id` | ProfilePage | Stats, post grid, follow, edit |
| `/upload` | UploadPost | Drag-and-drop photo/video |
| `/chat` | ChatPage | Real-time DM via Socket.io |
| `/games` | GameLobby | Browse rooms, create with settings |
| `/games/:roomCode` | GameRoom | Waiting room → live quiz → results |

## Design System

Dark editorial aesthetic with a warm gold accent (`#c8a96e`).
Typography: Playfair Display (display) + DM Sans (body).
All design tokens in CSS variables at `:root`.
