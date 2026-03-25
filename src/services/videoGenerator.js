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

// Split Korean text into subtitle chunks
function splitSubtitles(text, maxChars = 30) {
  const sentences = text.replace(/([.!?。])\s*/g, '$1|').split('|').filter(Boolean);
  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence.trim());
    } else {
      // Split by comma or space
      const parts = sentence.split(/[,，]\s*|(?<=.{15,})\s/);
      for (const part of parts) {
        if (part.trim()) chunks.push(part.trim());
      }
    }
  }
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
      const filename = `tts_${tts.id}.mp3`;
      await this.ffmpeg.writeFile(filename, base64ToUint8Array(tts.audioBase64));
      concatList.push(`file '${filename}'`);
    }

    // Concat all TTS into one narration track
    await this.ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList.join('\n')));
    await this.ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat_list.txt', '-c', 'copy', 'narration.mp3']);

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
    const fontSize = Math.round(height * 0.035);
    ctx.font = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const padding = fontSize * 0.6;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = Math.min(textWidth + padding * 2, width * 0.9);
    const boxHeight = fontSize * 1.8;
    const boxY = height - height * 0.08 - boxHeight;
    const boxX = (width - boxWidth) / 2;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    const radius = fontSize * 0.3;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
    ctx.fill();

    // Text with shadow
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, width / 2, boxY + boxHeight - padding * 0.5, boxWidth - padding);
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
      '-i', 'narration.mp3',
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
