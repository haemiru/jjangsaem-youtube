export const config = {
  supportsResponseStreaming: true,
  maxDuration: 120,
};

export default async function handler(req, res) {
  try {
    const path = req.url.replace(/^\/api\/anthropic/, '') || '/';
    const target = `https://api.anthropic.com${path}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const headers = {
      'content-type': 'application/json',
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      'x-api-key': apiKey,
    };

    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
      : undefined;

    // Check if client requested streaming
    const isStream = body && JSON.parse(body).stream;

    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
    });

    if (isStream && response.ok) {
      // Stream SSE response back to client
      res.setHeader('content-type', 'text/event-stream');
      res.setHeader('cache-control', 'no-cache');
      res.setHeader('connection', 'keep-alive');

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        res.end();
      }
    } else {
      // Non-streaming: return full response
      const data = await response.text();
      res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
      res.status(response.status).send(data);
    }
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
