import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, toast } from '../components/ui';

const COLORS = ['#000000','#ffffff','#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#1abc9c','#e91e63','#795548','#607d8b'];
const SIZES  = [3, 6, 12, 20];

const LOSER_LINES = [
  "Champions are made in the moments they feel like quitting — don't stop! 🔥",
  "The best players didn't get good by giving up. Come back stronger! 💪",
  "Every round you get better at reading the art! 📚",
  "The comeback is always stronger than the setback ✨",
  "Legends aren't born, they're made. Keep playing! 🌟",
];

export default function DrawRoom({ room, roomCode, players: initPlayers, gameSocket }) {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const myId       = user?._id?.toString();
  const isHost     = (room?.hostId?._id || room?.hostId)?.toString() === myId;
  const username   = user?.username || '';

  const canvasRef  = useRef(null);
  const drawing    = useRef(false);
  const lastPos    = useRef(null);
  const ctxRef     = useRef(null);

  const [phase,        setPhase]       = useState('waiting');
  const [players,      setPlayers]     = useState(initPlayers || []);
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

  const [isDrawer,     setIsDrawer]    = useState(false);
  const [secretWord,   setSecretWord]  = useState('');
  const [hint,         setHint]        = useState('');
  const [drawerName,   setDrawerName]  = useState('');
  const [drawerId,     setDrawerId]    = useState(null);
  const [timeLeft,     setTimeLeft]    = useState(60);
  const [timeLimit,    setTimeLimit]   = useState(60);
  const [messages,     setMessages]    = useState([]);
  const [guessText,    setGuessText]   = useState('');
  const [scoreboard,   setScoreboard]  = useState([]);
  const [round,        setRound]       = useState(1);
  const [totalRounds,  setTotalRounds] = useState(3);
  const [gameEnd,      setGameEnd]     = useState(null);
  const [color,        setColor]       = useState('#000000');
  const [brushSize,    setBrushSize]   = useState(6);
  const [turnEndInfo,  setTurnEndInfo] = useState(null);
  const [guessCount,   setGuessCount]  = useState({ guessed: 0, total: 0 });
  const [iGuessed,     setIGuessed]    = useState(false);
  const [countdown,    setCountdown]   = useState(null); // 3,2,1 before drawer starts
  const [loserLine]    = useState(() => LOSER_LINES[Math.floor(Math.random() * LOSER_LINES.length)]);
  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ── Canvas setup via callback ref ──────────────────────────────────────────
  const initCanvas = useCallback((canvas) => {
    if (!canvas) return;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctxRef.current = ctx;
  }, []);

  const startTimer = useCallback((limit) => {
    clearInterval(timerRef.current);
    setTimeLeft(limit);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Draw on canvas ───────────────────────────────────────────────────────────
  const drawLine = useCallback((x1, y1, x2, y2, strokeColor, size, emit = false) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = size;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (emit && gameSocket) {
      gameSocket.emit('drawStroke', {
        roomCode,
        stroke: { x1, y1, x2, y2, color: strokeColor, size },
      });
    }
  }, [gameSocket, roomCode]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const handlePointerDown = (e) => {
    if (!isDrawer) return;
    e.preventDefault();
    drawing.current = true;
    const pos = getPos(e, canvasRef.current);
    lastPos.current = pos;
    // Draw a dot on click
    drawLine(pos.x, pos.y, pos.x + 0.1, pos.y + 0.1, color, brushSize, true);
  };

  const handlePointerMove = (e) => {
    if (!drawing.current || !isDrawer) return;
    e.preventDefault();
    const pos = getPos(e, canvasRef.current);
    if (lastPos.current) {
      drawLine(lastPos.current.x, lastPos.current.y, pos.x, pos.y, color, brushSize, true);
    }
    lastPos.current = pos;
  };

  const handlePointerUp = (e) => {
    drawing.current = false;
    lastPos.current = null;
  };

  // Keep old names as aliases for JSX
  const handleMouseDown  = handlePointerDown;
  const handleMouseMove  = handlePointerMove;
  const handleMouseUp    = handlePointerUp;

  const handleClear = () => {
    const ctx = ctxRef.current;
    if (!ctx || !isDrawer) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    gameSocket?.emit('drawClear', { roomCode });
  };

  // ── Socket listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameSocket) return;

    gameSocket.on('playerJoined', ({ players: p }) => setPlayers(p));
    gameSocket.on('playerLeft',   ({ players: p }) => setPlayers(p));

    gameSocket.on('drawGameStarted', ({ players: pl, totalRounds: tr }) => {
      setScoreboard(pl.map(p => ({ ...p, score: 0 })));
      setTotalRounds(tr);
      setPhase('starting');
    });

    gameSocket.on('drawYourTurn', ({ word, hint: h, timeLimit: tl, round: r, totalRounds: tr, drawerName: dn }) => {
      setIsDrawer(true);
      setSecretWord(word);
      setHint(h);
      setDrawerName(dn || user?.username || '');
      setRound(r);
      setTotalRounds(tr);
      setTimeLimit(tl);
      setTurnEndInfo(null);
      // Show countdown 3-2-1 before drawing starts
      setCountdown(3);
      setPhase('countdown');
      let count = 3;
      const cd = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(cd);
          setCountdown(null);
          setPhase('drawing');
          startTimer(tl);
        } else {
          setCountdown(count);
        }
      }, 800);
      // Clear canvas
      setTimeout(() => {
        if (ctxRef.current && canvasRef.current) {
          ctxRef.current.fillStyle = '#ffffff';
          ctxRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }, 200);
    });

    gameSocket.on('drawNewTurn', ({ drawerId: did, drawerName: dn, hint: h, timeLimit: tl, round: r, totalRounds: tr }) => {
      const newDrawerId = did?.toString ? did.toString() : did;
      // If I am the drawer, drawYourTurn already handled my state — skip
      if (newDrawerId === myId) return;
      setIsDrawer(false);
      setDrawerId(newDrawerId);
      setDrawerName(dn);
      setHint(h);
      setSecretWord('');
      setRound(r);
      setTotalRounds(tr);
      setTimeLimit(tl);
      setTurnEndInfo(null);
      setMessages([]);
      setGuessCount({ guessed: 0, total: 0 });
      setIGuessed(false);
      setPhase('drawing');
      startTimer(tl);
      setTimeout(() => {
        if (ctxRef.current && canvasRef.current) {
          ctxRef.current.fillStyle = '#ffffff';
          ctxRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }, 200);
    });

    gameSocket.on('drawStroke', ({ stroke }) => {
      if (!ctxRef.current) return;
      drawLine(stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size, false);
    });

    gameSocket.on('drawClear', () => {
      const ctx = ctxRef.current;
      if (ctx && canvasRef.current) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    });

    gameSocket.on('drawMessage', ({ username: uname, text, correct, isSystem }) => {
      setMessages(prev => [...prev, { username: uname, text, correct, isSystem, id: Date.now() }]);
    });

    // Private confirmation to the guesser
    gameSocket.on('drawYouGuessed', ({ points }) => {
      setIGuessed(true);
      setGuessCount(prev => ({ ...prev, guessed: prev.guessed + 1 }));
      setMessages(prev => [...prev, {
        username: '', text: `✅ Correct! You'll get +${points} pts at end of turn`,
        correct: true, isSystem: true, id: Date.now(),
      }]);
    });

    // Public count update — doesn't reveal who guessed
    gameSocket.on('drawGuessCount', ({ guessed, total, guesserName }) => {
      setGuessCount({ guessed, total });
      setMessages(prev => [...prev, {
        username: '', text: `✅ ${guesserName} guessed it! (${guessed}/${total})`,
        correct: false, isSystem: true, id: Date.now(),
      }]);
    });

    gameSocket.on('drawTurnEnd', ({ word, timeUp, scoreboard: sb, pointsBreakdown }) => {
      clearInterval(timerRef.current);
      setTurnEndInfo({ word, timeUp, pointsBreakdown });
      setScoreboard(sb || []);
      setGuessCount({ guessed: 0, total: 0 });
      setIGuessed(false);
      setPhase('turnEnd');
    });

    gameSocket.on('drawRoundStart', ({ round: r, totalRounds: tr, scoreboard: sb }) => {
      setRound(r);
      setTotalRounds(tr);
      setScoreboard(sb || []);
      setMessages([]);
      setPhase('roundStart');
    });

    gameSocket.on('drawGameEnd', (result) => {
      clearInterval(timerRef.current);
      setGameEnd(result);
      setPhase('end');
    });

    return () => {
      ['playerJoined','playerLeft','drawGameStarted','drawYourTurn','drawNewTurn',
       'drawStroke','drawClear','drawMessage','drawYouGuessed','drawGuessCount',
       'drawTurnEnd','drawRoundStart','drawGameEnd'].forEach(e => gameSocket.off(e));
      clearInterval(timerRef.current);
    };
  }, [gameSocket, drawLine, startTimer]);

  // Auto scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleGuess = (e) => {
    e.preventDefault();
    if (!guessText.trim() || isDrawer) return;
    gameSocket?.emit('drawGuess', { roomCode, guess: guessText.trim() }, (res) => {
      if (res?.correct) setGuessText('');
    });
    setGuessText('');
  };

  // ── Waiting ──────────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🎨</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Draw & Guess</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.7 }}>
          One player draws a secret word 🖌️<br/>
          Others race to <strong>type the correct guess</strong> 💬<br/>
          Faster guess = <strong>more points</strong> ⚡<br/>
          Most points after all rounds wins 🏆
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {players.map(p => (
            <div key={p.userId} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-elevated)', borderRadius: 30,
              padding: '6px 16px 6px 8px', border: '1px solid var(--border)',
            }}>
              <Avatar username={p.username} size={30} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.username}</span>
            </div>
          ))}
        </div>

        {/* Multiplayer only info */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
          Share room code{' '}
          <strong style={{ color: 'var(--yellow, #FFD700)', fontSize: 14 }}>{roomCode}</strong>
          {' '}with other users to play Draw & Guess
        </div>
        {isHost ? (
          <div>
            <button className="btn btn-primary btn-lg" onClick={() => {
              gameSocket?.emit('drawStartGame', { roomCode }, res => {
                if (!res?.success) toast.error(res?.message || 'Failed to start');
              });
            }} disabled={players.length < 2} style={{ fontSize: 16, padding: '12px 32px' }}>
              🎨 Start Game
            </button>
            {players.length < 2 && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#e74c3c', fontWeight: 600 }}>
                ⚠️ Need at least 2 players
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for host to start…</div>
        )}
      </div>
    );
  }

  // ── Starting ─────────────────────────────────────────────────────────────────
  if (phase === 'starting') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 52 }}>🎨</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>Get ready to draw!</div>
        <div style={{ color: 'var(--text-muted)', marginTop: 8 }}>First turn coming up…</div>
      </div>
    );
  }

  // ── Round start ──────────────────────────────────────────────────────────────
  if (phase === 'roundStart') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 52 }}>🎨</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>Round {round} of {totalRounds}</div>
        <div style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 20 }}>Get ready…</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 260, margin: '0 auto' }}>
          {scoreboard.map((p, i) => {
            const isMe = p.userId?.toString() === myId;
            if (i >= 3 && !isMe) return null; // only top3 + self
            return (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderRadius: 10,
                background: isMe ? 'rgba(255,215,0,0.08)' : 'var(--bg-elevated)',
                border: `1px solid ${isMe ? 'var(--yellow)' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.username}{isMe ? ' (you)' : ''}</span>
                </div>
                {isMe && <span style={{ fontWeight: 700, color: 'var(--yellow)' }}>{p.score}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Turn end ─────────────────────────────────────────────────────────────────
  if (phase === 'turnEnd') {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>{turnEndInfo?.timeUp ? '⏰' : '🎉'}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
          {turnEndInfo?.timeUp ? 'Time up!' : 'Everyone guessed it!'}
        </div>
        <div style={{ fontSize: 15, marginBottom: 20, color: 'var(--text-muted)' }}>
          The word was: <strong style={{ color: 'var(--yellow)', fontSize: 18 }}>{turnEndInfo?.word}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 280, margin: '0 auto' }}>
          {scoreboard.map((p, i) => {
            const isMe  = p.userId?.toString() === myId;
            const earned = turnEndInfo?.pointsBreakdown?.[p.userId?.toString()] || 0;
            if (i >= 3 && !isMe) return null; // only top3 + self
            return (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderRadius: 10,
                background: isMe ? 'rgba(255,215,0,0.08)' : 'var(--bg-elevated)',
                border: `1px solid ${isMe ? 'var(--yellow)' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.username}{isMe ? ' (you)' : ''}</span>
                </div>
                {isMe && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {earned > 0 && <span style={{ fontSize: 12, color: '#2ecc71', fontWeight: 700 }}>+{earned}</span>}
                    <span style={{ fontWeight: 700, color: 'var(--yellow)' }}>{p.score}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>Next turn starting…</div>
      </div>
    );
  }

  // ── End screen ───────────────────────────────────────────────────────────────
  if (phase === 'end' && gameEnd) {
    const amWinner = gameEnd.winner?.userId?.toString() === myId || gameEnd.winner?.userId === myId;
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>{amWinner ? '🏆' : '💡'}</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          {amWinner ? 'You Won!' : 'Game Over!'}
        </div>
        {!amWinner && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 300, margin: '0 auto 16px', lineHeight: 1.6 }}>
            {loserLine}
          </div>
        )}
        {gameEnd.winner && (
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
            🏆 <strong style={{ color: 'var(--text-primary)' }}>{gameEnd.winner.username}</strong> wins!
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 280, margin: '0 auto 24px' }}>
          {gameEnd.scoreboard?.map((p, i) => {
            const isMe = p.userId?.toString() === myId;
            if (i >= 3 && !isMe) return null; // only top3 + self
            return (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderRadius: 12,
                background: isMe ? 'rgba(255,215,0,0.08)' : 'var(--bg-elevated)',
                border: `2px solid ${isMe ? 'var(--yellow)' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
                  <Avatar username={p.username} size={28} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.username}{isMe ? ' (you)' : ''}</span>
                </div>
                {isMe && <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--yellow)' }}>{p.score}</span>}
              </div>
            );
          })}
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>
      </div>
    );
  }

  // ── Countdown screen (for drawer) ───────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div style={{ fontSize: 20, color: 'var(--text-muted)', marginBottom: 16 }}>Your word is…</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--yellow)', letterSpacing: 4, marginBottom: 24 }}>
          {secretWord.toUpperCase()}
        </div>
        <div style={{ fontSize: 80, fontWeight: 900, color: countdown <= 1 ? '#e74c3c' : 'var(--yellow)',
          transition: 'all 0.3s', lineHeight: 1 }}>
          {countdown}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12 }}>Get ready to draw!</div>
      </div>
    );
  }

  // ── Drawing screen ───────────────────────────────────────────────────────────
  if (phase === 'drawing') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Round {round}/{totalRounds}</div>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: `3px solid ${timeLeft <= 10 ? '#e74c3c' : 'var(--yellow)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16,
            color: timeLeft <= 10 ? '#e74c3c' : 'var(--text)',
            transition: 'all 0.3s',
          }}>{timeLeft}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {isDrawer ? '✏️ Your turn to draw!' : `🎨 ${drawerName} is drawing`}
          </div>
        </div>

        {/* Word / hint */}
        <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 10,
          background: isDrawer ? 'rgba(var(--yellow),0.08)' : 'var(--bg-elevated)',
          border: `1px solid ${isDrawer ? 'var(--yellow)' : 'var(--border)'}` }}>
          {isDrawer ? (
            <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--yellow)', letterSpacing: 2 }}>
              {secretWord.toUpperCase()}
            </span>
          ) : (
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: 4 }}>{hint}</span>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {isDrawer ? 'Draw this word!' : `${hint.replace(/ /g,'').length} letters`}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden',
          border: '2px solid var(--border)', background: '#fff',
          cursor: isDrawer ? 'crosshair' : 'default' }}>
          <canvas
            ref={initCanvas}
            width={600} height={380}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', cursor: isDrawer ? 'crosshair' : 'default' }}
          />
        </div>

        {/* Drawing tools */}
        {isDrawer && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Colors */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {COLORS.map(col => (
                <button key={col} onClick={() => setColor(col)} style={{
                  width: 24, height: 24, borderRadius: '50%', background: col,
                  border: color === col ? '3px solid var(--primary)' : '2px solid var(--border)',
                  cursor: 'pointer', flexShrink: 0,
                }} />
              ))}
            </div>
            {/* Brush sizes */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {SIZES.map(s => (
                <button key={s} onClick={() => setBrushSize(s)} style={{
                  width: s + 12, height: s + 12, borderRadius: '50%',
                  background: brushSize === s ? 'var(--yellow)' : 'var(--border)',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                }} />
              ))}
            </div>
            <button onClick={handleClear} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
              🗑️ Clear
            </button>
          </div>
        )}

        {/* Chat / Guess */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ height: 120, overflowY: 'auto', padding: '8px 12px',
            display: 'flex', flexDirection: 'column', gap: 3 }}>
            {messages.map(m => (
              <div key={m.id} style={{
                fontSize: 13,
                color: m.correct ? 'var(--yellow)' : m.isSystem ? '#f39c12' : 'var(--text)',
                fontWeight: m.correct ? 700 : 400,
              }}>
                {m.isSystem ? m.text : <><strong>{m.username}:</strong> {m.text}</>}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {!isDrawer && (
            <form onSubmit={handleGuess} style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
              <input
                value={guessText}
                onChange={e => setGuessText(e.target.value)}
                placeholder="Type your guess…"
                autoComplete="off"
                style={{ flex: 1, padding: '8px 12px', background: 'none', border: 'none',
                  outline: 'none', fontSize: 13, color: 'var(--text-primary)' }}
              />
              <button type="submit" style={{
                padding: '8px 16px', background: 'var(--yellow)', color: '#fff',
                border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}>Guess</button>
            </form>
          )}
          {isDrawer && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              You are drawing — wait for others to guess!
            </div>
          )}
        </div>

        {/* Guess progress */}
        {guessCount.total > 0 && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            🔒 {guessCount.guessed}/{guessCount.total} guessed
            {iGuessed && !isDrawer && <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>✅ You got it!</span>}
          </div>
        )}

        {/* Scoreboard — top3 + self only, score only for self */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {scoreboard.map((p, i) => {
            const isMe = p.userId?.toString() === myId;
            const isCurrentDrawer = p.userId?.toString() === drawerId || p.userId === drawerId;
            if (i >= 3 && !isMe) return null; // only top3 + self
            return (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px 4px 6px', borderRadius: 20,
                background: 'var(--bg-elevated)',
                border: `1.5px solid ${isCurrentDrawer ? '#f39c12' : isMe ? 'var(--yellow)' : 'var(--border)'}`,
              }}>
                <Avatar username={p.username} size={22} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{isMe ? 'You' : p.username}</span>
                {isCurrentDrawer && <span style={{ fontSize: 12 }}>✏️</span>}
                {isMe && <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--yellow)', marginLeft: 2 }}>{p.score}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}