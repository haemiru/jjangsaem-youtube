import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, RotateCw, Edit3, Settings2, ArrowRight, ArrowUp, ArrowDown, Type, AlertCircle, StopCircle, X, ZoomIn, Upload } from 'lucide-react';

const COMMON_SUFFIX = ", Korean subjects, warm and professional style, clean background, high quality, bright lighting, suitable for educational YouTube content";

const GEMINI_MODEL = 'gemini-3-pro-image-preview';
const DELAY_BETWEEN_REQUESTS_MS = 3000;

async function generateImageWithGemini(prompt, retries = 3) {
  // Routed through server-side proxy — API key injected by proxy
  const url = `/api/gemini/models/${GEMINI_MODEL}:generateContent`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
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

export default function MediaPanel({ globalState, updateState, onNext }) {
  const { plan, script, benchmark } = globalState;
  const isShorts = plan?.format?.includes('쇼츠');

  // Items to generate
  const [queue, setQueue] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const stopRef = useRef(false);

  // Image preview modal
  const [previewItem, setPreviewItem] = useState(null);

  // Thumbnail overlay settings
  const [thumbSettings, setThumbSettings] = useState({
    text: script.final_thumbnail_copy || '',
    size: 40,
    position: 'bottom',
    color: '#FFFFFF',
    dim: 30
  });

  // Timeline for video
  const [timeline, setTimeline] = useState([]);
  const [bgm, setBgm] = useState('bgm_warm_morning');
  const [showSubtitle, setShowSubtitle] = useState(true);

  // Initialize queue
  useEffect(() => {
    if (!script.hook) return;

    const aspectSuffix = isShorts ? ', vertical 9:16 portrait aspect ratio, mobile-optimized' : '';
    const suffix = COMMON_SUFFIX + aspectSuffix;

    const items = [];
    const introPrompt = script.intro_image_prompt
      ? `${script.intro_image_prompt}${suffix}`
      : `Opening title background for: ${script.hook}.${suffix}`;
    items.push({ id: 'intro', label: '오프닝', prompt: introPrompt, status: 'idle', url: null });

    script.sections?.forEach((sec, idx) => {
      items.push({ id: `section_${idx}`, label: `섹션${idx+1}`, prompt: `${sec.image_prompt}${suffix}`, status: 'idle', url: null });
    });

    // Thumbnails — skip for Shorts
    if (!isShorts) {
      const domColors = benchmark?.thumbnailPatterns?.dominantColors?.join(', ') || 'warm tones';
      const thumbPrompt = `Korean mother with contrasting emotions (worry/hope) expression, ${domColors} background, child visible in background.${suffix}`;

      items.push({ id: 'thumb_a', label: '썸네일 A', prompt: thumbPrompt, status: 'idle', url: null });
      items.push({ id: 'thumb_b', label: '썸네일 B', prompt: thumbPrompt + ' Different angle and composition.', status: 'idle', url: null });
    }

    const outroPrompt = script.outro_image_prompt
      ? `${script.outro_image_prompt}${suffix}`
      : `Clean outro background with jjangsaem.com text placeholder.${suffix}`;
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
        const dataUrl = await generateImageWithGemini(newQueue[i].prompt);
        newQueue[i].url = dataUrl;
        newQueue[i].status = 'done';
      } catch (err) {
        console.error(`Image generation failed for ${newQueue[i].id}:`, err);
        newQueue[i].status = 'error';
        newQueue[i].error = err.message;
      }

      setQueue([...newQueue]);

      // Rate limiting delay between requests
      if (i < newQueue.length - 1 && newQueue[i].status === 'done') {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));
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
      const dataUrl = await generateImageWithGemini(newQueue[idx].prompt);
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
        {!isAllCompleted && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
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
          </div>
        )}
      </div>

      {genError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#dc2626', fontSize: '0.875rem' }}>
          <AlertCircle size={16} /> {genError}
        </div>
      )}

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
                  <label style={{ height: '120px', backgroundColor: 'var(--gray-100)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '0.25rem' }}>
                    <Upload size={20} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>이미지 업로드</span>
                    <input type="file" accept="image/*" hidden onChange={(e) => uploadImage(item.id, e.target.files[0])} />
                  </label>
                )}
                <div style={{ padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>{item.label}</div>
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

                    {/* Text Overlay */}
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', padding: '2rem',
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
                <button className="btn-secondary" style={{ marginTop: 'auto' }}>A/B 버전으로 둘 다 저장</button>
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
                    <button className="btn-primary" style={{ width: '100%' }} onClick={onNext}>
                      메타데이터 생성 <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 다음 단계 버튼 (타임라인 밖에도 항상 표시) */}
          {timeline.length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={onNext}>
                업로드 단계로 이동 <ArrowRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

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
