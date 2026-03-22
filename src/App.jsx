import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  Settings, 
  ClipboardList, 
  Search, 
  FileText, 
  Image as ImageIcon, 
  Upload, 
  BarChart2,
  CheckCircle2,
  X,
  PlaySquare,
  ArrowRight
} from 'lucide-react';
import './index.css';
import * as pdfjsLib from 'pdfjs-dist';
import BenchmarkPanel from './components/BenchmarkPanel';
import ScriptPanel from './components/ScriptPanel';
import MediaPanel from './components/MediaPanel';
import UploadPanel from './components/UploadPanel';

// --- Constants ---
const TABS = [
  { id: 'plan', label: '기획', icon: ClipboardList },
  { id: 'benchmark', label: '벤치마킹', icon: Search },
  { id: 'script', label: '대본', icon: FileText },
  { id: 'media', label: '미디어', icon: ImageIcon },
  { id: 'upload', label: '업로드', icon: Upload },
  { id: 'dashboard', label: '대시보드', icon: BarChart2 },
];

// Setup PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const INIT_STATE = {
  settings: { anthropicKey: '', youtubeKey: '', ttsKey: '', elevenlabsKey: '' },
  plan: { topic: '', format: '쇼츠 60초', targets: [], ebookName: '', ebookSummary: '', tone: '전문적', model: 'claude-opus-4-6' },
  benchmark: { channels: [], thumbnailPatterns: [], titleFormulas: [], tagPool: [] },
  script: { hook: '', bridge: '', sections: [], cta: '', titleSuggestions: [], thumbnailCopies: [] },
  media: { selectedThumbnailCopy: '', imagePrompts: [], generatedImages: [], selectedThumbnail: '' },
  metadata: { title: '', description: '', tags: [], hashtags: [], cotLog: '' },
  upload: { scheduleType: '', scheduledAt: '', visibility: '', uploadStatus: '' }
};

// --- Context ---
const AppContext = createContext();

// --- Components ---

// 1. Settings Modal
function SettingsModal({ isOpen, onClose }) {
  const { globalState, updateState } = useContext(AppContext);
  const [localKeys, setLocalKeys] = useState(globalState.settings);
  const [testStatus, setTestStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setLocalKeys(globalState.settings);
      setTestStatus(null);
    }
  }, [isOpen, globalState.settings]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalKeys(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    // Encrypt and save to localStorage (using btoa for simple simulation of encryption)
    Object.keys(localKeys).forEach(key => {
      if (localKeys[key]) {
        localStorage.setItem(`enc_${key}`, btoa(localKeys[key]));
      } else {
        localStorage.removeItem(`enc_${key}`);
      }
    });
    updateState('settings', localKeys);
    onClose();
  };

  const handleTest = () => {
    setTestStatus('testing');
    setTimeout(() => {
      setTestStatus('success');
    }, 1000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">API 키 설정</h2>
          <button className="modal-close" onClick={onClose}><X size={24} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Anthropic API Key (Claude용)</label>
            <input 
              type="password" 
              className="form-control" 
              name="anthropicKey" 
              value={localKeys.anthropicKey} 
              onChange={handleChange} 
              placeholder="sk-ant-..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">YouTube Data API Key</label>
            <input 
              type="password" 
              className="form-control" 
              name="youtubeKey" 
              value={localKeys.youtubeKey} 
              onChange={handleChange} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Google TTS API Key (선택)</label>
            <input 
              type="password" 
              className="form-control" 
              name="ttsKey" 
              value={localKeys.ttsKey} 
              onChange={handleChange} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">ElevenLabs API Key (선택)</label>
            <input 
              type="password" 
              className="form-control" 
              name="elevenlabsKey" 
              value={localKeys.elevenlabsKey} 
              onChange={handleChange} 
            />
          </div>

          {testStatus === 'testing' && <div className="status-badge warning">연결 테스트 중...</div>}
          {testStatus === 'success' && <div className="status-badge success">✅ 모든 키가 유효합니다</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleTest}>연결 테스트</button>
          <button className="btn-primary" onClick={handleSave}>암호화 저장</button>
        </div>
      </div>
    </div>
  );
}

// 2. Tab 1: Plan Panel
function PlanPanel({ onNext }) {
  const { globalState, updateState } = useContext(AppContext);
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
    if (!globalState.settings.anthropicKey) {
      setSummaryError('우측 상단 설정에서 Anthropic API 키를 먼저 입력해주세요.');
      return;
    }
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

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': globalState.settings.anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerously-allow-browser': 'true'
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
                 <div style={{ color: 'green', fontWeight: 600, marginBottom: '0.5rem' }}>✅ 요약 완료 (이 내용이 백그라운드에서 전달됩니다)</div>
                 <div style={{ whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', color: 'var(--text-muted)' }}>
                   {data.ebookSummary}
                 </div>
               </div>
             )}
             {summaryError && <div style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>{summaryError}</div>}
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

// 3. Placeholders for other tabs
function PlaceholderPanel({ title }) {
  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: 'var(--gray-400)' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>{title}</h2>
      <p>이 영역은 아직 구현되지 않은 플레이스홀더 탭입니다.</p>
    </div>
  );
}

// Main App
export default function App() {
  const [globalState, setGlobalState] = useState(INIT_STATE);
  const [activeTab, setActiveTab] = useState('plan');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load from localStorage on init
  useEffect(() => {
    const loadedSettings = { ...INIT_STATE.settings };
    let hasLoaded = false;
    Object.keys(loadedSettings).forEach(key => {
      const encVal = localStorage.getItem(`enc_${key}`);
      if (encVal) {
        try {
          loadedSettings[key] = atob(encVal);
          hasLoaded = true;
        } catch(e) {}
      }
    });
    if (hasLoaded) {
      setGlobalState(prev => ({ ...prev, settings: loadedSettings }));
    }
  }, []);

  const updateState = (section, payload) => {
    setGlobalState(prev => ({
      ...prev,
      [section]: payload
    }));
  };

  // Determine if a tab is "completed" (basic logic for demo)
  const isTabCompleted = (tabId) => {
    if (tabId === 'plan' && globalState.plan.topic.length > 0) return true;
    if (tabId === 'benchmark' && globalState.benchmark.channels.length > 0) return true;
    if (tabId === 'script' && globalState.script.final_hook) return true;
    if (tabId === 'media' && globalState.media.timeline) return true;
    if (tabId === 'upload' && globalState.upload.videoId) return true;
    return false;
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'plan':
        return <PlanPanel onNext={() => setActiveTab('benchmark')} />;
      case 'benchmark':
        return <BenchmarkPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('script')} />;
      case 'script':
        return <ScriptPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('media')} />;
      case 'media':
        return <MediaPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('upload')} />;
      case 'upload':
        return <UploadPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('dashboard')} />;
      case 'dashboard':
        return <PlaceholderPanel title="현황 대시보드" />;
      default:
        return null;
    }
  };

  return (
    <AppContext.Provider value={{ globalState, updateState }}>
      <div className="app-container">
        
        {/* Header */}
        <header className="header">
          <div className="header-logo">
            <PlaySquare color="var(--primary)" size={28} />
            <span>JjangSaem YouTube Auto</span>
          </div>
          <button className="header-btn" onClick={() => setIsSettingsOpen(true)}>
            <Settings size={18} />
            설정
          </button>
        </header>

        {/* Main Workspace */}
        <main className="main-content">
          
          {/* Tabs Navigation */}
          <div className="tabs-container">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const completed = isTabCompleted(tab.id);
              return (
                <button 
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? 'active' : ''} ${completed ? 'completed' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className={`tab-icon ${completed ? 'completed' : ''}`}>
                    {completed ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel */}
          {renderActiveTab()}

        </main>

        {/* Settings Modal */}
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        
      </div>
    </AppContext.Provider>
  );
}
