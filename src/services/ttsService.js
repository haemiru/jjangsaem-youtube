const TTS_VOICE = 'ko-KR-Neural2-A';
const TTS_SPEAKING_RATE = 0.95;
const DELAY_BETWEEN_CALLS = 500;

export async function synthesizeSpeech(text) {
  const res = await fetch('/api/tts/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ko-KR', name: TTS_VOICE },
      audioConfig: { audioEncoding: 'MP3', speakingRate: TTS_SPEAKING_RATE }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS API 오류 (${res.status}): ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.audioContent; // base64 MP3
}

export async function getAudioDuration(base64Audio) {
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
    return audioBuffer.duration;
  } finally {
    audioCtx.close();
  }
}

export async function synthesizeAllSections(script, onProgress) {
  const items = [];

  // Build text list from script structure
  const textParts = [];
  if (script.hook) {
    textParts.push({ id: 'intro', text: script.hook + (script.bridge ? ' ' + script.bridge : '') });
  }
  if (script.sections) {
    script.sections.forEach((sec, idx) => {
      textParts.push({ id: `section_${idx}`, text: sec.script });
    });
  }
  if (script.cta?.text) {
    textParts.push({ id: 'outro', text: script.cta.text });
  }

  for (let i = 0; i < textParts.length; i++) {
    const { id, text } = textParts[i];
    onProgress?.({ step: 'tts', current: i + 1, total: textParts.length, label: `음성 합성 중... (${i + 1}/${textParts.length})` });

    const audioBase64 = await synthesizeSpeech(text);
    const duration = await getAudioDuration(audioBase64);

    items.push({ id, audioBase64, duration, text });

    // Rate limit
    if (i < textParts.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS));
    }
  }

  return items;
}
