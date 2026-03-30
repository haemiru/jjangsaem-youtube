import React, { useState } from 'react';
import { ArrowRight, Loader2, CheckCircle2, Circle, PlayCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

export default function PlanPanel({ globalState, updateState, onNext }) {
  const data = globalState.plan;
  const seriesPlan = globalState.seriesPlan;
  const [localFile, setLocalFile] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingSeries, setIsGeneratingSeries] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [seriesError, setSeriesError] = useState('');

  const handleChange = (key, value) => {
    updateState('plan', { ...data, [key]: value });
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
      handleChange('ebookName', file.name);
      handleChange('ebookSummary', '');
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

[요청]
전자책 내용을 분석하여:
1. 롱폼 영상 (5~10분) 주제 5~6개 — 전자책 핵심 챕터/테마별로
2. 쇼츠 (15~30초) 주제 8~10개 — 전자책에서 뽑은 짧은 포인트들

각 주제는 유튜브에서 클릭을 유발하는 제목 형태로 작성해주세요.

[전자책 내용]
${pdfText.substring(0, 40000)}

JSON으로 출력:
{
  "items": [
    { "title": "영상 제목", "format": "일반 8~10분", "desc": "이 영상에서 다룰 핵심 내용 1줄 요약" },
    { "title": "쇼츠 제목", "format": "쇼츠 15~30초", "desc": "핵심 포인트 1줄" }
  ]
}
JSON만 출력.`;

      const res = await fetch('/api/anthropic/v1/messages', {
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
  const summarizeForTopic = async (topic) => {
    if (!localFile) return;

    setIsSummarizing(true);
    setSummaryError('');

    try {
      const pdfText = await extractPdfText(localFile);

      const prompt = `다음은 사용자가 업로드한 전자책 PDF의 본문 텍스트(일부)입니다.
현재 기획 중인 유튜브 영상의 주제는 [${topic}] 입니다.
이 주제와 관련된 내용을 중심으로, PDF의 핵심 노하우와 주요 목차를 요약해주세요. (이 요약본은 이후 대본 작성 프롬프트로 전달됩니다.)
텍스트가 너무 길면 핵심 위주로 1000자 이내로 압축해주세요.

[PDF 텍스트]
${pdfText.substring(0, 50000)}`;

      const res = await fetch('/api/anthropic/v1/messages', {
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
    updateState('plan', { ...data, topic: item.title, format: item.format });

    // Auto-summarize for this topic
    if (localFile) {
      summarizeForTopic(item.title);
    }
  };

  const hasSeries = seriesPlan.items.length > 0;
  const longformItems = seriesPlan.items.filter(it => it.format.startsWith('일반'));
  const shortsItems = seriesPlan.items.filter(it => it.format.startsWith('쇼츠'));
  const completedCount = seriesPlan.items.filter(it => it.status === 'completed').length;

  return (
    <div className="panel-card">
      <h2 className="panel-title">기획 설정</h2>

      {/* Step 1: Ebook Upload */}
      <div className="form-group" style={{ padding: '1.25rem', border: '2px solid var(--primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary)' }}>
        <label className="form-label" style={{ color: 'var(--primary)', fontSize: '1rem' }}>1. 전자책 PDF 업로드</label>
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

        {/* Series Generation Button — always show when ebook name exists */}
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

      <div className="form-group" style={{ padding: '1rem', border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary)' }}>
        <label className="form-label" style={{ color: 'var(--primary)' }}>캐릭터 이미지 업로드</label>
        <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
          영상에 사용할 캐릭터 이미지를 업로드하세요. 흰 배경 + 캐릭터 스타일의 이미지/영상 프롬프트에 반영됩니다.
        </p>
        <input
          type="file"
          accept="image/*"
          className="form-control"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => handleChange('characterImage', ev.target.result);
            reader.readAsDataURL(file);
          }}
        />
        {data.characterImage && (
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <img src={data.characterImage} alt="캐릭터" style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: '#fff' }} />
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem', display: 'block' }}>캐릭터 설명 (선택)</label>
              <textarea
                className="form-control"
                style={{ minHeight: '80px', fontSize: '0.875rem' }}
                value={data.characterDescription || ''}
                onChange={(e) => handleChange('characterDescription', e.target.value)}
                placeholder="예: 둥근 얼굴의 귀여운 여자 캐릭터, 하얀 가운을 입고 있음"
              />
            </div>
          </div>
        )}
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
        <label className="form-label">Claude 모델 선택</label>
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
