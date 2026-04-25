import React, { useState, useEffect } from 'react';
import { ArrowRight, Loader2, CheckCircle2, Circle, PlayCircle, BookOpen, Search } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

import { fetchWithRetry } from '../utils/fetchWithRetry';

const JJANGSAEM_BOOKSTORE_URL = 'https://jjangsaem.com';

export default function PlanPanel({ globalState, updateState, onNext }) {
  const data = globalState.plan;
  const seriesPlan = globalState.seriesPlan;
  const mode = data.mode || 'ebook';
  const [localFile, setLocalFile] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingSeries, setIsGeneratingSeries] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [seriesError, setSeriesError] = useState('');
  const [topicSeed, setTopicSeed] = useState('');

  // 외부에서 plan.topic이 채워져 들어온 경우(주제 검색→새 프로젝트, 저장된 프로젝트 로드 등)
  // 비어있는 topicSeed에 한해 동기화. 사용자가 입력 중인 값은 덮어쓰지 않음.
  useEffect(() => {
    if (mode === 'topic' && data.topic) {
      setTopicSeed(prev => prev || data.topic);
    }
  }, [data.topic, mode]);

  const handleChange = (key, value) => {
    updateState('plan', { ...data, [key]: value });
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    const next = { ...data, mode: nextMode };
    if (nextMode === 'topic') {
      next.ebookUrl = JJANGSAEM_BOOKSTORE_URL;
      next.ebookName = '';
      next.ebookSummary = '';
      setLocalFile(null);
    } else {
      if (data.ebookUrl === JJANGSAEM_BOOKSTORE_URL) {
        next.ebookUrl = '';
      }
    }
    updateState('plan', next);
    updateState('seriesPlan', { ebookName: '', items: [] });
    setSeriesError('');
    setSummaryError('');
  };

  const handleTargetToggle = (target) => {
    const newTargets = data.targets.includes(target)
      ? data.targets.filter(t => t !== target)
      : [...data.targets, target];
    handleChange('targets', newTargets);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setLocalFile(file);
      // Batch update to avoid stale closure overwrite
      updateState('plan', { ...data, ebookName: file.name, ebookSummary: '' });
      setSummaryError('');
      // Reset series plan when new ebook uploaded
      updateState('seriesPlan', { ebookName: '', items: [] });
    }
  };

  const extractPdfText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  // Generate series plan from topic (research-based, no ebook)
  const generateSeriesPlanFromTopic = async () => {
    const seed = (topicSeed || '').trim();
    if (!seed) {
      setSeriesError('주제를 입력해주세요.');
      return;
    }

    setIsGeneratingSeries(true);
    setSeriesError('');

    try {
      const prompt = `다음은 유튜브 채널 "키즈피지오"에서 다룰 주제입니다.
이 주제에 관한 최신 학술 연구(논문), 교과서, 전문 서적의 지식을 동원하여, 롱폼 1개(주제와 100% 일치) + 쇼츠 시리즈 3개(같은 주제의 세부 포인트)를 기획해주세요.

[주제]
${seed}

[채널 컨셉]
"아이 행동을 고치는 채널이 아니라, 아이의 '신경계'를 이해하는 채널"
차별점: 다른 채널은 행동 설명에 그치지만, 이 채널은 신경계 설명 + 해결까지 제시

[이번 기획의 특수성 — 마스터 롱폼 1 + 쇼츠 시리즈 3]
- 롱폼 1개는 입력 주제 문장을 그대로 다루는 "마스터 영상". 주제를 다른 각도로 쪼개거나 변형/확장하지 마세요. 입력 주제의 키워드·범위를 1mm도 벗어나지 않습니다.
- 쇼츠 3개는 같은 주제의 "세부 포인트" 3가지를 각각 짧게 잘라낸 시리즈. 주제 범위 안에서 서로 다른 사실/팁/오해/연구결과/체크포인트 중 3가지를 골라 독립적으로 다룹니다. 주제를 벗어난 새로운 토픽은 금지.
- 영상 하단 CTA에서는 "짱샘의 책방(jjangsaem.com)"으로 더 깊은 자료를 안내할 예정이니, "영상으로 큰 그림 → 책방에서 심화"가 자연스럽게 이어지도록 설계하세요.

[목표]
- 롱폼: 이 한 편으로 해당 주제의 핵심 그림을 전달
- 쇼츠: 같은 주제의 짧고 강한 포인트 3개로 알고리즘 노출 + 롱폼/책방 유입
- 더 깊이 알고 싶으면 짱샘의 책방을 찾도록 자연스럽게 유도

[요청 — 반드시 정확히 4개만 생성 (롱폼 1 + 쇼츠 3)]
★ 롱폼 영상 (일반 8~10분) 1개 — 주제와 100% 일치하는 단일 마스터 콘텐츠
  - format 값은 반드시 "일반 8~10분"

★ 쇼츠 (15~30초) 3개 — 같은 주제 안의 서로 다른 세부 포인트 3개
  - format 값은 반드시 "쇼츠 15~30초"
  - 3개는 서로 다른 각도(예: ① 흔한 오해 깨기 / ② 한 줄 실천 팁 / ③ 뜻밖의 연구 결과 / ④ 짧은 체크리스트 중 3가지)
  - 모두 입력 주제 범위 안에서만. 새로운 주제 확장 금지.

총 4개 항목. items 배열 길이는 반드시 4 (롱폼 1 + 쇼츠 3).

[focus 필드 작성 가이드]
- focus는 해당 영상이 참고할 구체적 학술 범위(이론명, 연구 분야, 핵심 개념, 저자)를 명시합니다.
- 롱폼 focus에는 입력 주제 문장의 모든 핵심 키워드를 그대로 포함.
- 쇼츠 focus에는 그 쇼츠가 다루는 구체 사실/연구/포인트만 명시.
- 나중에 대본 작성 시 이 범위 밖의 내용은 사용하지 않습니다.

제목은 입력 주제 범위 안에서 유튜브 클릭을 유발하는 형태로.

JSON으로 출력:
{
  "items": [
    { "title": "롱폼 제목 — 입력 주제와 100% 일치", "format": "일반 8~10분", "focus": "참고할 학술 범위 — 이론명/저자/연구 분야 구체적으로 + 입력 주제의 모든 키워드 포함", "desc": "이 영상에서 다룰 핵심 내용 1줄 요약 — 입력 주제 그대로" },
    { "title": "쇼츠 1 제목", "format": "쇼츠 15~30초", "focus": "이 쇼츠가 참고할 구체적 사실/연구", "desc": "핵심 포인트 1줄" },
    { "title": "쇼츠 2 제목", "format": "쇼츠 15~30초", "focus": "이 쇼츠가 참고할 구체적 사실/연구", "desc": "핵심 포인트 1줄" },
    { "title": "쇼츠 3 제목", "format": "쇼츠 15~30초", "focus": "이 쇼츠가 참고할 구체적 사실/연구", "desc": "핵심 포인트 1줄" }
  ]
}
JSON만 출력. items 배열 길이는 반드시 4 (롱폼 1 + 쇼츠 3).`;

      const res = await fetchWithRetry('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: data.model || "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!res.ok) throw new Error('시리즈 생성 API 호출 실패');
      const apiData = await res.json();
      const text = apiData.content[0].text;

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 파싱 실패');
      const parsed = JSON.parse(match[0]);

      const items = (parsed.items || []).map(item => ({
        ...item,
        status: 'pending'
      }));

      updateState('plan', { ...data, mode: 'topic', ebookName: `주제: ${seed}`, ebookUrl: JJANGSAEM_BOOKSTORE_URL });
      updateState('seriesPlan', { ebookName: `주제: ${seed}`, items });

    } catch (err) {
      console.error(err);
      setSeriesError('시리즈 생성 중 오류: ' + err.message);
    } finally {
      setIsGeneratingSeries(false);
    }
  };

  // Summarize topic knowledge for current video focus (research-based)
  const summarizeKnowledgeForTopic = async (topic, focus = '') => {
    setIsSummarizing(true);
    setSummaryError('');

    try {
      const focusBlock = focus
        ? `\n[이 영상이 집중할 학술 범위]\n${focus}\n`
        : '';

      const prompt = `다음 주제에 관한 최신 학술 연구(논문), 교과서, 전문 서적의 지식을 종합하여, 유튜브 대본 작성에 필요한 핵심 정보를 정리해주세요.

[영상 주제]
${topic}
${focusBlock}
요구사항:
- 위 "집중 범위"를 벗어나는 일반론은 넣지 말고, 지정된 범위에 해당하는 구체 내용만 깊이 있게 정리하세요.
- 가능하면 구체적 연구자 이름, 이론명, 주요 개념, 수치/통계, 임상 사례 등을 포함해주세요.
- 부모·비전문가가 이해할 수 있는 수준의 쉬운 설명도 함께 준비해주세요.
- 1000자 이내로 압축.

(이 요약본은 이후 대본 작성 프롬프트로 전달됩니다.)`;

      const res = await fetchWithRetry('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!res.ok) throw new Error('Claude 요약 API 호출 실패');
      const apiData = await res.json();
      handleChange('ebookSummary', apiData.content[0].text);
    } catch (err) {
      console.error(err);
      setSummaryError('요약 중 오류: ' + err.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Generate series plan from ebook
  const generateSeriesPlan = async () => {
    if (!localFile) return;

    setIsGeneratingSeries(true);
    setSeriesError('');

    try {
      const pdfText = await extractPdfText(localFile);

      const prompt = `다음은 유튜브 채널 "키즈피지오"에서 홍보할 전자책의 내용입니다.
이 전자책을 기반으로 유튜브 영상 시리즈를 기획해주세요.

[채널 컨셉]
"아이 행동을 고치는 채널이 아니라, 아이의 '신경계'를 이해하는 채널"
차별점: 다른 채널은 행동 설명에 그치지만, 이 채널은 신경계 설명 + 해결까지 제시

[목표]
- 영상을 통해 전자책 내용의 가치를 보여주고, 전자책 구매로 이어지도록 유도
- 각 영상은 전자책의 핵심 내용 일부를 다루되, 전체를 알려면 전자책을 봐야 하도록 구성

[요청 — 반드시 두 종류 모두 생성할 것]
전자책 내용을 분석하여 아래 두 종류를 모두 생성해:

★ 롱폼 영상 (일반 8~10분) — 반드시 3개
  - 전자책을 3개의 큰 주제 덩어리로 나누어 각각 1개씩
  - format 값은 반드시 "일반 8~10분"

★ 쇼츠 (15~30초) — 반드시 5개
  - 전자책의 각기 다른 세부 포인트 5개
  - format 값은 반드시 "쇼츠 15~30초"

총 8개 항목. 롱폼 3개, 쇼츠 5개. 반드시 정확히 이 개수로 생성.

[가장 중요한 원칙 — 내용 중복 금지]
- 각 영상은 전자책의 "서로 다른 특정 부분"만 집중적으로 다뤄야 합니다.
- 1번 영상과 2번 영상이 같은 챕터/사례/노하우를 다루면 안 됩니다.
- 롱폼 3개는 책을 3등분하듯 각자 맡은 영역만 깊이 다루고, 다른 롱폼이 맡은 영역은 언급만 하고 건드리지 않습니다.
- 쇼츠 5개도 마찬가지로 서로 다른 포인트/팁/사례 하나씩만.
- 큰 맥락(채널/책 전체 주제)은 공유하되, 세부 내용은 반드시 포커싱된 영역에서만 끌어오세요.

각 항목에는 반드시 "focus" 필드를 포함하세요. 이 필드는 해당 영상이 집중할 책의 특정 범위(챕터명, 섹션, 사례, 핵심 개념)를 구체적으로 명시합니다. 나중에 대본 작성 시 이 범위 밖의 내용은 사용하지 않습니다.

각 제목은 유튜브에서 클릭을 유발하는 형태로.

[전자책 내용]
${pdfText.substring(0, 20000)}

JSON으로 출력:
{
  "items": [
    { "title": "영상 제목", "format": "일반 8~10분", "focus": "이 영상이 집중할 책의 특정 챕터/섹션/사례 (다른 영상과 절대 겹치지 않게)", "desc": "이 영상에서 다룰 핵심 내용 1줄 요약" },
    { "title": "쇼츠 제목", "format": "쇼츠 15~30초", "focus": "이 쇼츠가 집중할 구체적 포인트 1개", "desc": "핵심 포인트 1줄" }
  ]
}
JSON만 출력.`;

      const res = await fetchWithRetry('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: data.model || "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!res.ok) throw new Error('시리즈 생성 API 호출 실패');
      const apiData = await res.json();
      const text = apiData.content[0].text;

      // Parse JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 파싱 실패');
      const parsed = JSON.parse(match[0]);

      const items = (parsed.items || []).map(item => ({
        ...item,
        status: 'pending' // pending | current | completed
      }));

      updateState('seriesPlan', { ebookName: data.ebookName, items });

    } catch (err) {
      console.error(err);
      setSeriesError('시리즈 생성 중 오류: ' + err.message);
    } finally {
      setIsGeneratingSeries(false);
    }
  };

  // Summarize ebook for current topic
  const summarizeForTopic = async (topic, focus = '') => {
    if (!localFile) return;

    setIsSummarizing(true);
    setSummaryError('');

    try {
      const pdfText = await extractPdfText(localFile);

      const focusBlock = focus
        ? `\n[이 영상이 집중해야 할 책의 특정 범위]\n${focus}\n\n반드시 위 범위에 해당하는 내용만 뽑아내세요. 책 전체를 요약하지 말고, 이 범위의 세부 내용(사례, 수치, 구체적 노하우)만 깊이 있게 정리하세요. 다른 영상이 다룰 범위는 건드리지 마세요.`
        : '';

      const prompt = `다음은 사용자가 업로드한 전자책 PDF의 본문 텍스트(일부)입니다.
현재 기획 중인 유튜브 영상의 주제는 [${topic}] 입니다.${focusBlock}
이 주제와 관련된 내용을 중심으로, PDF의 핵심 노하우와 주요 목차를 요약해주세요. (이 요약본은 이후 대본 작성 프롬프트로 전달됩니다.)
텍스트가 너무 길면 핵심 위주로 1000자 이내로 압축해주세요.

[PDF 텍스트]
${pdfText.substring(0, 20000)}`;

      const res = await fetchWithRetry('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!res.ok) throw new Error('Claude 요약 API 호출 실패');
      const apiData = await res.json();
      handleChange('ebookSummary', apiData.content[0].text);
    } catch (err) {
      console.error(err);
      setSummaryError('요약 중 오류: ' + err.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Select a series item as current topic
  const selectSeriesItem = (idx) => {
    const item = seriesPlan.items[idx];
    // Mark previous current as pending (if not completed)
    const newItems = seriesPlan.items.map((it, i) => {
      if (it.status === 'current') return { ...it, status: 'pending' };
      if (i === idx) return { ...it, status: 'current' };
      return it;
    });
    updateState('seriesPlan', { ...seriesPlan, items: newItems });
    // Default format: longform → 일반 4~5분, shorts → 쇼츠 60초
    const defaultFormat = item.format.startsWith('쇼츠') ? '쇼츠 60초' : '일반 4~5분';
    updateState('plan', { ...data, topic: item.title, format: defaultFormat });

    // Auto-summarize for this topic — pass focus so the summary narrows to the item's assigned range
    if (mode === 'topic') {
      summarizeKnowledgeForTopic(item.title, item.focus || item.desc || '');
    } else if (localFile) {
      summarizeForTopic(item.title, item.focus || item.desc || '');
    }
  };

  const hasSeries = seriesPlan.items.length > 0;
  const longformItems = seriesPlan.items.filter(it => it.format.startsWith('일반'));
  const shortsItems = seriesPlan.items.filter(it => it.format.startsWith('쇼츠'));
  const completedCount = seriesPlan.items.filter(it => it.status === 'completed').length;

  return (
    <div className="panel-card">
      <h2 className="panel-title">기획 설정</h2>

      {/* Step 1: Mode Selection */}
      <div className="form-group" style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => switchMode('ebook')}
          style={{
            flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            border: mode === 'ebook' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: mode === 'ebook' ? 'var(--secondary)' : 'var(--surface)',
            color: mode === 'ebook' ? 'var(--primary)' : 'var(--text)',
            fontWeight: mode === 'ebook' ? 700 : 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          <BookOpen size={18} /> 전자책 기반 기획
        </button>
        <button
          type="button"
          onClick={() => switchMode('topic')}
          style={{
            flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            border: mode === 'topic' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: mode === 'topic' ? 'var(--secondary)' : 'var(--surface)',
            color: mode === 'topic' ? 'var(--primary)' : 'var(--text)',
            fontWeight: mode === 'topic' ? 700 : 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          <Search size={18} /> 주제 기반 기획 (논문·전문서적)
        </button>
      </div>

      {/* Step 2: Ebook Upload (ebook mode) */}
      {mode === 'ebook' && (
        <div className="form-group" style={{ padding: '1.25rem', border: '2px solid var(--primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary)' }}>
          <label className="form-label" style={{ color: 'var(--primary)', fontSize: '1rem' }}>전자책 PDF 업로드</label>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            전자책을 업로드하면 AI가 내용을 분석하여 영상 시리즈를 자동 기획합니다.
          </p>
          <input
            type="file"
            accept="application/pdf"
            className="form-control"
            onChange={handleFileChange}
          />
          {data.ebookName && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>
              업로드된 파일: {data.ebookName}
            </div>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <label className="form-label" style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>전자책 구매 페이지 URL</label>
            <input
              type="url"
              className="form-control"
              value={data.ebookUrl || ''}
              onChange={(e) => handleChange('ebookUrl', e.target.value)}
              placeholder="예: https://jjangsaem.com/ebook/sensory-sleep"
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              유튜브 디스크립션에 전자책 링크로 삽입됩니다.
            </p>
          </div>

          {data.ebookName && (
            <div style={{ marginTop: '1rem' }}>
              {!localFile && (
                <p style={{ fontSize: '0.8125rem', color: '#d97706', marginBottom: '0.5rem' }}>
                  PDF 파일을 다시 선택해주세요 (페이지 새로고침 시 파일이 초기화됩니다).
                </p>
              )}
              {!hasSeries && (
                <button
                  className="btn-primary"
                  onClick={generateSeriesPlan}
                  disabled={isGeneratingSeries || !localFile}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', opacity: (!localFile && !isGeneratingSeries) ? 0.5 : 1 }}
                >
                  {isGeneratingSeries ? (
                    <><Loader2 className="animate-spin" size={18} /> 전자책 분석 및 시리즈 기획 중...</>
                  ) : (
                    '전자책 분석하여 영상 시리즈 기획하기'
                  )}
                </button>
              )}
              {hasSeries && (
                <button
                  className="btn-secondary"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem' }}
                  onClick={generateSeriesPlan}
                  disabled={isGeneratingSeries || !localFile}
                >
                  {isGeneratingSeries ? <><Loader2 className="animate-spin" size={14} /> 시리즈 재생성 중...</> : '시리즈 재생성'}
                </button>
              )}
            </div>
          )}
          {seriesError && <div style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>{seriesError}</div>}
        </div>
      )}

      {/* Step 2: Topic Seed (topic mode) */}
      {mode === 'topic' && (
        <div className="form-group" style={{ padding: '1.25rem', border: '2px solid var(--primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary)' }}>
          <label className="form-label" style={{ color: 'var(--primary)', fontSize: '1rem' }}>주제 입력</label>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            입력한 주제와 100% 일치하는 <strong>롱폼 1개 (마스터)</strong> + 같은 주제 세부 포인트 <strong>쇼츠 3개</strong>를 기획합니다.
            CTA에서는 "짱샘의 책방 방문 + 구독"을 다양한 문구로 유도합니다.
          </p>
          <textarea
            className="form-control"
            value={topicSeed}
            onChange={(e) => setTopicSeed(e.target.value)}
            placeholder="예: 자폐 스펙트럼 아동의 감각 조절 — 전정 감각과 고유 수용성 감각이 수면에 미치는 영향"
            rows={2}
          />

          <div style={{ marginTop: '0.75rem' }}>
            <label className="form-label" style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>연결 URL (자동 고정)</label>
            <input
              type="url"
              className="form-control"
              value={data.ebookUrl || JJANGSAEM_BOOKSTORE_URL}
              readOnly
              style={{ backgroundColor: 'var(--gray-100)', color: 'var(--text-muted)' }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              주제 기반 모드에서는 짱샘의 책방({JJANGSAEM_BOOKSTORE_URL})이 CTA·디스크립션에 자동으로 삽입됩니다.
            </p>
          </div>

          <div style={{ marginTop: '1rem' }}>
            {!hasSeries && (
              <button
                className="btn-primary"
                onClick={generateSeriesPlanFromTopic}
                disabled={isGeneratingSeries || !topicSeed.trim()}
                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', opacity: (!topicSeed.trim() && !isGeneratingSeries) ? 0.5 : 1 }}
              >
                {isGeneratingSeries ? (
                  <><Loader2 className="animate-spin" size={18} /> 주제 분석 및 영상 기획 중...</>
                ) : (
                  '주제 분석하여 롱폼 1 + 쇼츠 3 기획하기'
                )}
              </button>
            )}
            {hasSeries && (
              <button
                className="btn-secondary"
                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem' }}
                onClick={generateSeriesPlanFromTopic}
                disabled={isGeneratingSeries || !topicSeed.trim()}
              >
                {isGeneratingSeries ? <><Loader2 className="animate-spin" size={14} /> 시리즈 재생성 중...</> : '시리즈 재생성'}
              </button>
            )}
          </div>
          {seriesError && <div style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>{seriesError}</div>}
        </div>
      )}

      {/* Step 2: Series Plan */}
      {hasSeries && (
        <div className="form-group" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '1rem' }}>2. 영상 시리즈 ({completedCount}/{seriesPlan.items.length} 완료)</label>
          </div>

          {/* Progress bar */}
          <div style={{ height: '6px', backgroundColor: 'var(--gray-200)', borderRadius: '3px', marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ width: `${(completedCount / seriesPlan.items.length) * 100}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.3s' }} />
          </div>

          {/* Longform */}
          {longformItems.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#7c3aed', marginBottom: '0.5rem' }}>
                롱폼 영상 (5~10분) — {longformItems.length}개
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {longformItems.map((item) => {
                  const globalIdx = seriesPlan.items.indexOf(item);
                  return (
                    <SeriesItem key={globalIdx} item={item} idx={globalIdx} onSelect={selectSeriesItem} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Shorts */}
          {shortsItems.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#ea580c', marginBottom: '0.5rem' }}>
                쇼츠 (15~30초) — {shortsItems.length}개
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {shortsItems.map((item) => {
                  const globalIdx = seriesPlan.items.indexOf(item);
                  return (
                    <SeriesItem key={globalIdx} item={item} idx={globalIdx} onSelect={selectSeriesItem} />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Topic (auto-filled or manual) */}
      <div className="form-group">
        <label className="form-label">{hasSeries ? '3. 현재 영상 주제' : '주제 입력'}</label>
        <textarea
          className="form-control"
          value={data.topic}
          onChange={(e) => handleChange('topic', e.target.value)}
          placeholder={hasSeries ? '위 시리즈에서 선택하거나 직접 입력하세요' : '예: 터미타임 거부하는 아이 대처법'}
        />
        {/* Ebook summary for current topic */}
        {data.ebookSummary && (
          <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem' }}>
            <div style={{ color: '#16a34a', fontWeight: 600, marginBottom: '0.25rem' }}>전자책 요약 (대본 생성에 자동 전달)</div>
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto', color: 'var(--text-muted)' }}>
              {data.ebookSummary}
            </div>
          </div>
        )}
        {isSummarizing && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Loader2 className="animate-spin" size={14} /> 이 주제에 맞게 전자책 요약 중...
          </div>
        )}
        {summaryError && <div style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>{summaryError}</div>}
      </div>

      <div className="form-group">
        <label className="form-label">영상 포맷</label>
        <div className="radio-group">
          {['쇼츠 15~30초', '쇼츠 60초', '일반 4~5분', '일반 8~10분', '일반 10분 이상'].map(fmt => (
            <label key={fmt} className={`radio-label ${data.format === fmt ? 'selected' : ''}`}>
              <input type="radio" className="radio-input" checked={data.format === fmt} onChange={() => handleChange('format', fmt)} />
              {fmt}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">대상 시청자 (다중 선택)</label>
        <div className="checkbox-group">
          {['부모', '치료사', '교사', '전체'].map(target => (
            <label key={target} className={`checkbox-label ${data.targets.includes(target) ? 'selected' : ''}`}>
              <input type="checkbox" className="checkbox-input" checked={data.targets.includes(target)} onChange={() => handleTargetToggle(target)} />
              {target}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">톤앤매너</label>
        <div className="radio-group">
          {['전문적', '따뜻한', '교육적'].map(tone => (
            <label key={tone} className={`radio-label ${data.tone === tone ? 'selected' : ''}`}>
              <input type="radio" className="radio-input" checked={data.tone === tone} onChange={() => handleChange('tone', tone)} />
              {tone}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">대본 생성 모델 선택</label>
        <div className="radio-group">
          {[
            { id: 'claude-opus-4-6', label: 'claude-opus-4-6 (최고 품질)' },
            { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (균형)' },
            { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5-20251001 (빠름)' }
          ].map(model => (
            <label key={model.id} className={`radio-label ${data.model === model.id ? 'selected' : ''}`}>
              <input type="radio" className="radio-input" checked={data.model === model.id} onChange={() => handleChange('model', model.id)} />
              {model.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-primary" onClick={onNext}>
          다음 단계: 벤치마킹 <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}

// Series item component
function SeriesItem({ item, idx, onSelect }) {
  const statusStyles = {
    completed: { icon: <CheckCircle2 size={16} color="#22c55e" />, bg: '#f0fdf4', border: '#bbf7d0', badge: '완료', badgeColor: '#16a34a' },
    current: { icon: <PlayCircle size={16} color="var(--primary)" />, bg: 'var(--secondary)', border: 'var(--primary)', badge: '제작 중', badgeColor: 'var(--primary)' },
    pending: { icon: <Circle size={16} color="var(--gray-300)" />, bg: 'var(--surface)', border: 'var(--border)', badge: '예정', badgeColor: 'var(--text-muted)' },
  };
  const s = statusStyles[item.status] || statusStyles.pending;

  return (
    <button
      onClick={() => item.status !== 'completed' && onSelect(idx)}
      style={{
        background: s.bg, border: `1px solid ${s.border}`, borderRadius: 'var(--radius-sm)',
        padding: '0.5rem 0.75rem', cursor: item.status === 'completed' ? 'default' : 'pointer',
        textAlign: 'left', fontSize: '0.8125rem', transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: item.status === 'completed' ? 0.7 : 1
      }}
    >
      {s.icon}
      <span style={{ flex: 1, fontWeight: item.status === 'current' ? 600 : 400, textDecoration: item.status === 'completed' ? 'line-through' : 'none' }}>
        {item.title}
      </span>
      {item.desc && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>}
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: s.badgeColor, backgroundColor: s.badgeColor + '15', padding: '0.1rem 0.4rem', borderRadius: '3px', whiteSpace: 'nowrap' }}>
        {s.badge}
      </span>
    </button>
  );
}
