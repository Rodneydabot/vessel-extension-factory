const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// ── Chutes proxy — solves browser CORS ──
app.post('/api/chutes', async (req, res) => {
  const apiKey = req.headers['x-chutes-key'];
  const targetUrl = req.headers['x-chutes-url'] || 'https://api.chutes.ai/v1/chat/completions';

  // Security check: only allow chutes.ai domains or local addresses
  try {
    const url = new URL(targetUrl);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('192.168.') || url.hostname.startsWith('10.');
    if (!url.hostname.endsWith('.chutes.ai') && url.hostname !== 'chutes.ai' && !isLocal) {
      return res.status(400).json({ error: 'Invalid Proxy URL. Must be a *.chutes.ai domain or local address.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (!apiKey) return res.status(400).json({ error: 'Missing x-chutes-key header' });

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();

    res.status(upstream.status)
      .set('Content-Type', 'application/json')
      .send(text);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── CDPilot Browser Agent Proxy ──
app.post('/api/agent/cdp', async (req, res) => {
  const { command, args = [] } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing cdpilot command' });

  const { exec } = require('child_process');
  const fullCmd = `npx cdpilot ${command} ${args.join(' ')}`;
  
  exec(fullCmd, (error, stdout, stderr) => {
    if (error) {
       console.error(`CDPilot Error: ${stderr}`);
       return res.status(500).json({ error: stderr || stdout || error.message });
    }
    res.json({ output: stdout });
  });
});

// ── Static file ──
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Extension Factory running on port ${PORT}`);
});
