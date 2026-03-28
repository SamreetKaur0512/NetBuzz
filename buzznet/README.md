# Vibe — Full-Stack MERN Social Media App

A full-stack Instagram-like social media application with real-time messaging and multiplayer games.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, React Router v6, Axios, Socket.io-client |
| Backend | Node.js, Express.js |
| Database | MongoDB with Mongoose |
| Auth | JWT + bcryptjs |
| Real-time | Socket.io v4 (namespaced: `/chat`, `/game`) |
| File Uploads | Multer |

---

## Project Structure

```
vibe-app/
├── package.json              ← Root scripts (runs both server + client)
├── .gitignore
│
├── server/                   ← Express + Socket.io backend
│   ├── server.js             ← Entry point, HTTP server, Socket.io setup
│   ├── package.json
│   ├── .env.example
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── chatController.js
│   │   ├── gameController.js
│   │   ├── messageController.js
│   │   ├── postController.js
│   │   └── userController.js
│   ├── middleware/
│   │   ├── auth.js           ← JWT verifyToken, optionalAuth
│   │   └── upload.js         ← Multer config
│   ├── models/
│   │   ├── User.js
│   │   ├── Post.js
│   │   ├── Message.js
│   │   ├── ChatRequest.js
│   │   └── GameRoom.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── posts.js
│   │   ├── chat.js
│   │   ├── messages.js
│   │   └── games.js
│   ├── socket/
│   │   ├── chatSocket.js     ← Real-time DM events
│   │   └── gameSocket.js     ← Multiplayer game engine
│   ├── data/
│   │   └── questionBank.js   ← 35 quiz + puzzle questions
│   └── uploads/              ← Created automatically at runtime
│
└── client/                   ← React frontend
    ├── package.json
    ├── .env.example
    ├── public/
    │   └── index.html
    └── src/
        ├── App.jsx            ← Router + protected routes
        ├── index.js / index.css
        ├── context/
        │   ├── AuthContext.jsx
        │   └── SocketContext.jsx
        ├── services/
        │   └── api.js         ← All API calls (Axios)
        ├── components/
        │   ├── layout/Sidebar.jsx
        │   ├── ui/index.jsx   ← Avatar, Toast, Modal, Icons
        │   └── feed/PostCard.jsx
        └── pages/
            ├── LoginPage.jsx
            ├── RegisterPage.jsx
            ├── HomeFeed.jsx
            ├── ProfilePage.jsx
            ├── UploadPost.jsx
            ├── ChatPage.jsx
            ├── GameLobby.jsx
            └── GameRoom.jsx
```

---

## Quick Start

### Prerequisites
- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **MongoDB** running locally or a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) URI

---

### 1. Install dependencies

```bash
cd vibe-app
npm run install:all
```

This installs root, server, and client dependencies in one command.

---

### 2. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/vibe_app
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=7d
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

---

### 3. Configure the client

```bash
cd client
cp .env.example .env
```

Edit `client/.env`:

```env
REACT_APP_SERVER_URL=http://localhost:5000
```

---

### 4. Run in development mode

From the **root** of the project:

```bash
npm run dev
```

This starts both servers concurrently:
- **Backend** → `http://localhost:5000`
- **Frontend** → `http://localhost:3000`

Or run them separately:

```bash
# Terminal 1 — backend
npm run server

# Terminal 2 — frontend
npm run client
```

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, receive JWT |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id` | Get profile |
| PUT | `/api/users/update/:id` | Update profile + avatar |
| PUT | `/api/users/follow/:id` | Follow user |
| PUT | `/api/users/unfollow/:id` | Unfollow user |
| PUT | `/api/users/block/:id` | Block/unblock toggle |

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/posts/feed` | Paginated home feed |
| GET | `/api/posts/user/:id` | User's posts |
| POST | `/api/posts/create` | Upload photo/video post |
| DELETE | `/api/posts/:id` | Delete own post |
| PUT | `/api/posts/like/:id` | Toggle like |
| POST | `/api/posts/comment/:id` | Add comment |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/request` | Send chat request |
| PUT | `/api/chat/accept` | Accept request |
| PUT | `/api/chat/reject` | Reject request |
| GET | `/api/messages/conversations` | List conversations |
| GET | `/api/messages/:conversationId` | Message history |
| POST | `/api/messages/send` | Send message (REST) |

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/games/rooms` | List open rooms |
| POST | `/api/games/create` | Create room |
| GET | `/api/games/:roomCode` | Room details |
| GET | `/api/games/history` | Game history |

---

## Socket.io Events

### Connect
```js
// Chat
const chatSocket = io("http://localhost:5000/chat", { auth: { token: JWT } });

// Game
const gameSocket = io("http://localhost:5000/game", { auth: { token: JWT } });
```

### Chat Events (`/chat` namespace)
| Event | Direction | Description |
|-------|-----------|-------------|
| `joinRoom` | C→S | Subscribe to DM thread |
| `sendMessage` | C→S | Send message |
| `receiveMessage` | S→C | Incoming message |
| `typing` / `stopTyping` | C↔S | Typing indicators |
| `markRead` | C→S | Mark messages read |
| `userOnline` / `userOffline` | S→C | Presence events |

### Game Events (`/game` namespace)
| Event | Direction | Description |
|-------|-----------|-------------|
| `createRoom` | C→S | Create new room (ack: roomCode) |
| `joinRoom` | C→S | Join by room code |
| `invitePlayer` | C→S | Invite user to room |
| `playerReady` | C→S | Signal ready |
| `startGame` | C→S | Host starts (needs 2+ players) |
| `submitAnswer` | C→S | Submit option index (0–3) |
| `leaveRoom` | C→S | Leave room |
| `startGame` | S→C | Game started, first question |
| `gameUpdate` | S→C | nextQuestion / timeUp / allAnswered |
| `endGame` | S→C | Results + leaderboard |

---

## Features

### Social
- Register / Login with JWT
- Home feed with infinite scroll
- Like and comment on posts
- Upload photos and videos (drag-and-drop)
- Public and private profiles
- Follow / unfollow / block users

### Real-time Chat
- Chat request system (accept/reject before messaging)
- Real-time messaging via Socket.io
- Typing indicators
- Read receipts
- Unread message counts

### Multiplayer Games
- **Knowledge Quiz** — General knowledge (Science, History, Geography, Tech)
- **Mind Puzzles** — Logic riddles, math, sequences
- Create rooms with custom settings (player count, question count, time limit)
- Invite friends by room code
- Live countdown timer per question
- Early advance when all players answer
- Live leaderboard throughout the game
- Final results screen with rankings

---

## Production Build

```bash
# Build React client
npm run build

# The built files land in client/build/
# Serve them statically from Express or deploy to a CDN
```
