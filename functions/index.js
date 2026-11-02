/**
 * AI 강의 입력 — 캡처·PDF·텍스트(카톡 복붙 등)를 읽어 스케줄러 강의 항목으로 변환
 *
 * - 호출: 스케줄러 웹(scheduler/js/ai-import.js)에서 httpsCallable('aiExtractLectures')
 * - 권한: 로그인 + /users/{uid}/role 이 admin 또는 editor 인 사용자만
 * - 저장은 하지 않음. 결과는 미리보기로만 돌려주고, 저장은 사람이 '업로드 확정'으로 결정
 * - API 키는 Secret Manager(ANTHROPIC_API_KEY)에만 둠. 브라우저 코드에 절대 넣지 않음
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-sonnet-5-5';
const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // base64 디코딩 기준 합계 15MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const LECTURE_TOOL = {
  name: 'save_lectures',
  description: '자료에서 찾은 강의 항목을 스케줄러 형식으로 반환한다.',
  input_schema: {
    type: 'object',
    properties: {
      lectures: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', description: '허용 분류 목록 중 하나. 확신 없으면 빈 문자열' },
            titleKo: { type: 'string', description: '국문 제목. 원문 그대로' },
            titleEn: { type: 'string', description: '영문 제목. 원문에 있을 때만, 번역해서 만들지 말 것' },
            speakerKo: { type: 'string', description: '연자 실명. 기존 연자 목록과 같은 사람이면 목록 표기 그대로' },
            speakerEn: { type: 'string' },
            affiliation: { type: 'string', description: '소속 병원/기관' },
            affiliationEn: { type: 'string' },
            duration: { type: 'integer', description: '분 단위. 원문에 없으면 0' },
            companyName: { type: 'string', description: '후원/파트너 업체. 기존 업체 목록 표기 우선' },
            productName: { type: 'string' },
            isLuncheon: { type: 'boolean' },
            speakerMatched: { type: 'boolean', description: '기존 연자 목록과 매칭되면 true' },
            note: { type: 'string', description: '애매한 점(호칭만 있음, 제목 확정 아님 등)을 한 줄로. 없으면 빈 문자열' }
          },
          required: ['titleKo', 'speakerKo', 'category', 'duration', 'speakerMatched', 'note']
        }
      }
    },
    required: ['lectures']
  }
};

function buildSystemPrompt(ctx) {
  const list = (arr, n) => (arr || []).slice(0, n).join(', ') || '(없음)';
  return [
    '너는 의학 학술대회 프로그램 스케줄러의 입력 도우미다.',
    '사용자가 준 캡처·PDF·텍스트(카카오톡 대화 등)에서 "확정된 강의" 정보만 뽑아 save_lectures 도구로 반환한다.',
    '',
    '규칙:',
    '1. 원문에 없는 정보는 절대 만들지 않는다. 모르면 빈 문자열, 시간은 0.',
    '2. 대화 중 제안·검토 단계 문구와 최종 제목이 함께 있으면 마지막에 확정된 제목만 쓴다.',
    '3. 연자는 실명으로. "민형 형님", "@박민형원장님"처럼 호칭이 붙은 경우 기존 연자 목록과 맞춰 실명으로 바꾸고, 목록에 없으면 원문 이름에서 호칭(원장님/형님/교수님)만 뗀다.',
    '4. 분류(category)는 아래 허용 목록 중에서만 고른다. 애매하면 빈 문자열.',
    '5. 영문 제목은 원문에 있을 때만. 번역해서 채우지 않는다.',
    '6. 애매한 점은 note에 한 줄로 남긴다.',
    '7. 강의가 하나도 없으면 빈 배열을 반환한다.',
    '',
    `허용 분류: ${list(ctx.categories, 80)}`,
    `기존 연자: ${list(ctx.speakers, 600)}`,
    `기존 업체: ${list(ctx.companies, 300)}`
  ].join('\n');
}

exports.aiExtractLectures = onCall(
  { region: 'asia-northeast3', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    // 1) 권한 확인
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    const roleSnap = await admin.database().ref(`/users/${request.auth.uid}/role`).once('value');
    const role = roleSnap.val();
    if (role !== 'admin' && role !== 'editor') {
      throw new HttpsError('permission-denied', '편집 권한이 있는 계정만 사용할 수 있습니다.');
    }

    // 2) 입력 검증
    const { text = '', files = [], context = {} } = request.data || {};
    if (!text.trim() && files.length === 0) {
      throw new HttpsError('invalid-argument', '텍스트나 파일을 넣어주세요.');
    }
    if (files.length > MAX_FILES) throw new HttpsError('invalid-argument', `파일은 ${MAX_FILES}개까지 가능합니다.`);
    let total = 0;
    const content = [];
    for (const f of files) {
      if (!f || typeof f.data !== 'string') continue;
      total += Math.floor(f.data.length * 0.75);
      if (total > MAX_TOTAL_BYTES) throw new HttpsError('invalid-argument', '파일 용량 합계가 15MB를 넘습니다.');
      if (IMAGE_TYPES.includes(f.mediaType)) {
        content.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.data } });
      } else if (f.mediaType === 'application/pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
      } else {
        throw new HttpsError('invalid-argument', `지원하지 않는 형식: ${f.mediaType}`);
      }
    }
    content.push({
      type: 'text',
      text: (text.trim() ? `붙여넣은 텍스트:\n"""\n${text.slice(0, 50000)}\n"""\n\n` : '') +
        '위 자료에서 강의 항목을 뽑아 save_lectures로 반환해줘.'
    });

    // 3) Claude 호출 (도구 강제 → 항상 JSON 형태로 받음)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY.value(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: buildSystemPrompt(context),
        tools: [LECTURE_TOOL],
        tool_choice: { type: 'tool', name: 'save_lectures' },
        messages: [{ role: 'user', content }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error', res.status, errText);
      throw new HttpsError('internal', `AI 호출 실패 (${res.status})`);
    }
    const body = await res.json();
    const toolUse = (body.content || []).find(b => b.type === 'tool_use');
    const lectures = (toolUse && toolUse.input && Array.isArray(toolUse.input.lectures)) ? toolUse.input.lectures : [];

    console.log('aiExtractLectures', { uid: request.auth.uid, files: files.length, textLen: text.length, count: lectures.length, usage: body.usage });
    return { lectures };
  }
);
