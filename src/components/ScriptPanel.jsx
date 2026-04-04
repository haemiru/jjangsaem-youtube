import React, { useState, useEffect, useRef } from 'react';
import { FileText, Play, CheckCircle2, ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw, Type, Loader2, ArrowRight, Copy, Check } from 'lucide-react';

export default function ScriptPanel({ globalState, updateState, onNext }) {
  const { plan, benchmark, settings, script: globalScript } = globalState;

  const [streamText, setStreamText] = useState('');
  const [currentStep, setCurrentStep] = useState(0); // 0: idle, 1: hook, 2: rows, 3: titles, 4: done
  const [error, setError] = useState('');

  const [showHookCot, setShowHookCot] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [ttsSpeedLabel, setTtsSpeedLabel] = useState('1x');
  const [mode, setMode] = useState(null); // null: not chosen, 'auto', 'manual'
  const [manualStep, setManualStep] = useState(1); // 1: hook, 2: rows, 3: titles
  const [manualInput, setManualInput] = useState('');
  const [manualHookResult, setManualHookResult] = useState(null);
  const [manualRowsResult, setManualRowsResult] = useState(null);
  const [manualError, setManualError] = useState('');

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

  // === Prompt Builders (shared by auto & manual modes) ===
  const isShorts = plan.format.startsWith('쇼츠');

  const charDesc = plan.characterDescription
    ? `캐릭터 설명: ${plan.characterDescription}`
    : '업로드된 캐릭터 이미지를 참고';

  const lengthGuide = (() => {
    const f = plan.format;
    if (f === '쇼츠 15~30초') return { rows: '8~16', chars: '300~500', time: '15~30초' };
    if (f === '쇼츠 60초') return { rows: '16~28', chars: '700~1000', time: '50~60초' };
    if (f === '일반 4~5분') return { rows: '60~80', chars: '3000~4000', time: '4~5분' };
    if (f === '일반 8~10분') return { rows: '100~140', chars: '6000~8000', time: '8~10분' };
    if (f === '일반 10분 이상') return { rows: '140~180', chars: '8000~11000', time: '10분 이상' };
    return { rows: '60~100', chars: '4000~6000', time: '5~10분' };
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

  const buildHookPrompt = () => {
    return isShorts
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
❷ 공감 — 부모 마음을 잡는 공감 문장
❸ 반전 — 행동이 아니라 뇌/신경계 문제라는 관점 전환
❹ 핵심 설명 — 신경계/뇌과학 기반 설명
❺ 해결책 — 바로 따라할 수 있는 실용 솔루션
❻ CTA — 저장/공유 유도 + 구독 유도

아래 순서대로 생각한 뒤 기획해:
1. 시청자(부모) 감정 상태 분석
2. 가장 강한 감정 레버 파악
3. 훅 유형 선택 (공감형/충격형/숫자형/궁금증형/손실형)
4. 훅 초안 3개 작성 (각기 다른 유형, 100점 채점)
5. 최고점 훅 선정
6. 공감 문장 작성 — 부모가 "맞아, 우리 아이도..."라고 느낄 문장
7. 반전 문장 작성 — "사실 이건 행동이 아니라 신경계/뇌 문제"라는 관점 전환

JSON으로 출력:
{
  "cot_log": "위 사고 과정 전체 요약",
  "hook_candidates": [
    { "type": "유형", "text": "훅 문장", "score": 95, "reason": "한줄평" }
  ],
  "final_hook": { "text": "최종 선택된 훅", "score": 98 },
  "empathy": "공감 문장",
  "twist": "반전 문장"
}
JSON만 출력.`;
  };

  const buildRowsPrompt = (hookResult) => {
    return `위에서 기획한 요소를 이어받아, 전체 대본을 작성해줘.

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
- 한국어 나레이션 기준 약 300자 = 1분입니다. 이 기준에 맞춰 분량을 조절하세요.
- 반드시 총 글자 수 기준을 지켜주세요. 목표 글자 수보다 적게 쓰면 안 됩니다. 최소 글자 수 이상 반드시 작성하세요.

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
3. 각 row의 image_prompt: Write in ENGLISH. A prompt to visualize the sentence as an image.
   - Must include "white background"
   - Character appears with pose/expression explaining the content
   - Include 1~2 SHORT Korean keyword text (한글 키워드) related to the topic as overlay text in the image. Text must be in Korean (한글), NEVER English.
   - Focus on character pose, expression, simple props/icons
   - Do NOT place any text in the bottom 20% of the frame (reserved for video subtitles). Characters and props can use the full frame freely.
4. 각 row의 video_prompt: Write in ENGLISH. A prompt to animate the image into a 5-second video.
   - Include camera movement, character animation, visual effects, etc.
   - Do NOT mention any text animation (text is added in post-production)

⚠️ 중요: image_prompt와 video_prompt 값은 반드시 영어로 작성. 단, 이미지에 포함할 한글 키워드는 한글 그대로 프롬프트에 포함할 것. 영어 텍스트 절대 금지.

JSON 출력:
{
  "rows": [
    {
      "section": "hook",
      "script": "대본 문장 (한국어)",
      "image_prompt": "White background, cartoon character standing with surprised expression, small question mark icon floating above head, minimal clean layout, Korean text '위험 신호' displayed prominently in upper area, no English text",
      "video_prompt": "Camera slowly zooms into character, question mark icon bounces, character's eyes widen"
    }
  ],
  "full_script": "전체 대본을 이어붙인 텍스트 (복사용)"
}
JSON만 출력.`;
  };

  const buildTitlePrompt = (rowsResult) => {
    return `완성된 대본을 바탕으로 제목 후보${isShorts ? '' : ', 썸네일 문구, 썸네일 이미지 프롬프트'}를 만들어줘.

[대본 요약] ${rowsResult.rows?.slice(0, 5).map(r => r.script).join(' ')}
[벤치마킹 제목 공식] ${JSON.stringify(benchmark?.titleFormulas?.formulas || [])}
[핵심 태그] ${(benchmark?.tagPool || []).slice(0, 10).join(', ')}
[포맷] ${plan.format}
${isShorts ? '' : `
[검증된 고CTR 썸네일 문구 레퍼런스 — Nick Invests 스타일: 1~3단어 키워드형, 문장 금지, 임팩트 극대화]
🔥 충격/경고형: 위험 신호 / 늦었습니다 / 돌이킬 수 없다 / 놓치면 끝 / 이미 늦었다 / 절대 안됩니다
🧠 핵심 키워드형: 뇌가 멈췄다 / 신경계 붕괴 / 발달 정지 / 미주신경 차단 / 행동이 아니다
⚡ 대비/구분형: 정상 vs 위험 / 기다림 vs 방치 / 행동 vs 신호 / 진짜 vs 가짜
👶 직접 호소형: 꼭 보세요 / 확인하세요 / 이것만 보세요 / 부모 필수
🎯 숫자/솔루션형: 딱 3가지 / 5분 해결 / 1가지 원인 / 골든타임
⚠️ 규칙: 반드시 1~3단어, 굵은 글씨 시각화 기준, 설명하지 말고 키워드로 찍어라. "~입니다/~해요" 같은 종결어미 사용 금지.

[썸네일 이미지 프롬프트 가이드 — Nick Invests 스타일 참고]
Write 2 thumbnail image generation prompts in ENGLISH for A/B testing.
- Style: clean white background + cute cartoon/illustration character (whiteboard animation style)
- Character placed on left 30%, bold Korean keyword text (한글) displayed prominently in the right 70% area
- Include bold Korean keyword text (한글) prominently in the right 70% area. Text MUST be Korean (한글), NEVER English. No English text allowed.
- Character with emotion matching the topic (surprise, worry, joy, confidence, etc.)
- 1~2 simple props related to the topic (arrows, icons, etc.)
- Extremely minimal and clean design, high contrast
- Do NOT place text in bottom 20% (reserved for subtitles). Characters and props can fill the entire frame.
- Variant A: character + emotion focused
- Variant B: different pose/emotion + prop variation
- Prompt example: "YouTube thumbnail, 16:9 aspect ratio, pure white background, cute cartoon character with worried expression on left side, bold Korean text '뇌가 멈췄다' on right side, no English text..."
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
    { "text": "1~3단어 키워드 (문장 금지, 종결어미 금지, Nick Invests처럼 굵은 글씨로 박히는 임팩트 키워드)", "score": 90, "reason": "참고한 레퍼런스 패턴 + 한줄평" }
  ],
  "final_thumbnail_copy": "최종 추천 썸네일 키워드 (1~3단어, 문장 아닌 키워드)",
  "thumbnail_image_prompts": [
    { "variant": "A", "prompt": "YouTube thumbnail, 16:9 aspect ratio, clean pure white background, cute cartoon illustration character placed on left (30% of frame), character with [emotion] expression, bold Korean text '[한글 키워드]' displayed prominently on right side, simple minimal layout, whiteboard animation style, high contrast, [topic-related prop], no English text, no text in bottom 20%", "concept": "Character left + bold Korean keyword text right" },
    { "variant": "B", "prompt": "YouTube thumbnail, 16:9 aspect ratio, clean pure white background, cute cartoon illustration character placed on left with different pose, [different emotion] expression, bold Korean text '[한글 키워드]' on right side, topic-related simple props, minimal clean layout, whiteboard animation style, no English text, no text in bottom 20%", "concept": "Different pose/emotion + Korean keyword text" }
  ]`}
}
JSON만 출력. 다른 텍스트 절대 금지.`;
  };

  // === Manual mode: parse & save results ===
  const handleManualSubmit = () => {
    setManualError('');
    const parsed = parseJSON(manualInput);
    if (!parsed) {
      setManualError('JSON 파싱 실패. Claude의 응답에서 JSON 부분만 복사해서 붙여넣어 주세요.');
      return;
    }

    if (manualStep === 1) {
      // Hook result
      if (!parsed.final_hook) { setManualError('final_hook 필드가 없습니다.'); return; }
      setManualHookResult(parsed);
      setManualStep(2);
      setManualInput('');
    } else if (manualStep === 2) {
      // Rows result
      if (!parsed.rows) { setManualError('rows 필드가 없습니다.'); return; }
      setManualRowsResult(parsed);
      setManualStep(3);
      setManualInput('');
    } else if (manualStep === 3) {
      // Title result — save everything
      const fullScript = manualRowsResult.full_script || manualRowsResult.rows?.map(r => r.script).join('\n') || '';
      const finalState = {
        ...globalScript,
        cot_log: manualHookResult.cot_log,
        hook: manualHookResult.final_hook.text,
        empathy: manualHookResult.empathy,
        twist: manualHookResult.twist,
        rows: manualRowsResult.rows || [],
        full_script: fullScript,
        titleSuggestions: parsed.title_candidates || [],
        thumbnailCopies: parsed.thumbnail_candidates || [],
        thumbnailImagePrompts: parsed.thumbnail_image_prompts || [],
        final_title: parsed.final_title,
        final_thumbnail_copy: parsed.final_thumbnail_copy,
        final_hook: manualHookResult.final_hook
      };
      updateState('script', finalState);
      updateState('metadata', { ...globalState.metadata, title: parsed.final_title, description: fullScript.substring(0, 200) });
      updateState('media', { ...globalState.media, selectedThumbnailCopy: parsed.final_thumbnail_copy });
      setManualStep(4);
      setManualInput('');
    }
  };

  const getManualPrompt = () => {
    if (manualStep === 1) return buildHookPrompt();
    if (manualStep === 2) return buildRowsPrompt(manualHookResult);
    if (manualStep === 3) return buildTitlePrompt(manualRowsResult);
    return '';
  };

  const manualStepLabels = ['', '1/3: 훅(Hook) 기획', '2/3: 대본 본문 생성', '3/3: 제목 및 썸네일'];

  const generateAll = async () => {
    setError('');
    setCurrentStep(1);
    setStreamText('');

    let chatHistory = [];
    let hookResult = null;
    let rowsResult = null;
    let titleResult = null;

    try {
      // ===== STEP 1: HOOK =====
      setStreamText('=== [1/3] 훅(Hook) 기획 및 작성 중 ===\n\n');
      const hookPrompt = buildHookPrompt();

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

      const rowsPrompt = buildRowsPrompt(hookResult);

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

      const titlePrompt = buildTitlePrompt(rowsResult);

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
        thumbnailImagePrompts: titleResult.thumbnail_image_prompts || [],
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

  // === Manual mode UI ===
  if (mode === 'manual' && manualStep < 4 && !hasResults) {
    const prompt = getManualPrompt();
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="panel-title" style={{ margin: 0 }}>수동 모드 — {manualStepLabels[manualStep]}</h2>
          <button className="btn-secondary" onClick={() => { setMode(null); setManualStep(1); setManualHookResult(null); setManualRowsResult(null); setManualInput(''); setManualError(''); }}>
            모드 선택으로 돌아가기
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[1,2,3].map(s => (
            <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: s <= manualStep ? 'var(--primary)' : 'var(--gray-200)' }} />
          ))}
        </div>

        {/* Prompt to copy */}
        <div style={{ border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)', padding: '1.25rem', backgroundColor: 'var(--secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>아래 프롬프트를 복사하여 claude.ai에서 실행하세요</span>
            <button className="btn-primary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }} onClick={() => copyText(prompt, 'manual_prompt')}>
              {copiedId === 'manual_prompt' ? <><Check size={14}/> 복사됨</> : <><Copy size={14}/> 프롬프트 복사</>}
            </button>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'monospace', lineHeight: '1.5', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
            {prompt}
          </div>
        </div>

        {/* Paste result */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <label style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>Claude 응답 결과를 붙여넣기</label>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            claude.ai에서 나온 JSON 응답을 그대로 복사하여 아래에 붙여넣으세요.
          </p>
          <textarea
            className="form-control"
            style={{ minHeight: '200px', fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: '1.4' }}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder='{"cot_log": "...", "hook_candidates": [...], ...}'
          />
          {manualError && <div style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>{manualError}</div>}
          <button
            className="btn-primary"
            style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
          >
            {manualStep < 3 ? `결과 적용 → 다음 단계 (${manualStep + 1}/3)` : '결과 적용 → 대본 완성'}
          </button>
        </div>
      </div>
    );
  }

  if (!hasResults && currentStep === 0 && mode !== 'manual') {
    return (
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <FileText size={48} color="var(--gray-300)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>대본 생성</h2>

        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', width: '100%', maxWidth: '600px' }}>
          {/* Auto mode */}
          <div
            onClick={() => { setMode('auto'); }}
            style={{ flex: 1, padding: '1.5rem', border: '2px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <Play size={32} color="var(--primary)" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>자동 모드</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              API로 자동 생성<br/>
              <span style={{ fontSize: '0.75rem' }}>(Opus 기준 ~$2.2/영상)</span>
            </div>
          </div>

          {/* Manual mode */}
          <div
            onClick={() => { setMode('manual'); setManualStep(1); }}
            style={{ flex: 1, padding: '1.5rem', border: '2px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <Copy size={32} color="var(--primary)" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>수동 모드</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              프롬프트 복사 → claude.ai 실행 → 결과 붙여넣기<br/>
              <span style={{ fontSize: '0.75rem' }}>(API 비용 무료)</span>
            </div>
          </div>
        </div>

        {mode === 'auto' && (
          <>
            <button className="btn-primary" onClick={generateAll}>
              <Play fill="white" size={18} /> 대본 자동 생성 시작하기
            </button>
            {error && <div style={{ color: 'red', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>{error}</div>}
          </>
        )}

        <button className="btn-secondary" onClick={onNext} style={{ marginTop: '1rem', opacity: 0.7 }}>
          건너뛰고 미디어 단계 →
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
        const speedInstructions = {
          '1x': '',
          '1.2x': ' Speak at a slightly faster pace than normal, about 1.2x speed.',
          '1.5x': ' Speak at a noticeably faster pace, about 1.5x speed. Keep clarity while increasing tempo.',
          '2x': ' Speak at a very fast pace, about 2x speed. Maintain clear pronunciation despite the rapid delivery.'
        };
        const baseStyle = ttsStyles[plan.tone] || ttsStyles['전문적'];
        const styleText = baseStyle + (speedInstructions[ttsSpeedLabel] || '');
        const speedOptions = ['1x', '1.2x', '1.5x', '2x'];
        return (
          <div style={{ border: '1px solid #3b82f6', borderRadius: 'var(--radius-md)', padding: '1.25rem', backgroundColor: '#eff6ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', margin: 0, color: '#1d4ed8' }}>
                Google TTS Style Instructions ({plan.tone})
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {speedOptions.map(speed => (
                    <button
                      key={speed}
                      onClick={() => setTtsSpeedLabel(speed)}
                      style={{
                        padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
                        border: ttsSpeedLabel === speed ? '2px solid #1d4ed8' : '1px solid #93c5fd',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        backgroundColor: ttsSpeedLabel === speed ? '#1d4ed8' : 'white',
                        color: ttsSpeedLabel === speed ? 'white' : '#1d4ed8',
                      }}
                    >
                      {speed}
                    </button>
                  ))}
                </div>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                  onClick={() => copyText(styleText, 'tts_style')}
                >
                  {copiedId === 'tts_style' ? <><Check size={14}/> 복사됨</> : <><Copy size={14}/> 복사</>}
                </button>
              </div>
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

      {/* 썸네일 이미지 프롬프트 A/B */}
      {globalScript.thumbnailImagePrompts?.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem', marginBottom: '1rem' }}>
            <ImageIcon size={20} color="var(--primary)"/> 썸네일 이미지 프롬프트 (A/B)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {globalScript.thumbnailImagePrompts.map((tp, idx) => (
              <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, color: idx === 0 ? '#2563eb' : '#7c3aed' }}>
                    {tp.variant || (idx === 0 ? 'A' : 'B')}안 — {tp.concept}
                  </span>
                  <button
                    className="btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => copyText(tp.prompt, `thumb_img_${idx}`)}
                  >
                    {copiedId === `thumb_img_${idx}` ? <><Check size={12}/> 복사됨</> : <><Copy size={12}/> 복사</>}
                  </button>
                </div>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontFamily: 'monospace', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {tp.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className="btn-primary" onClick={onNext}>
          확정 후 미디어 단계 <ArrowRight size={20} />
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
