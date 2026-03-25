import React, { useState, useEffect, useRef } from 'react';
import { FileText, Play, CheckCircle2, ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw, Type, Loader2, ArrowRight, Copy, Check } from 'lucide-react';

export default function ScriptPanel({ globalState, updateState, onNext }) {
  const { plan, benchmark, settings, script: globalScript } = globalState;

  const [streamText, setStreamText] = useState('');
  const [currentStep, setCurrentStep] = useState(0); // 0: idle, 1: hook, 2: section, 3: titles, 4: done
  const [error, setError] = useState('');
  
  const [showHookCot, setShowHookCot] = useState(false);
  const [openPromptIdx, setOpenPromptIdx] = useState(null);
  const [showIntroPrompt, setShowIntroPrompt] = useState(false);
  const [showOutroPrompt, setShowOutroPrompt] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const copyPrompt = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };
  const streamEndRef = useRef(null);

  // If already generated and we aren't currently generating, show the results
  const isGenerating = currentStep > 0 && currentStep < 4;
  const hasResults = globalScript && globalScript.final_hook && !isGenerating && currentStep === 0;

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamText]);

  const parseJSON = (text) => {
    try {
      // 1. Remove <thinking>...</thinking> blocks (greedy — handle unclosed tags too)
      let cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
      // If an unclosed <thinking> remains, strip from it to the end
      cleaned = cleaned.replace(/<thinking>[\s\S]*/gi, '');

      // 2. Try to extract from markdown code blocks first
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }

      // 3. Try direct JSON parse
      try {
        return JSON.parse(cleaned);
      } catch {}

      // 4. Find the LAST balanced { ... } (the final JSON block is usually the answer)
      let lastValid = null;
      let searchFrom = 0;
      while (searchFrom < cleaned.length) {
        const startIdx = cleaned.indexOf('{', searchFrom);
        if (startIdx === -1) break;

        let depth = 0;
        let endIdx = -1;
        for (let i = startIdx; i < cleaned.length; i++) {
          if (cleaned[i] === '{') depth++;
          else if (cleaned[i] === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }

        if (endIdx === -1) break;
        const jsonStr = cleaned.substring(startIdx, endIdx + 1);
        try {
          lastValid = JSON.parse(jsonStr);
        } catch {}
        searchFrom = endIdx + 1;
      }

      if (lastValid) return lastValid;

      // 5. Fallback: try the original text (before thinking removal) for balanced JSON
      const rawStart = text.lastIndexOf('{');
      if (rawStart !== -1) {
        let depth = 0;
        let endIdx = -1;
        for (let i = rawStart; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        if (endIdx !== -1) {
          try { return JSON.parse(text.substring(rawStart, endIdx + 1)); } catch {}
        }
      }

      return null;
    } catch (err) {
      console.error('JSON 파싱 실패. 원본 응답:', text.substring(0, 500));
      return null;
    }
  };

  const generateAll = async () => {
    setError('');
    setCurrentStep(1);
    setStreamText('');

    let chatHistory = [];
    let hookResult = null;
    let sectionResult = null;
    let titleResult = null;

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
      if (!hookResponseText || hookResponseText.trim().length === 0) throw new Error("훅 생성 단계에서 API 응답이 비어있습니다. 모델을 변경하거나 다시 시도해주세요.");
      chatHistory.push({ role: "assistant", content: hookResponseText });

      hookResult = parseJSON(hookResponseText);
      if (!hookResult) throw new Error("훅 생성 단계에서 JSON 파싱 실패\n응답: " + hookResponseText.substring(0, 300));

      // ===== STEP 2: SECTIONS =====
      setCurrentStep(2);
      setStreamText(prev => prev + '\n\n=== [2/3] 본문 대본 작성 중 ===\n\n');
      
      const sectionPrompt = `위에서 생성한 훅을 이어받아 본문 대본을 작성해줘.

[훅] ${hookResult.final_hook.text}
[브릿지] ${hookResult.bridge}

포맷: ${plan.format}
연계 전자책: ${plan.ebookName} (영상 마지막에 자연스럽게 연결)
벤치마킹 제목 공식: ${benchmark?.titleFormulas?.formulas?.[0]?.pattern || '없음'}

JSON 출력:
{
  "intro_image_prompt": "오프닝 배경 이미지 생성 프롬프트 (영어, 훅 내용을 시각화)",
  "sections": [
    {
      "id": 1,
      "title": "섹션 제목",
      "script": "읽을 대본 전문",
      "duration_sec": 30,
      "image_prompt": "이 섹션용 이미지 생성 프롬프트 (영어, 한국인 등장)
- ${plan.ebookName ? `[${plan.ebookName}] 연계 전자책의 핵심 노하우를 자연스럽게 녹여냄` : '전문적인 노하우를 자연스럽게 녹여냄'}
- 핵심 메시지 요약 (1문장)",
      "key_message": "핵심 한 줄 요약"
    }
  ],
  "cta": {
    "text": "CTA 대본",
    "ebook_mention": "전자책 언급 문구",
    "duration_sec": 15
  },
  "outro_image_prompt": "엔딩 배경 이미지 생성 프롬프트 (영어, 깔끔한 아웃트로)"
}
JSON만 출력.`;

      chatHistory.push({ role: "user", content: sectionPrompt });
      const sectionResponseText = await runClaudeStream(chatHistory, plan.model, null, (chunk) => {
        setStreamText(prev => prev + chunk);
      });
      if (!sectionResponseText || sectionResponseText.trim().length === 0) throw new Error("본문 대본 생성 단계에서 API 응답이 비어있습니다. 다시 시도해주세요.");
      chatHistory.push({ role: "assistant", content: sectionResponseText });

      sectionResult = parseJSON(sectionResponseText);
      if (!sectionResult) throw new Error("본문 대본 생성 단계에서 JSON 파싱 실패\n응답: " + sectionResponseText.substring(0, 300));

      // ===== STEP 3: TITLES & THUMBNAILS =====
      setCurrentStep(3);
      setStreamText(prev => prev + '\n\n=== [3/3] 제목 및 썸네일 기획 중 ===\n\n');

      const isShorts = plan.format === '쇼츠 60초';
      const titlePrompt = `완성된 대본을 바탕으로 제목 후보${isShorts ? '' : '와 썸네일 문구'}를 만들어줘.

[대본 요약] ${(sectionResult.sections || []).map(s => s.key_message).join(', ')}
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
      if (!titleResponseText || titleResponseText.trim().length === 0) throw new Error("제목 생성 단계에서 API 응답이 비어있습니다. 다시 시도해주세요.");

      titleResult = parseJSON(titleResponseText);
      if (!titleResult) throw new Error("제목 생성 단계에서 JSON 파싱 실패\n응답: " + titleResponseText.substring(0, 300));

      // ===== COMPLETE & SAVE =====
      const finalScriptState = {
        ...globalScript,
        cot_log: hookResult.cot_log,
        hook: hookResult.final_hook.text,
        bridge: hookResult.bridge,
        intro_image_prompt: sectionResult.intro_image_prompt || '',
        outro_image_prompt: sectionResult.outro_image_prompt || '',
        sections: sectionResult.sections || [],
        cta: sectionResult.cta || {},
        titleSuggestions: titleResult.title_candidates || [],
        thumbnailCopies: titleResult.thumbnail_candidates || [],
        final_title: titleResult.final_title,
        final_thumbnail_copy: titleResult.final_thumbnail_copy,
        final_hook: hookResult.final_hook
      };
      
      updateState('script', finalScriptState);
      
      // Also write to metadata
      updateState('metadata', {
        ...globalState.metadata,
        title: titleResult.final_title,
        description: sectionResult.sections?.map(s => s.key_message).join(' ') || ''
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

  const updateSectionText = (idx, text) => {
    const newSections = [...globalScript.sections];
    newSections[idx].script = text;
    updateState('script', { ...globalScript, sections: newSections });
  };

  const updateSectionPrompt = (idx, prompt) => {
    const newSections = [...globalScript.sections];
    newSections[idx].image_prompt = prompt;
    updateState('script', { ...globalScript, sections: newSections });
  };

  const selectTitle = (titleText) => {
    updateState('script', { ...globalScript, final_title: titleText });
    updateState('metadata', { ...globalState.metadata, title: titleText });
  };

  const selectThumbnail = (thumbText) => {
    updateState('script', { ...globalScript, final_thumbnail_copy: thumbText });
    updateState('media', { ...globalState.media, selectedThumbnailCopy: thumbText });
  };

  if (!hasResults && currentStep === 0) {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <FileText size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>대본 자동 생성</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', textAlign: 'center' }}>
          기획 및 벤치마킹된 데이터를 바탕으로<br/>전문적이고 타겟에 맞는 대본을 생성합니다.
        </p>
        <button className="btn-primary" onClick={generateAll}>
          <Play fill="white" size={18} /> 대본 생성 시작하기
        </button>
        {error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}
        <button className="btn-secondary" onClick={onNext} style={{ marginTop: '1rem', opacity: 0.7 }}>
          건너뛰고 미디어 생성 →
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
          🎣 시선을 끄는 훅 (Hook)
        </h3>
        <p style={{ fontSize: '1.125rem', fontWeight: 600, padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
          "{globalScript.hook}"
        </p>
        {globalScript.bridge && <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>브릿지: {globalScript.bridge}</p>}
        
        <div style={{ marginTop: '1rem' }}>
          <button onClick={() => setShowHookCot(!showHookCot)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            [CoT 사유 과정 {showHookCot ? '접기 ▲' : '보기 ▼'}]
          </button>
          {showHookCot && (
            <div style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {globalScript.cot_log || '기록 없음'}
            </div>
          )}
        </div>
      </div>

      {/* 오프닝 이미지 프롬프트 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', backgroundColor: '#f0f9ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🎬 오프닝 이미지
          </h3>
          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setShowIntroPrompt(!showIntroPrompt)}>
            <ImageIcon size={14}/> {showIntroPrompt ? '프롬프트 닫기' : '프롬프트 보기'}
          </button>
        </div>
        {showIntroPrompt && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>오프닝 이미지 생성 프롬프트</label>
              <button onClick={() => copyPrompt(globalScript.intro_image_prompt || '', 'intro')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: copiedId === 'intro' ? '#16a34a' : 'var(--primary)', padding: '0.125rem 0.25rem' }}>
                {copiedId === 'intro' ? <><Check size={13}/> 복사됨</> : <><Copy size={13}/> 복사</>}
              </button>
            </div>
            <textarea
              className="form-control"
              style={{ minHeight: '80px', fontSize: '0.8125rem', lineHeight: '1.5' }}
              value={globalScript.intro_image_prompt || ''}
              onChange={(e) => updateState('script', { ...globalScript, intro_image_prompt: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* 섹션 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📝 본문 섹션
        </h3>
        {globalScript.sections?.map((sec, idx) => (
          <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{sec.title}</span>
                <span className="status-badge" style={{ backgroundColor: 'var(--gray-200)' }}>⏱ {sec.duration_sec}초</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setOpenPromptIdx(openPromptIdx === idx ? null : idx)}>
                  <ImageIcon size={14}/> {openPromptIdx === idx ? '프롬프트 닫기' : '프롬프트 보기'}
                </button>
              </div>
            </div>
            {openPromptIdx === idx && (
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>이미지 생성 프롬프트</label>
                  <button onClick={() => copyPrompt(sec.image_prompt || '', `section_${idx}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: copiedId === `section_${idx}` ? '#16a34a' : 'var(--primary)', padding: '0.125rem 0.25rem' }}>
                    {copiedId === `section_${idx}` ? <><Check size={13}/> 복사됨</> : <><Copy size={13}/> 복사</>}
                  </button>
                </div>
                <textarea
                  className="form-control"
                  style={{ minHeight: '80px', fontSize: '0.8125rem', lineHeight: '1.5' }}
                  value={sec.image_prompt || ''}
                  onChange={(e) => updateSectionPrompt(idx, e.target.value)}
                />
              </div>
            )}
            <textarea
              className="form-control"
              style={{ minHeight: '120px', lineHeight: '1.6' }}
              value={sec.script}
              onChange={(e) => updateSectionText(idx, e.target.value)}
            />
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <strong>핵심 메시지:</strong> {sec.key_message}
            </div>
          </div>
        ))}
        {globalScript.cta && (
          <div style={{ border: '1px dashed var(--primary)', borderRadius: 'var(--radius-md)', padding: '1.5rem', backgroundColor: 'var(--secondary)' }}>
            <h4 style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)' }}>CTA 및 아웃트로</h4>
            <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{globalScript.cta.text}</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>📢 전자책 연계: {globalScript.cta.ebook_mention}</p>
          </div>
        )}
      </div>

      {/* 엔딩 이미지 프롬프트 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', backgroundColor: '#f0f9ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🎬 엔딩 이미지
          </h3>
          <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setShowOutroPrompt(!showOutroPrompt)}>
            <ImageIcon size={14}/> {showOutroPrompt ? '프롬프트 닫기' : '프롬프트 보기'}
          </button>
        </div>
        {showOutroPrompt && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>엔딩 이미지 생성 프롬프트</label>
              <button onClick={() => copyPrompt(globalScript.outro_image_prompt || '', 'outro')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: copiedId === 'outro' ? '#16a34a' : 'var(--primary)', padding: '0.125rem 0.25rem' }}>
                {copiedId === 'outro' ? <><Check size={13}/> 복사됨</> : <><Copy size={13}/> 복사</>}
              </button>
            </div>
            <textarea
              className="form-control"
              style={{ minHeight: '80px', fontSize: '0.8125rem', lineHeight: '1.5' }}
              value={globalScript.outro_image_prompt || ''}
              onChange={(e) => updateState('script', { ...globalScript, outro_image_prompt: e.target.value })}
            />
          </div>
        )}
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
                        <span className="status-badge success">💯 {t.score}점</span>
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
                        <span className="status-badge success">💯 {t.score}점</span>
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
          확정 후 미디어 생성 <ArrowRight size={20} />
        </button>
      </div>

    </div>
  );
}

// --- API Helpers ---

// Stream fetching handler matching Anthropic Docs
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
      max_tokens: 8000,
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
    buffer = lines.pop(); // keep the last incomplete line

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
