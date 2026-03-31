import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, toast } from '../components/ui';

const GRID    = 20;

const LOSER_LINES = [
  "Champions are made in the moments they feel like quitting — don't stop! 🔥",
  "The best players didn't get good by giving up. Come back stronger! 💪",
  "Every game you get faster and smarter! 📚",
  "The comeback is always stronger than the setback ✨",
  "Legends aren't born, they're made. Keep playing! 🌟",
];

export default function SnakeRoom({ room, roomCode, players: initPlayers, gameSocket }) {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const canvasRef = useRef(null);
  const myId      = user?._id?.toString();
  const isHost    = (room?.hostId?._id || room?.hostId)?.toString() === myId;

  const [phase,      setPhase]      = useState('waiting');
  const [players,    setPlayers]    = useState(initPlayers || []);
  const [snakes,     setSnakes]     = useState([]);
  const [food,       setFood]       = useState([]);
  const [timeLeft,   setTimeLeft]   = useState(60);
  const [myScore,    setMyScore]    = useState(0);
  const [amAlive,    setAmAlive]    = useState(true);
  const [gameEnd,    setGameEnd]    = useState(null);
  const [countdown,  setCountdown]  = useState(null); // 3,2,1,0=Go,null=hidden
  const [loserLine]  = useState(() => LOSER_LINES[Math.floor(Math.random() * LOSER_LINES.length)]);
  const [muted,      setMuted]      = useState(false);
  const lastTickRef  = useRef(null);
  const audioCtxRef  = useRef(null);   // Web Audio API context
  const prevScoreRef = useRef(0);      // track previous score to detect food eaten

  // ── Play eat sound via Web Audio API (no file needed, very light) ───────────
  const playEatSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      // Short "munch" — low pitched blip, very quiet
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type      = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);   // very quiet
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) { /* AudioContext not available */ }
  }, []);

  // ── Draw canvas ─────────────────────────────────────────────────────────────
  const FOOD_EMOJIS = ['🍎','🍕','🍩','🍓','🍔','🍦','🌮','🍇'];

  const drawGame = useCallback((snakesData, foodData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const SIZE = canvas.width;
    const CELL = SIZE / GRID;

    // Background — soft dark green like a grass field
    ctx.fillStyle = '#e8f5e9';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke();
    }

    // Border — warm white
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);

    // Food as emojis
    ctx.font = `${Math.floor(CELL * 0.8)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    foodData.forEach(([fx, fy], i) => {
      const emoji = FOOD_EMOJIS[i % FOOD_EMOJIS.length];
      ctx.fillText(emoji, fx * CELL + CELL/2, fy * CELL + CELL/2);
    });

    // Snakes — cute round circles
    snakesData.forEach((snake, snakeIndex) => {
      if (!snake.body || snake.body.length === 0) return;
      ctx.globalAlpha = snake.alive ? 1 : 0.25;
      const R = CELL / 2 - 1;
      const playerNum = snakeIndex + 1; // 1-based player number

      snake.body.forEach(([bx, by], idx) => {
        const isHead = idx === 0;
        const cx = bx * CELL + CELL/2;
        const cy = by * CELL + CELL/2;
        const r  = isHead ? R + 1 : R - 1;

        ctx.fillStyle = snake.color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(cx - r*0.2, cy - r*0.2, r * 0.5, 0, Math.PI * 2);
        ctx.fill();

        if (isHead) {
          const eyeR   = Math.max(1.5, r * 0.18);
          const eyeOff = r * 0.35;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(cx - eyeOff, cy - eyeOff, eyeR * 1.4, 0, Math.PI*2);
          ctx.arc(cx + eyeOff, cy - eyeOff, eyeR * 1.4, 0, Math.PI*2);
          ctx.fill();
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(cx - eyeOff, cy - eyeOff, eyeR, 0, Math.PI*2);
          ctx.arc(cx + eyeOff, cy - eyeOff, eyeR, 0, Math.PI*2);
          ctx.fill();

          // Player number — dark pill above head for clear visibility
          const numStr   = String(playerNum);
          const numFont  = Math.max(9, Math.floor(CELL * 0.55));
          ctx.font       = `900 ${numFont}px Arial`;
          ctx.textAlign  = 'center';
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(numStr).width;
          const pw = tw + 6, ph = numFont + 4;
          const px = cx - pw/2, py = cy - r - ph - 2;
          // Dark background pill
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, ph/2);
          ctx.fill();
          // White number
          ctx.fillStyle = '#fff';
          ctx.fillText(numStr, cx, py + ph/2);
        }
      });



      ctx.globalAlpha = 1;
    });
  }, []);

  // ── Keep players in sync with parent prop (fixes name not visible on join) ──
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

  // ── Socket events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameSocket) return;

    gameSocket.on('playerJoined', ({ players: p }) => {
      const seen = new Set();
      setPlayers(p.filter(pl => {
        const id = (pl.userId?._id || pl.userId)?.toString();
        if (seen.has(id)) return false;
        seen.add(id); return true;
      }));
    });
    gameSocket.on('playerLeft', ({ players: p }) => setPlayers(p));

    gameSocket.on('snakeCountdown', ({ count }) => {
      setCountdown(count);
      if (count === 0) {
        setPhase('playing'); // enable keyboard controls
        setTimeout(() => setCountdown(null), 1000);
      }
    });

    gameSocket.on('snakeGameStarted', ({ snakes: s, food: f, timeLimit }) => {
      setSnakes(s);
      setFood(f);
      setTimeLeft(timeLimit);
      setAmAlive(true);
      setMyScore(0);
      setPhase('countdown'); // show board but don't allow movement yet
      drawGame(s, f);
    });

    gameSocket.on('snakeTick', ({ snakes: s, food: f, timeLeft: tl }) => {
      setSnakes(s);
      setFood(f);
      setTimeLeft(tl);
      const me = s.find(sn => sn.userId === myId || sn.userId?.toString() === myId);
      if (me) {
        setMyScore(me.score);
        setAmAlive(me.alive);
      }
      drawGame(s, f);
    });

    gameSocket.on('snakeGameEnd', (result) => {
      setGameEnd(result);
      setPhase('end');
    });

    return () => {
      ['playerJoined','playerLeft','snakeCountdown','snakeGameStarted','snakeTick','snakeGameEnd']
        .forEach(e => gameSocket.off(e));
    };
  }, [gameSocket, myId, drawGame]);

  // ── Play eat sound when myScore increases (= I just ate food) ───────────────
  useEffect(() => {
    if (myScore > prevScoreRef.current && phase === 'playing' && !muted) {
      playEatSound();
    }
    prevScoreRef.current = myScore;
  }, [myScore, phase, muted, playEatSound]);

  // ── Keyboard controls ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const keyMap = {
      ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
      w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
      W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
    };
    const handleKey = (e) => {
      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        gameSocket?.emit('snakeDir', { roomCode, dir });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, gameSocket, roomCode]);

  // ── Waiting ──────────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🐍</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Snake</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.7 }}>
          Control your snake with <strong>Arrow Keys</strong> or <strong>WASD</strong> 🎮<br/>
          Eat 🟡 food to grow and score points<br/>
          Avoid <strong>walls</strong> and <strong>other snakes</strong> — or you're eliminated!<br/>
          Most food collected when time ends <strong>wins</strong> 🏆
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          If tied on score, the player who collected food faster wins
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {players.map((p, i) => (
            <div key={p.userId} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-elevated)', borderRadius: 30,
              padding: '6px 14px 6px 8px', border: `2px solid ${['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'][i % 8]}`,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'][i % 8],
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 900, fontSize: 11, fontFamily: 'Arial, sans-serif',
              }}>{i + 1}</span>
              <Avatar username={p.username} size={28} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.username}</span>
            </div>
          ))}
        </div>

        {/* Solo or multiplayer info */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
          Play solo, or share room code{' '}
          <strong style={{ color: 'var(--yellow, #FFD700)', fontSize: 14 }}>{roomCode}</strong>
          {' '}with other users to play with them
        </div>
        {isHost ? (
          <div>
            <button className="btn btn-primary btn-lg" onClick={() => {
              gameSocket?.emit('snakeStartGame', { roomCode }, res => {
                if (!res?.success) toast.error(res?.message || 'Failed to start');
              });
            }} style={{ fontSize: 16, padding: '12px 32px' }}>
              🐍 {players.length < 2 ? '🎮 Play Solo' : 'Start Game'}
            </button>
            {players.length < 2 && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gold, #F7A325)', fontWeight: 600 }}>
                🎮 Solo Mode — play alone, no win/loss
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for host to start…</div>
        )}
      </div>
    );
  }

  // ── End screen ───────────────────────────────────────────────────────────────
  if (phase === 'end' && gameEnd) {
    const me        = gameEnd.results?.find(p => p.userId?.toString() === myId || p.userId === myId);
    const amWinner  = me?.pos === 1;
    const isSolo    = (gameEnd.results?.length || 0) <= 1;

    if (isSolo) {
      return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🎮</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 20, fontFamily: 'Poppins, sans-serif' }}>Game Over</div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--yellow, #FFD700)', fontFamily: 'Poppins, sans-serif' }}>{me?.score || 0}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Food collected</div>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>
        </div>
      );
    }

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 300, margin: '0 auto 24px' }}>
          {gameEnd.results?.map((p, i) => {
            const isMe = p.userId?.toString() === myId || p.userId === myId;
            const medal = p.pos === 1 ? '🥇' : p.pos === 2 ? '🥈' : p.pos === 3 ? '🥉' : null;
            if (!medal && !isMe) return null; // only show top 3 + self
            return (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderRadius: 12,
                background: isMe ? 'rgba(var(--yellow),0.08)' : 'var(--bg-elevated)',
                border: `2px solid ${p.color || 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {medal && <span style={{ fontSize: 20 }}>{medal}</span>}
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  <Avatar username={p.username} size={28} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.username}{isMe ? ' (you)' : ''}</span>
                </div>
                {isMe && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--yellow)' }}>{p.score}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>food</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────────────────────
  if (phase === 'playing' || phase === 'countdown') {
    return (
      <div>
        {/* Eliminated message */}
        {!amAlive && (
          <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>🍀✨</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#9b59b6', marginBottom: 4 }}>You were eliminated!</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 300, margin: '0 auto' }}>
              {loserLine}
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: amAlive ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {amAlive ? '🐍 You are alive!' : 'Watching others play…'}
          </div>
          <div style={{
            padding: '4px 14px', borderRadius: 20,
            background: timeLeft <= 10 ? 'rgba(231,76,60,0.2)' : 'var(--bg-elevated)',
            border: `1px solid ${timeLeft <= 10 ? '#e74c3c' : 'var(--border)'}`,
            fontWeight: 700, fontSize: 15,
            color: timeLeft <= 10 ? '#e74c3c' : 'var(--text)',
          }}>⏱ {timeLeft}s</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)' }}>
            🟡 {myScore}
          </div>
        </div>

        {/* Canvas + countdown overlay */}
        <div style={{ width: '100%', aspectRatio: '1', maxHeight: '60vh', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            width={600} height={600}
            style={{ borderRadius: 8, display: 'block', width: '100%', height: '100%' }}
          />
          {countdown !== null && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)', borderRadius: 8,
            }}>
              <div style={{
                fontSize: countdown === 0 ? 64 : 96,
                fontWeight: 900, fontFamily: 'Poppins, sans-serif',
                color: countdown === 0 ? '#00D68F' : '#FFD700',
                textShadow: '0 4px 24px rgba(0,0,0,0.6)',
                lineHeight: 1,
                animation: 'none',
              }}>
                {countdown === 0 ? 'Go! 🐍' : countdown}
              </div>
            </div>
          )}
        </div>

        {/* Mobile controls + mute button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, justifyContent: 'center' }}>
          {/* Arrow pad */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button onPointerDown={() => gameSocket?.emit('snakeDir', { roomCode, dir: 'UP' })}
              style={btnStyle}>▲</button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onPointerDown={() => gameSocket?.emit('snakeDir', { roomCode, dir: 'LEFT' })}
                style={btnStyle}>◀</button>
              <button onPointerDown={() => gameSocket?.emit('snakeDir', { roomCode, dir: 'DOWN' })}
                style={btnStyle}>▼</button>
              <button onPointerDown={() => gameSocket?.emit('snakeDir', { roomCode, dir: 'RIGHT' })}
                style={btnStyle}>▶</button>
            </div>
          </div>

          {/* Mute button */}
          <button
            onClick={() => setMuted(v => !v)}
            title={muted ? 'Unmute sound' : 'Mute sound'}
            style={{
              width: 44, height: 44, borderRadius: 10, fontSize: 20,
              background: muted ? 'rgba(255,71,87,0.12)' : 'var(--bg-elevated)',
              border: `1.5px solid ${muted ? '#FF4757' : 'var(--border)'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: muted ? '#FF4757' : 'var(--text-primary)',
              transition: 'all 0.15s', userSelect: 'none',
            }}
          >{muted ? '🔇' : '🔊'}</button>
        </div>

        {/* Live scores — top 3 + self only */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
          {snakes
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((s, i) => {
              const isMe = s.userId === myId || s.userId?.toString() === myId;
              if (i >= 3 && !isMe) return null; // top3 + self only
              return (
                <div key={s.userId} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', borderRadius: 20,
                  background: 'var(--bg-elevated)',
                  border: `1.5px solid ${isMe ? 'var(--yellow)' : s.alive ? s.color : 'var(--border)'}`,
                  opacity: s.alive ? 1 : 0.5,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>#{i + 1}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{isMe ? 'You' : s.username}</span>
                  {isMe && <span style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 700 }}>{s.score}🟡</span>}
                  {!s.alive && <span style={{ fontSize: 11 }}>💀</span>}
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return null;
}

const btnStyle = {
  width: 52, height: 52, fontSize: 20, borderRadius: 10,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  cursor: 'pointer', color: 'var(--text-primary)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  userSelect: 'none', WebkitUserSelect: 'none',
};