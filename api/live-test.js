// api/live-test.js
//
// Backs the "Live now" test banner. If you connect a Vercel KV (Upstash
// Redis) store to this project, every visitor sees the exact same live
// test at the same time -- a true shared round. This is entirely optional:
// if KV_REST_API_URL / KV_REST_API_TOKEN aren't set, this endpoint simply
// reports kvConnected:false and the page falls back to caching the live
// test per-browser (localStorage) instead. Nothing breaks either way.
//
// OPTIONAL SETUP for a truly shared live test:
//   Vercel dashboard -> Storage -> Create Database -> KV
//   Connect it to this project (this auto-adds KV_REST_API_URL and
//   KV_REST_API_TOKEN as environment variables) -> redeploy.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'tw_live_test';

async function kvGet() {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(`${KV_URL}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await r.json();
  if (!data || !data.result) return null;
  try { return JSON.parse(data.result); } catch (e) { return null; }
}

async function kvSet(value) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(JSON.stringify(value))
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const kvConnected = !!(KV_URL && KV_TOKEN);

  if (req.method === 'GET') {
    try {
      const cached = await kvGet();
      res.status(200).json({ kvConnected, data: cached });
    } catch (e) {
      res.status(200).json({ kvConnected: false, data: null });
    }
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    try {
      await kvSet(body);
      res.status(200).json({ ok: true, kvConnected });
    } catch (e) {
      res.status(200).json({ ok: false, kvConnected: false });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
