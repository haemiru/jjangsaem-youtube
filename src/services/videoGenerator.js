import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

// --- Utility ---
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function dataUrlToUint8Array(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * 한국어 자막 최적화 splitSubtitles
 *
 * 1. 한국어 종결어미 기준 자연스러운 분리
 * 2. 적절한 청크 길이 (15~20자)
 * 3. 너무 짧은 조각 병합
 * 4. 숫자/영어 혼합 텍스트 처리
 */
function splitSubtitles(text, maxChars = 20) {
  if (!text || text.trim().length === 0) return [];

  const normalized = text.replace(/\s+/g, ' ').trim();

  const segments = [];

  // 문장 부호 + 한국어 종결어미로 1차 분리
  const bySentence = normalized
    .replace(/([.!?…]+)/g, '$1\n')
    .replace(/(요\.|요!|요\?|다\.|다!|다\?|죠\.|죠!|죠\?|까\.|까!|까\?)/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sentence of bySentence) {
    if (sentence.length <= maxChars) {
      segments.push(sentence);
      continue;
    }
    segments.push(...splitLongSentence(sentence, maxChars));
  }

  // 너무 짧은 조각(3자 미만) 앞 조각에 병합
  const merged = [];
  for (const seg of segments) {
    if (seg.length < 3 && merged.length > 0) {
      merged[merged.length - 1] += ' ' + seg;
    } else {
      merged.push(seg);
    }
  }

  // maxChars 초과 조각 강제 분리
  const result = [];
  for (const seg of merged) {
    if (seg.length <= maxChars * 1.5) {
      result.push(seg);
    } else {
      result.push(...forceSplit(seg, maxChars));
    }
  }

  return result.length > 0 ? result : [text];
}

/**
 * 긴 문장을 자연스러운 지점에서 분리
 * 우선순위: 쉼표 > 접속사 > 연결어미 > 공백 > 강제
 */
function splitLongSentence(sentence, maxChars) {
  const chunks = [];
  let remaining = sentence;

  while (remaining.length > maxChars) {
    let splitIdx = -1;

    // 우선순위 1: maxChars 이내의 쉼표
    const commaIdx = remaining.lastIndexOf(',', maxChars);
    const korCommaIdx = remaining.lastIndexOf('，', maxChars);
    const bestComma = Math.max(commaIdx, korCommaIdx);
    if (bestComma > maxChars * 0.4) {
      splitIdx = bestComma + 1;
    }

    // 우선순위 2: 접속사/연결어 앞
    if (splitIdx === -1) {
      const connectors = ['그리고', '하지만', '그래서', '또한', '또는', '그런데', '따라서', '즉,'];
      for (const conn of connectors) {
        const idx = remaining.indexOf(conn, maxChars * 0.3);
        if (idx > 0 && idx <= maxChars) {
          splitIdx = idx;
          break;
        }
      }
    }

    // 우선순위 3: 한국어 연결어미 패턴
    if (splitIdx === -1) {
      const connEndings = /[서고며면]\s|지만\s|는데\s|으며\s|이며\s/g;
      let match;
      let bestIdx = -1;
      while ((match = connEndings.exec(remaining)) !== null) {
        if (match.index > maxChars * 0.3 && match.index <= maxChars) {
          bestIdx = match.index + match[0].length;
        }
      }
      if (bestIdx > 0) splitIdx = bestIdx;
    }

    // 우선순위 4: 공백
    if (splitIdx === -1) {
      const spaceIdx = remaining.lastIndexOf(' ', maxChars);
      if (spaceIdx > maxChars * 0.3) {
        splitIdx = spaceIdx + 1;
      }
    }

    // 우선순위 5: 강제 분리
    if (splitIdx === -1 || splitIdx <= 0) {
      splitIdx = maxChars;
    }

    const chunk = remaining.substring(0, splitIdx).trim();
    if (chunk.length > 0) chunks.push(chunk);
    remaining = remaining.substring(splitIdx).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * 최후 수단: 단어 경계를 존중하며 강제 분리
 */
function forceSplit(text, maxChars) {
  const words = text.split(' ');
  const chunks = [];
  let current = '';

  for (const word of words) {
    if ((current + word).length <= maxChars) {
      current += (current ? ' ' : '') + word;
    } else {
      if (current) chunks.push(current);
      current = word;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

// --- Main Video Generator ---
export class VideoGenerator {
  constructor(options) {
    this.timeline = options.timeline;       // [{id, label, url, duration}]
    this.ttsAudios = options.ttsAudios;     // [{id, audioBase64, duration, text}]
    this.bgmUrl = options.bgmUrl;           // URL to BGM mp3 or null
    this.showSubtitle = options.showSubtitle;
    this.isShorts = options.isShorts;
    this.onProgress = options.onProgress;
    this.aborted = false;

    // Resolution
    const quality = options.quality || 'standard';
    if (this.isShorts) {
      this.width = quality === 'fast' ? 540 : 1080;
      this.height = quality === 'fast' ? 960 : 1920;
    } else {
      this.width = quality === 'fast' ? 960 : 1920;
      this.height = quality === 'fast' ? 540 : 1080;
    }
    this.fps = quality === 'fast' ? 15 : 24;

    this.ffmpeg = null;
    this.frameIndex = 0;
  }

  abort() {
    this.aborted = true;
  }

  async initialize() {
    this.ffmpeg = new FFmpeg();
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }

  async generateVideo() {
    this.onProgress?.({ step: 'init', label: 'FFmpeg 초기화 중...' });
    await this.initialize();

    if (this.aborted) return null;

    // 1. Write TTS audio files and concat
    this.onProgress?.({ step: 'audio', label: '오디오 파일 준비 중...' });
    await this.prepareAudio();

    if (this.aborted) return null;

    // 2. Render frames with Ken Burns + transitions + subtitles
    await this.renderAllFrames();

    if (this.aborted) return null;

    // 3. Encode with FFmpeg
    this.onProgress?.({ step: 'encode', label: '영상 인코딩 중...' });
    const mp4Data = await this.encode();

    return new Blob([mp4Data], { type: 'video/mp4' });
  }

  async prepareAudio() {
    // Write each TTS section audio
    const concatList = [];
    for (const tts of this.ttsAudios) {
      const filename = `tts_${tts.id}.wav`;
      await this.ffmpeg.writeFile(filename, base64ToUint8Array(tts.audioBase64));
      concatList.push(`file '${filename}'`);
    }

    // Concat all TTS into one narration track
    await this.ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList.join('\n')));
    await this.ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat_list.txt', '-c:a', 'pcm_s16le', 'narration.wav']);

    // Write BGM if provided
    if (this.bgmUrl) {
      try {
        const bgmRes = await fetch(this.bgmUrl);
        const bgmData = new Uint8Array(await bgmRes.arrayBuffer());
        await this.ffmpeg.writeFile('bgm.mp3', bgmData);
      } catch (e) {
        console.warn('BGM 로드 실패, BGM 없이 진행:', e);
        this.bgmUrl = null;
      }
    }
  }

  async renderAllFrames() {
    // Calculate total frames using TTS durations
    const sectionData = this.buildSectionData();
    const totalFrames = sectionData.reduce((sum, s) => sum + s.frameCount, 0);
    this.frameIndex = 0;

    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');

    // Preload all images
    const images = {};
    for (const item of this.timeline) {
      images[item.id] = await loadImage(item.url);
    }

    const transitionFrames = Math.round(0.5 * this.fps); // 0.5s crossfade

    for (let si = 0; si < sectionData.length; si++) {
      if (this.aborted) return;

      const section = sectionData[si];
      const img = images[section.id];
      const nextImg = si < sectionData.length - 1 ? images[sectionData[si + 1].id] : null;

      // Ken Burns params: alternate zoom in/out
      const zoomIn = si % 2 === 0;
      const startZoom = zoomIn ? 1.0 : 1.15;
      const endZoom = zoomIn ? 1.15 : 1.0;
      // Slight pan direction
      const panXDir = si % 3 === 0 ? 1 : si % 3 === 1 ? -1 : 0;
      const panYDir = si % 2 === 0 ? 0.5 : -0.5;
      const maxPan = 0.03; // 3% of dimension

      // Subtitle chunks for this section
      const subtitleChunks = section.text ? splitSubtitles(section.text) : [];
      const chunkDurations = distributeTime(subtitleChunks, section.frameCount);

      for (let f = 0; f < section.frameCount; f++) {
        if (this.aborted) return;

        const t = section.frameCount > 1 ? f / (section.frameCount - 1) : 0;
        const easedT = easeInOutQuad(t);

        // Ken Burns transform
        const zoom = startZoom + (endZoom - startZoom) * easedT;
        const panX = panXDir * maxPan * easedT * this.width;
        const panY = panYDir * maxPan * easedT * this.height;

        ctx.clearRect(0, 0, this.width, this.height);

        // Draw main image with Ken Burns
        this.drawImageKenBurns(ctx, img, zoom, panX, panY);

        // Crossfade transition at the end
        if (nextImg && f >= section.frameCount - transitionFrames) {
          const blendT = (f - (section.frameCount - transitionFrames)) / transitionFrames;
          ctx.globalAlpha = blendT;
          const nextZoomIn = (si + 1) % 2 === 0;
          this.drawImageKenBurns(ctx, nextImg, nextZoomIn ? 1.0 : 1.15, 0, 0);
          ctx.globalAlpha = 1.0;
        }

        // Subtitle overlay
        if (this.showSubtitle && subtitleChunks.length > 0) {
          const activeChunk = getActiveChunk(subtitleChunks, chunkDurations, f);
          if (activeChunk) {
            this.drawSubtitle(ctx, activeChunk);
          }
        }

        // Export frame as JPEG
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        const frameData = new Uint8Array(await blob.arrayBuffer());
        const frameName = `frame_${String(this.frameIndex).padStart(6, '0')}.jpg`;
        await this.ffmpeg.writeFile(frameName, frameData);
        this.frameIndex++;

        // Progress update every 10 frames
        if (this.frameIndex % 10 === 0) {
          this.onProgress?.({
            step: 'render',
            current: this.frameIndex,
            total: totalFrames,
            label: `프레임 렌더링 중... (${this.frameIndex}/${totalFrames})`
          });
        }
      }
    }
  }

  drawImageKenBurns(ctx, img, zoom, panX, panY) {
    const { width, height } = this;
    const imgAspect = img.width / img.height;
    const canvasAspect = width / height;

    let drawW, drawH;
    if (imgAspect > canvasAspect) {
      drawH = height * zoom;
      drawW = drawH * imgAspect;
    } else {
      drawW = width * zoom;
      drawH = drawW / imgAspect;
    }

    const x = (width - drawW) / 2 + panX;
    const y = (height - drawH) / 2 + panY;

    ctx.drawImage(img, x, y, drawW, drawH);
  }

  drawSubtitle(ctx, text) {
    const { width, height } = this;

    // Shorts는 더 큰 폰트
    const fontSize = this.isShorts
      ? Math.round(height * 0.038)
      : Math.round(height * 0.032);

    ctx.font = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padding = { x: fontSize * 1.2, y: fontSize * 0.7 };
    const textWidth = ctx.measureText(text).width;
    const boxWidth = Math.min(textWidth + padding.x * 2, width * 0.88);
    const boxHeight = fontSize * 2.0;

    // 하단에서 12% 위치
    const boxY = height - height * 0.12;
    const boxX = (width - boxWidth) / 2;

    // 배경: 반투명 검정
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    const radius = fontSize * 0.4;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY - boxHeight / 2, boxWidth, boxHeight, radius);
    ctx.fill();

    // 텍스트 외곽선 (가독성 향상)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = fontSize * 0.08;
    ctx.strokeText(text, width / 2, boxY, boxWidth - padding.x);

    // 흰색 텍스트
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText(text, width / 2, boxY, boxWidth - padding.x);
    ctx.shadowBlur = 0;
  }

  buildSectionData() {
    return this.timeline.map(item => {
      const tts = this.ttsAudios.find(a => a.id === item.id);
      const durationSec = tts ? tts.duration : item.duration;
      return {
        id: item.id,
        frameCount: Math.round(durationSec * this.fps),
        text: tts?.text || ''
      };
    });
  }

  async encode() {
    const totalFrames = this.frameIndex;
    const args = [
      '-framerate', String(this.fps),
      '-i', 'frame_%06d.jpg',
      '-i', 'narration.wav',
    ];

    if (this.bgmUrl) {
      args.push('-i', 'bgm.mp3');
      args.push(
        '-filter_complex',
        `[2:a]volume=0.15,aloop=loop=-1:size=2e+09[bgm];[1:a][bgm]amix=inputs=2:duration=first[aout]`,
        '-map', '0:v',
        '-map', '[aout]'
      );
    } else {
      args.push('-map', '0:v', '-map', '1:a');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      'output.mp4'
    );

    await this.ffmpeg.exec(args);

    const data = await this.ffmpeg.readFile('output.mp4');

    // Cleanup
    for (let i = 0; i < totalFrames; i++) {
      try {
        await this.ffmpeg.deleteFile(`frame_${String(i).padStart(6, '0')}.jpg`);
      } catch {}
    }

    return data;
  }
}

// --- Helpers ---
function distributeTime(chunks, totalFrames) {
  if (chunks.length === 0) return [];
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
  return chunks.map(c => Math.round((c.length / totalChars) * totalFrames));
}

function getActiveChunk(chunks, durations, currentFrame) {
  let accumulated = 0;
  for (let i = 0; i < chunks.length; i++) {
    accumulated += durations[i];
    if (currentFrame < accumulated) return chunks[i];
  }
  return chunks[chunks.length - 1];
}
