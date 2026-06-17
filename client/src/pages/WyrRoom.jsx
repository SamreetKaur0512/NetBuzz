import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, toast } from '../components/ui';

export default function WyrRoom({ room, roomCode, players: initPlayers, gameSocket }) {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [phase,          setPhase]         = useState('waiting');   // waiting | playing | result | end
  const [players,        setPlayers]       = useState(initPlayers || []);
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

  const [question,       setQuestion]      = useState(null);
  const [timeLeft,       setTimeLeft]      = useState(20);
  const [myVote,         setMyVote]        = useState(null);
  const [voteCount,      setVoteCount]     = useState({ voted: 0, total: 0 });
  const [roundResult,    setRoundResult]   = useState(null);
  const [gameEnd,        setGameEnd]       = useState(null);
  const [isEliminated,   setIsEliminated]  = useState(false);
  const [alivePlayers,   setAlivePlayers]  = useState([]);
  const timerRef = useRef(null);

  const WYR_LINES = [
    "You didn't follow the crowd — that's a superpower 🌟",
    "The rarest opinions are always the most interesting 🔮",
    "Your perspective is your power — never change it 👑",
    "Bold choices make bold people — keep going! 🚀",
    "You voted with your heart, not the crowd 💜",
    "Standing alone takes more courage than standing together 🦋",
  ];
  const [eliminatedLine] = useState(() => WYR_LINES[Math.floor(Math.random() * WYR_LINES.length)]);
  const isHost   = (room?.hostId?._id || room?.hostId)?.toString() === user?._id?.toString();
  const myId     = user?._id?.toString();

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

  useEffect(() => {
    if (!gameSocket) return;

    gameSocket.on('playerJoined', ({ players: p }) => setPlayers(p));
    gameSocket.on('playerLeft',   ({ players: p }) => setPlayers(p));

    gameSocket.on('wyrGameStarted', ({ players: p }) => {
      setPlayers(p);
      setPhase('starting');
    });

    gameSocket.on('wyrNewRound', ({ question: q, alivePlayers: alive, timeLimit }) => {
      setQuestion(q);
      setAlivePlayers(alive);
      setMyVote(null);
      setRoundResult(null);
      setVoteCount({ voted: 0, total: alive.length });
      setPhase('playing');
      startTimer(timeLimit || 20);
      // Check if I'm eliminated
      const stillAlive = alive.some(p => p.userId?.toString() === myId || p.userId === myId);
      setIsEliminated(!stillAlive);
    });

    gameSocket.on('wyrVoteUpdate', ({ voted, total }) => {
      setVoteCount({ voted, total });
    });

    gameSocket.on('wyrRoundResult', (result) => {
      clearInterval(timerRef.current);
      setRoundResult(result);
      setPhase('result');
    });

    gameSocket.on('wyrGameEnd', (result) => {
      clearInterval(timerRef.current);
      // Force all players to end screen immediately regardless of current phase
      setRoundResult(null);
      setQuestion(null);
      setGameEnd(result);
      setPhase('end');
    });

    return () => {
      gameSocket.off('playerJoined');
      gameSocket.off('playerLeft');
      gameSocket.off('wyrGameStarted');
      gameSocket.off('wyrNewRound');
      gameSocket.off('wyrVoteUpdate');
      gameSocket.off('wyrRoundResult');
      gameSocket.off('wyrGameEnd');
      clearInterval(timerRef.current);
    };
  }, [gameSocket, myId]);

  const handleStart = () => {
    gameSocket?.emit('wyrStartGame', { roomCode }, (res) => {
      if (!res?.success) toast.error(res?.message || 'Failed to start');
    });
  };

  const handleVote = (vote) => {
    if (myVote || isEliminated) return;
    setMyVote(vote);
    gameSocket?.emit('wyrVote', { roomCode, vote }, (res) => {
      if (!res?.success) { setMyVote(null); toast.error(res?.message || 'Vote failed'); }
    });
  };

  // ── Waiting room ────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🤔</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Would You Rather</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.6 }}>
          Each round everyone votes on a dilemma.<br/>
          The <strong>minority</strong> gets eliminated.<br/>
          Last <strong>2 survivors</strong> are the winners! 🏆
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          {players.map(p => (
            <div key={p.userId} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-elevated)', borderRadius: 30,
              padding: '6px 14px 6px 6px',
              border: '1px solid var(--border)',
            }}>
              <Avatar username={p.username} size={28} src={p.profilePicture} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{p.username}</span>
              {(p.userId === room?.hostId || p.userId?.toString() === room?.hostId?.toString()) && (
                <span style={{ fontSize: 10, background: 'var(--yellow)', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>HOST</span>
              )}
            </div>
          ))}
        </div>

        {/* Multiplayer only info */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
          Share room code{' '}
          <strong style={{ color: 'var(--yellow, #FFD700)', fontSize: 14 }}>{roomCode}</strong>
          {' '}with other users to play Would You Rather
        </div>
        {isHost && (
          <div>
            <button className="btn btn-primary btn-lg" onClick={handleStart}
              disabled={players.length < 3} style={{ fontSize: 16, padding: '12px 32px' }}>
              🎮 Start Game
            </button>
            {players.length < 3 && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#e74c3c', fontWeight: 600 }}>
                ⚠️ Minimum 3 players required ({players.length}/3)
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

  // ── Starting ────────────────────────────────────────────────────────────────
  if (phase === 'starting') {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 52 }}>🤔</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>Get ready…</div>
        <div style={{ color: 'var(--text-muted)', marginTop: 8 }}>First question coming up!</div>
      </div>
    );
  }

  // ── End screen ──────────────────────────────────────────────────────────────
  if (phase === 'end' && gameEnd) {
    const amWinner = gameEnd.winners.some(w => w.userId?.toString() === myId || w.userId === myId);
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>{amWinner ? '🏆' : '🦋'}</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
          {amWinner ? 'You Won!' : 'You stood out!'}
        </div>

        {!amWinner && (
          <div style={{
            fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, margin: '0 auto 20px',
            lineHeight: 1.7, fontStyle: 'italic', textAlign: 'center',
          }}>
            {[
              "Being in the minority just means you think differently — and the world needs that! 🌍",
              "You didn't follow the crowd, you followed your heart. That's rare! 💜",
              "The most interesting people always have the most unique opinions! 🌟",
              "Being eliminated means you had the courage to be yourself. That's a win! ✨",
              "The minority today is often the majority of tomorrow. You were ahead of your time! 🚀",
              "True legends don't follow trends — they set them. Keep being you! 👑",
            ][Math.floor(Math.random() * 6)]}
          </div>
        )}

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 12 }}>🏆 Winners</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {gameEnd.winners.map(w => (
              <div key={w.userId} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg, #f6d365, #fda085)',
                borderRadius: 30, padding: '8px 18px 8px 8px',
              }}>
                <Avatar username={w.username} size={36} />
                <span style={{ fontWeight: 700, color: '#1a1d2e' }}>{w.username}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 10 }}>All Players</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 300, margin: '0 auto' }}>
            {gameEnd.allPlayers.map((p, i) => (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 10,
                background: p.eliminated ? 'var(--bg-elevated)' : 'rgba(var(--yellow),0.08)',
                border: `1px solid ${p.eliminated ? 'var(--border)' : 'var(--yellow)'}`,
                opacity: p.eliminated ? 0.6 : 1,
              }}>
                <Avatar username={p.username} size={30} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{p.username}</span>
                <span style={{ fontSize: 13, color: p.eliminated ? 'var(--text-muted)' : 'var(--yellow)', fontWeight: 600 }}>{p.eliminated ? 'out' : '🏆'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>

        </div>
      </div>
    );
  }

  // ── Round result ────────────────────────────────────────────────────────────
  if (phase === 'result' && roundResult) {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        {roundResult.draw ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🤝</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>It's a Draw!</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Replaying this question…</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Round Result</div>
          </>
        )}

        {/* Vote bars */}
        {question && (
          <div style={{ marginBottom: 20 }}>
            {['A', 'B'].map(v => {
              const voters  = roundResult.votes?.[v] || [];
              const count   = v === 'A' ? roundResult.countA : roundResult.countB;
              const total   = roundResult.countA + roundResult.countB;
              const pct     = total > 0 ? Math.round((count / total) * 100) : 0;
              const isMaj   = !roundResult.draw && v === roundResult.majorityVote;
              return (
                <div key={v} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{v === 'A' ? question.optionA : question.optionB}</span>
                    <span style={{ fontWeight: 700, color: isMaj ? 'var(--yellow)' : 'var(--text-muted)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg-elevated)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: isMaj ? 'var(--yellow)' : 'var(--border)',
                      borderRadius: 5, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {voters.join(', ') || 'No votes'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Eliminated */}
        {!roundResult.draw && roundResult.eliminated?.length > 0 && (
          <div style={{
            background: 'rgba(155,89,182,0.1)', border: '1px solid rgba(155,89,182,0.3)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, color: '#9b59b6', fontWeight: 700, marginBottom: 4 }}>Eliminated</div>
            <div style={{ fontSize: 13 }}>{roundResult.eliminated.map(p => p.username).join(', ')}</div>
          </div>
        )}

        {/* Survivors */}
        {!roundResult.draw && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            ✅ {roundResult.survivors?.length} survivor{roundResult.survivors?.length !== 1 ? 's' : ''} remaining
          </div>
        )}
      </div>
    );
  }

  // ── Playing ─────────────────────────────────────────────────────────────────
  if (phase === 'playing' && question) {
    return (
      <div>
        {/* Timer + alive count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            👥 {alivePlayers.length} alive
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', border: `3px solid ${timeLeft <= 5 ? '#e74c3c' : 'var(--yellow)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16, color: timeLeft <= 5 ? '#e74c3c' : 'var(--text)',
            transition: 'border-color 0.3s, color 0.3s',
          }}>
            {timeLeft}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {voteCount.voted}/{voteCount.total} voted
          </div>
        </div>

        {/* Category */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: 'var(--yellow)', textTransform: 'uppercase',
          }}>{question.category}</span>
        </div>

        {/* Would you rather label */}
        <div style={{
          textAlign: 'center', fontSize: 20, fontWeight: 700,
          marginBottom: 20, color: 'var(--text-primary)',
        }}>
          Would you rather…
        </div>

        {/* Options */}
        {isEliminated ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🍀✨</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#9b59b6' }}>You were eliminated</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
              {eliminatedLine}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Watch the remaining players…</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'A', label: question.optionA, color: '#6c5ce7' },
              { key: 'B', label: question.optionB, color: '#00b894' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => handleVote(opt.key)}
                disabled={!!myVote}
                style={{
                  padding: '18px 20px', borderRadius: 14, border: 'none', cursor: myVote ? 'default' : 'pointer',
                  background: myVote === opt.key
                    ? opt.color
                    : myVote ? 'var(--bg-elevated)' : 'var(--bg-elevated)',
                  color: myVote === opt.key ? '#fff' : 'var(--text)',
                  fontSize: 15, fontWeight: 600, textAlign: 'left',
                  border: myVote === opt.key
                    ? `2px solid ${opt.color}`
                    : '2px solid var(--border)',
                  transform: myVote === opt.key ? 'scale(1.02)' : 'scale(1)',
                  transition: 'all 0.2s',
                  opacity: myVote && myVote !== opt.key ? 0.5 : 1,
                }}
              >
                <span style={{
                  display: 'inline-block', width: 28, height: 28, borderRadius: '50%',
                  background: opt.color, color: '#fff', fontWeight: 700, fontSize: 14,
                  textAlign: 'center', lineHeight: '28px', marginRight: 12, flexShrink: 0,
                }}>
                  {opt.key}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {myVote && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            ✅ Vote cast — waiting for others… ({voteCount.voted}/{voteCount.total})
          </div>
        )}

        {/* Alive players */}
        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {alivePlayers.map(p => (
            <div key={p.userId} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--bg-elevated)', borderRadius: 20,
              padding: '3px 10px 3px 4px', fontSize: 12,
              border: p.userId?.toString() === myId || p.userId === myId
                ? '1px solid var(--yellow)' : '1px solid var(--border)',
            }}>
              <Avatar username={p.username} size={20} />
              <span>{p.username}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}