import React, { useState, useEffect, useRef, createContext } from 'react';
import {
  ClipboardList,
  Search,
  FileText,
  Image as ImageIcon,
  Upload,
  BarChart2,
  CheckCircle2,
  PlaySquare,
  FolderOpen,
  Loader2,
  Cloud,
  CloudOff,
} from 'lucide-react';
import './index.css';
import * as pdfjsLib from 'pdfjs-dist';
import PlanPanel from './components/PlanPanel';
import BenchmarkPanel from './components/BenchmarkPanel';
import ScriptPanel from './components/ScriptPanel';
import MediaPanel from './components/MediaPanel';
import UploadPanel from './components/UploadPanel';
import DashboardPanel from './components/DashboardPanel';
import ProjectManager from './components/ProjectManager';
import {
  signInAnon,
  createProject,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  renameProject,
} from './services/firestoreService';

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

// LocalStorage keys
const STORAGE_KEY = 'jjangsaem-yt-state';
const LAST_PROJECT_KEY = 'jjangsaem-last-project';

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return Object.keys(INIT_STATE).reduce((acc, key) => {
        acc[key] = { ...INIT_STATE[key], ...(parsed[key] || {}) };
        return acc;
      }, {});
    }
  } catch (e) {
    console.warn('로컬 상태 복원 실패:', e);
  }
  return null;
}

// Main App
export default function App() {
  const [globalState, setGlobalState] = useState(INIT_STATE);
  const [activeTab, setActiveTab] = useState('plan');

  // Firebase state
  const [uid, setUid] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(null);

  // --- Auth & Initial Load ---
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const userId = await signInAnon();
        if (cancelled) return;
        setUid(userId);

        // Check for last used project
        const lastId = localStorage.getItem(LAST_PROJECT_KEY);
        if (lastId) {
          const proj = await loadProject(lastId);
          if (proj && proj.uid === userId) {
            applyProject(proj);
            setIsLoading(false);
            return;
          }
        }

        // No last project — check for localStorage migration
        const localState = loadLocalState();
        if (localState && localState.plan.topic) {
          // Migrate localStorage data to Firestore
          const name = localState.plan.topic.substring(0, 30) || '마이그레이션된 프로젝트';
          const newId = await createProject(userId, name, localState);
          localStorage.setItem(LAST_PROJECT_KEY, newId);
          localStorage.removeItem(STORAGE_KEY);
          setCurrentProjectId(newId);
          setCurrentProjectName(name);
          setGlobalState(localState);
          setIsLoading(false);
          return;
        }

        // No data at all — show project manager
        setIsLoading(false);
        setProjectListOpen(true);
      } catch (err) {
        console.error('초기화 실패:', err);
        if (!cancelled) {
          // Fallback to localStorage
          const localState = loadLocalState();
          if (localState) setGlobalState(localState);
          setIsLoading(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Apply loaded project data to state
  const applyProject = (proj) => {
    const state = Object.keys(INIT_STATE).reduce((acc, key) => {
      acc[key] = { ...INIT_STATE[key], ...(proj[key] || {}) };
      return acc;
    }, {});
    setGlobalState(state);
    setActiveTab(proj.activeTab || 'plan');
    setCurrentProjectId(proj.id);
    setCurrentProjectName(proj.name || '');
    localStorage.setItem(LAST_PROJECT_KEY, proj.id);
  };

  // --- Debounced Firestore Save ---
  useEffect(() => {
    if (!currentProjectId || isLoading) return;

    // Skip if state hasn't actually changed
    const stateStr = JSON.stringify({ globalState, activeTab });
    if (lastSavedRef.current === stateStr) return;

    clearTimeout(saveTimerRef.current);
    setSaveStatus('idle');

    saveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await saveProject(currentProjectId, {
          plan: globalState.plan,
          benchmark: globalState.benchmark,
          script: globalState.script,
          metadata: globalState.metadata,
          upload: globalState.upload,
          seriesPlan: globalState.seriesPlan,
          activeTab,
        });
        lastSavedRef.current = stateStr;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2000);
      } catch (err) {
        console.error('Firestore 저장 실패:', err);
        setSaveStatus('error');
      }
    }, 2000);

    return () => clearTimeout(saveTimerRef.current);
  }, [globalState, activeTab, currentProjectId, isLoading]);

  const updateState = (section, payload) => {
    setGlobalState(prev => ({
      ...prev,
      [section]: payload
    }));
  };

  // --- Project Management ---
  const refreshProjects = async () => {
    if (!uid) return;
    setProjectsLoading(true);
    try {
      const list = await listProjects(uid);
      setProjects(list);
    } catch (err) {
      console.error('프로젝트 목록 조회 실패:', err);
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleOpenProjectManager = () => {
    refreshProjects();
    setProjectListOpen(true);
  };

  const handleSelectProject = async (projectId) => {
    if (projectId === currentProjectId) return;

    // Flush current project save
    clearTimeout(saveTimerRef.current);
    if (currentProjectId) {
      try {
        await saveProject(currentProjectId, {
          plan: globalState.plan,
          benchmark: globalState.benchmark,
          script: globalState.script,
          metadata: globalState.metadata,
          upload: globalState.upload,
          seriesPlan: globalState.seriesPlan,
          activeTab,
        });
      } catch (err) {
        console.error('프로젝트 저장 실패:', err);
      }
    }

    // Load new project
    try {
      const proj = await loadProject(projectId);
      if (proj) applyProject(proj);
    } catch (err) {
      console.error('프로젝트 로드 실패:', err);
    }
  };

  const handleCreateProject = async (name) => {
    if (!uid) return;
    try {
      const newId = await createProject(uid, name, INIT_STATE);
      setCurrentProjectId(newId);
      setCurrentProjectName(name);
      setGlobalState(INIT_STATE);
      setActiveTab('plan');
      localStorage.setItem(LAST_PROJECT_KEY, newId);
      lastSavedRef.current = null;
      setProjectListOpen(false);
      refreshProjects().catch(() => {});
    } catch (err) {
      console.error('프로젝트 생성 실패:', err);
      alert('프로젝트 생성 실패: ' + err.message);
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      await deleteProject(projectId);
      if (projectId === currentProjectId) {
        setCurrentProjectId(null);
        setCurrentProjectName('');
        setGlobalState(INIT_STATE);
        setActiveTab('plan');
        localStorage.removeItem(LAST_PROJECT_KEY);
      }
      await refreshProjects();
    } catch (err) {
      console.error('프로젝트 삭제 실패:', err);
    }
  };

  const handleRenameProject = async (projectId, newName) => {
    try {
      await renameProject(projectId, newName);
      if (projectId === currentProjectId) {
        setCurrentProjectName(newName);
      }
      await refreshProjects();
    } catch (err) {
      console.error('프로젝트 이름 변경 실패:', err);
    }
  };

  // Determine if a tab is "completed"
  const isTabCompleted = (tabId) => {
    if (tabId === 'plan' && globalState.plan.topic.length > 0) return true;
    if (tabId === 'benchmark' && globalState.benchmark.channels.length > 0) return true;
    if (tabId === 'script' && globalState.script.final_hook) return true;
    if (tabId === 'media' && globalState.media.generatedImages?.some(q => q.status === 'done')) return true;
    if (tabId === 'upload' && globalState.upload.videoId) return true;
    return false;
  };

  // --- Loading Screen ---
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={36} color="var(--primary)" />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>불러오는 중...</span>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ globalState, updateState }}>
      <div className="app-container">

        {/* Header */}
        <header className="header">
          <div className="header-logo" onClick={() => setActiveTab('plan')} style={{ cursor: 'pointer' }}>
            <PlaySquare color="var(--primary)" size={28} />
            <span>JjangSaem YouTube</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Save status indicator */}
            {currentProjectId && (
              <div className="save-status" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {saveStatus === 'saving' && <><Loader2 className="animate-spin" size={12} /> 저장 중...</>}
                {saveStatus === 'saved' && <><Cloud size={12} color="#22c55e" /> 저장됨</>}
                {saveStatus === 'error' && <><CloudOff size={12} color="#ef4444" /> 저장 실패</>}
              </div>
            )}

            {/* Project selector button */}
            <button className="header-btn" onClick={handleOpenProjectManager}>
              <FolderOpen size={16} />
              <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentProjectName || '프로젝트 선택'}
              </span>
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="main-content">

          {/* No project selected */}
          {!currentProjectId && (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
              <FolderOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>프로젝트를 선택하거나 새로 생성해주세요.</p>
              <button className="btn-primary" onClick={handleOpenProjectManager}>
                <FolderOpen size={18} /> 프로젝트 관리
              </button>
            </div>
          )}

          {/* Tabs Navigation */}
          {currentProjectId && (
            <>
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

              {/* All Tab Panels */}
              <div style={{ display: activeTab === 'plan' ? 'block' : 'none' }}>
                <PlanPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('benchmark')} />
              </div>
              <div style={{ display: activeTab === 'benchmark' ? 'block' : 'none' }}>
                <BenchmarkPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('script')} />
              </div>
              <div style={{ display: activeTab === 'script' ? 'block' : 'none' }}>
                <ScriptPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('media')} />
              </div>
              <div style={{ display: activeTab === 'media' ? 'block' : 'none' }}>
                <MediaPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('upload')} />
              </div>
              <div style={{ display: activeTab === 'upload' ? 'block' : 'none' }}>
                <UploadPanel globalState={globalState} updateState={updateState} onNext={() => setActiveTab('dashboard')} setActiveTab={setActiveTab} />
              </div>
              <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                <DashboardPanel globalState={globalState} onNavigate={setActiveTab} updateState={updateState} />
              </div>
            </>
          )}

        </main>

      </div>

      {/* Project Manager Modal */}
      <ProjectManager
        open={projectListOpen}
        onClose={() => setProjectListOpen(false)}
        projects={projects}
        currentProjectId={currentProjectId}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
        onRename={handleRenameProject}
        loading={projectsLoading}
      />
    </AppContext.Provider>
  );
}
