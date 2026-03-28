const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');

// POST /api/ai/chat — proxy AI call server-side (using Groq - free forever)
router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { prompt, maxTokens = 2000 } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: 'Prompt required' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'GROQ_API_KEY not set on server' });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  maxTokens,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(429).json({ success: false, message: data.error.message });

    const text = data.choices?.[0]?.message?.content || '';
    res.json({ success: true, text });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;