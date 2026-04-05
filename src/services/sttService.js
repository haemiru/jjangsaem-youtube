/**
 * STT (Speech-to-Text) alignment service
 * Analyzes uploaded narration audio and aligns timestamps to script sections
 */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function getAudioDurationFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio file'));
    };
  });
}

/**
 * Call Gemini STT to align audio timestamps to script sections
 */
export async function alignAudioToSections(audioFile, scriptSections, onProgress) {
  onProgress?.({ step: 'stt', label: '음성 분석 중 (타임스탬프 추출)...' });

  const base64 = await fileToBase64(audioFile);
  const mimeType = audioFile.type || 'audio/wav';
  const sectionTexts = scriptSections.map(s => s.script || s.text || '');

  const res = await fetch('/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: base64,
      mimeType,
      sections: sectionTexts,
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn('STT alignment failed, falling back to proportional split:', err);
    return null; // fallback to proportional
  }

  const data = await res.json();
  return data.segments;
}

/**
 * Build ttsAudios-compatible array from STT alignment or proportional fallback
 */
export function buildTimingsFromAlignment(segments, scriptSections, totalDuration) {
  if (segments && segments.length > 0) {
    // Use STT alignment
    return segments.map((seg, idx) => ({
      id: `section_${idx}`,
      audioBase64: null,
      duration: Math.max(0.5, (seg.endTime || 0) - (seg.startTime || 0)),
      text: scriptSections[idx]?.script || scriptSections[idx]?.text || '',
    }));
  }

  // Fallback: proportional split by character count
  const totalChars = scriptSections.reduce((sum, s) => sum + (s.script || s.text || '').length, 0);
  if (totalChars === 0) return [];

  return scriptSections.map((sec, idx) => {
    const text = sec.script || sec.text || '';
    const ratio = text.length / totalChars;
    return {
      id: `section_${idx}`,
      audioBase64: null,
      duration: Math.max(0.5, totalDuration * ratio),
      text,
    };
  });
}
