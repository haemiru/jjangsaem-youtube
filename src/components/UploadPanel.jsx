import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, ChevronDown, ChevronUp, Tag, Youtube, Calendar, X, PlaySquare, FileText, Loader2, ArrowRight, LogIn, Film, AlertCircle, RefreshCw } from 'lucide-react';
import { requestAccessToken, verifyToken, fetchPlaylists, uploadVideo, setThumbnail } from '../services/youtubeService';

// Hidden import for Play icon workaround
const Play = PlaySquare;

export default function UploadPanel({ globalState, updateState, onNext }) {
  const { plan, benchmark, script, media, metadata, upload } = globalState;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [usedFallback, setUsedFallback] = useState(false);

  // Local metadata state for editing before upload
  const [localMeta, setLocalMeta] = useState(null);

  // UI states
  const [showCot, setShowCot] = useState({ title: false, desc: false });
  const [newTag, setNewTag] = useState('');

  // YouTube Auth
  const [accessToken, setAccessToken] = useState(null);
  const [authError, setAuthError] = useState('');
  const [playlists, setPlaylists] = useState([]);

  // Video file
  const [videoFile, setVideoFile] = useState(null);

  // Upload options
  const [uploadOpts, setUploadOpts] = useState({
    privacy: 'private',
    scheduleTime: '',
    playlistId: '',
    selectedThumb: 'a',
  });

  // Upload Progress
  const [uploadStatus, setUploadStatus] = useState({ isUploading: false, percent: 0, text: '', videoId: '', error: '' });

  // --- YouTube Auth ---
  const handleAuth = async () => {
    if (!googleClientId) {
      setAuthError('.env 파일에 VITE_GOOGLE_CLIENT_ID를 설정해주세요.');
      return;
    }
    setAuthError('');
    try {
      const token = await requestAccessToken(googleClientId);
      setAccessToken(token);
      // Fetch playlists after auth
      try {
        const pl = await fetchPlaylists(token);
        setPlaylists(pl);
      } catch (e) {
        console.error('Playlist fetch failed:', e);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  // Verify token on mount if we had one
  useEffect(() => {
    if (accessToken) {
      verifyToken(accessToken).then(valid => {
        if (!valid) setAccessToken(null);
      });
    }
  }, []);

  // --- Metadata Generation (same as before) ---
  const generateMetadata = async () => {
    setError('');
    setIsGenerating(true);

    try {
      const titleCands = script.titleSuggestions?.map(t => t.text).join(', ') || script.final_title || '';
      const keyMsgs = script.sections?.map(s => s.key_message).join(', ') || '';
      const formula = JSON.stringify(benchmark.titleFormulas?.formulas || []);
      const tags = (benchmark.tagPool || []).join(', ');

      const fullScript = script.full_script || script.rows?.map(r => r.script).join('\n') || '';
      const systemPrompt = "당신은 유튜브 SEO 전문가이자 jjangsaem.com 콘텐츠 전략가입니다. 한국 육아·발달 분야 유튜브 채널의 검색 최적화에 특화되어 있습니다. 항상 JSON 형식으로만 응답합니다.";
      const prompt = `아래 정보를 바탕으로 유튜브 메타데이터를 작성해줘.

[대본 정보]
최종 제목 후보: ${titleCands}
핵심 메시지: ${keyMsgs}
전체 대본: ${fullScript.substring(0, 3000)}
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
설명 평가: 첫2줄 클릭유도/30 + 키워드삽입/25 + 내용충실도/25 + CTA자연스러움/20
태그 평가: 4종균형/25 + 경쟁도최적화/25 + 벤치마킹활용/25 + 500자활용/25

[디스크립션 작성 규칙 - 중요!]
- 타임스탬프(타임라인)는 넣지 마세요
- 대신 영상의 핵심 내용을 풍부하게 요약해주세요 (최소 500자 이상)
- 구성: 첫 2줄 클릭 유도 → 영상 핵심 내용 요약 (3~5개 포인트) → 관련 키워드/정보 → 전자책 소개 → 구독/좋아요 CTA
- 시청자가 디스크립션만 읽어도 영상 내용을 파악할 수 있도록 상세하게 작성

[60점 미만 항목은 즉시 재작성 후 재채점, 최대 3회 반복]

최종 JSON 출력:
{
  "cot_log": "전체 사고 과정",
  "title": { "text": "최종 제목", "score": 92, "improvement_note": "개선 내용" },
  "description": { "text": "전체 설명 텍스트 (타임스탬프 없이, 내용 풍부하게)", "score": 87, "preview_lines": "첫 2줄" },
  "tags": { "list": ["태그1", "태그2"], "score": 89, "char_count": 487 },
  "hashtags": ["#해시태그1", "#해시태그2", "#해시태그3"],
  "revision_count": 2
}
JSON만 출력.`;

      const res = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
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

      // Auto Append ebook link
      if (plan.ebookUrl) {
        parsed.description.text = parsed.description.text.replace(/jjangsaem\.com\/[^\s]*/g, plan.ebookUrl);
        if (!parsed.description.text.includes(plan.ebookUrl)) {
          parsed.description.text += `\n\n📚 연계 전자책 보기: ${plan.ebookUrl}`;
        }
      }

      // Auto Append channel links
      const channelLinks = `\n\n━━━━━━━━━━━━━━━━━━━━\n📸 짱샘의 인스타: @seochojiye\n📝 짱샘의 블로그: https://blog.naver.com/imoim77\n💬 카카오톡 문의: https://open.kakao.com/o/s3YnSoni`;
      if (!parsed.description.text.includes('blog.naver.com/imoim77')) {
        parsed.description.text += channelLinks;
      }

      setLocalMeta(parsed);
      updateState('metadata', { ...metadata, ...parsed, cotLog: parsed.cot_log });

    } catch (err) {
      console.error(err);
      setUsedFallback(true);
      // Fallback Mock
      const ebookLine = plan.ebookUrl ? `\n\n📚 연계 전자책 보기: ${plan.ebookUrl}` : '';
      const chLinks = `\n\n━━━━━━━━━━━━━━━━━━━━\n📸 짱샘의 인스타: @seochojiye\n📝 짱샘의 블로그: https://blog.naver.com/imoim77\n💬 카카오톡 문의: https://open.kakao.com/o/s3YnSoni`;
      const fallback = {
        cot_log: "1. 검색 의도 분석...\n2. 키워드 계층 설계...\n3. 제목 선택...\n...",
        title: { text: script.final_title || '터미타임 성공 비법', score: 95, improvement_note: '감정 단어 추가' },
        description: { text: `우리 아이 터미타임 잘하는 방법!\n\n0:00 오프닝\n0:30 본문 시작${ebookLine}${chLinks}`, score: 90, preview_lines: '우리 아이 터미타임 잘하는 방법!' },
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

  // --- Real YouTube Upload ---
  const executeUpload = async () => {
    if (!accessToken) {
      setUploadStatus(p => ({ ...p, error: 'YouTube 인증이 필요합니다. 먼저 Google 로그인을 해주세요.' }));
      return;
    }
    if (!videoFile) {
      setUploadStatus(p => ({ ...p, error: '업로드할 영상 파일을 선택해주세요.' }));
      return;
    }

    // Verify token is still valid
    const tokenValid = await verifyToken(accessToken);
    if (!tokenValid) {
      setAccessToken(null);
      setUploadStatus(p => ({ ...p, error: '인증이 만료되었습니다. 다시 로그인해주세요.' }));
      return;
    }

    setUploadStatus({ isUploading: true, percent: 0, text: '업로드 준비 중...', videoId: '', error: '' });

    try {
      const videoId = await uploadVideo({
        accessToken,
        videoFile,
        metadata: {
          title: localMeta.title.text,
          description: localMeta.description.text,
          tags: localMeta.tags.list,
          privacy: uploadOpts.privacy,
          playlistId: uploadOpts.playlistId,
          scheduledAt: uploadOpts.scheduleTime || null,
        },
        onProgress: (percent, text) => {
          setUploadStatus(p => ({ ...p, percent, text }));
        },
      });

      // Upload thumbnail if available
      const thumbUrl = uploadOpts.selectedThumb === 'a' ? media.thumbnailA : media.thumbnailB;
      if (thumbUrl && thumbUrl.startsWith('data:')) {
        setUploadStatus(p => ({ ...p, percent: 95, text: '썸네일 적용 중...' }));
        await setThumbnail(accessToken, videoId, thumbUrl);
      }

      setUploadStatus({ isUploading: false, percent: 100, text: '업로드 완료!', videoId, error: '' });

      updateState('upload', {
        ...globalState.upload,
        videoId,
        uploadAt: new Date().toISOString(),
        title: localMeta.title.text,
        privacy: uploadOpts.privacy,
        uploadStatus: 'success',
      });
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadStatus(p => ({ ...p, isUploading: false, error: err.message }));
    }
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

  const handleVideoFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // --- Render: Metadata not generated yet ---
  if (!localMeta && !isGenerating) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <FileText size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>최적화 메타데이터 생성</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', textAlign: 'center' }}>
          대본 및 벤치마킹 데이터를 분석하여 유튜브 SEO에 최적화된<br/>제목, 설명, 태그를 자동으로 생성하고 자기평가를 진행합니다.
        </p>
        <button className="btn-primary" onClick={generateMetadata}>
          <Play size={18} /> 메타데이터 생성 시작
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

  // --- Render: Main upload UI ---
  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>메타데이터 (SEO) 검토 및 업로드</h2>
        <button className="btn-secondary" onClick={generateMetadata}>전체 재생성</button>
      </div>

      {usedFallback && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 'var(--radius-md)', color: '#92400e', fontSize: '0.875rem' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} /> AI 메타데이터 생성에 실패하여 샘플 데이터를 사용 중입니다. 내용을 직접 수정하거나 "전체 재생성" 버튼으로 다시 시도해주세요.
        </div>
      )}

      {/* Title */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', margin: 0 }}>
            제목
          </h3>
          <span className="status-badge success" style={{ fontSize: '1rem' }}>{localMeta.title.score}점</span>
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
            설명 (Description)
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
            <Tag size={18} /> 태그 ({localMeta.tags.list.length}개 / 약 {localMeta.tags.list.join(',').length}자)
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

      {/* YouTube Auth + Upload Settings */}
      <div style={{ padding: '1.5rem', backgroundColor: 'var(--surface)', border: '2px solid var(--primary)', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Youtube size={20} color="var(--primary)" /> YouTube 업로드
        </h3>

        {/* Auth Section */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: accessToken ? '#f0fdf4' : 'var(--gray-100)', border: `1px solid ${accessToken ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {accessToken ? (
                <>
                  <CheckCircle2 size={18} color="#22c55e" />
                  <span style={{ fontWeight: 600, color: '#16a34a' }}>Google 계정 연결됨</span>
                </>
              ) : (
                <>
                  <LogIn size={18} color="var(--text-muted)" />
                  <span style={{ color: 'var(--text-muted)' }}>YouTube 업로드를 위해 Google 로그인이 필요합니다</span>
                </>
              )}
            </div>
            <button
              className={accessToken ? 'btn-secondary' : 'btn-primary'}
              onClick={handleAuth}
              style={{ fontSize: '0.875rem' }}
            >
              {accessToken ? <><RefreshCw size={14} /> 재인증</> : <><LogIn size={14} /> Google 로그인</>}
            </button>
          </div>
          {authError && (
            <div style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <AlertCircle size={14} /> {authError}
            </div>
          )}
        </div>

        {/* Video File Selection */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Film size={18} color="var(--primary)" />
            <span style={{ fontWeight: 600 }}>영상 파일 선택</span>
          </div>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/*"
            className="form-control"
            onChange={handleVideoFileChange}
          />
          {videoFile && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {videoFile.name} ({formatFileSize(videoFile.size)})
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* Thumbnail Selection */}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>썸네일 선택</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['a', 'b'].map(variant => {
                const url = variant === 'a' ? media.thumbnailA : media.thumbnailB;
                const isSelected = uploadOpts.selectedThumb === variant;
                return (
                  <div key={variant} style={{ flex: 1, cursor: 'pointer' }} onClick={() => setUploadOpts({...uploadOpts, selectedThumb: variant})}>
                    <div style={{
                      height: '80px', backgroundColor: 'var(--gray-200)',
                      backgroundImage: url ? `url(${url})` : 'none', backgroundSize: 'cover',
                      borderRadius: '4px', border: isSelected ? '3px solid var(--primary)' : '1px solid var(--gray-200)',
                    }} />
                    <div style={{ fontSize: '0.75rem', textAlign: 'center', marginTop: '0.25rem', fontWeight: isSelected ? 700 : 400, color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {variant.toUpperCase()} 버전 {isSelected ? '(선택됨)' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload Options */}
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
                  {playlists.length > 0 ? (
                    playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.title}</option>)
                  ) : (
                    <>
                      <option value="" disabled>(Google 로그인 후 재생목록 로드)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">예약 업로드 시점 (선택)</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="datetime-local" className="form-control" style={{ flex: 1 }} value={uploadOpts.scheduleTime} onChange={e => setUploadOpts({...uploadOpts, scheduleTime: e.target.value})} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(비워두면 즉시 업로드)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Progress */}
      {(uploadStatus.isUploading || uploadStatus.videoId) && (
        <div style={{ padding: '1.5rem', backgroundColor: uploadStatus.videoId ? '#f0fdf4' : 'var(--gray-100)', borderRadius: 'var(--radius-lg)', border: uploadStatus.videoId ? '1px solid #bbf7d0' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600 }}>
            <span>{uploadStatus.text}</span>
            <span>{uploadStatus.percent}%</span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'var(--gray-300)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${uploadStatus.percent}%`, height: '100%', backgroundColor: uploadStatus.videoId ? '#22c55e' : 'var(--primary)', transition: 'width 0.3s' }} />
          </div>

          {uploadStatus.videoId && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <a href={`https://studio.youtube.com/video/${uploadStatus.videoId}/edit`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>YouTube Studio 열기</a>
              <a href={`https://youtube.com/watch?v=${uploadStatus.videoId}`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>영상 보기</a>
              <button className="btn-primary" style={{ flex: 1 }} onClick={onNext}>대시보드로 이동</button>
            </div>
          )}
        </div>
      )}

      {/* Upload Error */}
      {uploadStatus.error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#dc2626', fontSize: '0.875rem' }}>
          <AlertCircle size={16} /> {uploadStatus.error}
        </div>
      )}

      {/* Upload Button */}
      {!uploadStatus.isUploading && !uploadStatus.videoId && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
          {!accessToken && (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Google 로그인 필요</span>
          )}
          {!videoFile && accessToken && (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>영상 파일을 선택해주세요</span>
          )}
          <button
            className="btn-primary"
            onClick={executeUpload}
            disabled={!accessToken || !videoFile}
            style={{ fontSize: '1.125rem', padding: '1rem 2rem', opacity: (!accessToken || !videoFile) ? 0.5 : 1 }}
          >
            <UploadCloud size={24} style={{ marginRight: '0.5rem' }} /> YouTube 업로드 실행
          </button>
        </div>
      )}
    </div>
  );
}
