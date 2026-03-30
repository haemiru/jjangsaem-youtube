import React, { useState, useEffect, useRef } from 'react';
import { FileText, Play, CheckCircle2, ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw, Type, Loader2, ArrowRight, Copy, Check } from 'lucide-react';

export default function ScriptPanel({ globalState, updateState, onNext }) {
  const { plan, benchmark, settings, script: globalScript } = globalState;

  const [streamText, setStreamText] = useState('');
  const [currentStep, setCurrentStep] = useState(0); // 0: idle, 1: hook, 2: rows, 3: titles, 4: done
  const [error, setError] = useState('');

  const [showHookCot, setShowHookCot] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };
  const streamEndRef = useRef(null);

  const isGenerating = currentStep > 0 && currentStep < 4;
  const hasResults = globalScript && globalScript.final_hook && !isGenerating && currentStep === 0;

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamText]);

  const parseJSON = (text) => {
    try {
      let cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
      cleaned = cleaned.replace(/<thinking>[\s\S]*/gi, '');
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
      try { return JSON.parse(cleaned); } catch {}
      let lastValid = null;
      let searchFrom = 0;
      while (searchFrom < cleaned.length) {
        const startIdx = cleaned.indexOf('{', searchFrom);
        if (startIdx === -1) break;
        let depth = 0, endIdx = -1;
        for (let i = startIdx; i < cleaned.length; i++) {
          if (cleaned[i] === '{') depth++;
          else if (cleaned[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        if (endIdx === -1) break;
        try { lastValid = JSON.parse(cleaned.substring(startIdx, endIdx + 1)); } catch {}
        searchFrom = endIdx + 1;
      }
      if (lastValid) return lastValid;
      const rawStart = text.lastIndexOf('{');
      if (rawStart !== -1) {
        let depth = 0, endIdx = -1;
        for (let i = rawStart; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        if (endIdx !== -1) { try { return JSON.parse(text.substring(rawStart, endIdx + 1)); } catch {} }
      }
      return null;
    } catch { return null; }
  };

  const generateAll = async () => {
    setError('');
    setCurrentStep(1);
    setStreamText('');

    let chatHistory = [];
    let hookResult = null;
    let rowsResult = null;
    let titleResult = null;

    const charDesc = plan.characterDescription
      ? `캐릭터 설명: ${plan.characterDescription}`
      : '업로드된 캐릭터 이미지를 참고';

    try {
      // ===== STEP 1: HOOK =====
      setStreamText('=== [1/3] 훅(Hook) 기획 및 작성 중 ===\n\n');
      const hookPrompt = `다음 정보를 바탕으로 유튜브 영상의 훅(Hook)을 작성해줘.

[영상 정보]
주제: ${plan.topic}
포맷: ${plan.format}
대상: ${plan.targets.join(', ')}
톤: ${plan.tone}
연관 전자책: ${plan.ebookName}
전자책 요약본: ${plan.ebookSummary || '(없음)'}
벤치마킹 감정 트리거: ${benchmark.titleFormulas?.triggerWords?.join(', ') || '없음'}

아래 순서대로 생각한 뒤 훅을 작성해:
1. 시청자 감정 상태 분석
2. 가장 강한 감정 레버 파악
3. 훅 유형 선택 (공감형/충격형/숫자형/궁금증형/손실형)
4. 훅 초안 3개 작성 (각기 다른 유형, 100점 채점)
5. 최고점 훅 선정 + 브릿지 문장 생성

JSON으로 출력:
{
  "cot_log": "위 사고 과정 전체 요약 (시청자 분석, 감정 레버, 채점 근거 등)",
  "hook_candidates": [
    { "type": "유형", "text": "훅 문장", "score": 95, "reason": "한줄평" }
  ],
  "final_hook": { "text": "최종 선택된 훅", "score": 98 },
  "bridge": "브릿지 문장"
}
JSON만 출력.`;

      chatHistory.push({ role: "user", content: hookPrompt });
      const hookResponseText = await runClaudeStream(chatHistory, plan.model, null, (chunk) => {
        setStreamText(prev => prev + chunk);
      });
      if (!hookResponseText || hookResponseText.trim().length === 0) throw new Error("훅 생성 단계에서 API 응답이 비어있습니다.");
      chatHistory.push({ role: "assistant", content: hookResponseText });

      hookResult = parseJSON(hookResponseText);
      if (!hookResult) throw new Error("훅 생성 단계에서 JSON 파싱 실패\n응답: " + hookResponseText.substring(0, 300));

      // ===== STEP 2: SENTENCE-LEVEL ROWS (대본 + 이미지 프롬프트 + 영상 프롬프트) =====
      setCurrentStep(2);
      setStreamText(prev => prev + '\n\n=== [2/3] 문장 단위 대본 + 이미지/영상 프롬프트 생성 중 ===\n\n');

      const rowsPrompt = `위에서 생성한 훅을 이어받아 본문 대본을 작성하고, 각 문장마다 이미지 프롬프트와 영상 프롬프트를 함께 생성해줘.

[훅] ${hookResult.final_hook.text}
[브릿지] ${hookResult.bridge}

포맷: ${plan.format}
연계 전자책: ${plan.ebookName} (영상 마지막에 자연스럽게 연결)

[스타일 가이드]
- 이 영상은 특정 캐릭터를 활용한 화이트보드 애니메이션 스타일입니다.
- ${charDesc}
- 모든 이미지는 흰색 배경 위에 캐릭터와 간단한 텍스트/아이콘으로 구성됩니다.
- Nick Invests 채널처럼 깔끔하고 미니멀한 교육 콘텐츠 스타일입니다.

[출력 규칙]
1. 대본을 1~2문장 단위로 끊어서 rows 배열에 넣어줘 (총 15~25개 row 정도)
2. 각 row의 image_prompt: 해당 문장을 시각화하는 이미지 프롬프트 (영어)
   - 반드시 "white background" 포함
   - 캐릭터가 등장하며 해당 내용을 설명하는 포즈/표정
   - 이미지 안에 표시되는 텍스트는 가능한 한글로 작성 (예: "text reading '수면 훈련'" 형태로)
3. 각 row의 video_prompt: 해당 이미지를 5초 영상으로 만들기 위한 Grok 영상 생성 프롬프트 (영어)
   - 카메라 움직임, 캐릭터 애니메이션, 텍스트 등장 효과 등 포함
4. 훅과 브릿지도 첫 번째 row들로 포함
5. CTA(구독/전자책 언급)도 마지막 row들로 포함

JSON 출력:
{
  "rows": [
    {
      "script": "대본 문장 (한국어)",
      "image_prompt": "Clean white background, character standing with ... (영어)",
      "video_prompt": "Camera slowly zooms in on character who ... (영어)"
    }
  ],
  "full_script": "전체 대본을 이어붙인 텍스트 (복사용)"
}
JSON만 출력.`;

      chatHistory.push({ role: "user", content: rowsPrompt });
      const rowsResponseText = await runClaudeStream(chatHistory, plan.model, null, (chunk) => {
        setStreamText(prev => prev + chunk);
      });
      if (!rowsResponseText || rowsResponseText.trim().length === 0) throw new Error("본문 대본 생성 단계에서 API 응답이 비어있습니다.");
      chatHistory.push({ role: "assistant", content: rowsResponseText });

      rowsResult = parseJSON(rowsResponseText);
      if (!rowsResult) throw new Error("본문 대본 생성 단계에서 JSON 파싱 실패\n응답: " + rowsResponseText.substring(0, 300));

      // ===== STEP 3: TITLES & THUMBNAILS =====
      setCurrentStep(3);
      setStreamText(prev => prev + '\n\n=== [3/3] 제목 및 썸네일 기획 중 ===\n\n');

      const isShorts = plan.format === '쇼츠 60초';
      const titlePrompt = `완성된 대본을 바탕으로 제목 후보${isShorts ? '' : '와 썸네일 문구'}를 만들어줘.

[대본 요약] ${rowsResult.rows?.slice(0, 5).map(r => r.script).join(' ')}
[벤치마킹 제목 공식] ${JSON.stringify(benchmark?.titleFormulas?.formulas || [])}
[핵심 태그] ${(benchmark?.tagPool || []).slice(0, 10).join(', ')}
[포맷] ${plan.format}

아래 JSON 형식으로만 바로 출력해. thinking 태그 쓰지 마.
{
  "title_cot_log": "제목 선정 근거 2~3문장",
  "title_candidates": [
    { "text": "제목", "score": 90, "reason": "한줄평" }
  ],
  "final_title": "최종 추천 제목"${isShorts ? '' : `,
  "thumbnail_cot_log": "썸네일 선정 근거 2~3문장",
  "thumbnail_candidates": [
    { "text": "문구", "score": 90, "reason": "한줄평" }
  ],
  "final_thumbnail_copy": "최종 추천 썸네일 문구"`}
}
JSON만 출력. 다른 텍스트 절대 금지.`;

      chatHistory.push({ role: "user", content: titlePrompt });
      const titleResponseText = await runClaudeStream(chatHistory, plan.model, null, (chunk) => {
        setStreamText(prev => prev + chunk);
      });
      if (!titleResponseText || titleResponseText.trim().length === 0) throw new Error("제목 생성 단계에서 API 응답이 비어있습니다.");

      titleResult = parseJSON(titleResponseText);
      if (!titleResult) throw new Error("제목 생성 단계에서 JSON 파싱 실패\n응답: " + titleResponseText.substring(0, 300));

      // ===== COMPLETE & SAVE =====
      const fullScript = rowsResult.full_script || rowsResult.rows?.map(r => r.script).join('\n') || '';

      const finalScriptState = {
        ...globalScript,
        cot_log: hookResult.cot_log,
        hook: hookResult.final_hook.text,
        bridge: hookResult.bridge,
        rows: rowsResult.rows || [],
        full_script: fullScript,
        titleSuggestions: titleResult.title_candidates || [],
        thumbnailCopies: titleResult.thumbnail_candidates || [],
        final_title: titleResult.final_title,
        final_thumbnail_copy: titleResult.final_thumbnail_copy,
        final_hook: hookResult.final_hook
      };

      updateState('script', finalScriptState);
      updateState('metadata', {
        ...globalState.metadata,
        title: titleResult.final_title,
        description: fullScript.substring(0, 200)
      });
      updateState('media', {
        ...globalState.media,
        selectedThumbnailCopy: titleResult.final_thumbnail_copy
      });

      setCurrentStep(4);
      setStreamText('');

    } catch (err) {
      console.error(err);
      setError(`대본 생성 중 오류 발생: ${err.message}`);
      setCurrentStep(0);
    }
  };

  const updateRowField = (idx, field, value) => {
    const newRows = [...globalScript.rows];
    newRows[idx] = { ...newRows[idx], [field]: value };
    updateState('script', { ...globalScript, rows: newRows });
  };

  const selectTitle = (titleText) => {
    updateState('script', { ...globalScript, final_title: titleText });
    updateState('metadata', { ...globalState.metadata, title: titleText });
  };

  const updateHook = (text) => {
    updateState('script', { ...globalScript, hook: text });
  };

  const updateBridge = (text) => {
    updateState('script', { ...globalScript, bridge: text });
  };

  const selectThumbnail = (thumbText) => {
    updateState('script', { ...globalScript, final_thumbnail_copy: thumbText });
    updateState('media', { ...globalState.media, selectedThumbnailCopy: thumbText });
  };

  // Get full script text for copy
  const getFullScriptText = () => {
    return globalScript.full_script || globalScript.rows?.map(r => r.script).join('\n') || '';
  };

  if (!hasResults && currentStep === 0) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <FileText size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>대본 자동 생성</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', textAlign: 'center' }}>
          기획 및 벤치마킹된 데이터를 바탕으로<br/>문장 단위 대본 + 이미지/영상 프롬프트를 생성합니다.
        </p>
        <button className="btn-primary" onClick={generateAll}>
          <Play fill="white" size={18} /> 대본 생성 시작하기
        </button>
        {error && <div style={{ color: 'red', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>{error}</div>}
        <button className="btn-secondary" onClick={onNext} style={{ marginTop: '1rem', opacity: 0.7 }}>
          건너뛰고 업로드 단계 →
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h2 className="panel-title">
          <Loader2 className="animate-spin" size={24} color="var(--primary)" />
          대본 생성 중 ({currentStep}/3)
        </h2>
        <div style={{
          flex: 1, backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
          padding: '1.5rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.875rem',
          overflowY: 'auto', maxHeight: '500px', lineHeight: '1.6'
        }}>
          {streamText}
          <div ref={streamEndRef} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>완성된 대본</h2>
        <button className="btn-secondary" onClick={generateAll}><RefreshCw size={16}/> 전체 재생성</button>
      </div>

      {/* 훅 카드 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', backgroundColor: 'var(--secondary)' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Hook & Bridge
        </h3>
        <textarea
          className="form-control"
          style={{ fontSize: '1.125rem', fontWeight: 600, minHeight: '80px', lineHeight: '1.6', backgroundColor: 'var(--surface)' }}
          value={globalScript.hook}
          onChange={(e) => updateHook(e.target.value)}
        />
        {globalScript.bridge !== undefined && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Bridge</label>
            <textarea
              className="form-control"
              style={{ minHeight: '60px', lineHeight: '1.6', fontSize: '0.9375rem' }}
              value={globalScript.bridge || ''}
              onChange={(e) => updateBridge(e.target.value)}
            />
          </div>
        )}
        <div style={{ marginTop: '1rem' }}>
          <button onClick={() => setShowHookCot(!showHookCot)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            [CoT 사유 과정 {showHookCot ? '접기' : '보기'}]
          </button>
          {showHookCot && (
            <div style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {globalScript.cot_log || '기록 없음'}
            </div>
          )}
        </div>
      </div>

      {/* 대본 + 이미지 프롬프트 + 영상 프롬프트 표 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <h3 style={{ fontSize: '1.125rem', padding: '1rem 1.5rem', margin: 0, backgroundColor: 'var(--gray-100)', borderBottom: '1px solid var(--border)' }}>
          대본 / 이미지 프롬프트 / 영상 프롬프트
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--gray-100)' }}>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '5%', whiteSpace: 'nowrap' }}>#</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '35%' }}>대본</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '30%' }}>이미지 프롬프트</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '30%' }}>영상 프롬프트</th>
              </tr>
            </thead>
            <tbody>
              {globalScript.rows?.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                  <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <textarea
                      className="form-control"
                      style={{ minHeight: '80px', fontSize: '0.8125rem', lineHeight: '1.5', border: '1px solid var(--gray-200)' }}
                      value={row.script}
                      onChange={(e) => updateRowField(idx, 'script', e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '80px', fontSize: '0.75rem', lineHeight: '1.4', fontFamily: 'monospace', border: '1px solid var(--gray-200)', paddingRight: '2rem' }}
                        value={row.image_prompt}
                        onChange={(e) => updateRowField(idx, 'image_prompt', e.target.value)}
                      />
                      <button
                        onClick={() => copyText(row.image_prompt, `img_${idx}`)}
                        style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', cursor: 'pointer', color: copiedId === `img_${idx}` ? '#16a34a' : 'var(--text-muted)', padding: '2px' }}
                        title="복사"
                      >
                        {copiedId === `img_${idx}` ? <Check size={12}/> : <Copy size={12}/>}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '80px', fontSize: '0.75rem', lineHeight: '1.4', fontFamily: 'monospace', border: '1px solid var(--gray-200)', paddingRight: '2rem' }}
                        value={row.video_prompt}
                        onChange={(e) => updateRowField(idx, 'video_prompt', e.target.value)}
                      />
                      <button
                        onClick={() => copyText(row.video_prompt, `vid_${idx}`)}
                        style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', cursor: 'pointer', color: copiedId === `vid_${idx}` ? '#16a34a' : 'var(--text-muted)', padding: '2px' }}
                        title="복사"
                      >
                        {copiedId === `vid_${idx}` ? <Check size={12}/> : <Copy size={12}/>}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 전체 대본 복사 영역 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>
            전체 대본 (복사용)
          </h3>
          <button
            className="btn-primary"
            style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            onClick={() => copyText(getFullScriptText(), 'full_script')}
          >
            {copiedId === 'full_script' ? <><Check size={14}/> 복사됨</> : <><Copy size={14}/> 전체 대본 복사</>}
          </button>
        </div>
        <div style={{
          padding: '1rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
          whiteSpace: 'pre-wrap', lineHeight: '1.8', fontSize: '0.9375rem', maxHeight: '400px', overflowY: 'auto'
        }}>
          {getFullScriptText()}
        </div>
      </div>

      {/* 전체 이미지 프롬프트 (복사용) */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>
            전체 이미지 프롬프트 (복사용)
          </h3>
          <button
            className="btn-primary"
            style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            onClick={() => copyText(globalScript.rows?.map(r => r.image_prompt).join('\n\n') || '', 'all_image_prompts')}
          >
            {copiedId === 'all_image_prompts' ? <><Check size={14}/> 복사됨</> : <><Copy size={14}/> 전체 이미지 프롬프트 복사</>}
          </button>
        </div>
        <div style={{
          padding: '1rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
          whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.8125rem', fontFamily: 'monospace',
          maxHeight: '400px', overflowY: 'auto'
        }}>
          {globalScript.rows?.map(r => r.image_prompt).join('\n\n')}
        </div>
      </div>

      {/* 제목 및 썸네일 추천 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* 제목 후보 */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', marginBottom: '1rem' }}>
            <Type size={20} color="var(--primary)"/> 제목 후보
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {globalScript.titleSuggestions?.map((t, idx) => {
              const isSelected = globalScript.final_title === t.text;
              return (
                <div key={idx} onClick={() => selectTitle(t.text)} style={{
                  padding: '1rem', border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--gray-200)'}`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: isSelected ? 'var(--secondary)' : 'transparent'
                }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input type="radio" checked={isSelected} readOnly style={{ marginTop: '4px', accentColor: 'var(--primary)' }}/>
                    <div>
                      <div style={{ fontWeight: isSelected ? 700 : 500 }}>{t.text}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                        <span className="status-badge success">{t.score}점</span>
                        <span style={{ color: 'var(--text-muted)' }}>{t.reason}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 썸네일 문구 후보 */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', marginBottom: '1rem' }}>
            <ImageIcon size={20} color="var(--primary)"/> 썸네일 문구 후보
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {globalScript.thumbnailCopies?.map((t, idx) => {
              const isSelected = globalScript.final_thumbnail_copy === t.text;
              return (
                <div key={idx} onClick={() => selectThumbnail(t.text)} style={{
                  padding: '1rem', border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--gray-200)'}`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: isSelected ? 'var(--secondary)' : 'transparent'
                }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input type="radio" checked={isSelected} readOnly style={{ marginTop: '4px', accentColor: 'var(--primary)' }}/>
                    <div>
                      <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '1.125rem' }}>{t.text}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                        <span className="status-badge success">{t.score}점</span>
                        <span style={{ color: 'var(--text-muted)' }}>{t.reason}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className="btn-primary" onClick={onNext}>
          확정 후 업로드 단계 <ArrowRight size={20} />
        </button>
      </div>

    </div>
  );
}

// --- API Helpers ---

async function runClaudeStream(messages, model, _apiKey, onChunk) {
  const systemPrompt = `당신은 jjangsaem.com의 유튜브 콘텐츠 전문가입니다. 피지오 후각 연구소 소속으로 발달장애 아동 및 가족을 위한 뇌과학 근거 중심의 전문적이고 따뜻한 어조로 작성합니다. 반드시 유효한 JSON 형식으로 응답하세요. JSON 앞뒤에 불필요한 텍스트를 넣지 마세요.`;

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      stream: true,
      system: systemPrompt,
      messages: messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 오류: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.substring(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            fullText += data.delta.text;
            onChunk(data.delta.text);
          }
        } catch(e) { /* ignore parse error on chunks */ }
      }
    }
  }

  return fullText;
}
