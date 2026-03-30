import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

export default function PlanPanel({ globalState, updateState, onNext }) {
  const data = globalState.plan;
  const [localFile, setLocalFile] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');

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
      handleChange('ebookSummary', ''); // Reset summary when new file loaded
      setSummaryError('');
    }
  };

  const extractPdfText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    // Extract first 50 pages to save context/time, typically enough for summary
    const maxPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => item.str).join(' ') + '\\n';
    }
    return fullText;
  };

  const summarizePdf = async () => {
    if (!localFile) return;
    if (!data.topic) {
      setSummaryError('주제를 먼저 상단에 입력해주세요 (주제 맞춤형 요약에 필요합니다).');
      return;
    }

    setIsSummarizing(true);
    setSummaryError('');

    try {
      // 1. Extract text from PDF
      const pdfText = await extractPdfText(localFile);

      // 2. Summarize using Claude Haiku (Fast & Cheap)
      const prompt = `다음은 사용자가 업로드한 전자책 PDF의 본문 텍스트(일부)입니다.
현재 기획 중인 유튜브 영상의 주제는 [${data.topic}] 입니다.
이 주제와 관련된 내용을 중심으로, PDF의 핵심 노하우와 주요 목차를 요약해주세요. (이 요약본은 이후 대본 작성 프롬프트로 전달됩니다.)
텍스트가 너무 길면 핵심 위주로 1000자 이내로 압축해주세요.

[PDF 텍스트]
${pdfText.substring(0, 50000)} // 최대 약 5만자로 제한
`;

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
      const summary = apiData.content[0].text;

      handleChange('ebookSummary', summary);
    } catch (err) {
      console.error(err);
      setSummaryError('요약 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="panel-card">
      <h2 className="panel-title">기획 설정</h2>

      <div className="form-group">
        <label className="form-label">주제 입력</label>
        <textarea
          className="form-control"
          value={data.topic}
          onChange={(e) => handleChange('topic', e.target.value)}
          placeholder="예: 터미타임 거부하는 아이 대처법"
        />
      </div>

      <div className="form-group">
        <label className="form-label">영상 포맷</label>
        <div className="radio-group">
          {['쇼츠 60초', '일반 5~10분'].map(fmt => (
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
        <label className="form-label" style={{ color: 'var(--primary)' }}>연계 전자책 (PDF 업로드 및 자동 요약)</label>
        <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
          선택한 주제를 바탕으로 PDF 내용을 자동 요약하여 대본 생성 시 AI에게 핵심 노하우를 전달합니다.
        </p>
        <input
          type="file"
          accept="application/pdf"
          className="form-control"
          onChange={handleFileChange}
        />
        <div style={{ marginTop: '0.75rem' }}>
          <label className="form-label" style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>전자책 구매 페이지 URL</label>
          <input
            type="url"
            className="form-control"
            value={data.ebookUrl || ''}
            onChange={(e) => handleChange('ebookUrl', e.target.value)}
            placeholder="예: https://jjangsaem.com/ebook/tummy-time-guide"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            유튜브 디스크립션에 전자책 링크로 삽입됩니다.
          </p>
        </div>
        {data.ebookName && (
           <div style={{ marginTop: '1rem' }}>
             <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>업로드된 파일: {data.ebookName}</div>
             {!data.ebookSummary ? (
               <button
                 className="btn-primary"
                 style={{ marginTop: '0.5rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                 onClick={summarizePdf}
                 disabled={isSummarizing}
               >
                 {isSummarizing ? 'PDF 분석 및 요약 중...' : '이 책을 요약하여 대본 정보로 연동하기'}
               </button>
             ) : (
               <div style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.875rem' }}>
                 <div style={{ color: 'green', fontWeight: 600, marginBottom: '0.5rem' }}>요약 완료 (이 내용이 백그라운드에서 전달됩니다)</div>
                 <div style={{ whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-muted)' }}>
                   {data.ebookSummary}
                 </div>
               </div>
             )}
             {summaryError && <div style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>{summaryError}</div>}
           </div>
        )}
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
