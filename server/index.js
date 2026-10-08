import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { DISCLAIMER, aiEnabled, generateAiInsights, generateRuleInsights } from './insights.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: aiEnabled() });
});

app.post('/api/insights', async (req, res) => {
  const payload = req.body;
  if (!payload?.summary?.month || !Array.isArray(payload.summary.categories)) {
    return res.status(400).json({ error: 'Request must include a monthly summary.' });
  }

  if (aiEnabled()) {
    try {
      const insights = await generateAiInsights(payload);
      return res.json({ source: 'ai', insights, disclaimer: DISCLAIMER });
    } catch (err) {
      const reason =
        err instanceof Anthropic.AuthenticationError ? 'invalid API key'
        : err instanceof Anthropic.RateLimitError ? 'rate limited'
        : err instanceof Anthropic.APIError ? `API error ${err.status}`
        : err.message;
      console.error('AI insights failed, using rule-based insights:', reason);
      return res.json({
        source: 'rules',
        notice: `AI insights unavailable (${reason}); showing rule-based insights instead.`,
        insights: generateRuleInsights(payload),
        disclaimer: DISCLAIMER,
      });
    }
  }

  res.json({
    source: 'rules',
    notice: 'No ANTHROPIC_API_KEY configured; showing rule-based insights.',
    insights: generateRuleInsights(payload),
    disclaimer: DISCLAIMER,
  });
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(here, '..', 'dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (AI insights ${aiEnabled() ? 'enabled' : 'disabled - rule-based fallback'})`);
});
