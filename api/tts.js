export default async function handler(req, res) {
  const path = req.url.replace(/^\/api\/tts/, '') || '/';
  const separator = path.includes('?') ? '&' : '?';
  const target = `https://texttospeech.googleapis.com/v1${path}${separator}key=${process.env.GOOGLE_TTS_API_KEY}`;

  const headers = { 'content-type': 'application/json' };

  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
