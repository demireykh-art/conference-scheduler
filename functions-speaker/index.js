/**
 * 연자 본인 강의 제목 수정 함수 (codebase: speaker)
 * AI 강의 입력 함수(functions/, Secret 필요)와 분리해 단독 배포한다.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

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
