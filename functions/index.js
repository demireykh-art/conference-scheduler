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

/* ============================================================
 * 연자 본인 강의 제목 수정 — editLectureTitle / myLectures
 * ------------------------------------------------------------
 * 호출자는 스케줄러 로그인 사용자가 아님. 두 가지로 "이 사람이 이 강의 연자"인지 확인한다.
 *   1) ASLS 이사회 앱(asls-board) 이사: 이사회 앱 로그인 ID 토큰 → 이사회 앱 Firestore users/<uid>
 *      (활성 이사 + 연결한 speakerId) — 토큰은 asls-board 프로젝트 기준으로 검증
 *   2) 외부 연자: 관리자가 만든 개인 링크의 비밀 토큰 /lectureEditTokens/<token> = { s: speakerId, c?: confId }
 * 확인되면 강의풀 제목 + 시간표에 배치된 사본 제목을 함께 바꾸고, titleEdit(수정 표시)·변경이력을 남긴다.
 * 시간·룸·연자·스폰서 등 다른 항목은 바꿀 수 없다.
 * ============================================================ */
const { ServerValue } = require('firebase-admin/database');
const BOARD_PROJECT = 'asls-board';
let boardApp = null;
function board() {
  if (!boardApp) boardApp = admin.initializeApp({ projectId: BOARD_PROJECT }, 'asls-board');
  return boardApp;
}
const cleanTitle = (v, max) => (typeof v === 'string' ? v.replace(/\r/g, '').trim() : '').slice(0, max);

// 호출자 → { speakerId, who, via, confId? }
async function resolveCaller(auth) {
  if (!auth || typeof auth !== 'object') throw new HttpsError('unauthenticated', '연자 확인 정보가 없습니다.');
  if (auth.type === 'board') {
    const idToken = String(auth.idToken || '');
    let dec;
    try { dec = await board().auth().verifyIdToken(idToken); }
    catch (e) { throw new HttpsError('unauthenticated', '이사회 앱 로그인이 만료됐어요. 앱을 새로고침해 주세요.'); }
    // 이사회 앱 규칙상 본인 문서는 본인 토큰으로 읽을 수 있음 → 연결한 연자 ID 확인
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${BOARD_PROJECT}/databases/(default)/documents/users/${dec.uid}`,
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) throw new HttpsError('permission-denied', '이사회 앱 회원 정보를 읽지 못했습니다.');
    const f = (await r.json()).fields || {};
    const sv = k => (f[k] && f[k].stringValue) || '';
    if (sv('status') !== 'active') throw new HttpsError('permission-denied', '승인된 이사만 수정할 수 있어요.');
    if (!sv('speakerId')) throw new HttpsError('failed-precondition', '이사회 앱에서 연자 연결을 먼저 해주세요.');
    return { speakerId: sv('speakerId'), who: `${sv('name') || dec.name || ''}${sv('clinic') ? ' ' + sv('clinic') : ''} (이사회 앱 · ${dec.email || dec.uid})`, via: 'board' };
  }
  if (auth.type === 'token') {
    const t = String(auth.token || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) throw new HttpsError('unauthenticated', '링크가 올바르지 않습니다.');
    const v = (await admin.database().ref('/lectureEditTokens/' + t).once('value')).val();
    if (!v || !v.s || v.revoked) throw new HttpsError('unauthenticated', '만료되었거나 잘못된 링크입니다. 학회 사무국에 새 링크를 요청해 주세요.');
    const spk = (await admin.database().ref('/adminSpeakers/' + v.s).once('value')).val() || {};
    return { speakerId: v.s, confId: v.c || '', who: `${spk.nameKo || spk.nameEn || ''} (연자 개인 링크)`, via: 'link' };
  }
  throw new HttpsError('invalid-argument', '알 수 없는 확인 방식입니다.');
}
const hasSpeaker = (lec, sid) => Array.isArray(lec && lec.speakers) && lec.speakers.some(s => s && s.id === sid);

// 내 강의 목록 (외부 연자 링크 페이지용) — 제목·시간·룸만 돌려줌
exports.myLectures = onCall({ region: 'asia-northeast3', timeoutSeconds: 30 }, async (request) => {
  const caller = await resolveCaller(request.data && request.data.auth);
  const spk = (await admin.database().ref('/adminSpeakers/' + caller.speakerId).once('value')).val() || {};
  const confIds = caller.confId ? [caller.confId] : Object.keys((await admin.database().ref('/adminConferences').once('value')).val() || {});
  const out = [];
  for (const cid of confIds) {
    const c = (await admin.database().ref('/adminConferences/' + cid).once('value')).val() || {};
    Object.entries(c.lecturePool || {}).forEach(([lid, l]) => {
      if (!hasSpeaker(l, caller.speakerId)) return;
      out.push({ confId: cid, confTitle: c.title || '', startDate: c.startDate || '', lectureId: lid, titleKo: l.titleKo || '', titleEn: l.titleEn || '', duration: l.duration || 0, partner: l.partnerKo || '' });
    });
  }
  out.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || a.titleKo.localeCompare(b.titleKo));
  return { speaker: { nameKo: spk.nameKo || '', nameEn: spk.nameEn || '' }, lectures: out };
});

exports.editLectureTitle = onCall({ region: 'asia-northeast3', timeoutSeconds: 30 }, async (request) => {
  const d = request.data || {};
  const caller = await resolveCaller(d.auth);
  const confId = String(d.confId || ''), lectureId = String(d.lectureId || '');
  if (!/^[\w-]{4,80}$/.test(confId) || !/^[\w-]{4,80}$/.test(lectureId)) throw new HttpsError('invalid-argument', '강의 정보가 올바르지 않습니다.');
  if (caller.confId && caller.confId !== confId) throw new HttpsError('permission-denied', '이 링크로는 다른 행사의 강의를 수정할 수 없습니다.');
  const titleKo = cleanTitle(d.titleKo, 300), titleEn = d.titleEn == null ? null : cleanTitle(d.titleEn, 300);
  if (!titleKo) throw new HttpsError('invalid-argument', '강의 제목을 입력해 주세요.');

  const base = admin.database().ref('/adminConferences/' + confId);
  const lec = (await base.child('lecturePool/' + lectureId).once('value')).val();
  if (!lec) throw new HttpsError('not-found', '강의를 찾을 수 없습니다.');
  if (!hasSpeaker(lec, caller.speakerId)) throw new HttpsError('permission-denied', '본인 강의만 수정할 수 있어요.');
  const changedKo = titleKo !== (lec.titleKo || ''), changedEn = titleEn != null && titleEn !== (lec.titleEn || '');
  if (!changedKo && !changedEn) return { ok: true, unchanged: true };

  const now = ServerValue.TIMESTAMP;
  const up = {};
  const prev = lec.titleEdit && !lec.titleEdit.ack ? lec.titleEdit : null;   // 확인 전 연속 수정이면 최초 원제목 유지
  up['lecturePool/' + lectureId + '/titleKo'] = titleKo;
  if (changedEn) up['lecturePool/' + lectureId + '/titleEn'] = titleEn;
  up['lecturePool/' + lectureId + '/updatedAt'] = now;
  up['lecturePool/' + lectureId + '/titleEdit'] = {
    at: now, by: caller.who, via: caller.via, speakerId: caller.speakerId, ack: false,
    prevKo: prev ? (prev.prevKo || '') : (lec.titleKo || ''), prevEn: prev ? (prev.prevEn || '') : (lec.titleEn || '')
  };
  // 시간표에 배치된 사본(공개 시간표가 사본 제목을 씀)
  const rooms = (await base.child('rooms').once('value')).val() || {};
  let placed = 0;
  Object.entries(rooms).forEach(([rid, room]) => Object.entries((room && room.sessions) || {}).forEach(([sid, s]) =>
    Object.entries((s && s.lectures) || {}).forEach(([lid, l]) => {
      if (!l || l.lectureId !== lectureId) return;
      const p = `rooms/${rid}/sessions/${sid}/lectures/${lid}/`;
      up[p + 'titleKo'] = titleKo; if (changedEn) up[p + 'titleEn'] = titleEn;
      placed++;
    })));
  await base.update(up);
  const confTitle = (await base.child('title').once('value')).val() || '';
  await admin.database().ref('/adminActivityLog').push({
    ts: now, uid: 'speaker:' + caller.speakerId, userName: caller.who, action: 'update', entity: 'lecture',
    summary: `연자 제목 수정: "${lec.titleKo || ''}" → "${titleKo}"${placed ? ` (시간표 ${placed}곳 반영)` : ''}`,
    confId, confTitle, entityId: lectureId
  });
  console.log('editLectureTitle', { confId, lectureId, via: caller.via, speakerId: caller.speakerId, placed });
  return { ok: true, placed };
});
