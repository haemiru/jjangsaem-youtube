import React, { useState, useEffect, createContext } from 'react';
import {
  ClipboardList,
  Search,
  FileText,
  Image as ImageIcon,
  Upload,
  BarChart2,
  CheckCircle2,
  PlaySquare,
} from 'lucide-react';
import './index.css';
import * as pdfjsLib from 'pdfjs-dist';
import PlanPanel from './components/PlanPanel';
import BenchmarkPanel from './components/BenchmarkPanel';
import ScriptPanel from './components/ScriptPanel';
import MediaPanel from './components/MediaPanel';
import UploadPanel from './components/UploadPanel';
import DashboardPanel from './components/DashboardPanel';

// --- Constants ---
const TABS = [
  { id: 'plan', label: '기획', icon: ClipboardList },
  { id: 'benchmark', label: '벤치마킹', icon: Search },
  { id: 'script', label: '대본', icon: FileText },
  { id: 'media', label: '미디어', icon: ImageIcon },
  { id: 'upload', label: '업로드', icon: Upload },
  { id: 'dashboard', label: '대시보드', icon: BarChart2 },
];

// Setup PDF.js worker (use local bundled worker instead of CDN)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const INIT_STATE = {
  plan: { topic: '', format: '쇼츠 60초', targets: [], ebookName: '', ebookSummary: '', ebookUrl: '', tone: '전문적', model: 'claude-opus-4-6', characterImage: '', characterDescription: '' },
  benchmark: { channels: [], thumbnailPatterns: [], titleFormulas: [], tagPool: [] },
  script: { hook: '', empathy: '', twist: '', sections: [], cta: '', titleSuggestions: [], thumbnailCopies: [] },
  media: { selectedThumbnailCopy: '', imagePrompts: [], generatedImages: [], selectedThumbnail: '' },
  metadata: { title: '', description: '', tags: [], hashtags: [], cotLog: '' },
  upload: { scheduleType: '', scheduledAt: '', visibility: '', uploadStatus: '' },
  seriesPlan: { ebookName: '', items: [] }
};

// --- Context ---
export const AppContext = createContext();

// Main App
export default function App() {
  const [globalState, setGlobalState] = useState(INIT_STATE);
  const [activeTab, setActiveTab] = useState('plan');

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
    if (tabId === 'media' && globalState.media.generatedImages?.some(q => q.status === 'done')) return true;
    if (tabId === 'upload' && globalState.upload.videoId) return true;
    return false;
  };

  return (
    <AppContext.Provider value={{ globalState, updateState }}>
      <div className="app-container">

        {/* Header */}
        <header className="header">
          <div className="header-logo" onClick={() => setActiveTab('plan')} style={{ cursor: 'pointer' }}>
            <PlaySquare color="var(--primary)" size={28} />
            <span>JjangSaem YouTube</span>
          </div>
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

          {/* All Tab Panels - always mounted, hidden via CSS to preserve state */}
          <div style={{ display: activeTab === 'plan' ? 'block' : 'none' }}>
            <PlanPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('benchmark')} />
          </div>
          <div style={{ display: activeTab === 'benchmark' ? 'block' : 'none' }}>
            <BenchmarkPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('script')} />
          </div>
          <div style={{ display: activeTab === 'script' ? 'block' : 'none' }}>
            <ScriptPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('upload')} />
          </div>
          <div style={{ display: activeTab === 'media' ? 'block' : 'none' }}>
            <MediaPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('upload')} disabled={true} />
          </div>
          <div style={{ display: activeTab === 'upload' ? 'block' : 'none' }}>
            <UploadPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('dashboard')} setActiveTab={setActiveTab} />
          </div>
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <DashboardPanel globalState={globalState} onNavigate={setActiveTab} />
          </div>

        </main>

      </div>
    </AppContext.Provider>
  );
}
