# Instagram Clone — MERN Backend  
### Phase 2: Real-time Chat + Multiplayer Games

## Stack
| Layer | Tech |
|-------|------|
| Server | Node.js + Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Real-time | **Socket.io v4** (namespaced) |
| File uploads | Multer |

## Setup

```bash
cd server
npm install
cp .env.example .env   # fill in MONGO_URI and JWT_SECRET
npm run dev
```

## Folder Structure

```
server/
├── controllers/
│   ├── authController.js
│   ├── chatController.js       ← NEW
│   ├── gameController.js       ← NEW
│   ├── messageController.js    ← NEW
│   ├── postController.js
│   └── userController.js
├── data/
│   └── questionBank.js         ← NEW  (20 quiz + 15 puzzle questions)
├── middleware/
│   ├── auth.js
│   └── upload.js
├── models/
│   ├── ChatRequest.js          ← NEW
│   ├── GameRoom.js             ← NEW
│   ├── Message.js              ← NEW
│   ├── Post.js
│   └── User.js
├── routes/
│   ├── auth.js
│   ├── chat.js                 ← NEW
│   ├── games.js                ← NEW
│   ├── messages.js             ← NEW
│   ├── posts.js
│   └── users.js
├── socket/
│   ├── chatSocket.js           ← NEW  (/chat namespace)
│   └── gameSocket.js           ← NEW  (/game namespace)
├── uploads/
├── .env.example
├── package.json
└── server.js                   ← UPDATED
```

## REST API

All protected routes: `Authorization: Bearer <token>`

### Chat Requests
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/chat/request` | `{ receiverId }` |
| PUT | `/api/chat/accept` | `{ requestId }` |
| PUT | `/api/chat/reject` | `{ requestId }` |
| GET | `/api/chat/requests` | — |

### Messages
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/messages/send` | `{ receiverId, messageText }` |
| GET | `/api/messages/conversations` | All DM threads |
| GET | `/api/messages/:conversationId` | History. `?page=1&limit=30` |

### Games
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/games/rooms` | `?gameType=quiz` |
| POST | `/api/games/create` | `{ gameType, maxPlayers, questionCount, questionTimeLimit }` |
| GET | `/api/games/:roomCode` | Room details |
| GET | `/api/games/history` | Finished games |

## Socket.io

### Connection
```js
const chatSocket = io("http://localhost:5000/chat", { auth: { token: JWT } });
const gameSocket = io("http://localhost:5000/game", { auth: { token: JWT } });
```

### /chat events
| Direction | Event | Payload |
|-----------|-------|---------|
| C→S | `joinRoom` | `{ conversationId }` |
| C→S | `sendMessage` | `{ receiverId, messageText }` |
| C→S | `typing` / `stopTyping` | `{ conversationId }` |
| C→S | `markRead` | `{ conversationId }` |
| S→C | `receiveMessage` | Message object |
| S→C | `chatRequest` | `{ requestId, from }` |
| S→C | `chatRequestAccepted` | `{ requestId, by }` |
| S→C | `userOnline` / `userOffline` | `{ userId }` |

### /game events
| Direction | Event | Payload |
|-----------|-------|---------|
| C→S | `createRoom` | `{ gameType, maxPlayers, questionCount, questionTimeLimit }` |
| C→S | `joinRoom` | `{ roomCode }` |
| C→S | `invitePlayer` | `{ roomCode, inviteeId }` |
| C→S | `playerReady` | `{ roomCode }` |
| C→S | `startGame` | `{ roomCode }` |
| C→S | `submitAnswer` | `{ roomCode, questionIndex, answer }` |
| C→S | `leaveRoom` | `{ roomCode }` |
| S→C | `roomCreated` | Room summary |
| S→C | `playerJoined` / `playerLeft` | `{ player, players }` |
| S→C | `gameInvite` | `{ roomCode, gameType, from }` |
| S→C | `startGame` | First question + metadata |
| S→C | `gameUpdate` | `{ event: nextQuestion|timeUp|allAnswered|answerSubmitted }` |
| S→C | `endGame` | `{ leaderboard, winner }` |

## Game Flow
```
createRoom → players joinRoom → playerReady → startGame (host)
  → question loop (submitAnswer / auto-advance on timeout)
  → endGame (leaderboard + winner)
```
