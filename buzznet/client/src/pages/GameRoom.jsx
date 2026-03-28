import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gameAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Avatar, Icons, LoadingCenter, toast } from '../components/ui';
import WyrRoom from './WyrRoom';
import TttRoom  from './TttRoom';
import DrawRoom  from './DrawRoom';
import SnakeRoom  from './SnakeRoom';
import AiQuizRoom from './AiQuizRoom';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function Leaderboard({ players, currentUserId }) {
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.totalAnswerTime || 999999) - (b.totalAnswerTime || 999999);
  });

  // Assign equal positions for same score + same time
  const withPos = [];
  sorted.forEach((p, i) => {
    let pos = i + 1;
    if (i > 0) {
      const prev = sorted[i - 1];
      if (p.score === prev.score &&
         (p.totalAnswerTime || 999999) === (prev.totalAnswerTime || 999999)) {
        pos = withPos[i - 1].pos;
      }
    }
    withPos.push({ ...p, pos });
  });

  const top3    = withPos.filter(p => p.pos <= 3);
  const myEntry = withPos.find(p => p.userId === currentUserId || p.userId?._id === currentUserId);
  const amInTop3 = myEntry && myEntry.pos <= 3;

  const medal      = (pos) => pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉';
  const medalClass = (pos) => pos === 1 ? 'gold' : pos === 2 ? 'silver' : 'bronze';

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">Leaderboard</div>

      {top3.map((p) => {
        const isMe = p.userId === currentUserId || p.userId?._id === currentUserId;
        return (
          <div key={p.userId} className={`leaderboard-row${isMe ? ' me' : ''}`}>
            <div className={`lb-rank ${medalClass(p.pos)}`}>{medal(p.pos)}</div>
            <Avatar username={p.username} size={32} />
            <div className="lb-name">{p.username}{isMe ? ' (you)' : ''}</div>
            {isMe && <div className="lb-score">{p.score}</div>}
          </div>
        );
      })}

      {!amInTop3 && myEntry && (
        <div className="leaderboard-row me" style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
          <Avatar username={myEntry.username} size={32} />
          <div className="lb-name">{myEntry.username} (you)</div>
          <div className="lb-score">{myEntry.score}</div>
        </div>
      )}
    </div>
  );
}


export default function GameRoom() {
  const { roomCode }   = useParams();
  const { user }       = useAuth();
  const { gameSocket } = useSocket();
  const navigate       = useNavigate();

  const [room, setRoom]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [gameState, setGameState]   = useState('waiting'); // waiting | in_progress | finished
  const [players, setPlayers]       = useState([]);
  const [question, setQuestion]     = useState(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [totalQ, setTotalQ]         = useState(10);
  const [timeLeft, setTimeLeft]     = useState(20);
  const [timeLimit, setTimeLimit]   = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerResult, setAnswerResult]     = useState(null); // { correct, correctAnswer }
  const [leaderboard, setLeaderboard]       = useState([]);
  const [finalResult, setFinalResult]       = useState(null);
  const [isReady, setIsReady]       = useState(false);
  const timerRef    = useRef(null);
  const timeLimitRef = useRef(20); // mirrors timeLimit state without causing re-renders

  const isHost = (room?.hostId?._id || room?.hostId)?.toString() === user?._id?.toString();
  const roomFullShownRef    = React.useRef(false);
  const joinedSuccessfully  = React.useRef(false); // true only if server confirmed join

  // ── Load room on mount ────────────────────────────────────────────────────
  const roomErrorShown = React.useRef(false); // guard: show room error only once
  useEffect(() => {
    gameAPI.getRoom(roomCode)
      .then(res => {
        setRoom(res.data.room);
        setPlayers(res.data.room.players || []);
        setGameState(res.data.room.status);
      })
      .catch(() => {
        if (!roomErrorShown.current) {
          roomErrorShown.current = true;
          toast.error('Room not found');
          navigate('/games');
        }
      })
      .finally(() => setLoading(false));
  }, [roomCode, navigate]);

  // ── Join room via socket — guarded so it fires EXACTLY once ────────────────
  const hasEmittedJoin = React.useRef(false);
  useEffect(() => {
    if (!gameSocket || !roomCode) return;
    if (hasEmittedJoin.current) return;   // StrictMode double-mount guard
    hasEmittedJoin.current = true;

    gameSocket.emit('joinRoom', { roomCode }, (res) => {
      if (res.success) {
        joinedSuccessfully.current = true;
        // Immediately update players from ack — name shows instantly
        if (res.room?.players) {
          // Deduplicate in case of any race
          const seen = new Set();
          setPlayers(res.room.players.filter(p => {
            const id = (p.userId?._id || p.userId)?.toString();
            if (seen.has(id)) return false;
            seen.add(id); return true;
          }));
        }
      } else if (res.message !== 'Room is full') {
        // Only show if HTTP load didn't already show this error
        if (!roomErrorShown.current) {
          roomErrorShown.current = true;
          toast.error(res.message);
          if (res.message === 'Room not found') navigate('/games');
        }
      }
    });
  }, [gameSocket, roomCode]);

  // ── Show ONE room-full notification when room fills up ─────────────────────
  useEffect(() => {
    if (!room) return;
    if (players.length >= room.maxPlayers && !roomFullShownRef.current) {
      roomFullShownRef.current = true;
      toast.info(`Room is full · ${players.length}/${room.maxPlayers} players`);
      // Auto-reset so if someone leaves and re-fills it shows again
      const t = setTimeout(() => { roomFullShownRef.current = false; }, 5000);
      return () => clearTimeout(t);
    }
    // Reset if room is no longer full
    if (players.length < room.maxPlayers) {
      roomFullShownRef.current = false;
    }
  }, [players.length, room]);

  // ── Timer countdown ───────────────────────────────────────────────────────
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

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!gameSocket) return;

    gameSocket.on('playerJoined', ({ players: p }) => {
      // Deduplicate by userId in case of any race condition
      const seen = new Set();
      const unique = p.filter(pl => {
        const id = (pl.userId?._id || pl.userId)?.toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setPlayers(unique);
    });
    gameSocket.on('playerLeft',   ({ players: p }) => setPlayers(p));

    gameSocket.on('gameUpdate', ({ event, players: p, question: q, questionIndex, leaderboard: lb, timeLimit: tl, correctAnswer }) => {
      if (p)  setPlayers(p);
      if (lb) setLeaderboard(lb);
      if (event === 'nextQuestion' && q) {
        setQuestion(q);
        setQuestionIdx(questionIndex);
        setSelectedAnswer(null);
        setAnswerResult(null);
        startTimer(tl || timeLimitRef.current);
      }
      if (event === 'timeUp' || event === 'allAnswered') {
        clearInterval(timerRef.current);
        setAnswerResult(prev => prev || { correct: false, correctAnswer });
      }
      if (event === 'answerSubmitted' && lb) setLeaderboard(lb);
    });

    gameSocket.on('startGame', ({ question: q, totalQuestions, timeLimit: tl, players: p }) => {
      setGameState('in_progress');
      setQuestion(q);
      setQuestionIdx(0);
      setTotalQ(totalQuestions);
      setTimeLimit(tl);
      timeLimitRef.current = tl;
      setPlayers(p);
      setSelectedAnswer(null);
      setAnswerResult(null);
      startTimer(tl);
    });

    gameSocket.on('endGame', ({ leaderboard: lb, winner }) => {
      clearInterval(timerRef.current);
      // Force all players to end screen immediately
      setQuestion(null);
      setAnswerResult(null);
      setLeaderboard(lb);
      setFinalResult({ leaderboard: lb, winner });
      setGameState('finished');
    });

    gameSocket.on('gameError', ({ message }) => {
      // Suppress room-state errors that are already handled by other UI
      const silent = ['Room is full', 'Game already started or finished', 'You are already in this room', 'Room not found'];
      if (!silent.includes(message)) toast.error(message);
    });

    return () => {
      gameSocket.off('playerJoined');
      gameSocket.off('playerLeft');
      gameSocket.off('gameUpdate');
      gameSocket.off('startGame');
      gameSocket.off('endGame');
      gameSocket.off('gameError');
      clearInterval(timerRef.current);
    };
  }, [gameSocket, startTimer]); // timeLimit intentionally excluded — use timeLimitRef to avoid killing timer on state change

  const handleReady = () => {
    gameSocket?.emit('playerReady', { roomCode });
    setIsReady(true);
  };

  const handleStart = () => {
    if (room?.gameType === 'wyr') {
      gameSocket?.emit('wyrStartGame', { roomCode });
    } else {
      gameSocket?.emit('startGame', { roomCode });
    }
  };

  const handleAnswer = (answerIdx) => {
    if (selectedAnswer !== null || answerResult) return;
    setSelectedAnswer(answerIdx);
    gameSocket?.emit('submitAnswer', {
      roomCode, questionIndex: questionIdx, answer: answerIdx,
    }, (res) => {
      if (res) setAnswerResult({ correct: res.correct, correctAnswer: res.correctAnswer });
    });
  };

  const handleLeave = () => {
    gameSocket?.emit('leaveRoom', { roomCode });
    navigate('/games');
  };

  if (loading) return <LoadingCenter />;

  // ── Finished screen ───────────────────────────────────────────────────────
  if (gameState === 'finished' && finalResult) {
    const myRank = finalResult.leaderboard.findIndex(p =>
      p.userId === user?._id || p.userId?._id === user?._id
    ) + 1;
    const myScore = finalResult.leaderboard.find(p =>
      p.userId === user?._id || p.userId?._id === user?._id
    )?.score || 0;

    const isSolo = finalResult.leaderboard.length === 1;
    const totalQ = finalResult.leaderboard[0]?.totalQuestions || room?.totalQuestions || 10;
    const correctCount = Math.round(myScore / 10); // each correct = 10pts

    if (isSolo) {
      return (
        <div className="game-room" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 72, marginBottom: 12 }}>🎮</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 900, marginBottom: 24 }}>
            Game Over
          </div>
          <div style={{
            display: 'inline-flex', gap: 32, background: 'var(--bg-surface)',
            border: '2px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: '20px 36px', marginBottom: 24,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--yellow)' }}>{myScore}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--green)' }}>{correctCount}/{totalQ}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Correct</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>
          </div>
        </div>
      );
    }

    return (
      <div className="game-room" style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>
            {myRank === 1 ? '🏆' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '💡'}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontStyle: 'italic', marginBottom: 8 }}>
            {myRank === 1 ? 'You won!' : myRank === 2 ? 'So close!' : myRank === 3 ? 'Great effort!' : 'Well played!'}
          </div>
          <div style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            {myScore} points
          </div>
          {myRank > 3 && (
            <div style={{
              fontSize: 14, color: 'var(--text-muted)', maxWidth: 320, margin: '0 auto 8px',
              lineHeight: 1.6, fontStyle: 'italic',
            }}>
              {[
                "Champions are made in the moments they feel like quitting — don't stop! 🔥",
                "The best players didn't get good by giving up. Come back stronger! 💪",
                "Knowledge grows with every game — you learned something new today! 📚",
                "The comeback is always stronger than the setback. Next round is yours! ✨",
                "Legends aren't born, they're made. Keep playing! 🌟",
              ][Math.floor(Math.random() * 5)]}
            </div>
          )}
          {finalResult.winner && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Winner: {finalResult.winner.username}
            </div>
          )}
        </div>

        <Leaderboard players={finalResult.leaderboard} currentUserId={user?._id} />

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  // ── AI Quiz game ─────────────────────────────────────────────────────────────
  if (room?.gameType === 'aiquiz') {
    return (
      <div className="game-room">
        <div className="game-room-header">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🤖 AI Quiz Master</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="room-code" style={{ fontSize: 14 }}>{roomCode}</div>
            <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
              <Icons.ArrowLeft /> Leave
            </button>
          </div>
        </div>
        <AiQuizRoom
          room={room}
          roomCode={roomCode}
          players={players}
          gameSocket={gameSocket}
        />
      </div>
    );
  }

  // ── Snake game ───────────────────────────────────────────────────────────────
  if (room?.gameType === 'snake') {
    return (
      <div className="game-room">
        <div className="game-room-header">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🐍 Snake</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="room-code" style={{ fontSize: 14 }}>{roomCode}</div>
            <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
              <Icons.ArrowLeft /> Leave
            </button>
          </div>
        </div>
        <SnakeRoom
          room={room}
          roomCode={roomCode}
          players={players}
          gameSocket={gameSocket}
        />
      </div>
    );
  }

  // ── Draw & Guess game ───────────────────────────────────────────────────────
  if (room?.gameType === 'draw') {
    return (
      <div className="game-room">
        <div className="game-room-header">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🎨 Draw & Guess</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="room-code" style={{ fontSize: 14 }}>{roomCode}</div>
            <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
              <Icons.ArrowLeft /> Leave
            </button>
          </div>
        </div>
        <DrawRoom
          room={room}
          roomCode={roomCode}
          players={players}
          gameSocket={gameSocket}
        />
      </div>
    );
  }

  // ── TTT game ─────────────────────────────────────────────────────────────────
  if (room?.gameType === 'ttt') {
    return (
      <div className="game-room">
        <div className="game-room-header">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>⭕ Tic Tac Toe</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="room-code" style={{ fontSize: 14 }}>{roomCode}</div>
            <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
              <Icons.ArrowLeft /> Leave
            </button>
          </div>
        </div>
        <TttRoom
          room={room}
          roomCode={roomCode}
          players={players}
          gameSocket={gameSocket}
        />
      </div>
    );
  }

  // ── WYR game ─────────────────────────────────────────────────────────────────
  if (room?.gameType === 'wyr') {
    return (
      <div className="game-room">
        <div className="game-room-header">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🤔 Would You Rather</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="room-code" style={{ fontSize: 14 }}>{roomCode}</div>
            <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
              <Icons.ArrowLeft /> Leave
            </button>
          </div>
        </div>
        <WyrRoom
          room={room}
          roomCode={roomCode}
          players={players}
          gameSocket={gameSocket}
        />
      </div>
    );
  }

  // ── Waiting room ──────────────────────────────────────────────────────────
  if (gameState === 'waiting') {
    return (
      <div className="game-room">
        <div className="game-room-header">
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Room Code
            </div>
            <div className="game-room-code">{roomCode}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
            <Icons.ArrowLeft /> Leave
          </button>
        </div>

        <div className="waiting-room">
          <div style={{ fontSize: 40, marginBottom: 8 }}>
            {room?.gameType === 'quiz' ? '🧠' : room?.gameType === 'wyr' ? '🤔' : room?.gameType === 'draw' ? '🎨' : '🔮'}
          </div>
          <div className="waiting-title">
            {room?.gameType === 'quiz' ? 'Knowledge Quiz' : room?.gameType === 'wyr' ? 'Would You Rather' : room?.gameType === 'draw' ? 'Draw & Guess' : 'Mind Puzzles'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
            {room?.totalQuestions} questions · {room?.questionTimeLimit}s per question · up to {room?.maxPlayers} players
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
            Share code <strong style={{ color: 'var(--yellow, #FFD700)' }}>{roomCode}</strong> to invite friends
          </div>

          {/* Players in room */}
          {/* Players — compact pill list */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
            {players.map(p => {
              const isPlayerHost = p.userId === room?.hostId || p.userId?._id === room?.hostId;
              return (
                <div key={p.userId} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'var(--bg-elevated)', borderRadius: 24,
                  padding: '6px 14px 6px 6px',
                  border: `1.5px solid ${isPlayerHost ? 'var(--yellow,#FFD700)' : p.ready ? '#2ecc71' : 'var(--border)'}`,
                }}>
                  <Avatar username={p.username} size={30} />
                  <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</div>
                    <div style={{ fontSize: 10, color: isPlayerHost ? 'var(--yellow,#FFD700)' : p.ready ? '#2ecc71' : 'var(--text-muted)' }}>
                      {isPlayerHost ? '👑 Host' : p.ready ? '✓ Ready' : 'Waiting…'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Start / Ready — immediately below players */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {!isReady && !isHost && joinedSuccessfully.current && (
              <button className="btn btn-secondary" onClick={handleReady} style={{ minWidth: 160 }}>
                <Icons.Check /> Ready
              </button>
            )}
            {isHost && (
              <>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleStart}
                  style={{ minWidth: 190 }}
                  disabled={players.length < 2 && !(['quiz','puzzle','aiquiz','snake'].includes(room?.gameType))}
                >
                  <Icons.Game /> {players.length < 2 && ['quiz','puzzle','aiquiz','snake'].includes(room?.gameType) ? '🎮 Play Solo' : 'Start Game'}
                </button>
                {players.length < 2 && ['quiz','puzzle','aiquiz','snake'].includes(room?.gameType) && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>
                    Solo mode — share <strong style={{ color: 'var(--yellow,#FFD700)' }}>{roomCode}</strong> to invite others
                  </div>
                )}
                {players.length < 2 && !['quiz','puzzle','aiquiz','snake'].includes(room?.gameType) && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    ⚠️ Need at least 2 players to start
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }



  // ── In-game screen ────────────────────────────────────────────────────────
  return (
    <div className="game-room">
      <div className="game-room-header" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {room?.gameType === 'quiz' ? '🧠 Knowledge Quiz' : '🔮 Mind Puzzles'}
        </div>
        <div className="room-code" style={{ fontSize: 14 }}>{roomCode}</div>
      </div>

      <div className="question-area">
        {/* Progress */}
        <div className="question-progress">
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{ width: `${((questionIdx + 1) / totalQ) * 100}%` }}
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {questionIdx + 1} / {totalQ}
          </span>
          <div className={`question-timer${timeLeft <= 5 ? ' urgent' : ''}`}>
            {timeLeft}
          </div>
        </div>

        {/* Question */}
        {question && (
          <>
            <div className="question-card">
              <div className="question-category">{question.category}</div>
              <div className="question-text">{question.question}</div>
            </div>

            <div className="options-grid">
              {question.options.map((opt, idx) => {
                let cls = '';
                if (answerResult) {
                  if (idx === answerResult.correctAnswer) cls = 'correct';
                  else if (idx === selectedAnswer && !answerResult.correct) cls = 'wrong';
                } else if (idx === selectedAnswer) {
                  cls = 'selected';
                }
                return (
                  <button
                    key={idx}
                    className={`option-btn ${cls}`}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedAnswer !== null}
                  >
                    <span className="option-letter">{OPTION_LABELS[idx]}</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {answerResult && (
              <div style={{
                textAlign: 'center', padding: '16px', marginTop: 12,
                color: answerResult.correct ? 'var(--green)' : 'var(--red)',
                fontWeight: 600, fontSize: 16,
              }}>
                {answerResult.correct ? '✓ Correct! +' + (question.points || 10) + ' points' : '✗ Incorrect'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Live leaderboard */}
      {leaderboard.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Leaderboard players={leaderboard} currentUserId={user?._id} />
        </div>
      )}
    </div>
  );
}