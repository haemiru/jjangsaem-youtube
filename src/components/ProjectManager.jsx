import React, { useState } from 'react';
import { X, Plus, FolderOpen, Trash2, Pencil, Clock, Loader2, Sparkles, Search, ArrowRight } from 'lucide-react';
import { researchTrendingTopics, TOPIC_CATEGORIES } from '../services/topicResearchService';

const TAB_LABELS = {
  plan: '기획',
  benchmark: '벤치마킹',
  script: '대본',
  media: '미디어',
  upload: '업로드',
  dashboard: '대시보드',
};

export default function ProjectManager({
  open,
  onClose,
  projects,
  currentProjectId,
  onSelect,
  onCreate,
  onCreateFromTopic,
  onDelete,
  onRename,
  loading,
}) {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [creating, setCreating] = useState(false);

  // --- 주제 검색 상태 ---
  const [topicSearchOpen, setTopicSearchOpen] = useState(false);
  const [selectedCats, setSelectedCats] = useState(TOPIC_CATEGORIES);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [topicResults, setTopicResults] = useState([]);
  const [resultMeta, setResultMeta] = useState(null); // { sourceCount, lookbackDays }

  if (!open) return null;

  const toggleCat = (cat) => {
    setSelectedCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const runTopicSearch = async () => {
    setSearching(true);
    setSearchError('');
    setTopicResults([]);
    try {
      const cats = selectedCats.length > 0 ? selectedCats : TOPIC_CATEGORIES;
      const { topics, sourceCount, lookbackDays, perspective } = await researchTrendingTopics(cats);
      setTopicResults(topics);
      setResultMeta({ sourceCount, lookbackDays, perspective });
      if (topics.length === 0) {
        setSearchError('추출된 주제가 없습니다. 카테고리를 다시 선택해보세요.');
      }
    } catch (err) {
      console.error(err);
      setSearchError('주제 검색 실패: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const pickTopic = async (topic) => {
    if (!onCreateFromTopic) return;
    await onCreateFromTopic(topic);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    await onCreate(name);
    setNewName('');
    setCreating(false);
  };

  const handleRename = async (id) => {
    const name = renameValue.trim();
    if (!name) return;
    await onRename(id, name);
    setRenamingId(null);
    setRenameValue('');
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">프로젝트 관리</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* New project input */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              className="form-control"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 프로젝트 이름"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }}
            >
              {creating ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> 생성</>}
            </button>
          </div>

          {/* 주제 검색 토글 버튼 */}
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              className="btn-secondary"
              onClick={() => setTopicSearchOpen(v => !v)}
              style={{
                width: '100%',
                padding: '0.6rem 1rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                borderStyle: 'dashed',
              }}
            >
              <Sparkles size={16} />
              {topicSearchOpen ? '주제 검색 닫기' : '주제 검색 — 최근 2개월 부모 관심사 5개 추천'}
            </button>
          </div>

          {topicSearchOpen && (
            <div
              style={{
                padding: '1rem',
                marginBottom: '1.25rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--gray-50, #f9fafb)',
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                카테고리 선택 (선택한 키워드의 최근 60일 인기 YouTube 영상을 분석합니다)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {TOPIC_CATEGORIES.map(cat => {
                  const active = selectedCats.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCat(cat)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: active ? 'var(--secondary)' : 'var(--surface)',
                        color: active ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <button
                  className="btn-primary"
                  onClick={runTopicSearch}
                  disabled={searching || selectedCats.length === 0}
                  style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
                >
                  {searching ? (
                    <><Loader2 className="animate-spin" size={14} /> YouTube + Claude 분석 중...</>
                  ) : (
                    <><Search size={14} /> 주제 검색 실행</>
                  )}
                </button>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  선택 카테고리 {selectedCats.length}개
                </span>
              </div>

              {searchError && (
                <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  {searchError}
                </div>
              )}

              {topicResults.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    최근 {resultMeta?.lookbackDays ?? 60}일 YouTube 영상 {resultMeta?.sourceCount ?? 0}개 분석 — 카드 클릭 시 "주제 기반 기획"으로 새 프로젝트 생성.
                  </div>
                  {resultMeta?.perspective && (
                    <div style={{
                      fontSize: '0.72rem',
                      color: 'var(--primary)',
                      background: 'var(--secondary)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-sm, 6px)',
                      marginBottom: '0.6rem',
                      lineHeight: 1.4,
                    }}>
                      🔭 이번 각도: {resultMeta.perspective}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {topicResults.map((t, idx) => (
                      <button
                        key={idx}
                        onClick={() => pickTopic(t.title)}
                        style={{
                          textAlign: 'left',
                          padding: '0.75rem 0.9rem',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.6rem',
                          transition: 'all 0.12s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--primary)';
                          e.currentTarget.style.background = 'var(--secondary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.background = 'var(--surface)';
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                            {t.category && (
                              <span style={{
                                fontSize: '0.65rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                background: 'var(--primary)',
                                color: 'white',
                                fontWeight: 600,
                              }}>
                                {t.category}
                              </span>
                            )}
                            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)' }}>
                              {t.title}
                            </span>
                          </div>
                          {t.why && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                              {t.why}
                            </div>
                          )}
                        </div>
                        <ArrowRight size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Project list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem' }} />
              <div>프로젝트 목록 불러오는 중...</div>
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              프로젝트가 없습니다. 새 프로젝트를 생성해주세요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`project-item ${p.id === currentProjectId ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: p.id === currentProjectId ? '2px solid var(--primary)' : '1px solid var(--border)',
                    backgroundColor: p.id === currentProjectId ? 'var(--secondary)' : 'var(--surface)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => { onSelect(p.id); onClose(); }}
                >
                  <FolderOpen size={18} color={p.id === currentProjectId ? 'var(--primary)' : 'var(--gray-400)'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingId === p.id ? (
                      <input
                        className="form-control"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                        onBlur={() => handleRename(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      />
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                          <span style={{
                            padding: '0.1rem 0.4rem',
                            borderRadius: '3px',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.6875rem',
                          }}>
                            {TAB_LABELS[p.activeTab] || '기획'}
                          </span>
                          {p.plan?.topic && (
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.plan.topic}
                            </span>
                          )}
                          {p.updatedAt && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: 'auto', flexShrink: 0 }}>
                              <Clock size={10} /> {formatDate(p.updatedAt)}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                      className="project-action-btn"
                      title="이름 변경"
                      onClick={(e) => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.name); }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="project-action-btn delete"
                      title="삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`"${p.name}" 프로젝트를 삭제하시겠습니까?`)) {
                          onDelete(p.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
