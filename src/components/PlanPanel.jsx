import React, { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

const SHORTS_TEMPLATES = [
  {
    category: '행동 해석 시리즈',
    color: '#ea580c',
    items: [
      { title: '버튼만 계속 누르는 아이… 괜찮을까요?', desc: '혼자 반복 vs 공유 차이' },
      { title: '이름 불러도 안 돌아보면 위험 신호입니다', desc: '호명 반응' },
      { title: '눈 안 마주치는 아이, 기다리면 될까요?', desc: '공동주의 설명' },
      { title: '혼자 노는 아이, 괜찮은 걸까요?', desc: '상호작용 핵심' },
      { title: '멍한 아이… 사실 freeze입니다', desc: '동결 반응 설명' },
      { title: '같은 행동인데 왜 결과는 다를까요?', desc: '자폐 vs 정상' },
      { title: '이 행동, 정상처럼 보이지만 아닙니다', desc: '반복 행동 해석' },
      { title: '아이 웃는데도 위험 신호일 수 있습니다', desc: '감정 vs 연결' },
      { title: '말이 늦는 이유, 대부분 이겁니다', desc: '신경계' },
      { title: '이 3가지만 보면 판단됩니다', desc: '눈맞춤 / 호명 / 공동주의' },
    ]
  },
  {
    category: '뇌·자율신경 설명 시리즈',
    color: '#7c3aed',
    items: [
      { title: '아이 뇌가 멈추는 이유 (freeze)', desc: '' },
      { title: '미주신경이 열리면 아이가 바뀝니다', desc: '' },
      { title: '코막힘이 뇌를 망칩니다', desc: '' },
      { title: 'meltdown vs shutdown 차이', desc: '' },
      { title: '왜 어떤 아이는 멍해질까', desc: '' },
      { title: '아이 문제는 행동이 아닙니다', desc: '' },
      { title: '발달은 훈련이 아닙니다', desc: '' },
      { title: '과민 아이의 뇌 상태', desc: '' },
      { title: '아이 뇌는 항상 위험을 체크합니다', desc: '' },
      { title: '신경계가 무너지면 생기는 일', desc: '' },
    ]
  },
  {
    category: '솔루션 시리즈',
    color: '#059669',
    items: [
      { title: '아이 멍할 때 바로 해보세요 (3초 자극)', desc: '' },
      { title: '귀 마사지 하나로 달라집니다', desc: '' },
      { title: '코만 바꿔도 아이가 바뀝니다', desc: '' },
      { title: '잠들기 전 5분 루틴', desc: '' },
      { title: '아이 진정시키는 방법 (과학적)', desc: '' },
      { title: '과민 아이 안정시키는 방법', desc: '' },
      { title: '집중력 올리는 가장 쉬운 방법', desc: '' },
      { title: '부모가 꼭 해야 하는 1가지', desc: '' },
      { title: '이걸 바꾸면 발달이 시작됩니다', desc: '' },
      { title: '아이 뇌를 살리는 습관 3가지', desc: '' },
    ]
  }
];

const SERIES_TEMPLATES = [
  {
    series: '시리즈 1: "이 행동, 괜찮은 걸까요?"',
    color: '#ea580c',
    items: [
      { title: '이 행동, 괜찮은 걸까요? — 버튼 반복', ep: '1편' },
      { title: '이 행동, 괜찮은 걸까요? — 멍함', ep: '2편' },
      { title: '이 행동, 괜찮은 걸까요? — 눈 안 마주침', ep: '3편' },
      { title: '이 행동, 괜찮은 걸까요? — 이름 불러도 반응 없음', ep: '4편' },
    ]
  },
  {
    series: '시리즈 2: "아이 뇌를 바꾸는 5분 루틴"',
    color: '#7c3aed',
    items: [
      { title: '아이 뇌를 바꾸는 5분 루틴 — 귀 마사지', ep: '1편' },
      { title: '아이 뇌를 바꾸는 5분 루틴 — 코 호흡', ep: '2편' },
      { title: '아이 뇌를 바꾸는 5분 루틴 — 얼굴 자극', ep: '3편' },
      { title: '아이 뇌를 바꾸는 5분 루틴 — 수면 루틴', ep: '4편' },
    ]
  },
  {
    series: '시리즈 3: "부모가 절대 놓치면 안되는 신호 3가지"',
    color: '#059669',
    items: [
      { title: '부모가 절대 놓치면 안되는 신호 — 눈맞춤', ep: '1편' },
      { title: '부모가 절대 놓치면 안되는 신호 — 호명', ep: '2편' },
      { title: '부모가 절대 놓치면 안되는 신호 — 공동주의', ep: '3편' },
    ]
  }
];

export default function PlanPanel({ globalState, updateState, onNext }) {
  const data = globalState.plan;
  const [localFile, setLocalFile] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSeries, setShowSeries] = useState(false);

  const selectTemplate = (item) => {
    updateState('plan', { ...data, topic: item.title, format: '쇼츠 15~30초' });
    setShowTemplates(false);
  };

  const selectSeriesEp = (item) => {
    updateState('plan', { ...data, topic: item.title, format: '일반 5~10분' });
    setShowSeries(false);
  };

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

      {/* 쇼츠 템플릿 */}
      <div className="form-group" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--gray-100)' }}>
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9375rem', color: 'var(--primary)', padding: 0, width: '100%' }}
        >
          {showTemplates ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
          쇼츠 템플릿에서 시작 (30개)
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          검증된 쇼츠 주제를 선택하면 주제와 포맷이 자동 설정됩니다.
        </p>
        {showTemplates && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {SHORTS_TEMPLATES.map((cat) => (
              <div key={cat.category}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: cat.color, marginBottom: '0.5rem' }}>{cat.category}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {cat.items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectTemplate(item)}
                      style={{
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        padding: '0.5rem 0.75rem', cursor: 'pointer', textAlign: 'left', fontSize: '0.8125rem',
                        transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.5rem'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.backgroundColor = cat.color + '10'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                    >
                      <span style={{ fontWeight: 500 }}>{item.title}</span>
                      {item.desc && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>— {item.desc}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 일반 영상 시리즈 템플릿 */}
      <div className="form-group" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--gray-100)' }}>
        <button
          onClick={() => setShowSeries(!showSeries)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9375rem', color: 'var(--primary)', padding: 0, width: '100%' }}
        >
          {showSeries ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
          일반 영상 시리즈 템플릿 (3개 시리즈, {SERIES_TEMPLATES.reduce((sum, s) => sum + s.items.length, 0)}편)
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          시리즈 에피소드를 선택하면 주제와 포맷(일반 5~10분)이 자동 설정됩니다.
        </p>
        {showSeries && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {SERIES_TEMPLATES.map((ser) => (
              <div key={ser.series}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: ser.color, marginBottom: '0.5rem' }}>{ser.series}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {ser.items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectSeriesEp(item)}
                      style={{
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        padding: '0.5rem 0.75rem', cursor: 'pointer', textAlign: 'left', fontSize: '0.8125rem',
                        transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.5rem'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ser.color; e.currentTarget.style.backgroundColor = ser.color + '10'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                    >
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ser.color, backgroundColor: ser.color + '15', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>{item.ep}</span>
                      <span style={{ fontWeight: 500 }}>{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
          {['쇼츠 15~30초', '쇼츠 60초', '일반 5~10분'].map(fmt => (
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
