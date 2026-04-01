import React from 'react';
import { ClipboardList, Search, FileText, Image as ImageIcon, Upload, CheckCircle2, Circle, ChevronRight, BarChart2, Tag, Type, Clock, ArrowRight } from 'lucide-react';

const STEPS = [
  { id: 'plan', label: '기획', icon: ClipboardList },
  { id: 'benchmark', label: '벤치마킹', icon: Search },
  { id: 'script', label: '대본', icon: FileText },
  { id: 'media', label: '미디어', icon: ImageIcon },
  { id: 'upload', label: '업로드', icon: Upload },
];

function getStepStatus(stepId, globalState) {
  const { plan, benchmark, script, media, metadata, upload } = globalState;
  switch (stepId) {
    case 'plan':
      return plan.topic.length > 0 ? 'done' : 'idle';
    case 'benchmark':
      return benchmark.channels?.length > 0 ? 'done' : plan.topic ? 'ready' : 'idle';
    case 'script':
      return script.hook ? 'done' : benchmark.channels?.length > 0 ? 'ready' : 'idle';
    case 'media':
      return media.generatedImages?.some(img => img.status === 'done') ? 'done' : script.hook ? 'ready' : 'idle';
    case 'upload':
      return upload.videoId ? 'done' : metadata.title ? 'ready' : 'idle';
    default:
      return 'idle';
  }
}

function ScoreBar({ score, label }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
      <span style={{ width: '60px', color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ flex: 1, height: '8px', backgroundColor: 'var(--gray-200)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ width: '40px', textAlign: 'right', fontWeight: 600, color }}>{score}점</span>
    </div>
  );
}

export default function DashboardPanel({ globalState, onNavigate, updateState }) {
  const { plan, benchmark, script, media, metadata, upload, seriesPlan } = globalState;

  const stepsWithStatus = STEPS.map(s => ({ ...s, status: getStepStatus(s.id, globalState) }));
  const doneCount = stepsWithStatus.filter(s => s.status === 'done').length;
  const progressPct = Math.round((doneCount / STEPS.length) * 100);

  const hasAnyData = plan.topic.length > 0;

  return (
    <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 className="panel-title" style={{ margin: 0 }}>현황 대시보드</h2>

      {/* Pipeline Progress */}
      <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>제작 파이프라인</h3>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary)' }}>{doneCount}/{STEPS.length} 완료 ({progressPct}%)</span>
        </div>

        {/* Overall progress bar */}
        <div style={{ height: '6px', backgroundColor: 'var(--gray-200)', borderRadius: '3px', overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '3px', transition: 'width 0.3s' }} />
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {stepsWithStatus.map((step, idx) => {
            const Icon = step.icon;
            const isDone = step.status === 'done';
            const isReady = step.status === 'ready';
            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => onNavigate(step.id)}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                    padding: '0.75rem 0.5rem', border: isDone ? '2px solid #22c55e' : isReady ? '2px solid var(--primary)' : '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    backgroundColor: isDone ? '#f0fdf4' : isReady ? 'var(--secondary)' : 'var(--surface)',
                    transition: 'all 0.2s'
                  }}
                >
                  {isDone ? <CheckCircle2 size={20} color="#22c55e" /> : <Icon size={20} color={isReady ? 'var(--primary)' : 'var(--gray-400)'} />}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isDone ? '#22c55e' : isReady ? 'var(--primary)' : 'var(--gray-400)' }}>
                    {step.label}
                  </span>
                </button>
                {idx < stepsWithStatus.length - 1 && (
                  <ChevronRight size={16} color="var(--gray-300)" style={{ flexShrink: 0 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {!hasAnyData ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: 'var(--gray-400)' }}>
          <BarChart2 size={48} style={{ marginBottom: '1rem' }} />
          <p style={{ fontSize: '1rem' }}>기획 탭에서 주제를 입력하면 대시보드가 활성화됩니다.</p>
          <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => onNavigate('plan')}>기획 시작하기</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

          {/* Project Summary Card */}
          <div style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', gridColumn: plan.topic ? '1 / -1' : undefined }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardList size={16} color="var(--primary)" /> 프로젝트 요약
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>주제</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{plan.topic || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>포맷</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{plan.format}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>대상 시청자</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{plan.targets.length > 0 ? plan.targets.join(', ') : '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>톤 / 모델</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{plan.tone} / {plan.model.replace('claude-', '').split('-').slice(0,2).join('-')}</div>
              </div>
              {plan.ebookName && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>연계 전자책</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{plan.ebookName} {plan.ebookSummary ? '(요약 완료)' : ''}</div>
                </div>
              )}
            </div>
          </div>

          {/* Benchmark Stats */}
          {benchmark.channels?.length > 0 && (
            <div style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Search size={16} color="var(--primary)" /> 벤치마킹 결과
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <StatRow label="분석 채널" value={`${benchmark.channels.length}개`} />
                <StatRow label="제목 공식" value={`${benchmark.titleFormulas?.formulas?.length || 0}개 패턴`} />
                <StatRow label="태그풀" value={`${benchmark.tagPool?.length || 0}개`} />
                {benchmark.thumbnailPatterns?.dominantColors && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', width: '80px' }}>주요 색상</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {benchmark.thumbnailPatterns.dominantColors.slice(0, 5).map((c, i) => (
                        <div key={i} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: c, border: '1px solid var(--gray-200)' }} title={c} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Script Stats */}
          {script.hook && (
            <div style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={16} color="var(--primary)" /> 대본 요약
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <StatRow label="섹션 수" value={`${script.sections?.length || 0}개`} />
                <StatRow label="제목 후보" value={`${script.titleSuggestions?.length || 0}개`} />
                <StatRow label="썸네일 카피" value={`${script.thumbnailCopies?.length || 0}개`} />
                {script.final_title && (
                  <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>최종 제목</div>
                    <div style={{ fontWeight: 600 }}>{script.final_title}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Media Stats */}
          {media.generatedImages?.length > 0 && (
            <div style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ImageIcon size={16} color="var(--primary)" /> 미디어 현황
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(() => {
                  const imgs = media.generatedImages;
                  const done = imgs.filter(i => i.status === 'done').length;
                  const errors = imgs.filter(i => i.status === 'error').length;
                  return (
                    <>
                      <StatRow label="생성 완료" value={`${done}/${imgs.length}장`} />
                      {errors > 0 && <StatRow label="실패" value={`${errors}장`} color="#ef4444" />}
                    </>
                  );
                })()}
                {media.timeline?.length > 0 && (
                  <StatRow label="타임라인" value={`${media.timeline.length}컷 / ${media.timeline.reduce((s, t) => s + (t.duration || 0), 0)}초`} />
                )}
                {/* Thumbnail previews */}
                {(media.thumbnailA || media.thumbnailB) && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {media.thumbnailA && <img src={media.thumbnailA} alt="Thumb A" style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--gray-200)' }} />}
                    {media.thumbnailB && <img src={media.thumbnailB} alt="Thumb B" style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--gray-200)' }} />}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata SEO Scores */}
          {metadata.title?.text && (
            <div style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tag size={16} color="var(--primary)" /> SEO 메타데이터 점수
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <ScoreBar score={metadata.title.score || 0} label="제목" />
                <ScoreBar score={metadata.description?.score || 0} label="설명" />
                <ScoreBar score={metadata.tags?.score || 0} label="태그" />
              </div>
              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--gray-100)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{metadata.title.text}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  태그 {metadata.tags?.list?.length || 0}개 | 해시태그 {metadata.hashtags?.length || 0}개
                </div>
              </div>
            </div>
          )}

          {/* Upload Status */}
          {(upload.videoId || upload.uploadStatus === 'manual_complete') && (
            <div style={{ padding: '1.25rem', border: '2px solid #22c55e', borderRadius: 'var(--radius-lg)', backgroundColor: '#f0fdf4', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22c55e' }}>
                <CheckCircle2 size={16} /> 업로드 완료
              </h3>
              {upload.videoId && upload.videoId !== 'manual' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <StatRow label="Video ID" value={upload.videoId} />
                    <StatRow label="공개 범위" value={upload.privacy === 'public' ? '공개' : upload.privacy === 'unlisted' ? '일부 공개' : '비공개'} />
                    {upload.uploadAt && <StatRow label="업로드 시각" value={new Date(upload.uploadAt).toLocaleString('ko-KR')} />}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <a href={`https://studio.youtube.com/video/${upload.videoId}/edit`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.875rem' }}>YouTube Studio</a>
                    <a href={`https://youtube.com/watch?v=${upload.videoId}`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.875rem' }}>영상 보기</a>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  직접 YouTube에 업로드 완료됨
                </div>
              )}
            </div>
          )}

          {/* Series Progress */}
          {seriesPlan?.items?.length > 0 && (upload.videoId || upload.uploadStatus === 'manual_complete') && (() => {
            const currentIdx = seriesPlan.items.findIndex(it => it.status === 'current');
            const nextItem = seriesPlan.items.find((it, i) => i > currentIdx && it.status === 'pending');
            const completedCount = seriesPlan.items.filter(it => it.status === 'completed').length;

            const handleContinue = () => {
              const newItems = seriesPlan.items.map(it => {
                if (it.status === 'current') return { ...it, status: 'completed' };
                return it;
              });
              if (nextItem) {
                const nextIdx = seriesPlan.items.indexOf(nextItem);
                newItems[nextIdx] = { ...newItems[nextIdx], status: 'current' };
              }
              updateState('seriesPlan', { ...seriesPlan, items: newItems });

              if (nextItem) {
                updateState('plan', { ...plan, topic: nextItem.title, format: nextItem.format });
                updateState('script', { hook: '', empathy: '', twist: '', sections: [], cta: '', titleSuggestions: [], thumbnailCopies: [] });
                updateState('benchmark', { channels: [], thumbnailPatterns: [], titleFormulas: [], tagPool: [] });
                updateState('metadata', { title: '', description: '', tags: [], hashtags: [], cotLog: '' });
                updateState('upload', { scheduleType: '', scheduledAt: '', visibility: '', uploadStatus: '' });
              }
              onNavigate('plan');
            };

            return (
              <div style={{ padding: '1.25rem', border: '2px solid #3b82f6', borderRadius: 'var(--radius-lg)', backgroundColor: '#eff6ff', gridColumn: '1 / -1' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1d4ed8' }}>
                  <BarChart2 size={16} /> 시리즈 진행 현황: {completedCount + 1}/{seriesPlan.items.length} 완료
                </h3>

                {/* Series item list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {seriesPlan.items.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: item.status === 'current' ? '#dbeafe' : item.status === 'completed' ? '#f0fdf4' : 'white',
                      border: item.status === 'current' ? '1px solid #93c5fd' : '1px solid var(--gray-200)'
                    }}>
                      {item.status === 'completed' ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                      ) : item.status === 'current' ? (
                        <ArrowRight size={16} color="#3b82f6" />
                      ) : (
                        <Circle size={16} color="var(--gray-300)" />
                      )}
                      <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: item.status === 'current' ? 600 : 400 }}>
                        {item.title}
                      </span>
                      <span style={{
                        fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                        color: item.format?.startsWith('쇼츠') ? '#ea580c' : '#7c3aed',
                        backgroundColor: item.format?.startsWith('쇼츠') ? '#ea580c15' : '#7c3aed15'
                      }}>
                        {item.format}
                      </span>
                    </div>
                  ))}
                </div>

                {nextItem ? (
                  <button
                    className="btn-primary"
                    style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                    onClick={handleContinue}
                  >
                    다음 영상 제작 시작하기: {nextItem.title}
                  </button>
                ) : (
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#16a34a', textAlign: 'center', padding: '0.5rem' }}>
                    모든 시리즈 영상 제작이 완료되었습니다!
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || 'var(--text-main)' }}>{value}</span>
    </div>
  );
}
