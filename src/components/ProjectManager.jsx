import React, { useState } from 'react';
import { X, Plus, FolderOpen, Trash2, Pencil, Clock, Loader2 } from 'lucide-react';

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
  onDelete,
  onRename,
  loading,
}) {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

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
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
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
