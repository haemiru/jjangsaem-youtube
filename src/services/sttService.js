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
 * Align audio to sections using proportional character-based timing.
 * STT via Gemini API is skipped due to Vercel body size limits (4.5MB).
 * Proportional splitting with punctuation weighting provides reasonable results.
 */
export async function alignAudioToSections(audioFile, scriptSections, onProgress) {
  onProgress?.({ step: 'stt', label: '섹션별 타이밍 계산 중...' });
  // Return null to use proportional fallback in buildTimingsFromAlignment
  return null;
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

  // Proportional split by character count (weighted by punctuation for natural pacing)
  const sectionWeights = scriptSections.map(s => {
    const text = s.script || s.text || '';
    // Add weight for punctuation marks (pauses)
    const punctCount = (text.match(/[.!?。，,\n]/g) || []).length;
    return text.length + punctCount * 3;
  });
  const totalWeight = sectionWeights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return [];

  return scriptSections.map((sec, idx) => {
    const text = sec.script || sec.text || '';
    const ratio = sectionWeights[idx] / totalWeight;
    return {
      id: `section_${idx}`,
      audioBase64: null,
      duration: Math.max(0.5, totalDuration * ratio),
      text,
    };
  });
}
