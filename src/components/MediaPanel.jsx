import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, RotateCw, Edit3, Settings2, Play, ArrowRight, ArrowUp, ArrowDown, Type, GripVertical } from 'lucide-react';

const COMMON_SUFFIX = ", Korean subjects, warm and professional style, clean background, high quality, bright lighting, suitable for educational YouTube content";

export default function MediaPanel({ globalState, updateState, onNext }) {
  const { script, benchmark } = globalState;

  // Items to generate
  const [queue, setQueue] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

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

    // Define items based on script
    const items = [];
    items.push({ id: 'intro', label: '오프닝', prompt: `Opening title background for: ${script.hook}. ${COMMON_SUFFIX}`, status: 'idle', url: null });
    
    script.sections?.forEach((sec, idx) => {
      items.push({ id: `section_${idx}`, label: `섹션${idx+1}`, prompt: `${sec.image_prompt}${COMMON_SUFFIX}`, status: 'idle', url: null });
    });

    // Thumbnails A & B
    const domColors = benchmark?.thumbnailPatterns?.dominantColors?.join(', ') || 'warm tones';
    const emotionType = "대비되는 감정 (예: 걱정/희망)"; // Simplified
    const thumbPrompt = `Korean mother with ${emotionType} expression, ${domColors} background, child visible in background. ${COMMON_SUFFIX}`;
    
    items.push({ id: 'thumb_a', label: '썸네일 A', prompt: thumbPrompt, status: 'idle', url: null });
    items.push({ id: 'thumb_b', label: '썸네일 B', prompt: thumbPrompt, status: 'idle', url: null });
    
    items.push({ id: 'outro', label: '엔딩', prompt: `Clean outro background with jjangsaem.com text placeholder. ${COMMON_SUFFIX}`, status: 'idle', url: null });

    setQueue(items);
  }, [script, benchmark]);

  const generateImages = async () => {
    setIsGenerating(true);
    let newQueue = [...queue];

    for (let i = 0; i < newQueue.length; i++) {
      newQueue[i].status = 'generating';
      setQueue([...newQueue]);

      // Mock Generation Delay
      await new Promise(r => setTimeout(r, 1000));

      // Assign Mock URL based on type
      let mockUrl = '/images/section1.png'; // default
      if (newQueue[i].id.includes('thumb')) mockUrl = '/images/thumb.png';
      if (newQueue[i].id.includes('outro')) mockUrl = '/images/outro.png';

      newQueue[i].url = mockUrl;
      newQueue[i].status = 'done';
      setQueue([...newQueue]);
    }
    
    setIsGenerating(false);
    
    // Initialize timeline with generated images
    const initialTimeline = newQueue
      .filter(q => q.id !== 'thumb_a' && q.id !== 'thumb_b') // exclude thumbs from timeline
      .map(q => ({
        id: q.id,
        label: q.label,
        url: q.url,
        duration: q.id.includes('section') ? 15 : 5
      }));
    setTimeline(initialTimeline);

    updateState('media', {
      ...globalState.media,
      generatedImages: newQueue,
      thumbnailA: newQueue.find(q => q.id === 'thumb_a')?.url,
      thumbnailB: newQueue.find(q => q.id === 'thumb_b')?.url,
      timeline,
      videoSettings: { bgm, showSubtitle }
    });
  };

  const completedCount = queue.filter(q => q.status === 'done').length;
  const isAllCompleted = completedCount === queue.length && queue.length > 0;

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
    return <div style={{ padding: '2rem', textAlign: 'center' }}>대본이 아직 생성되지 않았습니다.</div>;
  }

  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>시각 자료 생성 & 합성</h2>
        {!isAllCompleted && (
          <button 
            className="btn-primary" 
            onClick={generateImages} 
            disabled={isGenerating}
            style={{ opacity: isGenerating ? 0.7 : 1 }}
          >
            {isGenerating ? <RotateCw className="animate-spin" size={18} /> : <ImageIcon size={18} />}
            {isGenerating ? '이미지 생성 중...' : '전체 이미지 생성'}
          </button>
        )}
      </div>

      {/* 1. Generation Grid View */}
      <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🎨 이미지 생성 진행 ({completedCount}/{queue.length} 완료)
        </h3>
        
        {/* Progress Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(100px, 1fr))`, gap: '0.5rem', marginBottom: '1.5rem' }}>
          {queue.map(item => (
            <div key={item.id} style={{ 
              textAlign: 'center', padding: '0.75rem', 
              backgroundColor: item.status === 'done' ? '#dcfce7' : item.status === 'generating' ? '#fef9c3' : 'var(--gray-100)',
              border: item.status === 'generating' ? '1px dashed var(--primary)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{item.label}</div>
              <div style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>
                {item.status === 'done' ? '✅' : item.status === 'generating' ? '⏳' : '⬜'}
              </div>
            </div>
          ))}
        </div>

        {/* Generated Image Cards */}
        {isAllCompleted && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {queue.map(item => (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ height: '120px', backgroundColor: 'var(--gray-200)', backgroundImage: `url(${item.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div style={{ padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>{item.label}</div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', flex: 1 }}>재생성</button>
                    <button className="btn-secondary" style={{ padding: '0.25rem', fontSize: '0.75rem' }} title="프롬프트 수정"><Edit3 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAllCompleted && (
        <>
          {/* 2. Thumbnail Editor */}
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Type size={18} color="var(--primary)" /> 썸네일 합성 (A/B 테스트 설정)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
              {/* Preview Area */}
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundImage: `url('/images/thumb.png')`, backgroundSize: 'cover' }}>
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

          {/* 3. Setup Timeline */}
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings2 size={18} color="var(--primary)" /> 영상 합성 준비 (타임라인)
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
              {/* Sequence */}
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>이미지 순서 및 표시 시간 (Drag/Up/Down)</div>
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
                    {showSubtitle ? '✅ 켬 (음성을 자막으로 표시)' : '❌ 끔'}
                  </label>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* 렌더링 서버 연동 준비 완료 상태입니다.</div>
                  <button className="btn-primary" style={{ width: '100%' }} onClick={onNext}>
                    메타데이터 생성 <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
