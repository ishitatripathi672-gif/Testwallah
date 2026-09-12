
  // api/ai.js
//
// Uses Google's Gemini API — completely FREE, no credit card required.
// Get a free key at https://aistudio.google.com/apikey (just sign in with
// a Google account, click "Create API key"). Gemini's free tier has a
// generous daily quota which is more than enough for a quiz app like this.
//
// Model: gemini-3.8-flash (GA as of Sept 2, 2026, Google's current
// flagship Flash model). NOTE: Google retires Gemini model names
// aggressively — gemini-2.0-flash (used in an earlier version of this
// file) was already shut down on June 1, 2026. If this model ever stops
// working, check https://ai.google.dev/gemini-api/docs/changelog for the
// current model name and update GEMINI_MODEL below (or set it as a Vercel
// env var to change it without editing code).
//
// SETUP (one-time, in the Vercel dashboard):
//   Project -> Settings -> Environment Variables
//   Add: GEMINI_API_KEY = <the key from aistudio.google.com>
//   Then redeploy the project.
//
// The interface this function exposes to the page is unchanged
// ({system, prompt, maxTokens} in -> {text} out), so nothing in
// index.html needs to change — only the AI provider underneath.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'Server is missing GEMINI_API_KEY. Get a free key at https://aistudio.google.com/apikey, add it in Vercel: Project Settings -> Environment Variables -> GEMINI_API_KEY, then redeploy.'
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { system, prompt, maxTokens } = body || {};

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing "prompt" string in request body.' });
    return;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: Math.min(Math.max(parseInt(maxTokens, 10) || 1024, 1), 8192),
          temperature: 0.8
        }
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data });
      return;
    }

    const candidate = (data.candidates || [])[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map((p) => p.text || '').join('')
      : '';

    if (!text) {
      // Gemini can return an empty response if it hit a safety block or
      // ran out of tokens before finishing — surface that clearly instead
      // of silently returning nothing.
      const reason = candidate && candidate.finishReason ? candidate.finishReason : 'unknown';
      res.status(502).json({ error: `Gemini returned no text (finishReason: ${reason}).` });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
