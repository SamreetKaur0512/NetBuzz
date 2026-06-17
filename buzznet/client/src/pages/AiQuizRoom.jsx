import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, toast } from '../components/ui';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

// Server-side proxy — API key stays safe on server
async function callGemini(prompt, maxTokens = 2000) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${SERVER}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, maxTokens }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'AI request failed');
  return data.text;
}

async function getSubcategories(topicPath) {
  const pathStr = topicPath.join(' > ');
  const text = await callGemini(`You are helping build a quiz game. For the topic: "${pathStr}"

List exactly 15 specific subtopics, names, or categories that a quiz could be about.

Examples:
- "TV Serials" → ["Taarak Mehta Ka Ooltah Chashmah", "Yeh Hai Mohabbatein", "Balika Vadhu", ...]
- "Cricket" → ["Virat Kohli", "MS Dhoni", "IPL", "World Cup", "Test Cricket", ...]
- "Yeh Hai Mohabbatein" → ["Characters", "Storyline", "Cast & Actors", "Seasons", ...]
- "Sikh Dharam" → ["Guru Nanak Dev Ji", "Guru Gobind Singh Ji", "Golden Temple", ...]

IMPORTANT: Always return exactly 15 items. Never return empty array.
Respond ONLY with valid JSON array, no explanation:
["item1", "item2", ...]`, 800);
  const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim();
  return JSON.parse(clean);
}

async function generateQuestions(topic, count) {
  const text = await callGemini(`You are a quiz master. Generate exactly ${count} multiple choice questions about: "${topic}".

Rules:
- Each question must have exactly 4 options
- Only one correct answer per question
- Questions should be interesting, accurate and specific to the topic
- Vary the difficulty

Respond ONLY with valid JSON array, no other text:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": 0,
    "explanation": "Brief explanation"
  }
]
"answer" is the index (0-3) of the correct option.`, 4000);
  const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim();
  return JSON.parse(clean);
}

const FIELDS = [
  { id: 'tv_serials',      label: '📺 TV Serials',              category: 'Entertainment' },
  { id: 'bollywood',       label: '🎬 Bollywood Movies',         category: 'Entertainment' },
  { id: 'hollywood',       label: '🎥 Hollywood Movies',         category: 'Entertainment' },
  { id: 'music',           label: '🎵 Music & Songs',            category: 'Entertainment' },
  { id: 'anime',           label: '🎌 Anime & Cartoons',         category: 'Entertainment' },
  { id: 'cricket',         label: '🏏 Cricket',                  category: 'Sports' },
  { id: 'football',        label: '⚽ Football',                 category: 'Sports' },
  { id: 'olympics',        label: '🏅 Olympics',                 category: 'Sports' },
  { id: 'kabaddi',         label: '🤼 Kabaddi',                  category: 'Sports' },
  { id: 'hockey',          label: '🏑 Hockey',                   category: 'Sports' },
  { id: 'sikh_dharam',     label: '🪯 Sikh Dharam',              category: 'Religion' },
  { id: 'hinduism',        label: '🕉️ Hinduism',                category: 'Religion' },
  { id: 'islam',           label: '☪️ Islam',                    category: 'Religion' },
  { id: 'christianity',    label: '✝️ Christianity',             category: 'Religion' },
  { id: 'buddhism',        label: '☸️ Buddhism',                 category: 'Religion' },
  { id: 'world_wars',      label: '⚔️ World Wars',               category: 'History' },
  { id: 'desh_bhagats',    label: '🇮🇳 Desh Bhagats',           category: 'History' },
  { id: 'indian_history',  label: '🏛️ Indian History',           category: 'History' },
  { id: 'world_history',   label: '🌍 World History',            category: 'History' },
  { id: 'mughal_empire',   label: '👑 Mughal Empire',            category: 'History' },
  { id: 'countries',       label: '🗺️ Countries & Capitals',    category: 'Geography' },
  { id: 'india_geo',       label: '🇮🇳 India Geography',        category: 'Geography' },
  { id: 'world_geo',       label: '🌎 World Geography',          category: 'Geography' },
  { id: 'rivers_mountains',label: '⛰️ Rivers & Mountains',      category: 'Geography' },
  { id: 'current_affairs', label: '📰 Current Affairs',          category: 'Current Affairs' },
  { id: 'india_politics',  label: '🏛️ Indian Politics',          category: 'Current Affairs' },
  { id: 'world_politics',  label: '🌐 World Politics',           category: 'Current Affairs' },
  { id: 'economy',         label: '💹 Economy & Finance',        category: 'Current Affairs' },
  { id: 'computer_science',label: '💻 Computer Science',         category: 'Science & Tech' },
  { id: 'ai_tech',         label: '🤖 AI & Technology',          category: 'Science & Tech' },
  { id: 'space',           label: '🚀 Space & Astronomy',        category: 'Science & Tech' },
  { id: 'biology',         label: '🧬 Biology',                  category: 'Science & Tech' },
  { id: 'physics',         label: '⚡ Physics',                  category: 'Science & Tech' },
  { id: 'chemistry',       label: '🧪 Chemistry',                category: 'Science & Tech' },
  { id: 'civil_eng',       label: '🏗️ Civil Engineering',        category: 'Engineering' },
  { id: 'mechanical_eng',  label: '⚙️ Mechanical Engineering',   category: 'Engineering' },
  { id: 'electrical_eng',  label: '🔌 Electrical Engineering',   category: 'Engineering' },
  { id: 'food_cuisine',    label: '🍛 Food & Cuisine',           category: 'Lifestyle' },
  { id: 'punjabi_culture', label: '🎉 Punjabi Culture',          category: 'Lifestyle' },
  { id: 'yoga_health',     label: '🧘 Yoga & Health',            category: 'Lifestyle' },
  { id: 'hindi_lit',       label: '📖 Hindi Literature',         category: 'Literature' },
  { id: 'punjabi_lit',     label: '📜 Punjabi Literature',       category: 'Literature' },
  { id: 'english_lit',     label: '📚 English Literature',       category: 'Literature' },
  { id: 'business',        label: '💼 Business & Entrepreneurs', category: 'Business' },
  { id: 'startups',        label: '🚀 Startups & Innovation',    category: 'Business' },
  { id: 'hindu_mythology', label: '🔱 Hindu Mythology',          category: 'Mythology' },
  { id: 'greek_mythology', label: '⚡ Greek Mythology',          category: 'Mythology' },
  { id: 'general_gk',      label: '🧠 General Knowledge',        category: 'General' },
  { id: 'inventions',      label: '💡 Inventions & Discoveries', category: 'General' },
  { id: 'awards',          label: '🏆 Awards & Records',         category: 'General' },
  { id: 'famous_people',   label: '👤 Famous Personalities',     category: 'General' },
];

const OPTION_LABELS = ['A','B','C','D'];

export default function AiQuizRoom({ room, roomCode, players: initPlayers, gameSocket }) {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const myId      = user?._id?.toString();
  const isHost    = (room?.hostId?._id || room?.hostId)?.toString() === myId;

  const [phase,           setPhase]          = useState('field_select'); // field_select|drilling|loading|ready|playing|finished
  const [players,         setPlayers]        = useState(initPlayers || []);
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

  const [topicPath,       setTopicPath]      = useState([]);
  const [subcategories,   setSubcategories]  = useState([]);
  const [canDeepen,       setCanDeepen]      = useState(false);
  const [loadingMsg,      setLoadingMsg]     = useState('');
  const [questionCount,   setQuestionCount]  = useState(room?.totalQuestions || 10);
  const [readyTopic,      setReadyTopic]     = useState('');
  const [searchTerm,      setSearchTerm]     = useState('');
  const [fieldSearch,     setFieldSearch]    = useState('');
  // Quiz state
  const [question,        setQuestion]       = useState(null);
  const [questionIdx,     setQuestionIdx]    = useState(0);
  const [totalQ,          setTotalQ]         = useState(10);
  const [timeLeft,        setTimeLeft]       = useState(20);
  const [timeLimit,       setTimeLimit]      = useState(20);
  const [selectedAnswer,  setSelectedAnswer] = useState(null);
  const [answerResult,    setAnswerResult]   = useState(null);
  const [leaderboard,     setLeaderboard]    = useState([]);
  const [finalResult,     setFinalResult]    = useState(null);
  const [topic,           setTopic]          = useState('');
  const [customTopic,     setCustomTopic]    = useState('');
  const timerRef    = useRef(null);
  const timeLimitRef = useRef(20); // mirrors timeLimit without causing re-renders

  // ── Server-side AI proxy ────────────────────────────────────────────────────
  const callAI = async (prompt, maxTokens = 2000) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${SERVER}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt, maxTokens }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'AI request failed');
    return data.text.replace(/```json|```/g, '').trim();
  };

  const fetchSubcategories = async (path) => {
    const pathStr = path.join(' > ');
    setPhase('loading');
    setLoadingMsg(`🤖 AI is finding options for "${path[path.length-1]}"…`);
    gameSocket?.emit('aiQuizBroadcastLoading', { roomCode, message: `🤖 AI is finding options for "${path[path.length-1]}"…` });

    try {
      const prompt = `You are helping build a quiz game. For the topic: "${pathStr}"

List exactly 15 specific subtopics or items a quiz player might want to focus on.

If topic is a TV show → list characters, actors, seasons, episodes, storylines
If topic is a sport → list players, teams, tournaments, records, rules
If topic is a religion → list holy figures, scriptures, festivals, places, history
If topic is a person → list their achievements, timeline, facts, controversies, legacy
If topic is a subject → list chapters, concepts, formulas, applications, examples

IMPORTANT: 
1. ALWAYS return EXACTLY 15 items
2. NEVER return empty array
3. Items must be specific and relevant to "${pathStr}"
4. Return ONLY valid JSON array, no other text

["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8", "item9", "item10", "item11", "item12", "item13", "item14", "item15"]`;

      const raw = await callAI(prompt, 1000);
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');
      const subs = JSON.parse(match[0]);
      if (!Array.isArray(subs) || subs.length === 0) throw new Error('Empty array returned');

      // Set state directly for host (don't wait for socket roundtrip)
      setSubcategories(subs);
      setCanDeepen(true);
      setTopicPath(path);
      setSearchTerm('');
      setPhase('drilling');

      // Also broadcast to other players
      gameSocket?.emit('aiQuizSetSubs', { roomCode, subcategories: subs, currentPath: path });
    } catch (err) {
      console.error('Subcategory fetch error:', err);
      setTopicPath(path);
      setSubcategories([]);
      setPhase('drilling');
      toast.error('Could not find subcategories — you can still generate questions directly!');
    }
  };

  const fetchQuestions = async (topic, count) => {
    gameSocket?.emit('aiQuizBroadcastLoading', { roomCode, message: `🤖 AI is generating ${count} questions about "${topic}"…` });
    setPhase('loading');
    setLoadingMsg(`🤖 Generating ${count} questions about "${topic}"…`);

    try {
      const prompt = `You are a quiz master. Generate exactly ${count} multiple choice questions about: "${topic}".

Rules:
- Each question must have exactly 4 options
- Only one correct answer (index 0-3)
- Questions should be accurate, interesting and varied in difficulty
- Be specific to the exact topic

Return ONLY a valid JSON array:
[{"question":"...","options":["A","B","C","D"],"answer":0,"explanation":"why this is correct"}]`;

      const text = await callAI(prompt, 4000);
      const questions = JSON.parse(text);
      gameSocket?.emit('aiQuizSetQuestions', { roomCode, questions, topic, questionCount: questions.length }, (res) => {
        if (!res?.success) toast.error('Failed to save questions');
      });
    } catch (err) {
      console.error('Question generation error:', err);
      gameSocket?.emit('aiQuizBroadcastError', { roomCode, message: 'AI failed to generate questions. Please try again.' });
      setPhase('drilling');
    }
  };

  const startTimer = useCallback((limit) => {
    clearInterval(timerRef.current);
    setTimeLeft(limit);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { clearInterval(timerRef.current); return 0; } return prev - 1; });
    }, 1000);
  }, []);

  // ── Socket listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameSocket) return;

    gameSocket.on('playerJoined', ({ players: p }) => setPlayers(p));
    gameSocket.on('playerLeft',   ({ players: p }) => setPlayers(p));

    gameSocket.on('aiQuizLoading', ({ message }) => {
      setLoadingMsg(message);
      setPhase('loading');
    });

    gameSocket.on('aiQuizSubs', ({ subcategories: subs, canDeepen: cd, currentPath }) => {
      setSubcategories(subs);
      setCanDeepen(cd);
      setTopicPath(currentPath);
      setSearchTerm('');
      // If path is empty it means host went back to start — go to field_select, not drilling
      setPhase(currentPath && currentPath.length > 0 ? 'drilling' : 'field_select');
    });

    gameSocket.on('aiQuizReady', ({ topic: t, questionCount: qc, message }) => {
      setReadyTopic(t);
      setTotalQ(qc);
      setPhase('ready');
      toast.success(message);
    });

    gameSocket.on('aiQuizError', ({ message }) => {
      toast.error(message);
      setPhase('drilling');
    });

    gameSocket.on('startGame', ({ question: q, totalQuestions, timeLimit: tl, players: p, topic: t }) => {
      setQuestion(q);
      setQuestionIdx(0);
      setTotalQ(totalQuestions);
      setTimeLimit(tl);
      timeLimitRef.current = tl;
      setPlayers(p || []);
      setTopic(t || readyTopic);
      setSelectedAnswer(null);
      setAnswerResult(null);
      setPhase('playing');
      startTimer(tl);
    });

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
    });

    gameSocket.on('endGame', ({ leaderboard: lb, winner }) => {
      clearInterval(timerRef.current);
      setLeaderboard(lb);
      setFinalResult({ leaderboard: lb, winner });
      setPhase('finished');
    });

    gameSocket.on('gameError', ({ message }) => toast.error(message));

    return () => {
      ['playerJoined','playerLeft','aiQuizLoading','aiQuizSubs','aiQuizReady',
       'aiQuizError','startGame','gameUpdate','endGame','gameError']
        .forEach(e => gameSocket.off(e));
      clearInterval(timerRef.current);
    };
  }, [gameSocket, startTimer, readyTopic]); // timeLimit intentionally excluded — use timeLimitRef

  const handleFieldSelect = (field) => {
    if (!isHost) return;
    const path = [field.label.replace(/^[\S]+\s/, '')]; // strip emoji
    fetchSubcategories(path);
  };

  const handleSubSelect = (sub) => {
    if (!isHost) return;
    fetchSubcategories([...topicPath, sub]);
  };

  const handleGeneralQuestions = () => {
    if (!isHost) return;
    const t = topicPath.join(' > ');
    fetchQuestions(t, questionCount);
  };

  const handleAnswer = (answerIdx) => {
    if (selectedAnswer !== null || answerResult) return;
    setSelectedAnswer(answerIdx);
    gameSocket?.emit('submitAnswer', { roomCode, questionIndex: questionIdx, answer: answerIdx }, (res) => {
      if (res) setAnswerResult({ correct: res.correct, correctAnswer: res.correctAnswer });
    });
  };

  const handleCustomSearch = () => {
    if (!customTopic.trim()) return;
    fetchSubcategories([...topicPath, customTopic.trim()]);
    // Don't clear customTopic — preserved so user sees it if they go Back
  };

  const categories = [...new Set(FIELDS.map(f => f.category))];
  const filteredFields = FIELDS.filter(f =>
    f.label.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.category.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  // ── Field selection ────────────────────────────────────────────────────────
  if (phase === 'field_select') {
    return ( <div>

        {/* ⚠️ AI Disclaimer — prominent, everyone sees it */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,71,87,0.12), rgba(255,165,0,0.10))',
          border: '2px solid #FF4757',
          borderRadius: 14,
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 900,
              fontSize: 15,
              color: '#FF4757',
              letterSpacing: '0.3px',
              marginBottom: 4,
            }}>
              AI CAN MAKE MISTAKES!
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              fontWeight: 500,
            }}>
              Questions and answers are generated by AI — they may not always be 100% accurate.
              Play for fun and don't rely on this quiz for factual learning.
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>🤖</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>AI Quiz Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            {isHost ? 'Type ANY topic — AI will create questions about it!' : 'Waiting for host to choose a topic…'}
          </div>

          {/* Players */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            {players.map(p => (
              <div key={p.userId} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg-elevated)', borderRadius:20, padding:'4px 12px 4px 6px', border:'1px solid var(--border)' }}>
                <Avatar username={p.username} size={24} />
                <span style={{ fontSize:12, fontWeight:600 }}>{p.username}</span>
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <>
            {/* Custom topic search */}
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              <input
                placeholder="Type any topic e.g. 'Yeh Hai Mohabbatein', 'Virat Kohli', 'Python'…"
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSearch()}
                style={{ flex:1, padding:'10px 14px', borderRadius:10, border:'2px solid var(--yellow)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:14, outline:'none' }}
                autoFocus
              />
              <button onClick={handleCustomSearch} disabled={!customTopic.trim()} className="btn btn-primary" style={{ padding:'10px 20px', whiteSpace:'nowrap' }}>
                🔍 Search
              </button>
            </div>

            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12, textAlign:'center' }}>
              — or pick from examples below —
            </div>

            <input
              placeholder="Filter examples…"
              value={fieldSearch}
              onChange={e => setFieldSearch(e.target.value)}
              style={{ width:'100%', padding:'7px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13, marginBottom:12, boxSizing:'border-box' }}
            />

            {categories.map(cat => {
              const catFields = filteredFields.filter(f => f.category === cat);
              if (catFields.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{cat}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {catFields.map(f => (
                      <button key={f.id} onClick={() => handleFieldSelect(f)} style={{
                        padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)', cursor: 'pointer',
                        fontSize: 12, color: 'var(--text-primary)', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor='var(--yellow)'; e.currentTarget.style.color='var(--yellow)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text)'; }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Solo or multiplayer info */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
          Play solo, or share room code{' '}
          <strong style={{ color: 'var(--yellow, #FFD700)', fontSize: 14 }}>{roomCode}</strong>
          {' '}with other users to play with them
        </div>

        {!isHost && (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)', fontSize:14 }}>
            <div style={{ fontSize:40, marginBottom:10 }}>⏳</div>
            Host is choosing the quiz topic…
          </div>
        )}
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={{ textAlign:'center', padding:'60px 20px' }}>
        <div style={{ fontSize:52, marginBottom:16, animation:'spin 1s linear infinite' }}>🤖</div>
        <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>{loadingMsg}</div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>This may take a few seconds…</div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  // ── Drilling down ──────────────────────────────────────────────────────────
  if (phase === 'drilling') {
    const filtered = subcategories.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
      <div>
        {/* Back button + Breadcrumb */}
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
          {isHost && (
            <button
              onClick={() => {
                if (topicPath.length <= 1) {
                  // Back to field_select — switch phase, all inputs stay as they were
                  setTopicPath([]);
                  setSubcategories([]);
                  setPhase('field_select');
                  // Broadcast to other players (empty path signals field_select)
                  gameSocket?.emit('aiQuizSetSubs', { roomCode, subcategories: [], currentPath: [], goBack: true });
                } else {
                  // Go one level up and re-fetch subcategories for that level
                  fetchSubcategories(topicPath.slice(0, -1));
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20,
                background: 'var(--bg-elevated)',
                border: '1.5px solid var(--border)',
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                color: 'var(--text-secondary)', fontFamily: 'Poppins, sans-serif',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--yellow)'; e.currentTarget.style.color='var(--yellow)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-secondary)'; }}
            >
              ← Back
            </button>
          )}

          {/* Breadcrumb trail */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>📍</span>
            {topicPath.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color:'var(--text-muted)', fontSize:12 }}>›</span>}
                <span style={{
                  fontSize:13,
                  fontWeight: i === topicPath.length-1 ? 700 : 400,
                  color: i === topicPath.length-1 ? 'var(--yellow)' : 'var(--text-muted)',
                  cursor: isHost && i < topicPath.length-1 ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (isHost && i < topicPath.length-1) {
                    // Click any crumb to jump back to that level
                    fetchSubcategories(topicPath.slice(0, i + 1));
                  }
                }}
                onMouseEnter={e => { if (isHost && i < topicPath.length-1) e.currentTarget.style.color='var(--yellow)'; }}
                onMouseLeave={e => { if (isHost && i < topicPath.length-1) e.currentTarget.style.color='var(--text-muted)'; }}
                >{p}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {isHost ? (
          <>
            {/* Custom topic search */}
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input
                placeholder="Or go deeper with a specific subtopic…"
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSearch()}
                style={{ flex:1, padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13, outline:'none' }}
              />
              <button onClick={handleCustomSearch} disabled={!customTopic.trim()} className="btn btn-primary" style={{ padding:'8px 16px', whiteSpace:'nowrap', fontSize:13 }}>
                🔍 Search
              </button>
            </div>

            <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>
              🤖 AI found {subcategories.length} options for "{topicPath[topicPath.length-1]}"
            </div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:14 }}>
              Choose a specific option to go deeper, or generate questions about the current topic:
            </div>

            {/* Generate general questions button — count fixed from room settings */}
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
              <button onClick={handleGeneralQuestions} style={{
                padding:'8px 18px', borderRadius:20, border:'2px solid var(--yellow)',
                background:'rgba(var(--yellow),0.08)', color:'var(--yellow)',
                cursor:'pointer', fontWeight:700, fontSize:13,
              }}>
                ✨ Generate {questionCount} questions about "{topicPath[topicPath.length-1]}"
              </button>
            </div>

            {canDeepen && (
              <>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Or go more specific:</div>
                <input
                  placeholder="🔍 Search subcategories…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ width:'100%', padding:'7px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13, marginBottom:10, boxSizing:'border-box' }}
                />
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, maxHeight:200, overflowY:'auto' }}>
                  {filtered.map((sub, i) => (
                    <button key={i} onClick={() => handleSubSelect(sub)} style={{
                      padding:'6px 14px', borderRadius:20, border:'1px solid var(--border)',
                      background:'var(--bg-elevated)', cursor:'pointer', fontSize:13, color:'var(--text-primary)',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='var(--yellow)'; e.currentTarget.style.color='var(--yellow)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text)'; }}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🤖</div>
            Host is selecting the topic: <strong style={{ color:'var(--yellow)' }}>{topicPath.join(' › ')}</strong>
          </div>
        )}
      </div>
    );
  }

  // ── Ready to start ─────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div style={{ textAlign:'center', padding:'20px 0' }}>
        <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>Questions Ready!</div>
        <div style={{ fontSize:15, color:'var(--text-muted)', marginBottom:6 }}>Topic:</div>
        <div style={{ fontSize:18, fontWeight:700, color:'var(--yellow)', marginBottom:20 }}>{readyTopic}</div>
        <div style={{ fontSize:14, color:'var(--text-muted)', marginBottom:28 }}>{totalQ} AI-generated questions</div>

        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', marginBottom:28 }}>
          {players.map(p => (
            <div key={p.userId} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg-elevated)', borderRadius:30, padding:'6px 14px 6px 8px', border:'1px solid var(--border)' }}>
              <Avatar username={p.username} size={28} />
              <span style={{ fontWeight:600, fontSize:13 }}>{p.username}</span>
            </div>
          ))}
        </div>

        {isHost ? (
          <button className="btn btn-primary btn-lg" onClick={() => {
            gameSocket?.emit('aiQuizStart', { roomCode }, res => {
              if (!res?.success) toast.error(res?.message || 'Failed to start');
            });
          }} style={{ fontSize:16, padding:'12px 32px' }}>
            🚀 Start Quiz!
          </button>
        ) : (
          <div style={{ color:'var(--text-muted)', fontSize:13 }}>Waiting for host to start…</div>
        )}
      </div>
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  if (phase === 'playing' && question) {
    return (
      <div className="game-room">
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8, textAlign:'center' }}>
          🤖 {topic}
        </div>

        <div className="question-area">
          <div className="question-progress">
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width:`${((questionIdx+1)/totalQ)*100}%` }} />
            </div>
            <span style={{ fontSize:12, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{questionIdx+1}/{totalQ}</span>
            <div className={`question-timer${timeLeft<=5?' urgent':''}`}>{timeLeft}</div>
          </div>

          <div className="question-card">
            {question.category && <div className="question-category">{question.category}</div>}
            <div className="question-text">{question.question}</div>
          </div>

          <div className="options-grid">
            {question.options?.map((opt, idx) => {
              let cls = '';
              if (answerResult) {
                if (idx === answerResult.correctAnswer) cls = 'correct';
                else if (idx === selectedAnswer && !answerResult.correct) cls = 'wrong';
              } else if (idx === selectedAnswer) cls = 'selected';
              return (
                <button key={idx} className={`option-btn ${cls}`} onClick={() => handleAnswer(idx)} disabled={selectedAnswer !== null}>
                  <span className="option-letter">{OPTION_LABELS[idx]}</span>{opt}
                </button>
              );
            })}
          </div>

          {answerResult && (
            <div style={{ textAlign:'center', padding:16, marginTop:12, color: answerResult.correct ? 'var(--green)' : 'var(--red)', fontWeight:600, fontSize:16 }}>
              {answerResult.correct ? '✓ Correct! +10 points' : '✗ Incorrect'}
              {question.explanation && <div style={{ fontSize:13, fontWeight:400, marginTop:6, color:'var(--text-muted)' }}>{question.explanation}</div>}
            </div>
          )}
        </div>

        {leaderboard.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Leaderboard</div>
            {leaderboard.slice(0,3).map((p, i) => {
              const isMe = p.userId === myId || p.userId?._id === myId;
              return (
                <div key={p.userId} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, background: isMe ? 'rgba(var(--yellow),0.08)' : 'transparent' }}>
                  <span>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                  <span style={{ fontSize:13, flex:1 }}>{p.username}{isMe?' (you)':''}</span>
                  {isMe && <span style={{ fontWeight:700, color:'var(--yellow)' }}>{p.score}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Finished ───────────────────────────────────────────────────────────────
  if (phase === 'finished' && finalResult) {
    const myRank  = finalResult.leaderboard.findIndex(p => p.userId === myId || p.userId?._id === myId) + 1;
    const myScore = finalResult.leaderboard.find(p => p.userId === myId || p.userId?._id === myId)?.score || 0;
    const isSolo  = finalResult.leaderboard.length === 1;

    if (isSolo) {
      const correctCount = Math.round(myScore / 10);
      return (
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:8 }}>🎮</div>
          <div style={{ fontSize:24, fontWeight:800, marginBottom:4, fontFamily:'Poppins,sans-serif' }}>Game Over</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>Topic: <strong style={{color:'var(--yellow,#FFD700)'}}>{topic}</strong></div>
          <div style={{ display:'inline-flex', gap:24, background:'var(--bg-elevated,#f0f2f8)', borderRadius:16, padding:'16px 28px', marginBottom:24 }}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:30,fontWeight:900,color:'var(--yellow,#FFD700)',fontFamily:'Poppins,sans-serif'}}>{myScore}</div>
              <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:600}}>Score</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:30,fontWeight:900,color:'var(--green,#00D68F)',fontFamily:'Poppins,sans-serif'}}>{correctCount}/{totalQ}</div>
              <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:600}}>Correct</div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/games')}>Back to Lobby</button>
        </div>
      );
    }

    return (
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:64, marginBottom:8 }}>{myRank===1?'🏆':myRank===2?'🥈':myRank===3?'🥉':'💡'}</div>
        <div style={{ fontSize:28, fontWeight:700, marginBottom:8 }}>
          {myRank===1?'You Won!':myRank===2?'So close!':myRank===3?'Great effort!':'Well played!'}
        </div>
        <div style={{ fontSize:18, fontWeight:700, color:'var(--yellow)', marginBottom:4 }}>{myScore} points</div>
        <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>Topic: {topic}</div>

        {finalResult.leaderboard.slice(0,3).map((p, i) => {
          const isMe = p.userId === myId || p.userId?._id === myId;
          return (
            <div key={p.userId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderRadius:12, marginBottom:6, background: isMe?'rgba(255,215,0,0.08)':'var(--bg-elevated)', border:`2px solid ${isMe?'var(--yellow)':'var(--border)'}`, maxWidth:300, margin:'0 auto 6px' }}>
              <span style={{ fontSize:20 }}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
              <Avatar username={p.username} size={28} />
              <span style={{ flex:1, fontWeight:600, fontSize:14 }}>{p.username}{isMe?' (you)':''}</span>
              {isMe && <span style={{ fontWeight:800, color:'var(--yellow)' }}>{p.score}</span>}
            </div>
          );
        })}

        {/* Show own position if not in top3 */}
        {myRank > 3 && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderRadius:12, marginTop:8, background:'rgba(255,215,0,0.08)', border:'2px dashed var(--yellow)', maxWidth:300, margin:'8px auto 0' }}>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text-muted)' }}>#{myRank}</span>
            <span style={{ flex:1, fontWeight:600, fontSize:14 }}>You</span>
            <span style={{ fontWeight:800, color:'var(--yellow)' }}>{myScore}</span>
          </div>
        )}

        <button className="btn btn-secondary" style={{ marginTop:20 }} onClick={() => navigate('/games')}>Back to Lobby</button>
      </div>
    );
  }

  return null;
}