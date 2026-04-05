import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, ArrowRight, Loader2, StopCircle, RotateCw, AlertCircle, Play, Upload, Edit3, ChevronUp, Download, X, ZoomIn, ArrowUp, ArrowDown, Film, Save, Settings2, Type } from 'lucide-react';
import { synthesizeFullScript, STYLE_PROMPTS, TONE_OPTIONS, VOICE_OPTIONS, SPEED_OPTIONS, DEFAULT_SPEED_RATE } from '../services/ttsService';
import { alignAudioToSections, buildTimingsFromAlignment, getAudioDurationFromFile } from '../services/sttService';
import { VideoGenerator } from '../services/videoGenerator';

const COMMON_SUFFIX = ", for Korean audience, warm and professional style, clean background, high quality, bright lighting, suitable for educational YouTube content, do not place text in the bottom 20% of the frame (reserved for subtitles) but characters and props can use the full frame, all text in the image must be in Korean (한글) only, no English text, no headlines, no background sentences, minimalist design";

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';
const DELAY_BETWEEN_REQUESTS_MS = 3000;

async function generateImageWithGemini(prompt, referenceImage = null, retries = 3) {
  // Routed through server-side proxy — API key injected by proxy
  const url = `/api/gemini/models/${GEMINI_MODEL}:generateContent`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Build parts: text prompt + optional reference image
      const reqParts = [];
      if (referenceImage) {
        // Extract base64 and mimeType from data URL
        const match = referenceImage.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          reqParts.push({
            text: `Use the character from the reference image below as the main character. Maintain consistent appearance, style, and features.\n\n${prompt}`
          });
          reqParts.push({
            inlineData: { mimeType: match[1], data: match[2] }
          });
        } else {
          reqParts.push({ text: prompt });
        }
      } else {
        reqParts.push({ text: prompt });
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: reqParts }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            thinkingConfig: {
              thinkingBudget: 1024,
            },
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        // Rate limit - wait and retry
        if (res.status === 429 && attempt < retries - 1) {
          const backoff = Math.pow(2, attempt + 1) * 2000;
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`Gemini API 오류 (${res.status}): ${errText.substring(0, 200)}`);
      }

      const data = await res.json();
      console.log('Gemini API response:', JSON.stringify(data).substring(0, 500));
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error('응답에 콘텐츠가 없습니다: ' + JSON.stringify(data).substring(0, 300));

      const imagePart = parts.find(p => p.inlineData);
      if (!imagePart) throw new Error('이미지가 생성되지 않았습니다: ' + JSON.stringify(parts.map(p => Object.keys(p))));

      const { mimeType, data: base64Data } = imagePart.inlineData;
      return `data:${mimeType};base64,${base64Data}`;
    } catch (err) {
      if (attempt < retries - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
}

const FLUX_MODELS = {
  'flux-schnell': 'black-forest-labs/flux-schnell',
  'flux-pro': 'black-forest-labs/flux-1.1-pro',
};

async function generateImageWithReplicate(prompt, modelKey, referenceImage = null, retries = 3) {
  const modelVersion = FLUX_MODELS[modelKey];
  if (!modelVersion) throw new Error(`Unknown model: ${modelKey}`);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // 1. Build input
      const input = {
        prompt,
        aspect_ratio: '16:9',
        output_format: 'webp',
        output_quality: 90,
      };

      // FLUX 1.1 Pro supports image_prompt for reference image guidance
      if (modelKey === 'flux-pro' && referenceImage) {
        input.image_prompt = referenceImage;
      }

      // 1. Create prediction
      const createRes = await fetch('/api/replicate/models/' + modelVersion + '/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        if (createRes.status === 429 && attempt < retries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 2000));
          continue;
        }
        throw new Error(`Replicate API 오류 (${createRes.status}): ${errText.substring(0, 200)}`);
      }

      const prediction = await createRes.json();

      // 2. Poll for completion (max 120 seconds)
      const pollUrl = `/api/replicate/predictions/${prediction.id}`;
      const maxWait = 120000;
      const pollInterval = 1500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));

        const pollRes = await fetch(pollUrl);
        if (!pollRes.ok) continue;

        const status = await pollRes.json();

        if (status.status === 'succeeded') {
          // 3. Fetch image and convert to base64
          const output = Array.isArray(status.output) ? status.output[0] : status.output;
          if (!output) throw new Error('이미지 URL이 없습니다');

          const imgRes = await fetch(output);
          const blob = await imgRes.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        if (status.status === 'failed') {
          throw new Error(`이미지 생성 실패: ${status.error || 'unknown error'}`);
        }

        if (status.status === 'canceled') {
          throw new Error('이미지 생성이 취소되었습니다');
        }
      }

      throw new Error('이미지 생성 시간 초과 (120초)');
    } catch (err) {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      throw err;
    }
  }
}

export default function MediaPanel({ globalState, updateState, onNext, disabled }) {
  // Disabled mode - show placeholder
  if (disabled) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <ImageIcon size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>미디어 생성 (비활성화)</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', textAlign: 'center', lineHeight: '1.6' }}>
          현재 캡컷(CapCut) 등 외부 도구로 영상을 제작하는 워크플로우를 사용 중입니다.<br/>
          대본 단계에서 생성된 이미지/영상 프롬프트를 활용하세요.
        </p>
        <button className="btn-primary" onClick={onNext}>
          업로드 단계로 이동 <ArrowRight size={20} />
        </button>
      </div>
    );
  }

  const { plan, script, benchmark } = globalState;
  const isShorts = plan?.format?.includes('쇼츠');

  // Items to generate
  const [queue, setQueue] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const stopRef = useRef(false);

  // Image preview modal
  const [previewItem, setPreviewItem] = useState(null);

  // Thumbnail overlay settings (Nick Invests style: bold black text on white bg)
  const [thumbSettings, setThumbSettings] = useState({
    text: script.final_thumbnail_copy || '',
    size: 56,
    position: 'middle',
    color: '#000000',
    dim: 0
  });

  // Timeline for video
  const [timeline, setTimeline] = useState([]);
  const [bgm, setBgm] = useState('bgm_warm_morning');
  const [showSubtitle, setShowSubtitle] = useState(true);

  // Video generation
  const [videoProgress, setVideoProgress] = useState(null); // { step, label, current?, total? }
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoQuality, setVideoQuality] = useState('fast');
  const [ttsTone, setTtsTone] = useState(plan?.tone || '따뜻한');
  const [ttsStyleId, setTtsStyleId] = useState(STYLE_PROMPTS[plan?.tone || '따뜻한']?.[0]?.id || 'warm_1');
  const [ttsVoice, setTtsVoice] = useState('Kore');
  const [ttsSpeed, setTtsSpeed] = useState(DEFAULT_SPEED_RATE);
  const [videoError, setVideoError] = useState('');
  const videoGenRef = useRef(null);

  // Thumbnail canvas export
  const thumbCanvasRef = useRef(null);

  // Timeline preview
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const previewTimerRef = useRef(null);

  // TTS resume (keep completed audios across retries)
  const [cachedTtsAudios, setCachedTtsAudios] = useState([]);

  // Audio mode: 'tts' (AI generate) or 'upload' (user uploads narration file)
  const [audioMode, setAudioMode] = useState('tts');
  const [uploadedAudioFile, setUploadedAudioFile] = useState(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState(null);

  // Prompt editing for image cards
  const [editingPromptId, setEditingPromptId] = useState(null);

  // Character reference image
  const [characterRef, setCharacterRef] = useState(null);

  // Image generation model selection
  const [imageModel, setImageModel] = useState('gemini'); // 'gemini' | 'flux-schnell' | 'flux-pro'

  // Initialize queue
  useEffect(() => {
    if (!script.hook) return;

    const aspectSuffix = isShorts ? ', 세로 9:16 비율, 모바일 최적화' : '';
    const suffix = COMMON_SUFFIX + aspectSuffix;

    const items = [];
    const introPrompt = script.intro_image_prompt
      ? `${script.intro_image_prompt}${suffix}`
      : `Opening title background for: ${script.hook}.${suffix}`;
    items.push({ id: 'intro', label: '오프닝', prompt: introPrompt, status: 'idle', url: null });

    // Use sections if available, otherwise fall back to rows
    const imageSources = script.sections?.length > 0 ? script.sections : (script.rows || []);
    imageSources.forEach((sec, idx) => {
      if (!sec.image_prompt) return;
      const sectionLabel = sec.section ? `${sec.section}` : `섹션${idx+1}`;
      const keyword = sec.keyword || '';
      const shortKeyword = keyword.length > 20 ? keyword.substring(0, 20).replace(/[,.]$/, '') : keyword;
      const keywordInstruction = shortKeyword
        ? `. Only text allowed: Korean text '${shortKeyword}' inside a speech bubble or label near the main character. Do not include any other text, titles, headlines, or captions. Only the specified text '${shortKeyword}' should be visible.`
        : '. Do not include any text, titles, headlines, or captions in the image.';
      items.push({ id: `section_${idx}`, label: sectionLabel, prompt: `${sec.image_prompt}${keywordInstruction}${suffix}`, status: 'idle', url: null });
    });

    // Thumbnails — skip for Shorts (Nick Invests style: white bg + cartoon character + bold text)
    if (!isShorts) {
      const thumbNoText = '. CRITICAL: Do not include any text, titles, headlines, captions, or Korean text in the image. The image must contain only the character and props, absolutely no text at all. Leave the right side empty for post-production text overlay.';
      let thumbBasePrompt = script.thumbnailImagePrompts?.[0]?.prompt
        || `YouTube thumbnail, 16:9 aspect ratio, clean pure white background, cute cartoon illustration character placed on left (30% of frame), expressive emotion, right side empty space for text overlay, minimal layout, high contrast, whiteboard animation style`;
      let thumbAltPrompt = script.thumbnailImagePrompts?.[1]?.prompt
        || thumbBasePrompt + ', different pose and angle, different composition';

      // Strip any existing text instructions from saved prompts
      thumbBasePrompt = thumbBasePrompt.replace(/,?\s*(bold |Korean |한글|text |'[^']*'|"[^"]*")*(keyword|text|글자|키워드)[^,]*/gi, '');
      thumbAltPrompt = thumbAltPrompt.replace(/,?\s*(bold |Korean |한글|text |'[^']*'|"[^"]*")*(keyword|text|글자|키워드)[^,]*/gi, '');

      items.push({ id: 'thumb_a', label: '썸네일 A', prompt: `${thumbBasePrompt}${thumbNoText}${suffix}`, status: 'idle', url: null });
      items.push({ id: 'thumb_b', label: '썸네일 B', prompt: `${thumbAltPrompt}${thumbNoText}${suffix}`, status: 'idle', url: null });
    }

    const outroPrompt = script.outro_image_prompt
      ? `${script.outro_image_prompt}${suffix}`
      : `Warm and clean ending card background, soft gradient, subtle sparkle effects, empty center area for text overlay, suitable for thank you message and channel subscription CTA, Korean text only if needed, no English text.${suffix}`;
    items.push({ id: 'outro', label: '엔딩', prompt: outroPrompt, status: 'idle', url: null });

    setQueue(items);
  }, [script, benchmark, isShorts]);

  const stopGeneration = () => {
    stopRef.current = true;
  };

  const generateImages = async () => {
    setIsGenerating(true);
    setGenError('');
    stopRef.current = false;
    const newQueue = [...queue];

    for (let i = 0; i < newQueue.length; i++) {
      if (stopRef.current) {
        // Mark remaining generating items back to idle
        newQueue.forEach(q => { if (q.status === 'generating') q.status = 'idle'; });
        setQueue([...newQueue]);
        break;
      }

      // Skip already completed items
      if (newQueue[i].status === 'done') continue;

      newQueue[i].status = 'generating';
      setQueue([...newQueue]);

      try {
        const dataUrl = imageModel === 'gemini'
          ? await generateImageWithGemini(newQueue[i].prompt, characterRef)
          : await generateImageWithReplicate(newQueue[i].prompt, imageModel, characterRef);
        newQueue[i].url = dataUrl;
        newQueue[i].status = 'done';
      } catch (err) {
        console.error(`Image generation failed for ${newQueue[i].id}:`, err);
        newQueue[i].status = 'error';
        newQueue[i].error = err.message;
      }

      setQueue([...newQueue]);

      // Rate limiting delay between requests (shorter for Replicate)
      const delay = imageModel === 'gemini' ? DELAY_BETWEEN_REQUESTS_MS : 500;
      if (i < newQueue.length - 1 && newQueue[i].status === 'done') {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    setIsGenerating(false);

    // Initialize timeline with generated images (exclude thumbnails)
    const completedItems = newQueue.filter(q => q.status === 'done');
    const timelineItems = completedItems
      .filter(q => q.id !== 'thumb_a' && q.id !== 'thumb_b')
      .map(q => ({
        id: q.id,
        label: q.label,
        url: q.url,
        duration: q.id.includes('section') ? 15 : 5
      }));
    setTimeline(timelineItems);

    updateState('media', {
      ...globalState.media,
      generatedImages: newQueue,
      thumbnailA: completedItems.find(q => q.id === 'thumb_a')?.url,
      thumbnailB: completedItems.find(q => q.id === 'thumb_b')?.url,
      timeline: timelineItems,
      videoSettings: { bgm, showSubtitle }
    });
  };

  const regenerateSingle = async (itemId) => {
    const newQueue = [...queue];
    const idx = newQueue.findIndex(q => q.id === itemId);
    if (idx === -1) return;

    newQueue[idx].status = 'generating';
    newQueue[idx].error = undefined;
    setQueue([...newQueue]);

    try {
      const dataUrl = imageModel === 'gemini'
        ? await generateImageWithGemini(newQueue[idx].prompt, characterRef)
        : await generateImageWithReplicate(newQueue[idx].prompt, imageModel, characterRef);
      newQueue[idx].url = dataUrl;
      newQueue[idx].status = 'done';
    } catch (err) {
      newQueue[idx].status = 'error';
      newQueue[idx].error = err.message;
    }

    setQueue([...newQueue]);
  };

  const uploadImage = (itemId, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const newQueue = [...queue];
      const idx = newQueue.findIndex(q => q.id === itemId);
      if (idx === -1) return;
      newQueue[idx].url = e.target.result;
      newQueue[idx].status = 'done';
      newQueue[idx].error = undefined;
      setQueue([...newQueue]);
    };
    reader.readAsDataURL(file);
  };

  // Download all completed images (500ms interval to avoid browser throttling)
  const downloadAllImages = async () => {
    const completed = queue.filter(q => q.status === 'done' && q.url);
    for (let i = 0; i < completed.length; i++) {
      const item = completed[i];
      const link = document.createElement('a');
      link.href = item.url;
      const ext = item.url.startsWith('data:image/png') ? 'png' : item.url.startsWith('data:image/webp') ? 'webp' : 'jpg';
      link.download = `${String(i + 1).padStart(2, '0')}_${item.id}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (i < completed.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  };

  const completedCount = queue.filter(q => q.status === 'done').length;
  const errorCount = queue.filter(q => q.status === 'error').length;
  const isAllCompleted = completedCount === queue.length && queue.length > 0;
  const hasResults = completedCount > 0;

  // Auto-build timeline when all images are complete (covers upload-only flow)
  useEffect(() => {
    if (isAllCompleted && timeline.length === 0) {
      const autoTimeline = queue
        .filter(q => q.status === 'done' && q.id !== 'thumb_a' && q.id !== 'thumb_b')
        .map(q => ({ id: q.id, label: q.label, url: q.url, duration: q.id.includes('section') ? 15 : 5 }));
      if (autoTimeline.length > 0) setTimeline(autoTimeline);
    }
  }, [isAllCompleted, queue]);

  // Sync queue to globalState so tab completion is detected
  useEffect(() => {
    if (completedCount > 0) {
      updateState('media', {
        ...globalState.media,
        generatedImages: queue,
      });
    }
  }, [completedCount]);

  // --- Video Generation ---
  const startVideoGeneration = async () => {
    setVideoError('');
    setVideoProgress({ step: 'tts', label: '음성 합성 준비 중...' });
    setVideoBlob(null);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }

    try {
      let ttsAudios;
      let uploadedAudio = null;

      // Determine audio source file (either uploaded or AI-generated)
      let audioFile;
      if (audioMode === 'upload' && uploadedAudioFile) {
        audioFile = uploadedAudioFile;
      } else {
        // --- TTS mode: generate full script audio in one API call ---
        const selectedStyle = STYLE_PROMPTS[ttsTone]?.find(s => s.id === ttsStyleId);
        audioFile = await synthesizeFullScript(script, {
          stylePrompt: selectedStyle?.prompt || STYLE_PROMPTS['따뜻한'][0].prompt,
          speedRate: ttsSpeed,
          voiceName: ttsVoice,
          onProgress: setVideoProgress,
        });
      }

      // --- Analyze audio and align to sections ---
      setVideoProgress({ step: 'stt', label: '음성 분석 중 (섹션별 타이밍 매칭)...' });
      const scriptSections = script.sections?.length > 0 ? script.sections : (script.rows || []);
      const totalDuration = await getAudioDurationFromFile(audioFile);

      const segments = await alignAudioToSections(audioFile, scriptSections, setVideoProgress);
      ttsAudios = buildTimingsFromAlignment(segments, scriptSections, totalDuration);
      uploadedAudio = audioFile;

      setVideoProgress({ step: 'stt', label: `음성 분석 완료 (${ttsAudios.length}개 섹션 매칭)` });

      if (videoGenRef.current?.aborted) return;

      // 2. Video generation
      const bgmPath = bgm !== 'bgm_none' ? `/bgm/${bgm}.mp3` : null;
      const generator = new VideoGenerator({
        timeline,
        ttsAudios,
        uploadedAudio,
        bgmUrl: bgmPath,
        showSubtitle,
        isShorts,
        quality: videoQuality,
        onProgress: setVideoProgress,
      });
      videoGenRef.current = generator;

      const blob = await generator.generateVideo();
      if (!blob) return; // aborted

      setVideoBlob(blob);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setVideoProgress({ step: 'done', label: '영상 생성 완료!' });

      // Store for upload panel
      updateState('media', { ...globalState.media, videoBlob: blob });
    } catch (err) {
      console.error('Video generation error:', err);
      setVideoError(`영상 생성 실패: ${err.message}. "다시 시도" 버튼으로 이어서 생성할 수 있습니다.`);
      setVideoProgress(null);
    }
  };

  const stopVideoGeneration = () => {
    videoGenRef.current?.abort();
    setVideoProgress(null);
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `${plan.topic || 'video'}_${isShorts ? 'shorts' : 'regular'}.mp4`;
    a.click();
  };

  const updatePrompt = (itemId, newPrompt) => {
    const newQueue = queue.map(q => q.id === itemId ? { ...q, prompt: newPrompt } : q);
    setQueue(newQueue);
  };

  // --- Thumbnail Export ---
  const exportThumbnail = (variant = 'A') => {
    const thumbItem = queue.find(q => q.id === (variant === 'A' ? 'thumb_a' : 'thumb_b') && q.status === 'done');
    if (!thumbItem?.url) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Background image
      ctx.drawImage(img, 0, 0, 1280, 720);

      // Dimmer
      ctx.fillStyle = `rgba(0, 0, 0, ${thumbSettings.dim / 100})`;
      ctx.fillRect(0, 0, 1280, 720);

      // Text overlay — positioned on right side (character is on left ~30%)
      const fontSize = thumbSettings.size * (1280 / 600);
      ctx.font = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = thumbSettings.color;
      const isDarkText = thumbSettings.color === '#000000' || thumbSettings.color === '#000';
      ctx.shadowColor = isDarkText ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = isDarkText ? 0 : 8;

      const textX = 830; // Right side center (character occupies left ~30%)
      const textY = thumbSettings.position === 'top' ? 150
        : thumbSettings.position === 'middle' ? 360 : 570;

      // Word-wrap text in right area
      const maxWidth = 750;
      const words = thumbSettings.text.split('');
      let lines = [];
      let currentLine = '';
      for (const char of words) {
        const testLine = currentLine + char;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineHeight = fontSize * 1.3;
      const startY = textY - ((lines.length - 1) * lineHeight) / 2;
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], textX, startY + li * lineHeight, maxWidth);
      }
      ctx.shadowBlur = 0;

      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thumbnail_${variant}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = thumbItem.url;
  };

  const saveThumbAB = () => {
    exportThumbnail('A');
    setTimeout(() => exportThumbnail('B'), 500);
  };

  // --- Timeline Preview ---
  const startPreview = () => {
    if (timeline.length === 0) return;
    setPreviewPlaying(true);
    setPreviewIdx(0);
    let idx = 0;
    const advance = () => {
      idx++;
      if (idx >= timeline.length) {
        setPreviewPlaying(false);
        setPreviewIdx(0);
        return;
      }
      setPreviewIdx(idx);
      previewTimerRef.current = setTimeout(advance, Math.min(timeline[idx].duration, 3) * 1000);
    };
    previewTimerRef.current = setTimeout(advance, Math.min(timeline[0].duration, 3) * 1000);
  };

  const stopPreview = () => {
    setPreviewPlaying(false);
    clearTimeout(previewTimerRef.current);
  };

  const moveTimelineItem = (idx, dir) => {
    const newTl = [...timeline];
    if (dir === 'up' && idx > 0) {
      [newTl[idx-1], newTl[idx]] = [newTl[idx], newTl[idx-1]];
    } else if (dir === 'down' && idx < newTl.length - 1) {
      [newTl[idx+1], newTl[idx]] = [newTl[idx], newTl[idx+1]];
    }
    setTimeline(newTl);
  };

  const updateDuration = (idx, val) => {
    const newTl = [...timeline];
    newTl[idx].duration = parseInt(val) || 0;
    setTimeline(newTl);
  };

  if (queue.length === 0) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <ImageIcon size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>시각 자료 생성</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', textAlign: 'center' }}>
          대본이 아직 생성되지 않았습니다.<br/>대본 탭에서 먼저 대본을 생성해주세요.
        </p>
        <button className="btn-secondary" onClick={onNext} style={{ opacity: 0.7 }}>
          건너뛰고 업로드 →
        </button>
      </div>
    );
  }

  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>시각 자료 생성 & 합성</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {completedCount > 0 && !isGenerating && (
            <button className="btn-secondary" onClick={downloadAllImages}>
              <Download size={18} /> 전체 다운로드 ({completedCount})
            </button>
          )}
          {!isAllCompleted && (
            <>
            {isGenerating && (
              <button
                className="btn-secondary"
                onClick={stopGeneration}
                style={{ color: '#dc2626', borderColor: '#dc2626' }}
              >
                <StopCircle size={18} /> 중지
              </button>
            )}
            <button
              className="btn-primary"
              onClick={generateImages}
              disabled={isGenerating}
              style={{ opacity: isGenerating ? 0.7 : 1 }}
            >
              {isGenerating ? <RotateCw className="animate-spin" size={18} /> : <ImageIcon size={18} />}
              {isGenerating ? '이미지 생성 중...' : completedCount > 0 ? '이미지 이어서 생성' : '전체 이미지 생성'}
            </button>
            </>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--gray-100)' }}>
        <label className="form-label" style={{ marginBottom: '0.5rem' }}>이미지 생성 모델</label>
        <div className="radio-group">
          {[
            { id: 'gemini', label: 'Gemini', desc: '캐릭터 참조 지원' },
            { id: 'flux-schnell', label: 'FLUX Schnell', desc: '빠름 · ~$0.003/장' },
            { id: 'flux-pro', label: 'FLUX 1.1 Pro', desc: '고품질 · 참조이미지 지원 · ~$0.04/장' },
          ].map(m => (
            <label key={m.id} className={`radio-label ${imageModel === m.id ? 'selected' : ''}`} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.125rem', padding: '0.5rem 0.75rem' }}>
              <input type="radio" className="radio-input" checked={imageModel === m.id} onChange={() => setImageModel(m.id)} disabled={isGenerating} />
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{m.label}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.desc}</span>
            </label>
          ))}
        </div>
        {imageModel === 'flux-schnell' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            FLUX Schnell은 캐릭터 참조 이미지를 지원하지 않습니다. 프롬프트만으로 생성됩니다.
          </p>
        )}
      </div>

      {genError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#dc2626', fontSize: '0.875rem' }}>
          <AlertCircle size={16} /> {genError}
        </div>
      )}

      {/* 0. Character Reference */}
      <div style={{ padding: '1rem 1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', backgroundColor: characterRef ? '#f0fdf4' : 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>캐릭터 레퍼런스 (선택사항)</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {characterRef ? '캐릭터 이미지가 설정되었습니다. 모든 이미지 생성에 반영됩니다.' : '캐릭터 이미지를 업로드하면 해당 캐릭터 스타일로 이미지가 생성됩니다.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {characterRef && (
              <>
                <img src={characterRef} alt="캐릭터" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '2px solid var(--primary)' }} />
                <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setCharacterRef(null)}>
                  <X size={14} /> 제거
                </button>
              </>
            )}
            <label className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              <Upload size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              {characterRef ? '변경' : '업로드'}
              <input type="file" accept="image/*" hidden onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setCharacterRef(ev.target.result);
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>
        </div>
      </div>

      {/* 1. Generation Grid View */}
      <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          이미지 생성 진행 ({completedCount}/{queue.length} 완료{errorCount > 0 ? `, ${errorCount} 실패` : ''})
        </h3>

        {/* Progress Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(100px, 1fr))`, gap: '0.5rem', marginBottom: '1.5rem' }}>
          {queue.map(item => (
            <div key={item.id} style={{
              textAlign: 'center', padding: '0.75rem',
              backgroundColor: item.status === 'done' ? '#dcfce7' : item.status === 'generating' ? '#fef9c3' : item.status === 'error' ? '#fef2f2' : 'var(--gray-100)',
              border: item.status === 'generating' ? '1px dashed var(--primary)' : item.status === 'error' ? '1px solid #fecaca' : '1px solid var(--border)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{item.label}</div>
              <div style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>
                {item.status === 'done' ? '✅' : item.status === 'generating' ? '⏳' : item.status === 'error' ? '❌' : '⬜'}
              </div>
            </div>
          ))}
        </div>

        {/* Image Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {queue.map(item => (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {item.status === 'done' ? (
                  <div
                    onClick={() => setPreviewItem(item)}
                    style={{ height: '120px', backgroundImage: `url(${item.url})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'pointer', position: 'relative' }}
                  >
                    <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ZoomIn size={14} color="white" />
                    </div>
                  </div>
                ) : item.status === 'error' ? (
                  <div style={{ height: '120px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontSize: '0.75rem', padding: '0.5rem', textAlign: 'center' }}>
                    {item.error || '생성 실패'}
                  </div>
                ) : item.status === 'generating' ? (
                  <div style={{ height: '120px', backgroundColor: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RotateCw className="animate-spin" size={24} color="var(--primary)" />
                  </div>
                ) : (
                  <label
                    style={{ height: '120px', backgroundColor: 'var(--gray-100)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '0.25rem', border: '2px dashed transparent', transition: 'border-color 0.2s' }}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.backgroundColor = 'var(--gray-200)'; }}
                    onDragLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = 'var(--gray-100)'; }}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = 'var(--gray-100)'; const file = e.dataTransfer.files[0]; if (file) uploadImage(item.id, file); }}
                  >
                    <Upload size={20} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>클릭 또는 끌어다 놓기</span>
                    <input type="file" accept="image/*" hidden onChange={(e) => uploadImage(item.id, e.target.files[0])} />
                  </label>
                )}
                <div style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.label}</span>
                    <button
                      onClick={() => setEditingPromptId(editingPromptId === item.id ? null : item.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                      title="프롬프트 보기/수정"
                    >
                      {editingPromptId === item.id ? <ChevronUp size={14} /> : <Edit3 size={14} />}
                    </button>
                  </div>
                  {editingPromptId === item.id && (
                    <textarea
                      className="form-control"
                      style={{ fontSize: '0.7rem', minHeight: '60px', marginBottom: '0.5rem', lineHeight: '1.4' }}
                      value={item.prompt}
                      onChange={(e) => updatePrompt(item.id, e.target.value)}
                    />
                  )}
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {item.status === 'done' && (
                      <label className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', flex: 1, cursor: 'pointer', textAlign: 'center' }}>
                        <Upload size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> 교체
                        <input type="file" accept="image/*" hidden onChange={(e) => uploadImage(item.id, e.target.files[0])} />
                      </label>
                    )}
                    <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', flex: 1 }} onClick={() => regenerateSingle(item.id)} disabled={isGenerating}>
                      {item.status === 'done' ? '재생성' : item.status === 'error' ? '재시도' : 'AI 생성'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
      </div>

      {hasResults && (
        <>
          {/* 2. Thumbnail Editor (일반 영상만) */}
          {!isShorts && (
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Type size={18} color="var(--primary)" /> 썸네일 합성 (A/B 테스트 설정)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
              {/* Preview Area */}
              {(() => {
                const thumbItem = queue.find(q => q.id === 'thumb_a' && q.status === 'done');
                const thumbUrl = thumbItem?.url;
                return (
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: 'var(--gray-200)', backgroundImage: thumbUrl ? `url(${thumbUrl})` : 'none', backgroundSize: 'cover' }}>
                    {/* Dimmer */}
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'black', opacity: thumbSettings.dim / 100 }} />

                    {/* Text Overlay — right side (character is on left ~30%) */}
                    <div style={{
                      position: 'absolute', top: 0, right: 0, bottom: 0, width: '65%', display: 'flex', padding: '1.5rem',
                      alignItems: thumbSettings.position === 'top' ? 'flex-start' : thumbSettings.position === 'middle' ? 'center' : 'flex-end',
                      justifyContent: 'center'
                    }}>
                      <div style={{
                        fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 700,
                        fontSize: `${thumbSettings.size}px`, color: thumbSettings.color,
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 0 rgba(0,0,0,0.5)',
                        textAlign: 'center', wordBreak: 'keep-all', lineHeight: 1.2
                      }}>
                        {thumbSettings.text}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>문구 선택 (후보 중)</label>
                  <select
                    className="form-control"
                    value={thumbSettings.text}
                    onChange={e => setThumbSettings(p => ({ ...p, text: e.target.value }))}
                  >
                    <option value={script.final_thumbnail_copy}>{script.final_thumbnail_copy} (최종 추천)</option>
                    {script.thumbnailCopies?.map((c, i) => (
                      <option key={i} value={c.text}>{c.text}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>텍스트 크기 ({thumbSettings.size}px)</label>
                  <input type="range" min="20" max="100" value={thumbSettings.size} onChange={e => setThumbSettings(p => ({ ...p, size: parseInt(e.target.value) }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>위치</label>
                  <div className="radio-group" style={{ gap: '0.5rem' }}>
                    {['top', 'middle', 'bottom'].map(pos => (
                      <label key={pos} className={`radio-label ${thumbSettings.position === pos ? 'selected' : ''}`} style={{ padding: '0.25rem 0.5rem', flex: 1, justifyContent: 'center' }}>
                        <input type="radio" className="radio-input" checked={thumbSettings.position === pos} onChange={() => setThumbSettings(p => ({ ...p, position: pos }))} />
                        {pos === 'top' ? '상' : pos === 'middle' ? '중' : '하'}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>배경 어둡기 ({thumbSettings.dim}%)</label>
                  <input type="range" min="0" max="80" value={thumbSettings.dim} onChange={e => setThumbSettings(p => ({ ...p, dim: parseInt(e.target.value) }))} style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={saveThumbAB}>
                    <Save size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />A/B 둘 다 저장
                  </button>
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={() => exportThumbnail('A')}>
                    <Download size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />A만 저장
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 3. Setup Timeline */}
          {timeline.length > 0 && (
            <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings2 size={18} color="var(--primary)" /> 영상 합성 준비 (타임라인)
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                {/* Sequence */}
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>이미지 순서 및 표시 시간</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {timeline.map((item, idx) => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', backgroundColor: 'var(--surface)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <button onClick={() => moveTimelineItem(idx, 'up')} disabled={idx===0} style={{ padding:0, border:'none', background:'none', cursor:'pointer', color: idx===0 ? 'var(--gray-300)' : 'var(--text-main)' }}><ArrowUp size={14}/></button>
                          <button onClick={() => moveTimelineItem(idx, 'down')} disabled={idx===timeline.length-1} style={{ padding:0, border:'none', background:'none', cursor:'pointer', color: idx===timeline.length-1 ? 'var(--gray-300)' : 'var(--text-main)' }}><ArrowDown size={14}/></button>
                        </div>
                        <img src={item.url} alt="" style={{ width: '50px', height: '30px', objectFit: 'cover', borderRadius: '2px' }} />
                        <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{item.label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input type="number" className="form-control" style={{ width: '70px', padding: '0.25rem 0.5rem' }} value={item.duration} onChange={(e) => updateDuration(idx, e.target.value)} />
                          <span style={{ fontSize: '0.875rem' }}>초</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Settings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <label className="form-label">배경음악 (BGM)</label>
                    <select className="form-control" value={bgm} onChange={e => setBgm(e.target.value)}>
                      <option value="bgm_warm_morning">따뜻한 아침 (어쿠스틱)</option>
                      <option value="bgm_calm_study">차분한 수업 (피아노)</option>
                      <option value="bgm_happy_kids">신나는 아이들 (마림바)</option>
                      <option value="bgm_lofi_chill">편안한 로파이</option>
                      <option value="bgm_none">음악 없음</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">자막 표시</label>
                    <label className="checkbox-label" style={{ display: 'inline-flex' }}>
                      <input type="checkbox" className="checkbox-input" checked={showSubtitle} onChange={e => setShowSubtitle(e.target.checked)} />
                      {showSubtitle ? '켬 (음성을 자막으로 표시)' : '끔'}
                    </label>
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="btn-secondary" style={{ width: '100%' }} onClick={previewPlaying ? stopPreview : startPreview}>
                      {previewPlaying ? <><StopCircle size={16} /> 미리보기 중지</> : <><Play size={16} /> 타임라인 미리보기</>}
                    </button>
                    <button className="btn-primary" style={{ width: '100%' }} onClick={onNext}>
                      다음 단계 (업로드) <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Timeline Preview */}
              {previewPlaying && timeline[previewIdx] && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <div style={{ position: 'relative', display: 'inline-block', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '2px solid var(--primary)' }}>
                    <img
                      src={timeline[previewIdx].url}
                      alt={timeline[previewIdx].label}
                      style={{ maxHeight: '250px', objectFit: 'contain', display: 'block' }}
                    />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.5rem', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.875rem', textAlign: 'center' }}>
                      {timeline[previewIdx].label} ({previewIdx + 1}/{timeline.length})
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Video Generation */}
          {timeline.length > 0 && (
            <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Film size={18} color="var(--primary)" /> 영상 생성
              </h3>

              {!videoProgress && !videoUrl && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Audio Mode Toggle */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.875rem' }}>음성 방식</label>
                    <div className="radio-group" style={{ gap: '0.5rem' }}>
                      <label className={`radio-label ${audioMode === 'tts' ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                        <input type="radio" className="radio-input" checked={audioMode === 'tts'} onChange={() => setAudioMode('tts')} />
                        AI 음성 생성
                      </label>
                      <label className={`radio-label ${audioMode === 'upload' ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                        <input type="radio" className="radio-input" checked={audioMode === 'upload'} onChange={() => setAudioMode('upload')} />
                        나레이션 파일 업로드
                      </label>
                    </div>
                  </div>

                  {audioMode === 'tts' ? (
                    <>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.875rem' }}>음성 선택</label>
                        <select className="form-control" value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}>
                          {VOICE_OPTIONS.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.875rem' }}>톤앤매너</label>
                        <div className="radio-group" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
                          {TONE_OPTIONS.map(tone => (
                            <label key={tone} className={`radio-label ${ttsTone === tone ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                              <input type="radio" className="radio-input" checked={ttsTone === tone} onChange={() => { setTtsTone(tone); setTtsStyleId(STYLE_PROMPTS[tone][0].id); }} />
                              {tone}
                            </label>
                          ))}
                        </div>
                        <select className="form-control" value={ttsStyleId} onChange={e => setTtsStyleId(e.target.value)} style={{ fontSize: '0.85rem' }}>
                          {STYLE_PROMPTS[ttsTone]?.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.875rem' }}>읽기 속도</label>
                        <div className="radio-group" style={{ gap: '0.5rem' }}>
                          {SPEED_OPTIONS.map(s => (
                            <label key={s.id} className={`radio-label ${ttsSpeed === s.id ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}>
                              <input type="radio" className="radio-input" checked={ttsSpeed === s.id} onChange={() => setTtsSpeed(s.id)} />
                              {s.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="form-label" style={{ fontSize: '0.875rem' }}>나레이션 파일</label>
                      {!uploadedAudioFile ? (
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.5rem', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                          <Upload size={18} />
                          클릭하여 음성 파일 선택 (mp3, wav, m4a)
                          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setUploadedAudioFile(file);
                              setUploadedAudioUrl(URL.createObjectURL(file));
                            }
                          }} />
                        </label>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                            <Play size={16} />
                            <span style={{ flex: 1 }}>{uploadedAudioFile.name} ({(uploadedAudioFile.size / 1024 / 1024).toFixed(1)}MB)</span>
                            <button onClick={() => { setUploadedAudioFile(null); if (uploadedAudioUrl) URL.revokeObjectURL(uploadedAudioUrl); setUploadedAudioUrl(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                              <X size={16} color="#dc2626" />
                            </button>
                          </div>
                          {uploadedAudioUrl && (
                            <audio src={uploadedAudioUrl} controls style={{ width: '100%', height: '36px' }} />
                          )}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            AI가 음성을 분석하여 각 이미지의 타이밍을 자동으로 맞춥니다.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="form-label" style={{ fontSize: '0.875rem' }}>화질 선택</label>
                    <div className="radio-group" style={{ gap: '0.5rem' }}>
                      <label className={`radio-label ${videoQuality === 'fast' ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                        <input type="radio" className="radio-input" checked={videoQuality === 'fast'} onChange={() => setVideoQuality('fast')} />
                        빠른 생성 (720p)
                      </label>
                      <label className={`radio-label ${videoQuality === 'standard' ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                        <input type="radio" className="radio-input" checked={videoQuality === 'standard'} onChange={() => setVideoQuality('standard')} />
                        표준 (1080p)
                      </label>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={startVideoGeneration} style={{ width: '100%' }} disabled={audioMode === 'upload' && !uploadedAudioFile}>
                    <Film size={18} /> 영상 생성하기
                  </button>
                  {videoError && (
                    <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
                        <AlertCircle size={16} /> {videoError}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {videoProgress && videoProgress.step !== 'done' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', padding: '2rem' }}>
                  <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                  <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{videoProgress.label}</div>
                  {videoProgress.total && (
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--gray-200)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.2s' }} />
                    </div>
                  )}
                  <button className="btn-secondary" onClick={stopVideoGeneration} style={{ color: '#dc2626', borderColor: '#dc2626' }}>
                    <StopCircle size={16} /> 중지
                  </button>
                </div>
              )}

              {videoUrl && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <video
                    src={videoUrl}
                    controls
                    style={{ width: '100%', maxHeight: '400px', borderRadius: 'var(--radius-md)', backgroundColor: '#000' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-primary" onClick={downloadVideo} style={{ flex: 1 }}>
                      <Download size={18} /> 다운로드
                    </button>
                    <button className="btn-secondary" onClick={() => { setVideoUrl(null); setVideoBlob(null); setVideoProgress(null); }} style={{ flex: 1 }}>
                      다시 생성
                    </button>
                    <button className="btn-primary" onClick={onNext} style={{ flex: 1 }}>
                      업로드 <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </>
      )}

      {/* 다음 단계 버튼 — 항상 표시 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className="btn-primary" onClick={onNext}>
          업로드 단계로 이동 <ArrowRight size={18} />
        </button>
      </div>

      {/* Image Preview Modal */}
      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <button
            onClick={() => setPreviewItem(null)}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={24} color="white" />
          </button>
          <div style={{ color: 'white', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {previewItem.label}
          </div>
          <img
            src={previewItem.url}
            alt={previewItem.label}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '80vh',
              objectFit: 'contain', borderRadius: '8px',
              cursor: 'default'
            }}
          />
        </div>
      )}
    </div>
  );
}
