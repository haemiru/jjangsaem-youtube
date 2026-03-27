// 톤앤매너에 따른 스타일 프롬프트 매핑
const STYLE_PROMPTS = {
  전문적: '전문 치료사처럼 차분하고 신뢰감 있는 목소리로 또렷하게 읽어주세요.',
  따뜻한: '따뜻하고 친근한 목소리로, 육아에 지친 부모님께 말하듯 천천히 읽어주세요.',
  교육적: '선생님처럼 명확하고 이해하기 쉽게, 핵심을 강조하며 읽어주세요.',
};

export const TONE_OPTIONS = Object.keys(STYLE_PROMPTS);

const DELAY_BETWEEN_CALLS = 800;

export async function synthesizeSpeech(text, tone = '따뜻한') {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      stylePrompt: STYLE_PROMPTS[tone] || STYLE_PROMPTS['따뜻한']
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS API 오류 (${res.status}): ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.audioContent; // base64 WAV
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

export async function synthesizeAllSections(script, { tone = '따뜻한', onProgress } = {}) {
  const items = [];

  const textParts = [];
  if (script.hook) {
    textParts.push({
      id: 'intro',
      text: script.hook + (script.bridge ? ' ' + script.bridge : '')
    });
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
    onProgress?.({
      step: 'tts',
      current: i + 1,
      total: textParts.length,
      label: `음성 생성 중... (${i + 1}/${textParts.length})`
    });

    const audioBase64 = await synthesizeSpeech(text, tone);
    const duration = await getAudioDuration(audioBase64);

    items.push({ id, audioBase64, duration, text });

    if (i < textParts.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS));
    }
  }

  return items;
}
