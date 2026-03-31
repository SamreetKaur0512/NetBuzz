import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { Icons, Modal, LoadingCenter, toast } from '../components/ui';

const GAME_TYPES = [
  { type: 'quiz',   icon: '🧠', name: 'Knowledge Quiz',    desc: 'Answer general knowledge questions. Fastest & most correct answers win.' },
  { type: 'puzzle', icon: '🔮', name: 'Mind Puzzles',      desc: 'Logic riddles, math challenges & sequence puzzles.' },
  { type: 'wyr',    icon: '🤔', name: 'Would You Rather',  desc: 'Vote on dilemmas. Minority gets eliminated each round. Last 2 standing win!' },
  { type: 'ttt',    icon: '⭕', name: 'Tic Tac Toe',        desc: 'Get symbols in a row, column or diagonal to win! Board grows with more players.' },
  { type: 'draw',   icon: '🎨', name: 'Draw & Guess',       desc: 'One player draws a secret word, others race to guess it! Most points wins.' },
  { type: 'snake',  icon: '🐍', name: 'Snake',               desc: 'Control your snake, eat food & avoid walls and other snakes! Most food in time wins.' },
  { type: 'aiquiz', icon: '🤖', name: 'AI Quiz Master',      desc: 'Choose any topic, AI drills down to your exact interest and generates unique questions!' },
];

export default function GameLobby() {
  const navigate        = useNavigate();
  const { gameSocket }  = useSocket();
  const [rooms, setRooms]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedType, setSelectedType] = useState('quiz');
  const [createOpen, setCreateOpen]     = useState(false);

  const [creating, setCreating]         = useState(false);
  const [joinCode, setJoinCode]         = useState('');
  const [createForm, setCreateForm]     = useState({
    gameType: 'wyr', maxPlayers: 8, questionCount: 10, questionTimeLimit: 120, snakeSpeed: 'normal',
  });
  const roomsRef = useRef(null);

  useEffect(() => {
    gameAPI.listRooms(selectedType)
      .then(res => setRooms(res.data.rooms || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedType]);

  // Listen for socket create confirmation
  useEffect(() => {
    if (!gameSocket) return;
    gameSocket.on('roomCreated', ({ roomCode }) => {
      navigate(`/games/${roomCode}`);
    });
    return () => gameSocket.off('roomCreated');
  }, [gameSocket, navigate]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    navigate(`/games/${joinCode.toUpperCase()}`);
  };

  const handleCreate = () => {
    if (!gameSocket) return toast.error('Socket not connected');
    setCreating(true);
    gameSocket.emit('createRoom', createForm, (res) => {
      setCreating(false);
      if (!res.success) {
        toast.error(res.message);
      }
      // Navigation triggered by 'roomCreated' event
    });
  };



  return (
    <div className="game-lobby">
      {/* Header */}
      <div className="game-lobby-header">
        <div className="game-lobby-title">Game Lobby</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Play real-time multiplayer games with friends.
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Icons.Plus /> Create Room
          </button>
          <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              style={{ width: 160 }}
              placeholder="Room code…"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <button type="submit" className="btn btn-secondary">Join</button>
          </form>

        </div>
      </div>

      {/* Game type selector */}
      <div className="game-type-grid">
        {GAME_TYPES.map(g => (
          <div
            key={g.type}
            className={`game-type-card${selectedType === g.type ? ' selected' : ''}`}
            onClick={() => {
              setSelectedType(g.type);
              setCreateForm(p => ({ ...p, gameType: g.type }));
              setTimeout(() => roomsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }}
          >
            <div className="game-type-icon">{g.icon}</div>
            <div className="game-type-name">{g.name}</div>
            <div className="game-type-desc">{g.desc}</div>
          </div>
        ))}
      </div>

      {/* Open rooms */}
      <div className="rooms-section" ref={roomsRef}>
        <h2>Open Rooms</h2>
        {loading && <LoadingCenter />}
        {!loading && rooms.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🎮</div>
            <div>
              No open rooms for {GAME_TYPES.find(g => g.type === selectedType)?.name || selectedType}.<br/>
              <span style={{ fontSize: 14 }}>Be the first to create one!</span>
            </div>
          </div>
        )}
        <div className="rooms-grid">
          {rooms.map(room => (
            <div key={room._id} className="room-card" onClick={() => navigate(`/games/${room.roomCode}`)}>
              <div style={{ fontSize: 32 }}>
                {room.gameType === 'quiz' ? '🧠' : room.gameType === 'wyr' ? '🤔' : room.gameType === 'ttt' ? '⭕' : room.gameType === 'draw' ? '🎨' : room.gameType === 'snake' ? '🐍' : room.gameType === 'aiquiz' ? '🤖' : '🔮'}
              </div>
              <div className="room-info">
                <div className="room-code">{room.roomCode}</div>
                <div className="room-meta">
                  {room.gameType === 'quiz' ? 'Knowledge Quiz' : room.gameType === 'wyr' ? 'Would You Rather' : room.gameType === 'ttt' ? 'Tic Tac Toe' : room.gameType === 'draw' ? 'Draw & Guess' : room.gameType === 'snake' ? 'Snake' : room.gameType === 'aiquiz' ? 'AI Quiz Master' : 'Mind Puzzles'} · by {room.hostId?.username}
                </div>
              </div>
              <div className="room-players">
                {room.players?.length || 0}/{room.maxPlayers} <Icons.User />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create room modal */}
      {createOpen && (
        <Modal title="Create Game Room" onClose={() => setCreateOpen(false)}>
          <div className="form-group">
            <label className="form-label">Game Type</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GAME_TYPES.map(g => (
                <button
                  key={g.type}
                  type="button"
                  className={`btn btn-sm ${createForm.gameType === g.type ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCreateForm(p => ({ ...p, gameType: g.type }))}
                  style={{ fontSize: 12 }}
                >
                  {g.icon} {g.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Max Players</label>
              <input
                className="form-input"
                type="number" min={2} max={20}
                value={createForm.maxPlayers}
                onChange={e => setCreateForm(p => ({ ...p, maxPlayers: +e.target.value }))}
              />
            </div>
            {/* Snake gets a Speed field; ttt and aiquiz get nothing; others get Questions/Rounds */}
            {createForm.gameType === 'snake' && (
              <div className="form-group">
                <label className="form-label">Speed</label>
                <select
                  className="form-input"
                  value={createForm.snakeSpeed || 'normal'}
                  onChange={e => setCreateForm(p => ({ ...p, snakeSpeed: e.target.value }))}
                >
                  <option value="slow">Slow (easy)</option>
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                  <option value="extreme">Extreme</option>
                </select>
              </div>
            )}
            {(createForm.gameType !== 'ttt' && createForm.gameType !== 'snake') && (
              <div className="form-group">
                <label className="form-label">
                  {createForm.gameType === 'draw' ? 'Rounds' : 'Questions'}
                </label>
                <input
                  className="form-input"
                  type="number" min={5} max={20}
                  value={createForm.questionCount}
                  onChange={e => setCreateForm(p => ({ ...p, questionCount: +e.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              {createForm.gameType === 'ttt' ? 'Time Per Turn (seconds)' : createForm.gameType === 'draw' ? 'Time Per Drawing (seconds)' : createForm.gameType === 'snake' ? 'Game Duration (seconds)' : createForm.gameType === 'aiquiz' ? 'Time Per Question (seconds)' : 'Time Per Question (seconds)'}
            </label>
            <input
              className="form-input"
              type="number" min={10} max={60}
              value={createForm.questionTimeLimit}
              onChange={e => setCreateForm(p => ({ ...p, questionTimeLimit: +e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-full" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-full" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Room'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}