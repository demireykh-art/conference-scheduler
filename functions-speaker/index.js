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


// 이사회 앱 로그인 토큰 → 이사회 앱 회원 정보 (본인 토큰으로 본인 문서만 읽음)
async function boardUser(idTokenRaw) {
  const idToken = String(idTokenRaw || '');
  let dec;
  try { dec = await board().auth().verifyIdToken(idToken); }
  catch (e) { throw new HttpsError('unauthenticated', '이사회 앱 로그인이 만료됐어요. 앱을 새로고침해 주세요.'); }
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${BOARD_PROJECT}/databases/(default)/documents/users/${dec.uid}`,
    { headers: { Authorization: 'Bearer ' + idToken } });
  if (!r.ok) throw new HttpsError('permission-denied', '이사회 앱 회원 정보를 읽지 못했습니다.');
  const f = (await r.json()).fields || {};
  const sv = k => (f[k] && f[k].stringValue) || '';
  return { uid: dec.uid, email: dec.email || '', name: sv('name') || dec.name || '', clinic: sv('clinic'), status: sv('status'), role: sv('role'), tier: sv('tier'), speakerId: sv('speakerId') };
}

// 호출자 → { speakerId, who, via, confId? }
async function resolveCaller(auth) {
  if (!auth || typeof auth !== 'object') throw new HttpsError('unauthenticated', '연자 확인 정보가 없습니다.');
  if (auth.type === 'board') {
    const u = await boardUser(auth.idToken);
    if (u.status !== 'active') throw new HttpsError('permission-denied', '승인된 이사만 수정할 수 있어요.');
    if (!u.speakerId) throw new HttpsError('failed-precondition', '이사회 앱에서 연자 연결을 먼저 해주세요.');
    return { speakerId: u.speakerId, who: `${u.name}${u.clinic ? ' ' + u.clinic : ''} (이사회 앱 · ${u.email})`, via: 'board' };
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


/* ============================================================
 * 이사회 앱 관리자·사무국의 확인(컨펌) — boardReview
 *   이사회 앱에서 role=admin 또는 tier=사무국 인 활성 회원만
 *   list   : 승인 대기 강의·일정 제출 + 확인 전 연자 제목 수정
 *   approve: 제출 승인 → 강의풀 생성·행사 연자 등록 (해외 연자는 여행 일정 비공개 저장)
 *   reject : 제출 반려
 *   ack    : 연자 제목 수정 확인(표시 해제)
 * 스케줄러 「강의·일정 제출함」 승인과 같은 결과를 만든다.
 * ============================================================ */
const isBoardSub = s => !!s && (s.source === 'board' || (s.travel && s.travel.status === 'domestic') || /^\[ASLS 이사회 앱\]/.test(s.note || ''));
exports.boardReview = onCall({ region: 'asia-northeast3', timeoutSeconds: 60 }, async (request) => {
  const d = request.data || {};
  const u = await boardUser(d.idToken);
  if (u.status !== 'active' || !(u.role === 'admin' || u.tier === '사무국')) throw new HttpsError('permission-denied', '이사회 앱 관리자·사무국만 확인할 수 있어요.');
  const who = `${u.name}${u.clinic ? ' ' + u.clinic : ''} (이사회 앱 관리자 · ${u.email})`;
  const db = admin.database();
  const now = ServerValue.TIMESTAMP;
  const log = (summary, extra) => db.ref('/adminActivityLog').push(Object.assign({ ts: now, uid: 'board:' + u.uid, userName: who, action: 'update', entity: 'lecture', summary }, extra || {}));
  const titleOf = async cid => (await db.ref(`/adminConferences/${cid}/title`).once('value')).val() || '';

  if (d.action === 'list') {
    const subs = (await db.ref('/tripSubmissions').orderByChild('submittedAt').limitToLast(300).once('value')).val() || {};
    const pending = Object.entries(subs).filter(([, v]) => v && v.status !== 'approved' && v.status !== 'rejected')
      .map(([id, v]) => ({ id, confId: v.confId || '', nameKo: v.nameKo || v.nameEn || '', board: isBoardSub(v), submittedAt: v.submittedAt || 0,
        lectures: (v.lectures || []).map(l => ({ title: l.title || '', type: l.type || '', sponsor: l.sponsor || '', duration: l.duration || 0, lang: l.lang || '' })), note: v.note || '' }));
    const confs = (await db.ref('/adminConferences').once('value')).val() || {};
    const edits = [];
    Object.entries(confs).forEach(([cid, c]) => Object.entries((c && c.lecturePool) || {}).forEach(([lid, l]) => {
      if (l && l.titleEdit && !l.titleEdit.ack) edits.push({ confId: cid, confTitle: c.title || '', lectureId: lid, titleKo: l.titleKo || '', prevKo: l.titleEdit.prevKo || '', by: l.titleEdit.by || '', at: l.titleEdit.at || 0 });
    }));
    const ct = Object.fromEntries(Object.entries(confs).map(([cid, c]) => [cid, (c && c.title) || '']));
    pending.forEach(p => { p.confTitle = ct[p.confId] || ''; });
    pending.sort((a, b) => b.submittedAt - a.submittedAt); edits.sort((a, b) => b.at - a.at);
    return { pending, edits };
  }

  if (d.action === 'reject') {
    const id = String(d.id || ''); if (!/^[\w-]{4,80}$/.test(id)) throw new HttpsError('invalid-argument', '잘못된 요청');
    const s = (await db.ref('/tripSubmissions/' + id).once('value')).val(); if (!s) throw new HttpsError('not-found', '제출을 찾을 수 없어요.');
    await db.ref('/tripSubmissions/' + id + '/status').set('rejected');
    await log(`강의·일정 제출 반려 "${s.nameKo || s.nameEn || ''}" (이사회 앱)`, { confId: s.confId || '', confTitle: await titleOf(s.confId), entityId: s.speakerId || '' });
    return { ok: true };
  }

  if (d.action === 'ack') {
    const cid = String(d.confId || ''), lid = String(d.lectureId || '');
    if (!/^[\w-]{4,80}$/.test(cid) || !/^[\w-]{4,80}$/.test(lid)) throw new HttpsError('invalid-argument', '잘못된 요청');
    const ref = db.ref(`/adminConferences/${cid}/lecturePool/${lid}/titleEdit`);
    const t = (await ref.once('value')).val(); if (!t) return { ok: true };
    await ref.update({ ack: true, ackAt: now, ackBy: who });
    await log(`연자 제목 수정 확인: "${t.prevKo || ''}" → 현재 제목 (이사회 앱)`, { confId: cid, confTitle: await titleOf(cid), entityId: lid });
    return { ok: true };
  }

  if (d.action === 'approve') {
    const id = String(d.id || ''); if (!/^[\w-]{4,80}$/.test(id)) throw new HttpsError('invalid-argument', '잘못된 요청');
    const s = (await db.ref('/tripSubmissions/' + id).once('value')).val(); if (!s) throw new HttpsError('not-found', '제출을 찾을 수 없어요.');
    if (s.status === 'approved') return { ok: true, already: true };
    const boardSub = isBoardSub(s);
    let sid = s.speakerId || '';
    if (!sid && s.nameKo) {
      const all = (await db.ref('/adminSpeakers').once('value')).val() || {};
      const hit = Object.entries(all).filter(([, v]) => v && (v.nameKo || '').trim() === s.nameKo.trim());
      if (hit.length !== 1) throw new HttpsError('failed-precondition', hit.length ? `연자 리스트에 "${s.nameKo}"가 ${hit.length}명이라 자동 연결할 수 없어요. 스케줄러 제출함에서 처리해 주세요.` : `연자 리스트에 "${s.nameKo}"가 없어요. 스케줄러에서 연자를 먼저 등록해 주세요.`);
      sid = hit[0][0];
    }
    if (!s.confId || !sid) throw new HttpsError('failed-precondition', '행사·연자 정보가 없어 반영할 수 없어요.');
    const base = db.ref('/adminConferences/' + s.confId);
    const up = {};
    if (!(await base.child('confSpeakers/' + sid).once('value')).exists()) up['confSpeakers/' + sid] = { role: '연자', order: 999 };
    const spk = { id: sid, nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: '', affiliationEn: s.affiliationEn || '' };
    (s.lectures || []).filter(l => l && (l.title || l.type)).forEach((l, i) => {
      const lid = base.child('lecturePool').push().key;
      up['lecturePool/' + lid] = {
        titleKo: l.title || l.type || '(제목 미정)', titleEn: '', duration: Number(l.duration) || 0,
        categories: l.type ? [l.type] : [], tags: [], types: [], speakers: [spk],
        partnerId: '', partnerKo: l.sponsor || '', partnerEn: '', productKo: '', productEn: '', productCategory: '', productDesc: '',
        abstractUrl: l.abstractUrl || '', memo: l.note || '', order: 9000 + i, createdAt: now, updatedAt: now
      };
    });
    if (!boardSub) {   // 해외 연자: 여행 일정·연락처는 비공개 칸
      await db.ref(`/adminSpeakerTrips/${s.confId}/${sid}`).set(Object.assign({}, s.travel || {}, { nameEn: s.nameEn || '', nameKo: s.nameKo || '', email: s.email || '', phone: s.phone || '', cvFileUrl: s.cvFileUrl || '', updatedAt: now }));
      const cur = (await db.ref('/adminSpeakerContacts/' + sid).once('value')).val() || {};
      const c = { email: cur.email || s.email || '', phone: cur.phone || s.phone || '' };
      if (c.email || c.phone) await db.ref('/adminSpeakerContacts/' + sid).set(c);
    }
    await base.update(up);
    await db.ref('/tripSubmissions/' + id).update({ status: 'approved', speakerId: sid, lectureIds: Object.keys(up).filter(k => k.startsWith('lecturePool/')).map(k => k.slice(12)) });
    await log(`${boardSub ? '이사회 앱 강의 제출' : '해외 연자 일정·강의 제출'} "${s.nameKo || s.nameEn || ''}" 승인·반영 (이사회 앱)`, { confId: s.confId, confTitle: await titleOf(s.confId), entityId: sid });
    return { ok: true };
  }
  throw new HttpsError('invalid-argument', '알 수 없는 요청');
});


/* ============================================================
 * 이사회 앱 '내 제출' 상태 동기화 — mySubmissions
 *   이사회 앱이 기억하는 내 제출 키들의 현재 상태를 알려준다 (본인 이메일로 제출한 것만)
 *   pending · approved(강의풀에 있음) · removed(승인됐지만 강의가 지워짐) · rejected · gone(제출 기록 삭제)
 * ============================================================ */
exports.mySubmissions = onCall({ region: 'asia-northeast3', timeoutSeconds: 30 }, async (request) => {
  const d = request.data || {};
  const u = await boardUser(d.idToken);
  if (u.status !== 'active') throw new HttpsError('permission-denied', '승인된 이사만 볼 수 있어요.');
  const keys = (Array.isArray(d.keys) ? d.keys : []).map(String).filter(k => /^[\w-]{4,80}$/.test(k)).slice(0, 100);
  const db = admin.database(), out = {}, pools = {};
  const poolOf = async cid => pools[cid] || (pools[cid] = (await db.ref(`/adminConferences/${cid}/lecturePool`).once('value')).val() || {});
  for (const k of keys) {
    const s = (await db.ref('/tripSubmissions/' + k).once('value')).val();
    if (!s) { out[k] = 'gone'; continue; }
    if ((s.email || '').toLowerCase() !== (u.email || '').toLowerCase()) continue;   // 남의 제출은 알려주지 않음
    if (s.status === 'rejected') { out[k] = 'rejected'; continue; }
    if (s.status !== 'approved') { out[k] = 'pending'; continue; }
    const pool = s.confId ? await poolOf(s.confId) : {};
    let alive;
    if (Array.isArray(s.lectureIds) && s.lectureIds.length) alive = s.lectureIds.some(id => pool[id]);
    else {   // 예전 승인분: 같은 연자 + 같은 제목(또는 수정 전 제목) 강의가 남아 있는지
      const titles = (Array.isArray(s.lectures) ? s.lectures : Object.values(s.lectures || {})).map(l => ((l && (l.title || l.type)) || '').trim()).filter(Boolean);
      alive = Object.values(pool).some(l => l && Array.isArray(l.speakers) && l.speakers.some(x => x && x.id === s.speakerId)
        && (titles.includes((l.titleKo || '').trim()) || (l.titleEdit && titles.includes((l.titleEdit.prevKo || '').trim()))));
    }
    out[k] = alive ? 'approved' : 'removed';
  }
  return { status: out };
});
