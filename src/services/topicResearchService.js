import { fetchWithRetry } from '../utils/fetchWithRetry';

export const TOPIC_CATEGORIES = [
  '발달장애',
  'ADHD',
  '원시반사',
  'HSP',
  '사경',
  '사두증',
  '모로반사',
  '자폐',
  '이른둥이',
  '장애아이',
];

const ISO_DAYS_AGO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

const TOPIC_HISTORY_KEY = 'jjangsaem.topicSearch.history';
const TOPIC_HISTORY_MAX = 50;

const PERSPECTIVE_SEEDS = [
  '연령대별 관점 — 영아(0~2세) / 유아(3~6세) / 학령기(7~12세) 중 한두 시기에 집중해서 풀기',
  '감각통합·원시반사 관점에서 일상 행동을 신경계 메커니즘으로 해석',
  '수면/식이/등원 거부/배변 등 부모가 매일 부딪히는 루틴 문제 중심',
  '부모의 정서·번아웃·양육 스트레스 — 아이가 아닌 부모 자신을 돌보는 관점',
  '최신 신경발달 연구·임상 인사이트와 가정 적용 사이를 연결',
  '행동 교정이 아닌 환경/감각 조절·예방 전략 위주',
  '또래 관계·사회성 발달·기관(어린이집/유치원/학교) 적응 관점',
  '진단명에 갇히지 않고 증상의 신경계 메커니즘을 풀어 설명',
  '형제·가족 관계 안에서의 발달 이슈와 가족 시스템 관점',
  '디지털·미디어 노출과 신경계 발달의 관계',
];

const YT_ORDERS = ['viewCount', 'relevance', 'date'];
const LOOKBACK_OPTIONS = [45, 60, 90, 120];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getTopicHistory() {
  try {
    const raw = localStorage.getItem(TOPIC_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendTopicHistory(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return;
  try {
    const prev = getTopicHistory();
    const seen = new Set(prev);
    const merged = [...prev];
    for (const t of titles) {
      const trimmed = (t || '').trim();
      if (!trimmed || seen.has(trimmed)) continue;
      merged.push(trimmed);
      seen.add(trimmed);
    }
    const trimmedHistory = merged.slice(-TOPIC_HISTORY_MAX);
    localStorage.setItem(TOPIC_HISTORY_KEY, JSON.stringify(trimmedHistory));
  } catch {
    // localStorage 사용 불가 환경 — 무시
  }
}

export function clearTopicHistory() {
  try {
    localStorage.removeItem(TOPIC_HISTORY_KEY);
  } catch {
    // noop
  }
}

async function fetchYoutubeTopVideosForKeyword(keyword, publishedAfter, maxResults = 10, order = 'viewCount') {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: keyword,
    maxResults: String(maxResults),
    relevanceLanguage: 'ko',
    regionCode: 'KR',
    order,
    publishedAfter,
  });
  const res = await fetch(`/api/youtube/search?${params.toString()}`);
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  return (data.items || []).map((item) => ({
    title: item.snippet?.title || '',
    channelTitle: item.snippet?.channelTitle || '',
    publishedAt: item.snippet?.publishedAt || '',
    description: (item.snippet?.description || '').slice(0, 200),
  }));
}

/**
 * 카테고리들에서 최근 lookbackDays일 사이에 가장 많이 본 YouTube 영상 타이틀을 모은 뒤
 * Claude로 5개의 트렌드 주제를 뽑아 반환.
 *
 * @param {string[]} categories — 검색할 카테고리 배열 (없으면 TOPIC_CATEGORIES 전체)
 * @param {object}  opts
 * @param {number}  opts.lookbackDays   미지정 시 [45,60,90,120]일 중 무작위 (다양성 확보용)
 * @param {number}  opts.perCategory    카테고리당 가져올 영상 수
 * @param {string}  opts.model          Claude 모델 ID
 * @returns {Promise<{topics: Array<{title:string, why:string, category:string}>, sourceCount:number, lookbackDays:number, perspective:string}>}
 */
export async function researchTrendingTopics(categories, opts = {}) {
  // lookback: 명시되지 않으면 무작위 (45/60/90/120일) — 같은 카테고리라도 다른 시기 인기 영상이 들어오게
  const lookbackDays = opts.lookbackDays ?? pickRandom(LOOKBACK_OPTIONS);
  const perCategory = opts.perCategory ?? 8;
  const model = opts.model || 'claude-haiku-4-5-20251001';

  const cats = (categories && categories.length > 0) ? categories : TOPIC_CATEGORIES;
  const publishedAfter = ISO_DAYS_AGO(lookbackDays);

  // YouTube 검색 — 카테고리별 병렬, 카테고리마다 정렬 기준을 무작위로 (다른 영상 풀 유입)
  const results = await Promise.all(
    cats.map(async (cat) => {
      const order = pickRandom(YT_ORDERS);
      const videos = await fetchYoutubeTopVideosForKeyword(cat, publishedAfter, perCategory, order);
      return { category: cat, videos, order };
    })
  );

  const totalVideoCount = results.reduce((sum, r) => sum + r.videos.length, 0);

  // 컨텍스트 묶어서 Claude로 트렌드 주제 5개 추출 — 카테고리 순서도 매번 셔플
  const corpusBlock = shuffle(results)
    .map(({ category, videos, order }) => {
      if (videos.length === 0) return `[${category} · ${order}] (검색 결과 없음)`;
      const lines = videos.map((v, i) => `  ${i + 1}. ${v.title}  — ${v.channelTitle}`).join('\n');
      return `[${category} · ${order}]\n${lines}`;
    })
    .join('\n\n');

  const history = getTopicHistory();
  const exclusionBlock = history.length > 0
    ? `\n[이미 제안한 주제 — 반드시 제외, 변형/유사 표현도 금지]\n${history.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\n`
    : '';

  // 매 호출마다 다른 "각도"로 보도록 관점 시드를 무작위 주입
  const perspective = pickRandom(PERSPECTIVE_SEEDS);

  const prompt = `당신은 한국 유튜브 트렌드 분석가입니다. 아래는 최근 ${lookbackDays}일 사이 한국에서 조회수가 많이 나온 YouTube 영상 목록입니다 (카테고리별).

이 데이터를 분석해서, **부모(특히 발달장애·신경발달·재활 관련 자녀를 둔 부모)들의 최근 관심사**를 가장 잘 대표하는 **유튜브 영상 주제 5개**를 제안해주세요.

[원천 데이터 — YouTube 인기 영상 타이틀]
${corpusBlock}
${exclusionBlock}
[이번 검색의 각도 — 이 렌즈로 5개를 풀어내세요]
${perspective}

[채널 컨셉]
"키즈피지오/짱샘" — 아이의 행동을 설명하는 채널이 아니라, 아이의 '신경계'를 이해하는 채널.
대상: 발달이 걱정되는 아이를 키우는 부모.
톤: 따뜻하고 전문적, 5060이 아닌 30~40대 부모 대상.

[주제 선정 기준]
1. 위 데이터에서 반복적으로 등장하거나, 특히 조회수·관심이 높은 키워드를 우선 반영
2. 너무 광범위하지 않고 영상 1편으로 다룰 수 있는 좁은 주제
3. 클릭을 유발할 만한 부모의 실제 고민 (검색 의도가 명확)
4. 5개 주제는 서로 겹치지 않게 (다른 카테고리/관점 분포)
5. 단순 행동 설명이 아닌, 신경계·발달 메커니즘을 풀 수 있는 주제 우대
6. "이미 제안한 주제"가 있다면, 그 목록과 의미상 겹치지 않는 새로운 각도/하위 주제로 제안 (같은 키워드라도 다른 관점·증상·연령대·대처법 등으로 변주)
7. 위 "이번 검색의 각도"를 5개 모두에 일관되게 반영 — 다른 각도였다면 나오지 않았을 주제 위주로

[출력 형식 — JSON만]
{
  "topics": [
    {
      "title": "유튜브 영상 주제 (한 문장, 25자 이내, 그 자체로 주제기반 기획에 바로 넣을 수 있도록 명확하게)",
      "why": "왜 최근 관심사인지 — 원천 데이터 근거 1~2줄",
      "category": "위 카테고리 중 가장 가까운 하나"
    }
  ]
}
topics 배열 길이는 정확히 5개. JSON만 출력.`;

  const res = await fetchWithRetry('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error('주제 추출 API 호출 실패');
  }
  const apiData = await res.json();
  const text = apiData.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('주제 JSON 파싱 실패');
  const parsed = JSON.parse(match[0]);
  const topics = Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [];
  appendTopicHistory(topics.map((t) => t?.title).filter(Boolean));
  return {
    topics,
    sourceCount: totalVideoCount,
    lookbackDays,
    perspective,
  };
}
