export default async function handler(req, res) {
  const path = req.url.replace(/^\/api\/replicate/, '') || '/';
  const target = `https://api.replicate.com/v1${path}`;

  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
  };

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
