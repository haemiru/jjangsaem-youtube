// 톤앤매너별 스타일 프롬프트 목록
export const STYLE_PROMPTS = {
  따뜻한: [
    { id: 'warm_1', label: '부모님께 말하듯', prompt: '따뜻하고 친근한 목소리로, 육아에 지친 부모님께 말하듯 천천히 읽어주세요.' },
    { id: 'warm_2', label: '다정한 언니처럼', prompt: '옆집 언니가 다정하게 조언해주듯, 편안하고 부드러운 톤으로 읽어주세요.' },
    { id: 'warm_3', label: '잠자리 동화처럼', prompt: '아이에게 잠자리 동화를 읽어주듯, 포근하고 느긋한 목소리로 읽어주세요.' },
    { id: 'warm_4', label: '공감하는 상담사', prompt: '공감 능력이 뛰어난 상담사처럼, 상대방의 마음을 어루만지듯 따뜻하게 읽어주세요.' },
    { id: 'warm_5', label: '엄마의 응원', prompt: '아이를 격려하는 엄마의 목소리로, 희망적이고 밝은 톤으로 읽어주세요.' },
  ],
  전문적: [
    { id: 'pro_1', label: '차분한 치료사', prompt: '전문 치료사처럼 차분하고 신뢰감 있는 목소리로 또렷하게 읽어주세요.' },
    { id: 'pro_2', label: '의학 다큐 내레이션', prompt: '의학 다큐멘터리 내레이터처럼 권위 있고 명확한 톤으로 읽어주세요.' },
    { id: 'pro_3', label: '소아과 전문의', prompt: '경험 많은 소아과 전문의가 부모에게 설명하듯, 전문적이면서도 이해하기 쉽게 읽어주세요.' },
    { id: 'pro_4', label: '학회 발표자', prompt: '학술 발표를 하듯 논리적이고 체계적으로, 핵심 데이터를 강조하며 읽어주세요.' },
    { id: 'pro_5', label: '뉴스 앵커', prompt: '신뢰감 있는 뉴스 앵커처럼 정확한 발음과 적절한 속도로 읽어주세요.' },
  ],
  교육적: [
    { id: 'edu_1', label: '친절한 선생님', prompt: '선생님처럼 명확하고 이해하기 쉽게, 핵심을 강조하며 읽어주세요.' },
    { id: 'edu_2', label: '유치원 선생님', prompt: '유치원 선생님이 학부모에게 설명하듯, 밝고 활기찬 톤으로 쉽게 읽어주세요.' },
    { id: 'edu_3', label: '강의하는 교수', prompt: '대학 교수가 강의하듯 차분하면서도 흥미를 유발하는 톤으로 읽어주세요.' },
    { id: 'edu_4', label: '워크숍 진행자', prompt: '실습 워크숍 진행자처럼 참여를 이끌어내는 에너지 있는 목소리로 읽어주세요.' },
    { id: 'edu_5', label: '교육 유튜버', prompt: '인기 교육 유튜버처럼 생동감 있고 쉬운 말투로, 핵심을 콕콕 짚어 읽어주세요.' },
  ],
};

export const TONE_OPTIONS = Object.keys(STYLE_PROMPTS);

// Gemini TTS 음성 목록
export const VOICE_OPTIONS = [
  { id: 'Kore', label: 'Kore (여성, 차분)', gender: '여성' },
  { id: 'Aoede', label: 'Aoede (여성, 밝은)', gender: '여성' },
  { id: 'Leda', label: 'Leda (여성, 부드러운)', gender: '여성' },
  { id: 'Zephyr', label: 'Zephyr (여성, 경쾌한)', gender: '여성' },
  { id: 'Charon', label: 'Charon (남성, 깊은)', gender: '남성' },
  { id: 'Fenrir', label: 'Fenrir (남성, 힘있는)', gender: '남성' },
  { id: 'Puck', label: 'Puck (남성, 친근한)', gender: '남성' },
  { id: 'Orus', label: 'Orus (남성, 안정적)', gender: '남성' },
];

// 속도 옵션
export const SPEED_OPTIONS = [
  { id: 1.0, label: '1배속 (기본)' },
  { id: 1.2, label: '1.2배속' },
  { id: 1.5, label: '1.5배속' },
  { id: 2.0, label: '2배속' },
];

const DELAY_BETWEEN_CALLS = 800;

export const DEFAULT_SPEED_RATE = 1.5;

export async function synthesizeSpeech(text, { stylePrompt, speedRate = DEFAULT_SPEED_RATE, voiceName = 'Kore' } = {}) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceName,
      stylePrompt,
      speedRate
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

export async function synthesizeAllSections(script, { stylePrompt, speedRate = DEFAULT_SPEED_RATE, voiceName = 'Kore', onProgress, cachedAudios = [] } = {}) {
  const items = [];

  const textParts = [];
  const introText = script.hook
    ? script.hook + (script.empathy ? ' ' + script.empathy : '') + (script.twist ? ' ' + script.twist : '')
    : '';
  if (introText) {
    textParts.push({ id: 'intro', text: introText });
  }
  if (script.sections) {
    script.sections.forEach((sec, idx) => {
      // Skip section if it duplicates the intro (hook + empathy + twist)
      const secText = (sec.script || '').replace(/\s+/g, '');
      const introNorm = introText.replace(/\s+/g, '');
      if (introNorm && (secText === introNorm || introNorm.includes(secText) || secText.includes(introNorm))) {
        return;
      }
      textParts.push({ id: `section_${idx}`, text: sec.script });
    });
  }
  if (script.cta?.text) {
    textParts.push({ id: 'outro', text: script.cta.text });
  }

  for (let i = 0; i < textParts.length; i++) {
    const { id, text } = textParts[i];

    // Resume: skip if already cached
    const cached = cachedAudios.find(a => a.id === id);
    if (cached) {
      items.push(cached);
      onProgress?.({
        step: 'tts',
        current: i + 1,
        total: textParts.length,
        label: `음성 캐시 사용 (${i + 1}/${textParts.length})`
      });
      continue;
    }

    onProgress?.({
      step: 'tts',
      current: i + 1,
      total: textParts.length,
      label: `음성 생성 중... (${i + 1}/${textParts.length})`
    });

    const audioBase64 = await synthesizeSpeech(text, { stylePrompt, speedRate, voiceName });
    const duration = await getAudioDuration(audioBase64);

    items.push({ id, audioBase64, duration, text });

    if (i < textParts.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS));
    }
  }

  return items;
}
