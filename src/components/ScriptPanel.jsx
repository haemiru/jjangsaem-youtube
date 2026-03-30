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

    const isShorts = plan.format.startsWith('쇼츠');

    try {
      // ===== STEP 1: HOOK =====
      setStreamText('=== [1/3] 훅(Hook) 기획 및 작성 중 ===\n\n');

      const hookPrompt = isShorts
        ? `다음 정보를 바탕으로 유튜브 쇼츠의 훅(Hook)을 기획해줘.

[영상 정보]
주제: ${plan.topic}
포맷: ${plan.format}
대상: ${plan.targets.join(', ')}
톤: ${plan.tone}
연관 전자책: ${plan.ebookName}
전자책 요약본: ${plan.ebookSummary || '(없음)'}
벤치마킹 감정 트리거: ${benchmark.titleFormulas?.triggerWords?.join(', ') || '없음'}

[쇼츠 영상 구조 — 4단계]
❶ Hook — 공포 또는 궁금증 유발 (첫 1~2초)
❷ 설명 — 핵심 내용 빠르게 전달
❸ 핵심 — 신경계/뇌과학 기반 핵심 포인트 1가지
❹ CTA — "이건 꼭 부모님이 알아야 합니다" + 저장/공유 유도

아래 순서대로 생각한 뒤 기획해:
1. 시청자(부모) 감정 상태 분석
2. 가장 강한 감정 레버 파악
3. 훅 유형 선택 (공감형/충격형/숫자형/궁금증형/손실형)
4. 훅 초안 3개 작성 (각기 다른 유형, 100점 채점)
5. 최고점 훅 선정

JSON으로 출력:
{
  "cot_log": "위 사고 과정 전체 요약",
  "hook_candidates": [
    { "type": "유형", "text": "훅 문장", "score": 95, "reason": "한줄평" }
  ],
  "final_hook": { "text": "최종 선택된 훅", "score": 98 },
  "empathy": "",
  "twist": ""
}
JSON만 출력.`
        : `다음 정보를 바탕으로 유튜브 영상의 훅(Hook)과 공감·반전 문장을 기획해줘.

[영상 정보]
주제: ${plan.topic}
포맷: ${plan.format}
대상: ${plan.targets.join(', ')}
톤: ${plan.tone}
연관 전자책: ${plan.ebookName}
전자책 요약본: ${plan.ebookSummary || '(없음)'}
벤치마킹 감정 트리거: ${benchmark.titleFormulas?.triggerWords?.join(', ') || '없음'}

[바이럴 영상 공식 — 6단계 구조]
❶ Hook (3초) — 공포 또는 궁금증 유발
❷ 공감 — 부모 마음을 잡는 공감 문장 (예: "많은 부모님들이 괜찮다고 생각하지만...")
❸ 반전 — 행동이 아니라 뇌/신경계 문제라는 관점 전환 (예: "문제는 행동이 아니라 뇌 상태입니다")
❹ 핵심 설명 — 신경계/뇌과학 기반 설명
❺ 해결책 — 바로 따라할 수 있는 실용 솔루션
❻ CTA — 저장/공유 유도 + 구독 유도

아래 순서대로 생각한 뒤 기획해:
1. 시청자(부모) 감정 상태 분석 — 이 주제를 검색하는 부모의 심리
2. 가장 강한 감정 레버 파악
3. 훅 유형 선택 (공감형/충격형/숫자형/궁금증형/손실형)
4. 훅 초안 3개 작성 (각기 다른 유형, 100점 채점)
5. 최고점 훅 선정
6. 공감 문장 작성 — 부모가 "맞아, 우리 아이도..."라고 느낄 문장
7. 반전 문장 작성 — "사실 이건 행동이 아니라 신경계/뇌 문제"라는 관점 전환

JSON으로 출력:
{
  "cot_log": "위 사고 과정 전체 요약 (시청자 분석, 감정 레버, 채점 근거 등)",
  "hook_candidates": [
    { "type": "유형", "text": "훅 문장", "score": 95, "reason": "한줄평" }
  ],
  "final_hook": { "text": "최종 선택된 훅", "score": 98 },
  "empathy": "공감 문장",
  "twist": "반전 문장"
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

      // Format-specific length guide (Google TTS 기준: 한국어 약 250자 = 1분)
      const lengthGuide = (() => {
        const f = plan.format;
        if (f === '쇼츠 15~30초') return { rows: '4~8', chars: '100~120', time: '15~30초' };
        if (f === '쇼츠 60초') return { rows: '8~14', chars: '200~250', time: '50~60초' };
        if (f === '일반 4~5분') return { rows: '25~35', chars: '1000~1250', time: '4~5분' };
        if (f === '일반 8~10분') return { rows: '45~60', chars: '2000~2500', time: '8~10분' };
        if (f === '일반 10분 이상') return { rows: '60~80', chars: '2500~3500', time: '10분 이상' };
        return { rows: '25~40', chars: '1000~2000', time: '5~10분' };
      })();

      const structureGuide = isShorts
        ? `[쇼츠 4단계 구조 — 반드시 이 순서대로 작성]
❶ hook — 훅 (첫 1~2초, 공포 또는 궁금증 유발)
❷ explain — 설명 (핵심 내용 빠르게 전달)
❸ core — 핵심 포인트 (신경계/뇌과학 기반 핵심 1가지)
❹ cta — CTA ("이건 꼭 부모님이 알아야 합니다" + 저장/공유 유도)

section 배분:
   - hook: 1개 row
   - explain: 1~${plan.format === '쇼츠 60초' ? '4' : '2'}개 row
   - core: 1~${plan.format === '쇼츠 60초' ? '4' : '2'}개 row
   - cta: 1개 row`
        : `[6단계 바이럴 영상 구조 — 반드시 이 순서대로 작성]
❶ hook — 훅 (3초, 공포 또는 궁금증 유발)
❷ empathy — 공감 (부모 마음을 잡는 공감, "많은 부모님들이 괜찮다고 생각하지만...")
❸ twist — 반전 (행동→뇌/신경계로 관점 전환, "문제는 행동이 아니라 뇌 상태입니다")
❹ core — 핵심 설명 (신경계/뇌과학 근거의 쉬운 설명, 그림처럼 설명)
❺ solution — 해결책 (BEFORE→AFTER, 바로 따라할 수 있게)
❻ cta — CTA (저장/공유 유도 + 구독 유도, "이건 꼭 부모님이 알아야 합니다")

section 배분 가이드:
   - hook: 1~2개 row
   - empathy: 2~4개 row
   - twist: 1~3개 row
   - core: 가장 많은 비중 (전체의 약 35%)
   - solution: 전체의 약 25%
   - cta: 1~3개 row`;

      const rowsPrompt = `위에서 기획한 요소를 이어받아, 전체 대본을 작성해줘.

[기획된 요소]
훅: ${hookResult.final_hook.text}
${!isShorts ? `공감: ${hookResult.empathy}\n반전: ${hookResult.twist}` : ''}

포맷: ${plan.format}
연계 전자책: ${plan.ebookName} (영상 마지막에 자연스럽게 연결)

${structureGuide}

[분량 기준 — 매우 중요! 반드시 지켜야 합니다]
- 목표 영상 길이: ${lengthGuide.time}
- row 수: ${lengthGuide.rows}개
- 전체 대본 총 글자 수: ${lengthGuide.chars}자
- Google TTS 한국어 기준 약 250자 = 1분입니다. 이 기준에 맞춰 분량을 조절하세요.
- 반드시 총 글자 수 기준을 지켜주세요. 너무 짧으면 안 됩니다.

[스타일 가이드]
- 이 영상은 특정 캐릭터를 활용한 화이트보드 애니메이션 스타일입니다.
- ${charDesc}
- 모든 이미지는 흰색 배경 위에 캐릭터와 간단한 텍스트/아이콘으로 구성됩니다.
- Nick Invests 채널처럼 깔끔하고 미니멀한 교육 콘텐츠 스타일입니다.

[알고리즘 핵심 전략]
- 첫 3초 = 공포 or 궁금증
- 중간 = 반전 (행동 → 뇌)
- 끝 = 저장/공유 유도

[출력 규칙]
1. 대본을 1~2문장 단위로 끊어서 rows 배열에 넣어줘 (총 ${lengthGuide.rows}개 row)
2. 각 row에 section 필드를 반드시 포함 — 값은 ${isShorts ? '"hook", "explain", "core", "cta"' : '"hook", "empathy", "twist", "core", "solution", "cta"'} 중 하나
3. 각 row의 image_prompt: 해당 문장을 시각화하는 이미지 생성 프롬프트 (영어로 작성)
   - 반드시 "white background" 포함
   - 캐릭터가 등장하며 해당 내용을 설명하는 포즈/표정
   - 이미지 안에 표시할 텍스트는 한글을 그대로 포함 (예: text reading "수면 훈련")
   - 이미지 안의 텍스트는 화면 상단~중앙(위쪽 70%)에 배치 — 하단 30%는 영상 자막이 들어가므로 텍스트가 겹치지 않도록 할 것
4. 각 row의 video_prompt: 해당 이미지를 5초 영상으로 만들기 위한 영상 생성 프롬프트 (영어로 작성)
   - 카메라 움직임, 캐릭터 애니메이션, 텍스트 등장 효과 등 포함

JSON 출력:
{
  "rows": [
    {
      "section": "hook",
      "script": "대본 문장 (한국어)",
      "image_prompt": "White background, character standing in ... pose ... (영어)",
      "video_prompt": "Camera slowly zooms in on character ... (영어)"
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

      const titlePrompt = `완성된 대본을 바탕으로 제목 후보${isShorts ? '' : '와 썸네일 문구'}를 만들어줘.

[대본 요약] ${rowsResult.rows?.slice(0, 5).map(r => r.script).join(' ')}
[벤치마킹 제목 공식] ${JSON.stringify(benchmark?.titleFormulas?.formulas || [])}
[핵심 태그] ${(benchmark?.tagPool || []).slice(0, 10).join(', ')}
[포맷] ${plan.format}
${isShorts ? '' : `
[검증된 고CTR 썸네일 문구 레퍼런스 — 이 패턴을 참고해 주제에 맞게 변형/조합할 것]
🔥 불안 자극형 (클릭 유도 최강):
1. 이거… 괜찮은 걸까요?
2. 이 행동, 위험 신호입니다
3. 그냥 두면 늦습니다
4. 많은 부모가 놓칩니다
5. 정상처럼 보여도 아닙니다
6. 지금 놓치면 늦어요
7. 대부분 모르고 지나갑니다
8. 이건 기다리면 안됩니다

🧠 전문가 포지셔닝형:
9. 문제는 행동이 아닙니다
10. 아이 뇌 상태입니다
11. 신경계가 무너진 신호
12. 미주신경이 닫혔습니다
13. 발달이 멈춘 이유
14. 뇌가 멈춘 상태입니다
15. 연결이 끊어진 신호
16. 과부하 상태입니다

⚡ 구분/판별형:
17. 정상 vs 위험 차이
18. 자폐 vs 정상 구분법
19. 괜찮은 경우 vs 개입 필요
20. 기다려도 되는 아이 vs 아닌 아이
21. 단순 행동 vs 위험 신호
22. 멍함 vs freeze 차이

👶 부모 공감형:
23. 우리 아이도 이랬어요?
24. 혹시 이런 모습 보이나요?
25. 이 행동, 많이 보셨죠?
26. 부모라면 꼭 보세요
27. 이건 꼭 알아야 합니다

🔥 솔루션 유도형:
28. 이 3가지만 보세요
29. 지금 바로 확인하세요
30. 5분이면 바뀝니다
`}
아래 JSON 형식으로만 바로 출력해. thinking 태그 쓰지 마.
{
  "title_cot_log": "제목 선정 근거 2~3문장",
  "title_candidates": [
    { "text": "제목", "score": 90, "reason": "한줄평" }
  ],
  "final_title": "최종 추천 제목"${isShorts ? '' : `,
  "thumbnail_cot_log": "썸네일 선정 근거 + 어떤 레퍼런스 패턴을 참고했는지 2~3문장",
  "thumbnail_candidates": [
    { "text": "문구", "score": 90, "reason": "참고한 레퍼런스 번호 + 한줄평" }
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
        empathy: hookResult.empathy,
        twist: hookResult.twist,
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

  const updateEmpathy = (text) => {
    updateState('script', { ...globalScript, empathy: text });
  };

  const updateTwist = (text) => {
    updateState('script', { ...globalScript, twist: text });
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

      {/* 훅·공감·반전 기획 카드 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', backgroundColor: 'var(--secondary)' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          6단계 바이럴 구조 기획
        </h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem', display: 'block' }}>❶ Hook (3초)</label>
          <textarea
            className="form-control"
            style={{ fontSize: '1.125rem', fontWeight: 600, minHeight: '70px', lineHeight: '1.6', backgroundColor: 'var(--surface)' }}
            value={globalScript.hook}
            onChange={(e) => updateHook(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#2563eb', marginBottom: '0.25rem', display: 'block' }}>❷ 공감</label>
          <textarea
            className="form-control"
            style={{ minHeight: '60px', lineHeight: '1.6', fontSize: '0.9375rem', backgroundColor: 'var(--surface)' }}
            value={globalScript.empathy || ''}
            onChange={(e) => updateEmpathy(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem', display: 'block' }}>❸ 반전</label>
          <textarea
            className="form-control"
            style={{ minHeight: '60px', lineHeight: '1.6', fontSize: '0.9375rem', backgroundColor: 'var(--surface)' }}
            value={globalScript.twist || ''}
            onChange={(e) => updateTwist(e.target.value)}
          />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
          ❹ 핵심 설명 → ❺ 해결책 → ❻ CTA 는 아래 대본 테이블에서 확인
        </div>
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
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '4%', whiteSpace: 'nowrap' }}>#</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '9%', whiteSpace: 'nowrap' }}>구간</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '32%' }}>대본</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '27.5%' }}>이미지 프롬프트</th>
                <th style={{ padding: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'left', width: '27.5%' }}>영상 프롬프트</th>
              </tr>
            </thead>
            <tbody>
              {globalScript.rows?.map((row, idx) => {
                const sectionLabels = {
                  hook: { text: '❶ Hook', color: '#ea580c' },
                  empathy: { text: '❷ 공감', color: '#2563eb' },
                  twist: { text: '❸ 반전', color: '#dc2626' },
                  explain: { text: '❷ 설명', color: '#2563eb' },
                  core: { text: plan.format.startsWith('쇼츠') ? '❸ 핵심' : '❹ 핵심', color: '#7c3aed' },
                  solution: { text: '❺ 해결', color: '#059669' },
                  cta: { text: plan.format.startsWith('쇼츠') ? '❹ CTA' : '❻ CTA', color: '#d97706' }
                };
                const sectionInfo = sectionLabels[row.section] || { text: row.section || '-', color: 'var(--text-muted)' };
                const prevSection = idx > 0 ? globalScript.rows[idx - 1]?.section : null;
                const isNewSection = row.section !== prevSection;
                return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top', borderTop: isNewSection && idx > 0 ? '2px solid var(--gray-300)' : undefined }}>
                  <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: sectionInfo.color, backgroundColor: sectionInfo.color + '15', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      {sectionInfo.text}
                    </span>
                  </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TTS Style Instructions */}
      {(() => {
        const ttsStyles = {
          '따뜻한': 'Speak in a warm, gentle, and empathetic tone, like a caring mother talking to worried parents. Soft and reassuring voice, moderate pace, with natural emotional pauses.',
          '전문적': 'Speak in a calm, confident, and authoritative tone, like a pediatric neurologist explaining to parents. Clear articulation, steady pace, professional but approachable.',
          '교육적': 'Speak in a friendly and clear instructional tone, like a kind teacher explaining step by step. Bright and encouraging voice, slightly slower pace for clarity.'
        };
        const styleText = ttsStyles[plan.tone] || ttsStyles['전문적'];
        return (
          <div style={{ border: '1px solid #3b82f6', borderRadius: 'var(--radius-md)', padding: '1.25rem', backgroundColor: '#eff6ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', margin: 0, color: '#1d4ed8' }}>
                Google TTS Style Instructions ({plan.tone})
              </h3>
              <button
                className="btn-primary"
                style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                onClick={() => copyText(styleText, 'tts_style')}
              >
                {copiedId === 'tts_style' ? <><Check size={14}/> 복사됨</> : <><Copy size={14}/> 복사</>}
              </button>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontFamily: 'monospace', lineHeight: '1.6', color: '#374151' }}>
              {styleText}
            </div>
          </div>
        );
      })()}

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
  const systemPrompt = `당신은 키즈피지오 유튜브 채널의 콘텐츠 전문가입니다.

[채널 컨셉]
"아이 행동을 고치는 채널이 아니라, 아이의 '신경계'를 이해하는 채널"

[브랜드 핵심 메시지]
- "문제 행동이 아니라 신경계 상태입니다"
- "발달은 훈련이 아니라 안정 위에 만들어집니다"
- "아이를 바꾸지 말고, 신경계를 바꾸세요"

[채널 슬로건]
"아이의 행동을 고치지 마세요. 뇌를 이해하면 행동은 바뀝니다"

[차별점]
다른 채널은 '행동 설명'에 그치지만, 이 채널은 '신경계 설명 + 해결'까지 제시합니다.
부모는 행동을 보고, 전문가는 신경계를 봅니다.

[어조]
발달장애 아동 및 가족을 위한 뇌과학 근거 중심의 전문적이고 따뜻한 어조로 작성합니다.

반드시 유효한 JSON 형식으로 응답하세요. JSON 앞뒤에 불필요한 텍스트를 넣지 마세요.`;

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
