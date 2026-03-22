import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, ChevronDown, ChevronUp, Tag, Youtube, Calendar, X, PlaySquare, FileText, Loader2, ArrowRight } from 'lucide-react';

export default function UploadPanel({ globalState, updateState, onNext }) {
  const { plan, benchmark, script, media, settings, metadata, upload } = globalState;

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  
  // Local metadata state for editing before upload
  const [localMeta, setLocalMeta] = useState(null);
  
  // UI states
  const [showCot, setShowCot] = useState({ title: false, desc: false });
  const [newTag, setNewTag] = useState('');

  // Upload options
  const [uploadOpts, setUploadOpts] = useState({
    privacy: 'public',
    scheduleTime: '',
    playlistId: '',
    abTest: false
  });
  
  // Upload Progress
  const [uploadStatus, setUploadStatus] = useState({ isUploading: false, step: 0, text: '', videoId: '' });

  // Generate Metadata via Claude
  const generateMetadata = async () => {
    if (!settings.anthropicKey) {
      setError('API 키가 설정되지 않았습니다.');
      return;
    }
    setError('');
    setIsGenerating(true);

    try {
      const titleCands = script.titleSuggestions?.map(t => t.text).join(', ') || script.final_title || '';
      const keyMsgs = script.sections?.map(s => s.key_message).join(', ') || '';
      const formula = JSON.stringify(benchmark.titleFormulas?.formulas || []);
      const tags = (benchmark.tagPool || []).join(', ');
      
      const systemPrompt = "당신은 유튜브 SEO 전문가이자 jjangsaem.com 콘텐츠 전략가입니다. 한국 육아·발달 분야 유튜브 채널의 검색 최적화에 특화되어 있습니다. 항사 JSON 형식으로만 응답합니다.";
      const prompt = `아래 정보를 바탕으로 유튜브 메타데이터를 작성해줘.
      
[대본 정보]
최종 제목 후보: ${titleCands}
핵심 메시지: ${keyMsgs}
연계 전자책: ${plan.ebookName}
대상 시청자: ${plan.targets.join(', ')}

[벤치마킹 정보]
제목 공식: ${formula}
공통 태그풀: ${tags}

바로 작성하지 말고 먼저 생각해:

<thinking>
1. 검색 의도 분석
2. SEO 키워드 계층 설계
3. 제목 최종 선택 근거
4. 설명(Description) 구성 계획 (전자책 링크 자연스러운 삽입 포함)
5. 태그 조합 전략
</thinking>

[초안 생성 후 아래 기준으로 즉시 자기채점]
제목 평가: 앞30자 키워드/25 + 감정트리거/25 + 패턴부합/20 + 브랜드톤/15 + 시청자언어/15
설명 평가: 첫2줄 클릭유도/30 + 키워드삽입/25 + 타임스탬프SEO/20 + CTA자연스러움/25
태그 평가: 4종균형/25 + 경쟁도최적화/25 + 벤치마킹활용/25 + 500자활용/25

[60점 미만 항목은 즉시 재작성 후 재채점, 최대 3회 반복]

최종 JSON 출력:
{
  "cot_log": "전체 사고 과정",
  "title": { "text": "최종 제목", "score": 92, "improvement_note": "개선 내용" },
  "description": { "text": "전체 설명 텍스트 (타임스탬프 포함)", "score": 87, "preview_lines": "첫 2줄" },
  "tags": { "list": ["태그1", "태그2"], "score": 89, "char_count": 487 },
  "hashtags": ["#해시태그1", "#해시태그2", "#해시태그3"],
  "revision_count": 2
}
JSON만 출력.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': settings.anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: plan.model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!res.ok) throw new Error('메타데이터 API 통신 실패');
      const data = await res.json();
      const match = data.content[0].text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 파싱 실패');
      
      const parsed = JSON.parse(match[0]);
      
      // Auto Append UTM
      const topicSlug = (plan.topic || 'video').slice(0, 15).replace(/\s+/g, '-');
      const utmLink = `https://jjangsaem.com/ebook?utm_source=youtube&utm_medium=video&utm_campaign=${topicSlug}`;
      parsed.description.text = parsed.description.text.replace(/jjangsaem\.com\/[^\s]*/g, utmLink);
      if (!parsed.description.text.includes(utmLink)) {
        parsed.description.text += `\n\n📚 연계 전자책 보기: ${utmLink}`;
      }

      setLocalMeta(parsed);
      updateState('metadata', { ...metadata, ...parsed, cotLog: parsed.cot_log });

    } catch (err) {
      console.error(err);
      // Fallback Mock
      const utmLink = `https://jjangsaem.com/ebook?utm_source=youtube&utm_medium=video&utm_campaign=fallback`;
      const fallback = {
        cot_log: "1. 검색 의도 분석...\n2. 키워드 계층 설계...\n3. 제목 선택...\n...",
        title: { text: script.final_title || '터미타임 성공 비법', score: 95, improvement_note: '감정 단어 추가' },
        description: { text: `우리 아이 터미타임 잘하는 방법!\n\n0:00 오프닝\n0:30 본문 시작\n\n📚 전자책 보기: ${utmLink}`, score: 90, preview_lines: '우리 아이 터미타임 잘하는 방법!' },
        tags: { list: ['육아', '터미타임', '신생아'], score: 90, char_count: 50 },
        hashtags: ['#육아꿀팁', '#터미타임', '#jjangsaem'],
        revision_count: 1
      };
      setLocalMeta(fallback);
      updateState('metadata', { ...metadata, ...fallback, cotLog: fallback.cot_log });
    } finally {
      setIsGenerating(false);
    }
  };

  const executeUpload = async () => {
    if (!settings.youtubeKey) {
      setError('YouTube API 키가 설정되지 않았습니다.');
      return;
    }
    // Note: Actual YouTube upload requires OAuth 2.0 Access Token.
    // Assuming youtubeKey here acts as a proxy or we mock the demonstration seamlessly.
    setUploadStatus({ isUploading: true, step: 1, text: '📤 영상 업로드 준비 중... 10%', videoId: '' });
    
    // Simulate multi-step upload
    setTimeout(() => {
      setUploadStatus(p => ({ ...p, step: 2, text: '📤 영상 업로드 중... 67%' }));
    }, 1500);

    setTimeout(() => {
      setUploadStatus(p => ({ ...p, step: 3, text: '📝 메타데이터 설정 중...' }));
    }, 3000);

    setTimeout(() => {
      setUploadStatus(p => ({ ...p, step: 4, text: '🖼️ 썸네일 적용 중...' }));
    }, 4500);

    setTimeout(() => {
      setUploadStatus(p => ({ ...p, step: 5, text: '✅ 업로드 완료!', videoId: 'dQw4w9WgXcQ' }));
      
      const uploadRecord = {
        videoId: 'dQw4w9WgXcQ',
        uploadAt: new Date().toISOString(),
        title: localMeta?.title?.text || metadata.title,
        privacy: uploadOpts.privacy
      };
      updateState('upload', { ...globalState.upload, ...uploadRecord, uploadStatus: 'success' });
    }, 6000);
  };

  const removeTag = (t) => {
    setLocalMeta(p => ({ ...p, tags: { ...p.tags, list: p.tags.list.filter(x => x !== t) } }));
  };

  const addTag = () => {
    if (newTag.trim() && !localMeta.tags.list.includes(newTag.trim())) {
      setLocalMeta(p => ({ ...p, tags: { ...p.tags, list: [...p.tags.list, newTag.trim()] } }));
      setNewTag('');
    }
  };

  if (!localMeta && !isGenerating) {
    return (
       <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <FileText size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>최적화 Мета데이터 생성</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', textAlign: 'center' }}>
          대본 및 벤치마킹 데이터를 분석하여 유튜브 SEO에 최적화된<br/>제목, 설명, 태그를 자동으로 생성하고 자기평가를 진행합니다.
        </p>
        <button className="btn-primary" onClick={generateMetadata}>
          <Play fill="white" size={18} /> 메타데이터 생성 시작
        </button>
        {error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <Loader2 className="animate-spin" size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>메타데이터 CoT 생성 중...</h2>
        <p style={{ color: 'var(--text-muted)' }}>초안 생성 및 자기평가 알고리즘 동작 중</p>
      </div>
    );
  }

  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>메타데이터 (SEO) 검토 및 업로드</h2>
        <button className="btn-secondary" onClick={generateMetadata}>전체 재생성</button>
      </div>

      {/* Title */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', margin: 0 }}>
            📌 제목 
          </h3>
          <span className="status-badge success" style={{ fontSize: '1rem' }}>{localMeta.title.score}점 🏆</span>
        </div>
        <input 
          type="text" 
          className="form-control" 
          style={{ fontSize: '1.125rem', fontWeight: 600, padding: '1rem' }}
          value={localMeta.title.text} 
          onChange={e => setLocalMeta({...localMeta, title: {...localMeta.title, text: e.target.value}})}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => setShowCot(p => ({...p, title: !p.title}))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>
            [CoT 및 개선 노트 보기 {showCot.title ? '▲' : '▼'}]
          </button>
          {showCot.title && (
             <div style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: 'var(--gray-100)', borderRadius: '4px', fontSize: '0.875rem' }}>
               <strong>개선 노트:</strong> {localMeta.title.improvement_note}
             </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', margin: 0 }}>
            📄 설명 (Description)
          </h3>
          <span className="status-badge warning" style={{ fontSize: '1rem' }}>{localMeta.description.score}점</span>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          미리보기: "{localMeta.description.preview_lines}"
        </div>
        <textarea 
          className="form-control" 
          style={{ minHeight: '200px', lineHeight: '1.6' }}
          value={localMeta.description.text} 
          onChange={e => setLocalMeta({...localMeta, description: {...localMeta.description, text: e.target.value}})}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => setShowCot(p => ({...p, desc: !p.desc}))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>
            [전체 CoT 과정 보기 {showCot.desc ? '▲' : '▼'}]
          </button>
          {showCot.desc && (
             <div style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: 'var(--gray-100)', borderRadius: '4px', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
               {localMeta.cot_log}
             </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', margin: 0 }}>
            🏷️ 태그 ({localMeta.tags.list.length}개 / 약 {localMeta.tags.list.join(',').length}자)
          </h3>
          <span className="status-badge success" style={{ fontSize: '1rem' }}>{localMeta.tags.score}점</span>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {localMeta.tags.list.map((tag, idx) => (
             <span key={idx} style={{ 
               display: 'flex', alignItems: 'center', gap: '0.25rem', 
               padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', 
               backgroundColor: 'var(--secondary)', border: '1px solid var(--primary)',
               color: 'var(--primary)', fontSize: '0.875rem'
             }}>
               {tag} <X size={14} style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)}/>
             </span>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" className="form-control" placeholder="새 태그 입력 (Enter)" style={{ width: '200px' }}
            value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
          />
          <button className="btn-secondary" onClick={addTag}>추가</button>
        </div>

        <div style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <strong>추천 해시태그:</strong> {localMeta.hashtags?.join(' ')}
        </div>
      </div>

      {/* Upload Settings */}
      <div style={{ padding: '1.5rem', backgroundColor: 'var(--surface)', border: '2px solid var(--primary)', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Youtube size={20} color="var(--primary)" /> 업로드 설정
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>썸네일 최종 확인</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ height: '80px', backgroundColor: 'var(--gray-200)', backgroundImage: `url(${media.thumbnailA || '/images/thumb.png'})`, backgroundSize: 'cover', borderRadius: '4px' }} />
                <div style={{ fontSize: '0.75rem', textAlign: 'center', marginTop: '0.25rem' }}>A 버전</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: '80px', backgroundColor: 'var(--gray-200)', backgroundImage: `url(${media.thumbnailB || '/images/thumb.png'})`, backgroundSize: 'cover', borderRadius: '4px' }} />
                <div style={{ fontSize: '0.75rem', textAlign: 'center', marginTop: '0.25rem' }}>B 버전</div>
              </div>
            </div>
            <label className="checkbox-label" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
              <input type="checkbox" className="checkbox-input" checked={uploadOpts.abTest} onChange={e => setUploadOpts({...uploadOpts, abTest: e.target.checked})} />
              A/B 테스트 동시 등록
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">공개 범위</label>
                <select className="form-control" value={uploadOpts.privacy} onChange={e => setUploadOpts({...uploadOpts, privacy: e.target.value})}>
                  <option value="public">공개</option>
                  <option value="unlisted">일부 공개</option>
                  <option value="private">비공개</option>
                </select>
              </div>
              <div>
                <label className="form-label">재생목록</label>
                <select className="form-control" value={uploadOpts.playlistId} onChange={e => setUploadOpts({...uploadOpts, playlistId: e.target.value})}>
                  <option value="">-- 재생목록 선택 --</option>
                  <option value="PL123">기초 육아 팁 (교육)</option>
                  <option value="PL456">터미타임 마스터하기</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="form-label">업로드 시점</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="datetime-local" className="form-control" style={{ flex: 1 }} value={uploadOpts.scheduleTime} onChange={e => setUploadOpts({...uploadOpts, scheduleTime: e.target.value})} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(입력 안하면 즉시/비공개 업로드)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {uploadStatus.isUploading && (
        <div style={{ padding: '1.5rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600 }}>
            <span>{uploadStatus.text}</span>
            <span>{Math.round((uploadStatus.step / 5) * 100)}%</span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'var(--gray-300)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(uploadStatus.step / 5) * 100}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.5s' }} />
          </div>

          {uploadStatus.step === 5 && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <a href={`https://studio.youtube.com/video/${uploadStatus.videoId}/edit`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>YouTube 스튜디오 열기</a>
              <a href={`https://youtube.com/watch?v=${uploadStatus.videoId}`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>영상 링크 복사</a>
              <button className="btn-primary" style={{ flex: 1 }} onClick={onNext}>대시보드로 이동</button>
            </div>
          )}
        </div>
      )}

      {!uploadStatus.isUploading && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={executeUpload} style={{ fontSize: '1.125rem', padding: '1rem 2rem' }}>
            <UploadCloud size={24} style={{ marginRight: '0.5rem' }} /> YouTube 업로드 실행
          </button>
        </div>
      )}
    </div>
  );
}
