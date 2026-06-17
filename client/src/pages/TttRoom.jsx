import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, toast } from '../components/ui';

const LOSER_LINES = [
  "Champions are made in the moments they feel like quitting — don't stop! 🔥",
  "The best players didn't get good by giving up. Come back stronger! 💪",
  "Every loss is a lesson in disguise 📚",
  "The comeback is always stronger than the setback ✨",
  "Legends aren't born, they're made. Keep playing! 🌟",
  "You played well — next time the board is yours! 🎯",
];

function getBoardConfig(playerCount) {
  if (playerCount <= 2) return { size: 3, winLen: 3 };
  if (playerCount === 3) return { size: 5, winLen: 4 };
  if (playerCount === 4) return { size: 6, winLen: 4 };
  if (playerCount <= 6) return { size: 7, winLen: 5 };
  return { size: 8, winLen: 5 };
}

function Board({ board, size, onMove, currentTurn, myId, symbolToColor, winCombo, disabled }) {
  const canPlay  = currentTurn === myId && !disabled;
  const cellSize = size <= 3 ? 88 : size <= 6 ? 58 : size <= 7 ? 50 : 44;
  const fontSize = size <= 3 ? 32 : size <= 6 ? 20 : 16;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
      gap: size <= 3 ? 8 : 5,
      margin: '0 auto',
      width: 'fit-content',
    }}>
      {board.map((cell, i) => {
        const isWin   = winCombo?.includes(i);
        const color   = cell ? (symbolToColor?.[cell] || '#fff') : null;
        return (
          <button key={i} onClick={() => canPlay && !cell && onMove(i)}
            style={{
              width: cellSize, height: cellSize,
              borderRadius: size <= 3 ? 12 : 8,
              border: isWin ? '2px solid var(--yellow)' : '2px solid var(--border)',
              background: isWin
                ? 'linear-gradient(135deg, rgba(108,92,231,0.3), rgba(108,92,231,0.1))'
                : 'var(--bg-elevated)',
              cursor: canPlay && !cell ? 'pointer' : 'default',
              fontSize, fontWeight: 900,
              color: color || (canPlay && !cell ? 'var(--border)' : 'transparent'),
              transition: 'all 0.12s',
              transform: isWin ? 'scale(1.08)' : 'scale(1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {cell || (canPlay && !cell && size <= 3 ? '·' : '')}
          </button>
        );
      })}
    </div>
  );
}

export default function TttRoom({ room, roomCode, players: initPlayers, gameSocket }) {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const myId      = user?._id?.toString();
  const isHost    = (room?.hostId?._id || room?.hostId)?.toString() === myId;

  const [phase,         setPhase]        = useState('waiting');
  const [players,       setPlayers]      = useState(initPlayers || []);
  // Sync players when parent updates (fixes name not showing to joiner without refresh)
  useEffect(() => {
    if (initPlayers?.length) {
      const seen = new Set();
      setPlayers(initPlayers.filter(p => {
        const id = (p.userId?._id || p.userId)?.toString();
        if (seen.has(id)) return false;
        seen.add(id); return true;
      }));
    }
  }, [initPlayers]);

  const [board,         setBoard]        = useState([]);
  const [size,          setSize]         = useState(3);
  const [winLen,        setWinLen]       = useState(3);
  const [currentTurn,   setCurrentTurn]  = useState(null);
  const [playerSymbols, setPlayerSymbols] = useState({});
  const [playerColors,  setPlayerColors]  = useState({});
  const [symbolToColor, setSymbolToColor] = useState({});
  const [winCombo,      setWinCombo]     = useState(null);
  const [gameEnd,       setGameEnd]      = useState(null);
  const [loserLine]     = useState(() => LOSER_LINES[Math.floor(Math.random() * LOSER_LINES.length)]);
  const [timeLeft,      setTimeLeft]     = useState(20);
  const [turnTimeLimit, setTurnTimeLimit] = useState(20);
  const timerRef = useRef(null);

  const startTimer = (limit) => {
    clearInterval(timerRef.current);
    setTimeLeft(limit);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const mySymbol = playerSymbols[myId];
  const myColor  = playerColors[myId];

  useEffect(() => {
    if (!gameSocket) return;

    gameSocket.on('playerJoined', ({ players: p }) => setPlayers(p));
    gameSocket.on('playerLeft',   ({ players: p }) => setPlayers(p));

    gameSocket.on('tttGameStarted', ({ board: b, size: s, winLen: wl, playerSymbols: ps, playerColors: pc, currentTurn: ct, turnTimeLimit: tl, players: pl }) => {
      setBoard(b);
      setSize(s);
      setWinLen(wl);
      setPlayerSymbols(ps);
      setPlayerColors(pc);
      setCurrentTurn(ct?.toString ? ct.toString() : ct);
      setTurnTimeLimit(tl || 20);
      setWinCombo(null);
      setPhase('playing');
      startTimer(tl || 20);
      // Build symbol→color map
      const s2c = {};
      Object.keys(ps).forEach(uid => { s2c[ps[uid]] = pc[uid]; });
      setSymbolToColor(s2c);
    });

    gameSocket.on('tttMoveMade', ({ board: b }) => setBoard(b));

    gameSocket.on('tttTurnChange', ({ currentTurn: ct, board: b }) => {
      setCurrentTurn(ct?.toString ? ct.toString() : ct);
      setBoard(b);
      startTimer(turnTimeLimit);
    });

    gameSocket.on('tttTimeUp', ({ currentTurn: ct, board: b }) => {
      setCurrentTurn(ct?.toString ? ct.toString() : ct);
      setBoard(b);
      startTimer(turnTimeLimit);
    });

    gameSocket.on('tttGameEnd', (result) => {
      clearInterval(timerRef.current);
      setWinCombo(result.combo || null);
      setBoard(result.board);
      setGameEnd(result);
      setPhase('end');
    });

    return () => {
      ['playerJoined','playerLeft','tttGameStarted','tttMoveMade',
       'tttTurnChange','tttTimeUp','tttGameEnd'].forEach(e => gameSocket.off(e));
      clearInterval(timerRef.current);
    };
  }, [gameSocket, myId]);

  const handleMove = (index) => {
    gameSocket?.emit('tttMove', { roomCode, index }, (res) => {
      if (!res?.success) toast.error(res?.message || 'Invalid move');
    });
  };

  const handleStart = () => {
    gameSocket?.emit('tttStartGame', { roomCode }, (res) => {
      if (!res?.success) toast.error(res?.message || 'Failed to start');
    });
  };

  const getUsername = (uid) => {
    const id = uid?.toString ? uid.toString() : uid;
    return players.find(p => (p.userId?.toString?.() || p.userId) === id)?.username || 'Player';
  };

  // ── Waiting ──────────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    const pCount = players.length;
    const config = getBoardConfig(pCount);
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>⭕</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Tic Tac Toe</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.7 }}>
          Board size grows with players!<br/>
          Get <strong>{config.winLen}</strong> in a <strong>row, column or diagonal</strong> on a <strong>{config.size}×{config.size}</strong> board to win 🏆
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          2p→3×3(3) &nbsp;|&nbsp; 3p→5×5(4) &nbsp;|&nbsp; 4p→6×6(4) &nbsp;|&nbsp; 5-6p→7×7(5) &nbsp;|&nbsp; 7-8p→8×8(5)
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {players.map((p, i) => (
            <div key={p.userId} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-elevated)', borderRadius: 30,
              padding: '6px 16px 6px 8px', border: '1px solid var(--border)',
            }}>
              <Avatar username={p.username} size={30} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.username}</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'][i] }}>
                {['✕','○','△','□','★','♦','●','▲'][i]}
              </span>
            </div>
          ))}
        </div>

        {/* Multiplayer only info */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
          Share room code{' '}
          <strong style={{ color: 'var(--yellow, #FFD700)', fontSize: 14 }}>{roomCode}</strong>
          {' '}with other users to play Tic Tac Toe
        </div>
        {isHost && (
          <div>
            <button className="btn btn-primary btn-lg" onClick={handleStart}
              disabled={players.length < 2} style={{ fontSize: 16, padding: '12px 32px' }}>
              🎮 Start Game
            </button>
            {players.length < 2 && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#e74c3c', fontWeight: 600 }}>
                ⚠️ Need at least 2 players to start
              </div>
            )}
          </div>
        )}
        {!isHost && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for host to start…</div>
        )}
      </div>
    );
  }

  // ── End screen ───────────────────────────────────────────────────────────────
  if (phase === 'end' && gameEnd) {
    const amWinner = !gameEnd.draw &&
      (gameEnd.winner?.userId?.toString() === myId || gameEnd.winner?.userId === myId);

    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>
          {gameEnd.draw ? '🤝' : amWinner ? '🏆' : '💡'}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          {gameEnd.draw ? "It's a Draw!" : amWinner ? 'You Won!' : 'Well played!'}
        </div>

        {!amWinner && !gameEnd.draw && (
          <div style={{
            fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic',
            maxWidth: 300, margin: '0 auto 16px', lineHeight: 1.6,
          }}>{loserLine}</div>
        )}

        {gameEnd.winner && (
          <div style={{ fontSize: 15, marginBottom: 16, color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{gameEnd.winner.username}</span>
            {' '}got{' '}
            <span style={{ fontWeight: 900, color: symbolToColor[gameEnd.winner.symbol] || 'var(--yellow)', fontSize: 18 }}>
              {gameEnd.winner.symbol}
            </span>
            {' '}{winLen} in a row! 🎉
          </div>
        )}

        {/* Final board */}
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <Board
            board={gameEnd.board || board}
            size={size}
            onMove={() => {}}
            currentTurn={null} myId={myId}
            symbolToColor={symbolToColor}
            winCombo={winCombo}
            disabled={true}
          />
        </div>

        {/* Players */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          {gameEnd.players?.map(p => {
            const isWinner = gameEnd.winner?.userId?.toString() === p.userId?.toString();
            return (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: isWinner ? 'rgba(var(--yellow),0.08)' : 'var(--bg-elevated)',
                border: `2px solid ${isWinner ? 'var(--yellow)' : 'var(--border)'}`,
                borderRadius: 30, padding: '6px 16px 6px 8px',
              }}>
                <Avatar username={p.username} size={28} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.username}</span>
                <span style={{ fontWeight: 900, fontSize: 18, color: p.color }}>{p.symbol}</span>
                {isWinner && <span>🏆</span>}
              </div>
            );
          })}
        </div>

        <button className="btn btn-secondary" onClick={() => navigate('/games')}>
          Back to Lobby
        </button>
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────────────────────
  const isMyTurn     = currentTurn === myId;
  const currentName  = getUsername(currentTurn);
  const currentSym   = playerSymbols[currentTurn] || '';
  const currentColor = playerColors[currentTurn]  || 'var(--text)';

  return (
    <div>
      {/* Turn indicator */}
      <div style={{
        textAlign: 'center', marginBottom: 14,
        padding: '10px 16px', borderRadius: 12,
        background: isMyTurn ? 'rgba(var(--yellow),0.08)' : 'var(--bg-elevated)',
        border: `2px solid ${isMyTurn ? 'var(--yellow)' : 'var(--border)'}`,
        transition: 'all 0.3s',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {isMyTurn ? '🎯 Your turn!' : (
            <>
              <span style={{ fontWeight: 900, fontSize: 18, color: currentColor }}>{currentSym}</span>
              {' '}{currentName}'s turn
            </>
          )}
        </span>
      </div>

      {/* Timer */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `3px solid ${timeLeft <= 5 ? '#e74c3c' : 'var(--yellow)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 18,
          color: timeLeft <= 5 ? '#e74c3c' : 'var(--text)',
          transition: 'border-color 0.3s, color 0.3s',
        }}>
          {timeLeft}
        </div>
      </div>

      {/* Players legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 14 }}>
        {players.map(p => {
          const uid    = p.userId?.toString?.() || p.userId;
          const sym    = playerSymbols[uid];
          const color  = playerColors[uid];
          const isMe   = uid === myId;
          const isTurn = uid === currentTurn;
          return (
            <div key={uid} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px 3px 6px', borderRadius: 20,
              background: isTurn ? 'var(--bg-elevated)' : 'transparent',
              border: `1.5px solid ${isTurn ? color || 'var(--yellow)' : 'var(--border)'}`,
              opacity: isTurn ? 1 : 0.7,
              transition: 'all 0.2s',
            }}>
              <Avatar username={p.username} size={20} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{isMe ? 'You' : p.username}</span>
              <span style={{ fontWeight: 900, fontSize: 14, color }}>{sym}</span>
            </div>
          );
        })}
      </div>

      {/* Board */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <Board
          board={board} size={size}
          onMove={handleMove}
          currentTurn={currentTurn} myId={myId}
          symbolToColor={symbolToColor}
          winCombo={winCombo}
          disabled={false}
        />
      </div>

      {/* Win condition reminder */}
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        Get <strong>{winLen}</strong> in a row, column or diagonal to win on this {size}×{size} board
        {mySymbol && (
          <> — Your symbol is <span style={{ fontWeight: 900, color: myColor, fontSize: 14 }}>{mySymbol}</span></>
        )}
      </div>
    </div>
  );
}