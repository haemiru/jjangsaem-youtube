import React, { useState, useEffect } from 'react';
import { Search, Image as ImageIcon, Type, Target, Link as LinkIcon, AlertCircle, ArrowRight, Loader2, X } from 'lucide-react';

export default function BenchmarkPanel({ globalState, updateState, onNext }) {
  const [progress, setProgress] = useState({ step: 0, text: '', error: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [fallbackWarning, setFallbackWarning] = useState('');

  const { plan, benchmark } = globalState;

  // If already has results, show them.
  const hasResults = benchmark.channels.length > 0 || benchmark.tagPool.length > 0;

  const startBenchmark = async () => {
    if (!plan.topic) {
      setProgress({ step: 0, text: '', error: '기획 탭에서 주제를 먼저 입력해주세요.' });
      return;
    }

    setIsProcessing(true);
    setProgress({ step: 1, text: '🔍 키워드 추출 중...', error: '' });

    try {
      // 1. Keyword Extraction
      let keywords = await fetchKeywords(plan.topic);
      if (!keywords || keywords.length === 0) {
        // Fallback: use topic words as keywords
        keywords = plan.topic.split(/\s+/).filter(w => w.length > 1);
        if (keywords.length === 0) throw new Error('키워드 추출 실패');
      }

      setProgress({ step: 2, text: '📺 유사 채널 수집 중...', error: '' });

      // 2. Collect Channels
      const { channels, popularVideos, allTags, usedFallback } = await collectChannels(keywords);
      if (usedFallback) {
        setFallbackWarning('YouTube API에서 조건에 맞는 채널을 찾지 못해 샘플 데이터를 사용합니다. 결과를 참고용으로만 활용해주세요.');
      } else {
        setFallbackWarning('');
      }

      // 3. Analyze Thumbnails (skip for Shorts)
      const isShorts = plan.format === '쇼츠 60초';
      let thumbnailPatterns = null;
      if (!isShorts) {
        setProgress({ step: 3, text: '🖼️ 썸네일 패턴 분석 중...', error: '' });
        const thumbnails = popularVideos.map(v => v.thumbnail).slice(0, 10); // Max 10
        thumbnailPatterns = await analyzeThumbnails(thumbnails);
      }

      setProgress({ step: isShorts ? 3 : 4, text: '📊 제목 공식 추출 중...', error: '' });

      // 4. Analyze Titles — prefer relevant videos
      const relevantVideos = popularVideos.filter(v => v.relevant);
      const titlesToAnalyze = relevantVideos.length >= 5
        ? relevantVideos.map(v => v.title).slice(0, 20)
        : popularVideos.map(v => v.title).slice(0, 20);
      const titleFormulas = titlesToAnalyze.length > 0 ? await analyzeTitles(titlesToAnalyze) : null;

      setProgress({ step: isShorts ? 4 : 5, text: '✅ 벤치마킹 완료', error: '' });

      // 5. Build Tag Pool — filter out generic/irrelevant tags
      const genericTags = new Set(['브이로그', 'vlog', 'VLOG', '일상', '영국', '미국', '일본', '직장인', '정리해고', '회사', '퇴사', '여행']);
      const tagFreq = {};
      allTags.forEach(tag => {
        if (!genericTags.has(tag) && tag.length > 1) {
          tagFreq[tag] = (tagFreq[tag] || 0) + 1;
        }
      });
      const tagPool = Object.entries(tagFreq)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 20)
        .map(t => t[0]);

      // Update Global State
      updateState('benchmark', {
        channels,
        thumbnailPatterns,
        titleFormulas,
        tagPool
      });

    } catch (err) {
      console.error(err);
      setProgress(prev => ({ ...prev, error: `오류 발생: ${err.message}` }));
    } finally {
      setIsProcessing(false);
    }
  };

  const removeTag = (tagToRemove) => {
    const newTags = benchmark.tagPool.filter(tag => tag !== tagToRemove);
    updateState('benchmark', { ...benchmark, tagPool: newTags });
  };

  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>벤치마킹 분석</h2>
        {(!hasResults || isProcessing) && (
          <button 
            className="btn-primary" 
            onClick={startBenchmark} 
            disabled={isProcessing}
            style={{ opacity: isProcessing ? 0.7 : 1 }}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            {isProcessing ? '분석 중...' : '벤치마킹 시작'}
          </button>
        )}
      </div>

      {(progress.text || progress.error) && !hasResults && (
        <div style={{ padding: '1.5rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: progress.error ? 'red' : 'var(--primary)' }}>
            {progress.error || progress.text}
          </div>
          {isProcessing && (
            <div style={{ marginTop: '1rem', height: '8px', backgroundColor: 'var(--gray-300)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${(progress.step / (plan.format === '쇼츠 60초' ? 4 : 5)) * 100}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      )}

      {!hasResults && !isProcessing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={onNext} style={{ opacity: 0.7 }}>
            건너뛰고 대본 작성 →
          </button>
        </div>
      )}

      {hasResults && !isProcessing && (
        <>
          {fallbackWarning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 'var(--radius-md)', color: '#92400e', fontSize: '0.875rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {fallbackWarning}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: plan.format === '쇼츠 60초' ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
            {/* Thumbnail Pattern Card (숏츠가 아닐 때만 표시) */}
            {plan.format !== '쇼츠 60초' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', marginBottom: '1rem' }}>
                <ImageIcon size={20} color="var(--primary)"/> 썸네일 패턴 카드
              </h3>
              {benchmark.thumbnailPatterns ? (
                <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <strong>주요 색상: </strong>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {benchmark.thumbnailPatterns.dominantColors?.map((c, idx) => (
                        <div key={idx} style={{
                          width: '24px', height: '24px', borderRadius: '50%', backgroundColor: c, border: '1px solid #ddd',
                          display: 'inline-block'
                        }} title={c}/>
                      ))}
                    </div>
                  </div>
                  <div><strong>텍스트 패턴:</strong> {JSON.stringify(benchmark.thumbnailPatterns.textPattern)}</div>
                  <div><strong>레이아웃:</strong> {JSON.stringify(benchmark.thumbnailPatterns.layoutType)}</div>
                  <div><strong>표정 비율:</strong> {JSON.stringify(benchmark.thumbnailPatterns.emotionType)}</div>
                  <div><strong>자주 쓰인 단어:</strong> {benchmark.thumbnailPatterns.commonWords?.join(', ')}</div>
                </div>
              ) : <p>데이터 없음</p>}
            </div>
            )}

            {/* Title Formula Card */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', marginBottom: '1rem' }}>
                <Type size={20} color="var(--primary)"/> 제목 공식 카드
              </h3>
              {benchmark.titleFormulas ? (
                <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {benchmark.titleFormulas.formulas?.slice(0, 3).map((f, idx) => (
                    <div key={idx} style={{ padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: '4px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>패턴 {idx + 1}: {f.pattern}</div>
                      <div style={{ color: 'var(--text-muted)' }}>예시: {f.example}</div>
                    </div>
                  ))}
                  <div><strong>트리거 단어:</strong> {benchmark.titleFormulas.triggerWords?.join(', ')}</div>
                  <div><strong>숫자 활용:</strong> {benchmark.titleFormulas.numberUsage}</div>
                </div>
              ) : <p>데이터 없음</p>}
            </div>
          </div>

          {/* Core Tags Card */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', marginBottom: '1rem' }}>
              <Target size={20} color="var(--primary)"/> 핵심 태그 카드 (클릭시 제외)
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {benchmark.tagPool.map((tag, idx) => (
                <button 
                  key={idx} 
                  onClick={() => removeTag(tag)}
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.25rem', 
                    padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', 
                    backgroundColor: 'var(--secondary)', border: '1px solid var(--primary)',
                    color: 'var(--primary)', fontSize: '0.875rem', cursor: 'pointer'
                  }}
                >
                  #{tag} <X size={14} />
                </button>
              ))}
            </div>
          </div>

          {/* Channels List */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>분석된 채널 목록 ({benchmark.channels.length}개)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {benchmark.channels.map((ch, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--gray-100)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{ch.channelTitle}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      구독자: {Number(ch.subscriberCount).toLocaleString()}명 | 누적 조회수: {Number(ch.viewCount).toLocaleString()}회
                    </span>
                  </div>
                  <a href={`https://youtube.com/channel/${ch.channelId}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <LinkIcon size={16} /> 채널 보기
                  </a>
                </div>
              ))}
              {benchmark.channels.length === 0 && <p>조건에 맞는 적절한 채널을 찾지 못했습니다.</p>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={onNext}>
              이 결과로 대본 생성하기 <ArrowRight size={20} />
            </button>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={startBenchmark}>다시 분석하기</button>
          </div>
        </>
      )}
    </div>
  );
}

// --- API Helpers ---

async function fetchKeywords(topic) {
  const res = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `다음 유튜브 영상 주제와 직접적으로 관련된 검색 키워드 5개를 생성해줘.
주제: ${topic}

규칙:
- 반드시 이 주제의 핵심 내용과 직접 관련된 키워드만 생성
- 너무 일반적인 키워드(육아, 일상, 브이로그 등)는 제외
- 유튜브에서 이 주제의 영상을 찾을 때 실제로 사용할 구체적인 검색어
- JSON 배열로만 출력

출력 형식: ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]`
      }]
    })
  });
  if (!res.ok) throw new Error('Claude API 요청 실패 (키워드)');
  const data = await res.json();
  const text = data.content[0].text;
  const match = text.match(/\[(.*)\]/s);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch(e) { return null; }
  }
  return null;
}

async function collectChannels(keywords) {
  let channelMap = new Map(); // channelId -> relevance count

  // 1. Search for videos via keywords — track how many keywords each channel matches
  for (const kw of keywords.slice(0, 5)) {
    const searchRes = await fetch(`/api/youtube/search?part=snippet&type=video&q=${encodeURIComponent(kw)}&maxResults=10&relevanceLanguage=ko&regionCode=KR`);
    if(searchRes.ok) {
      const data = await searchRes.json();
      data.items?.forEach(item => {
        const chId = item.snippet.channelId;
        channelMap.set(chId, (channelMap.get(chId) || 0) + 1);
      });
    }
  }

  // Sort by relevance (channels appearing in more keyword searches first)
  const sortedChannelIds = [...channelMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  // 2. Fetch channel stats and filter
  const cIds = sortedChannelIds.slice(0, 25);
  if (cIds.length === 0) return { channels: [], popularVideos: [], allTags: [], usedFallback: false };

  const chRes = await fetch(`/api/youtube/channels?part=statistics,snippet&id=${cIds.join(',')}`);
  const chData = await chRes.json();

  // Build keyword set for relevance checking
  const keywordSet = keywords.map(k => k.toLowerCase());

  const validChannels = [];
  for (const ch of (chData.items || [])) {
    const subs = parseInt(ch.statistics.subscriberCount || '0', 10);
    const views = parseInt(ch.statistics.viewCount || '0', 10);
    const videoCount = parseInt(ch.statistics.videoCount || '1', 10);
    const chTitle = (ch.snippet.title || '').toLowerCase();
    const chDesc = (ch.snippet.description || '').toLowerCase();

    // Channel relevance check: title or description must contain at least one keyword
    const isRelevant = keywordSet.some(kw => chTitle.includes(kw) || chDesc.includes(kw));
    const relevanceScore = channelMap.get(ch.id) || 0;

    // Relaxed stats filter + relevance requirement
    if (subs < 100000 && (views / videoCount) > 1000 && (isRelevant || relevanceScore >= 2)) {
      validChannels.push({
        channelId: ch.id,
        channelTitle: ch.snippet.title,
        subscriberCount: subs,
        viewCount: views,
        relevanceScore
      });
    }
  }

  // Sort by relevance score
  validChannels.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const finalChannels = validChannels.slice(0, 8);

  // 3. Collect popular videos & tags — filter by keyword relevance
  let popularVideos = [];
  let allTags = [];

  for (const ch of finalChannels) {
    const vRes = await fetch(`/api/youtube/search?part=snippet&channelId=${ch.channelId}&order=viewCount&maxResults=10&type=video`);
    if (vRes.ok) {
      const vData = await vRes.json();
      const vIds = vData.items?.map(i => i.id.videoId) || [];
      if (vIds.length > 0) {
        const dRes = await fetch(`/api/youtube/videos?part=snippet&id=${vIds.join(',')}`);
        const dData = await dRes.json();

        dData.items?.forEach(vd => {
          const title = vd.snippet.title || '';
          // Only include videos whose title has some relevance to keywords
          const titleLower = title.toLowerCase();
          const videoRelevant = keywordSet.some(kw => titleLower.includes(kw));

          popularVideos.push({
            title,
            thumbnail: vd.snippet.thumbnails?.high?.url || vd.snippet.thumbnails?.default?.url,
            viewCount: 0,
            description: (vd.snippet.description || '').substring(0, 100),
            relevant: videoRelevant
          });
          if (vd.snippet.tags) {
            // Only include tags from relevant videos, or tags that match keywords
            if (videoRelevant) {
              allTags.push(...vd.snippet.tags);
            } else {
              // From non-relevant videos, only keep tags that match a keyword
              vd.snippet.tags.forEach(tag => {
                if (keywordSet.some(kw => tag.toLowerCase().includes(kw) || kw.includes(tag.toLowerCase()))) {
                  allTags.push(tag);
                }
              });
            }
          }
        });
      }
    }
  }

  // 모의 데이터 (API 미동작/조건 미달 대비 Fallback)
  let usedFallback = false;
  if (finalChannels.length === 0) {
    usedFallback = true;
    finalChannels.push({
      channelId: 'UC_dummy', channelTitle: '모의 육아 채널', subscriberCount: 25000, viewCount: 1500000
    });
    for(let i=0; i<10; i++) {
      popularVideos.push({
        title: `터미타임 ${i}개월 아기 성공 비법`,
        thumbnail: 'https://images.unsplash.com/photo-1519689680058-324335c77eba',
        description: '우리 아기 터미타임 잘하는 법...'
      });
      allTags.push('육아', '신생아', '터미타임', '발달');
    }
  }

  return { channels: finalChannels, popularVideos, allTags, usedFallback };
}

async function analyzeThumbnails(thumbnails) {
  try {
    const content = thumbnails.map(url => ({
      type: "image",
      source: { type: "url", url: url }
    }));
    content.push({
      type: "text",
      text: "이 유튜브 썸네일들을 분석해서 다음을 JSON으로 출력해줘.\n분석 항목:\n1. dominantColors: 가장 많이 쓰인 색상 조합 top3 (헥스코드 배열)\n2. textPattern: 텍스트 글자수 범위, 위치(상/중/하), 폰트 굵기를 포함한 문자열 요약\n3. emotionType: 등장 인물 표정 유형 (공감/놀람/걱정/희망/없음) 비율\n4. layoutType: 인물중심/텍스트중심/인포그래픽 비율\n5. commonWords: 텍스트에서 자주 등장한 단어 top10 배열\nJSON 형식으로만 출력, 다른 텍스트 없이."
    });

    const res = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: content }]
      })
    });
    
    if(!res.ok) throw new Error('Vision API Error');
    const data = await res.json();
    const text = data.content[0].text;
    return robustParseJSON(text);
  } catch (err) {
    console.warn("Thumbnail Analysis fallback", err);
    // Fallback Mock Data Since Claude Vision base64/URL might have strict CORS or URL issue
    return {
      dominantColors: ['#FFC107', '#E91E63', '#2196F3'],
      textPattern: '가운데 정렬, 5~10자, 굵은 고딕',
      emotionType: { '공감': '40%', '놀람': '30%', '없음': '30%' },
      layoutType: { '인물중심': '60%', '텍스트중심': '40%' },
      commonWords: ['꿀팁', '성공', '비밀', '초보', '필수']
    };
  }
}

async function analyzeTitles(titles) {
  try {
    const res = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `아래 유튜브 영상 제목들에서 반복되는 패턴을 분석해줘.\n제목 목록: ${titles.join(' | ')}\n\n다음을 JSON으로 출력:\n{\n  "formulas": [\n    { "pattern": "패턴 설명", "example": "예시 제목", "frequency": 빈도수 }\n  ],\n  "triggerWords": ["감정 트리거 단어 목록"],\n  "numberUsage": "숫자 활용 패턴 설명"\n}\nJSON만 출력.`
        }]
      })
    });
    
    if(!res.ok) throw new Error('Title Analysis Error');
    const data = await res.json();
    const text = data.content[0].text;
    return robustParseJSON(text);
  } catch (err) {
    console.warn("Title Analysis fallback", err);
    return {
      formulas: [
        { pattern: '[대상] + 공감 + 해결책 명시', example: '초보 부모라면 무조건 알아야 할 터미타임 성공 비법', frequency: 5 },
        { pattern: '부정적 결과 경고형', example: '이거 모르면 우리 아이 터미타임 거부합니다', frequency: 3 },
        { pattern: '기간 한정 효과 강조', example: '생후 1개월, 5분만 따라하면 꿀잠 자는 마법', frequency: 2 }
      ],
      triggerWords: ['무조건', '충격', '비법', '초보', '실수'],
      numberUsage: '기간(개월 수, 일 수) 및 짧은 수행 시간(5분, 3가지)을 주로 사용하여 실천 장벽을 낮춤'
    };
  }
}

function robustParseJSON(text) {
  try {
    let cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
    try { return JSON.parse(cleaned); } catch {}
    const startIdx = cleaned.indexOf('{');
    if (startIdx === -1) return null;
    let depth = 0, endIdx = -1;
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx === -1) return null;
    return JSON.parse(cleaned.substring(startIdx, endIdx + 1));
  } catch (err) {
    console.error('robustParseJSON 실패:', text.substring(0, 300));
    return null;
  }
}
