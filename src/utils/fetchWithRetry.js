export async function fetchWithRetry(url, options, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 504 || res.status === 529) && i < maxRetries - 1) {
      // Exponential backoff: 15s, 30s, 45s, 60s, 90s
      const wait = [15, 30, 45, 60, 90][i] * 1000;
      console.log(`${res.status} error, retrying in ${wait / 1000}s... (${i + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    throw new Error(`API 요청 실패 (${res.status})`);
  }
}
