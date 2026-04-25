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

async function fetchYoutubeTopVideosForKeyword(keyword, publishedAfter, maxResults = 10) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: keyword,
    maxResults: String(maxResults),
    relevanceLanguage: 'ko',
    regionCode: 'KR',
    order: 'viewCount',
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
 * @param {number}  opts.lookbackDays   기본 60일 (=2개월)
 * @param {number}  opts.perCategory    카테고리당 가져올 영상 수
 * @param {string}  opts.model          Claude 모델 ID
 * @returns {Promise<{topics: Array<{title:string, why:string, category:string}>, sourceCount:number}>}
 */
export async function researchTrendingTopics(categories, opts = {}) {
  const lookbackDays = opts.lookbackDays ?? 60;
  const perCategory = opts.perCategory ?? 8;
  const model = opts.model || 'claude-haiku-4-5-20251001';

  const cats = (categories && categories.length > 0) ? categories : TOPIC_CATEGORIES;
  const publishedAfter = ISO_DAYS_AGO(lookbackDays);

  // YouTube 검색 — 카테고리별 병렬
  const results = await Promise.all(
    cats.map(async (cat) => {
      const videos = await fetchYoutubeTopVideosForKeyword(cat, publishedAfter, perCategory);
      return { category: cat, videos };
    })
  );

  const totalVideoCount = results.reduce((sum, r) => sum + r.videos.length, 0);

  // 컨텍스트 묶어서 Claude로 트렌드 주제 5개 추출
  const corpusBlock = results
    .map(({ category, videos }) => {
      if (videos.length === 0) return `[${category}] (검색 결과 없음)`;
      const lines = videos.map((v, i) => `  ${i + 1}. ${v.title}  — ${v.channelTitle}`).join('\n');
      return `[${category}]\n${lines}`;
    })
    .join('\n\n');

  const prompt = `당신은 한국 유튜브 트렌드 분석가입니다. 아래는 최근 ${lookbackDays}일 사이 한국에서 조회수가 많이 나온 YouTube 영상 목록입니다 (카테고리별).

이 데이터를 분석해서, **부모(특히 발달장애·신경발달·재활 관련 자녀를 둔 부모)들의 최근 관심사**를 가장 잘 대표하는 **유튜브 영상 주제 5개**를 제안해주세요.

[원천 데이터 — YouTube 인기 영상 타이틀]
${corpusBlock}

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
  return {
    topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
    sourceCount: totalVideoCount,
  };
}
