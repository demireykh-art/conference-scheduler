/**
 * timetable.js — 시간표 및 프로그램 구성 (리스트형)
 * 구조: 행사 > 룸(탭) > 세션 > 강의(순서대로, 시작시각 자동 계산)
 * 데이터: /adminConferences/<id>/rooms/<roomId>/sessions/<sessionId>/lectures/<lecId>
 */

const CONF_ID = new URLSearchParams(location.search).get('id');
try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
const confRef = () => database.ref('/adminConferences/' + CONF_ID);
const ctitle = () => (CONF && CONF.title) || '';   // 변경이력 기록용 행사명

let CONF = null;              // 전체 행사 객체
let CURRENT_ROOM = null;      // 현재 선택된 룸 id
let editingSession = null;    // { roomId, sessionId } | { roomId }(신규)
let movingLecture = null;     // { roomId, sessionId, lecId }
let placingTarget = null;     // { roomId, sessionId } (배치 대상 세션)
let editingDuration = null;   // { roomId, sessionId, lecId }
let POOL = [];                // 이 행사의 강의 풀
let newRoomDate = '';         // 룸 추가 모달에서 선택한 날짜
let CONFLICT_IDS = new Set(); // 현재 중복(연자 겹침) 강의 id 집합
let CONFS = [];               // 전체 행사 목록 (전환기용)

const SPEAKER_TRAVEL_MIN = 10; // 다른 룸 이동 시간(분)

/* ---------- 초기화 ---------- */
document.getElementById('sidebarMount').innerHTML = renderSidebar('timetable');
Masters.init();   // 연자 이름·사진 표시(중복 알림)용
// 마스터(연자 사진 등) 로드/변경 시 시간표 다시 그림
document.addEventListener('masters-change', () => { if (CONF) renderAll(); });

// 행사 목록 로드 → 좌우 전환기 (id 없으면 첫 행사로 이동)
database.ref('/adminConferences').once('value').then(snap => {
    CONFS = toOrderedArray(snap.val());
    if (!CONF_ID && CONFS.length) {
        let last = ''; try { last = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { }  // 마지막 보던 행사
        const target = CONFS.find(c => c.id === last) ? last : CONFS[0].id;
        location.replace('timetable.html?id=' + target); return;
    }
    renderConfSwitcher();
});

function renderConfSwitcher() {
    const el = document.getElementById('confSwitcher');
    if (!el) return;
    if (!CONFS.length) { el.innerHTML = ''; return; }
    const idx = CONFS.findIndex(c => c.id === CONF_ID);
    const cur = CONFS[idx] || null;
    const prev = idx > 0 ? CONFS[idx - 1].id : '';
    const next = (idx >= 0 && idx < CONFS.length - 1) ? CONFS[idx + 1].id : '';
    const opts = CONFS.map(c => `<option value="${c.id}" ${c.id === CONF_ID ? 'selected' : ''}>${escapeHtml(c.title || '(제목 없음)')}</option>`).join('');
    el.innerHTML = `
        <button class="cs-arrow" ${prev ? '' : 'disabled'} onclick="gotoConf('${prev}')" title="이전 행사">‹</button>
        <select class="cs-select" onchange="gotoConf(this.value)">${opts}</select>
        <button class="cs-arrow" ${next ? '' : 'disabled'} onclick="gotoConf('${next}')" title="다음 행사">›</button>
        ${cur && cur.startDate ? `<span class="cs-date">${escapeHtml(fmtDateRange(cur.startDate, cur.endDate))}</span>` : ''}`;
}
window.gotoConf = function (id) { if (id && id !== CONF_ID) location.href = 'timetable.html?id=' + id; };

// 배치 모달 분류 필터 + 검색 이벤트
document.getElementById('placeCatFilter').innerHTML =
    '<option value="">전체 분류</option>' + PRODUCT_CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
document.getElementById('placeSearch').addEventListener('input', renderPlaceList);
document.getElementById('placeCatFilter').addEventListener('change', renderPlaceList);
document.getElementById('placeHidePlaced').addEventListener('change', renderPlaceList);

if (!CONF_ID) {
    document.getElementById('sessions').innerHTML =
        '<div class="card empty-state">행사 id가 없습니다. <a href="index.html">행사 목록</a>에서 시간표를 선택하세요.</div>';
} else {
    confRef().on('value', snap => {
        CONF = snap.val();
        if (!CONF) {
            document.getElementById('sessions').innerHTML =
                '<div class="card empty-state">행사를 찾을 수 없습니다.</div>';
            return;
        }
        renderAll();
        if (document.getElementById('placeModal').classList.contains('open')) renderPlaceList();
    });
    confRef().child('lecturePool').on('value', snap => {
        POOL = toOrderedArray(snap.val());
        if (document.getElementById('placeModal').classList.contains('open')) renderPlaceList();
    });
}

/* ---------- 룸 정렬 헬퍼 ---------- */
function orderedRooms() { return toOrderedArray(CONF && CONF.rooms); }
function getRoom(id) { return (CONF && CONF.rooms && CONF.rooms[id]) ? { id, ...CONF.rooms[id] } : null; }

/* ============================================================
   렌더
   ============================================================ */
function renderAll() {

    const rooms = orderedRooms();
    if (!CURRENT_ROOM || !rooms.find(r => r.id === CURRENT_ROOM)) {
        CURRENT_ROOM = rooms.length ? rooms[0].id : null;
    }
    renderRoomTabs(rooms);
    renderRoomSettings();
    renderSessions();
}

/* ---------- 룸 탭 ---------- */
function renderRoomTabs(rooms) {
    const box = document.getElementById('roomTabs');
    const tabs = rooms.map(r => `
        <button class="room-tab ${r.id === CURRENT_ROOM ? 'active' : ''}" data-room="${r.id}"
            onclick="selectRoom('${r.id}')">
            <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>${escapeHtml(r.name || '(이름 없음)')}
            <span class="room-tab-date ${r.date ? '' : 'nodate'}">${r.date ? escapeHtml(dayLabel(r.date)) : '날짜미정'}</span>
            ${r.kmaSubmit ? '<span class="room-tab-kma" title="의협제출 대상">의협</span>' : ''}
        </button>`).join('');
    box.innerHTML = tabs + `<button class="room-tab add-tab" onclick="openRoomModal()">+ 룸 추가</button>`;

    enableSort(box, '.room-tab[data-room]', 'data-room', ids => persistRoomOrder(ids), 'room');
}

window.selectRoom = function (id) { CURRENT_ROOM = id; renderRoomTabs(orderedRooms()); renderRoomSettings(); renderSessions(); };

/* ---------- 룸 설정 ---------- */
function renderRoomSettings() {
    const el = document.getElementById('roomSettings');
    const addRow = document.getElementById('addSessionRow');
    const room = getRoom(CURRENT_ROOM);
    if (!room) { el.style.display = 'none'; addRow.style.display = 'none'; return; }
    el.style.display = 'flex';
    addRow.style.display = 'flex';

    el.innerHTML = `
        <div class="field grow">
            <label>룸 이름</label>
            <input type="text" value="${escapeHtml(room.name || '')}" onchange="updateRoom('name', this.value)">
        </div>
        <div class="field grow">
            <label>주제</label>
            <input type="text" value="${escapeHtml(room.topic || '')}" onchange="updateRoom('topic', this.value)">
        </div>
        <div class="field" style="min-width:200px">
            <label>날짜 (연자 중복 체크 기준)</label>
            <div class="day-btns">${renderDayButtons(room)}</div>
        </div>
        <div class="field">
            <label>시작시간</label>
            <input type="time" value="${escapeHtml(room.startTime || '09:00')}" onchange="updateRoom('startTime', this.value)">
        </div>
        <div class="field" style="min-width:170px">
            <label>표시 언어 (이 룸 전체)</label>
            <div class="lang-btns">
                <button type="button" class="lang-btn ${roomLang(room) === 'ko' ? 'active' : ''}" onclick="updateRoom('lang','ko')">한글</button>
                <button type="button" class="lang-btn ${roomLang(room) === 'en' ? 'active' : ''}" onclick="updateRoom('lang','en')">영어(EN)</button>
            </div>
        </div>
        <label class="check-inline">
            <input type="checkbox" ${room.kmaSubmit ? 'checked' : ''} onchange="updateRoom('kmaSubmit', this.checked)">
            의협제출
        </label>
        <button class="btn btn-sm" onclick="duplicateRoom()">📑 다른 날짜로 복제</button>
        <button class="btn btn-danger-ghost btn-sm" onclick="deleteRoom('${room.id}')">룸 삭제</button>
        <div class="settings-hint"><b>의협제출</b> 체크 시, 나중에 의협 제출용 프린트에 이 룸의 강의만 추려서 출력합니다. · ‘다른 날짜로 복제’는 이 룸(세션·강의 포함)을 그대로 복사한 <b>독립된 새 룸</b>을 만듭니다.</div>
    `;
}

// 이 룸을 독립된 새 룸으로 복제 (룸·세션·강의 모두 새 id → 서로 영향 없음). 날짜는 복제 후 지정.
window.duplicateRoom = function () {
    if (!AdminAuth.requireEdit()) return;
    const room = getRoom(CURRENT_ROOM);
    if (!room) return;
    const newId = uuid();
    const copy = {
        name: room.name || '',
        topic: room.topic || '',
        date: '',                         // 새 날짜는 복제 후 지정
        startTime: room.startTime || '09:00',
        visible: room.visible !== false,
        kmaSubmit: !!room.kmaSubmit,
        lang: room.lang || 'ko',
        order: orderedRooms().length,
        sessions: {}
    };
    toOrderedArray(room.sessions).forEach((s, si) => {
        const sc = { name: s.name || '', order: si };
        if (s.moderator) sc.moderator = { ...s.moderator };
        if (s.lang) sc.lang = s.lang;
        if (s.langExcluded) sc.langExcluded = true;
        const lects = toOrderedArray(s.lectures);
        if (lects.length) {
            sc.lectures = {};
            lects.forEach((l, li) => {
                const { id, _start, _end, ...rest } = l;   // 계산값·id 제거
                sc.lectures[uuid()] = { ...rest, order: li };
            });
        }
        copy.sessions[uuid()] = sc;
    });
    confRef().child('rooms/' + newId).set(copy)
        .then(() => {
            CURRENT_ROOM = newId;
            logActivity('create', 'room', `룸 "${copy.name}" 복제(다른 날짜용)`, { confId: CONF_ID, confTitle: ctitle(), entityId: newId });
            Toast.success('룸을 복제했습니다. 아래 날짜 버튼에서 이 룸의 날짜를 지정하세요.');
        })
        .catch(e => Toast.error('복제 실패: ' + e.message));
};

window.updateRoom = function (field, value) {
    if (!AdminAuth.requireEdit()) { renderRoomSettings(); return; }
    confRef().child('rooms/' + CURRENT_ROOM + '/' + field).set(value)
        .catch(e => Toast.error('저장 실패: ' + e.message));
};

/* ---------- 개회식 / 브레이크 / 행사 항목 ---------- */
const BREAK_PRESETS = [
    { ko: '개회식', en: 'Opening Ceremony', dur: 15 },
    { ko: '개회사', en: 'Opening Remarks', dur: 10 },
    { ko: 'Coffee Break', en: 'Coffee Break', dur: 20 },
    { ko: '점심식사', en: 'Lunch Break', dur: 60 },
    { ko: '폐회사', en: 'Closing Remarks', dur: 10 },
    { ko: 'Q&A & Panel Discussion', en: 'Q&A & Panel Discussion', dur: 15, panel: true }
];
let breakTarget = null;   // { roomId, sessionId }

window.openBreakModal = function (roomId, sessionId) {
    if (!AdminAuth.requireEdit()) return;
    breakTarget = { roomId, sessionId };
    document.getElementById('breakTitleKo').value = '';
    document.getElementById('breakTitleEn').value = '';
    document.getElementById('breakDur').value = 20;
    document.getElementById('breakIsPanel').checked = false;
    document.getElementById('breakPresets').innerHTML =
        BREAK_PRESETS.map((p, i) => `<span class="chip" style="cursor:pointer" onclick="applyBreakPreset(${i})">${escapeHtml(p.ko)}</span>`).join('');
    document.getElementById('breakModal').classList.add('open');
};
window.applyBreakPreset = function (i) {
    const p = BREAK_PRESETS[i]; if (!p) return;
    document.getElementById('breakTitleKo').value = p.ko;
    document.getElementById('breakTitleEn').value = p.en;
    document.getElementById('breakDur').value = p.dur;
    document.getElementById('breakIsPanel').checked = !!p.panel;
};
window.closeBreakModal = function () { document.getElementById('breakModal').classList.remove('open'); };
window.saveBreak = function () {
    if (!AdminAuth.requireEdit()) return;
    const t = breakTarget || {};
    if (!t.roomId || !t.sessionId) return;
    const titleKo = document.getElementById('breakTitleKo').value.trim();
    const titleEn = document.getElementById('breakTitleEn').value.trim();
    if (!titleKo && !titleEn) { Toast.warning('제목을 입력하세요.'); return; }
    const dur = Number(document.getElementById('breakDur').value) || 0;
    const isPanel = document.getElementById('breakIsPanel').checked;
    const order = toOrderedArray(CONF.rooms[t.roomId].sessions[t.sessionId].lectures).length;
    const data = isPanel
        ? { isPanel: true, titleKo, titleEn, duration: dur, order }
        : { isBreak: true, titleKo, titleEn, duration: dur, order };
    confRef().child(`rooms/${t.roomId}/sessions/${t.sessionId}/lectures/${uuid()}`).set(data)
        .then(() => {
            logActivity('create', 'lecture', `${isPanel ? '패널' : '행사 항목'} "${titleKo || titleEn}" 추가`, { confId: CONF_ID, confTitle: ctitle(), entityId: t.sessionId });
            Toast.success('추가되었습니다.'); closeBreakModal();
        })
        .catch(e => Toast.error('추가 실패: ' + e.message));
};

// 세션 언어: 룸 전체 적용에서 제외(개별설정) 토글
window.setSessionLangExcluded = function (roomId, sessionId, on) {
    if (!AdminAuth.requireEdit()) { renderSessions(); return; }
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/langExcluded`).set(!!on)
        .catch(e => Toast.error('저장 실패: ' + e.message));
};
// 세션 개별 언어 지정 (개별설정일 때만 적용)
window.setSessionLang = function (roomId, sessionId, lang) {
    if (!AdminAuth.requireEdit()) return;
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/lang`).set(lang === 'en' ? 'en' : 'ko')
        .catch(e => Toast.error('저장 실패: ' + e.message));
};

// 행사 기간(시작~종료)의 날짜들을 YYYY-MM-DD 배열로
function enumerateDates(start, end) {
    if (!start) return [];
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = (end || start).split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);
    const out = [];
    let guard = 0;
    while (cur <= last && guard < 400) {
        out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
        cur.setDate(cur.getDate() + 1);
        guard++;
    }
    return out;
}
function dayLabel(dstr) {
    const [y, m, d] = dstr.split('-').map(Number);
    const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${wd})`;
}
// 룸 설정의 날짜 선택 버튼 (행사 기간 자동 표시, 한 번 클릭으로 지정/해제)
function renderDayButtons(room) {
    const days = enumerateDates(CONF.startDate, CONF.endDate);
    if (!days.length) {
        return '<span style="color:var(--text-dim);font-size:0.8rem">행사 날짜가 설정되지 않았습니다. (행사설정에서 기간 입력)</span>';
    }
    return days.map(d =>
        `<button type="button" class="day-btn ${room.date === d ? 'active' : ''}" onclick="setRoomDate('${d}')">${dayLabel(d)}</button>`
    ).join('');
}
window.setRoomDate = function (d) {
    if (!AdminAuth.requireEdit()) return;
    const room = getRoom(CURRENT_ROOM);
    const newVal = (room && room.date === d) ? '' : d;   // 다시 클릭하면 해제
    updateRoom('date', newVal);
};

// 룸 추가 모달 — 날짜 필수
window.openRoomModal = function () {
    if (!AdminAuth.requireEdit()) return;
    const days = enumerateDates(CONF.startDate, CONF.endDate);
    if (!days.length) { Toast.warning('먼저 행사설정에서 행사 기간(시작일·종료일)을 입력하세요.'); return; }
    newRoomDate = days.length === 1 ? days[0] : '';   // 하루 행사면 자동 선택
    document.getElementById('newRoomName').value = `룸 ${orderedRooms().length + 1}`;
    renderNewRoomDayButtons();
    document.getElementById('roomModal').classList.add('open');
    setTimeout(() => document.getElementById('newRoomName').focus(), 50);
};
window.closeRoomModal = function () { document.getElementById('roomModal').classList.remove('open'); };
function renderNewRoomDayButtons() {
    const days = enumerateDates(CONF.startDate, CONF.endDate);
    document.getElementById('newRoomDayBtns').innerHTML = days.map(d =>
        `<button type="button" class="day-btn ${newRoomDate === d ? 'active' : ''}" onclick="selectNewRoomDate('${d}')">${dayLabel(d)}</button>`
    ).join('');
}
window.selectNewRoomDate = function (d) { newRoomDate = d; renderNewRoomDayButtons(); };
window.saveNewRoom = function () {
    if (!AdminAuth.requireEdit()) return;
    if (!newRoomDate) { Toast.warning('날짜를 선택하세요. (필수)'); return; }
    const name = document.getElementById('newRoomName').value.trim() || `룸 ${orderedRooms().length + 1}`;
    const id = uuid();
    confRef().child('rooms/' + id).set({
        name, topic: '', date: newRoomDate, startTime: '09:00', visible: true, kmaSubmit: false, order: orderedRooms().length
    }).then(() => {
        logActivity('create', 'room', `룸 "${name}" 추가`, { confId: CONF_ID, confTitle: ctitle(), entityId: id });
        CURRENT_ROOM = id; closeRoomModal(); Toast.success('룸이 추가되었습니다.');
    })
        .catch(e => Toast.error(e.message));
};

window.deleteRoom = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const r = getRoom(id);
    const ok = await confirmDialog(`"${r ? r.name : ''}" 룸을 삭제할까요?\n포함된 세션·강의가 모두 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    CURRENT_ROOM = null;
    confRef().child('rooms/' + id).remove().then(() => {
        logActivity('delete', 'room', `룸 "${r ? r.name : ''}" 삭제`, { confId: CONF_ID, confTitle: ctitle(), entityId: id });
        Toast.success('삭제되었습니다.');
    });
};

function persistRoomOrder(ids) {
    if (!AdminAuth.requireEdit()) return;
    const updates = {};
    ids.forEach((id, i) => updates['rooms/' + id + '/order'] = i);
    confRef().update(updates);
}

/* ---------- 언어(표시) 헬퍼 ---------- */
function roomLang(room) { return room && room.lang === 'en' ? 'en' : 'ko'; }
// 세션 유효 언어: 개별설정(제외) 시 세션 언어, 아니면 룸 언어
function effectiveLang(room, session) {
    if (session && session.langExcluded) return session.lang === 'en' ? 'en' : 'ko';
    return roomLang(room);
}
// 언어에 맞는 값 선택 (영어 없으면 한글로 폴백, 반대도)
function pickLang(lang, ko, en) {
    ko = ko || ''; en = en || '';
    return lang === 'en' ? (en || ko) : (ko || en);
}

/* ---------- 세션 + 강의 ---------- */
function renderSessions() {
    const box = document.getElementById('sessions');
    const room = getRoom(CURRENT_ROOM);
    if (!room) { box.innerHTML = ''; return; }

    CONFLICT_IDS = computeConflictIds();   // 중복 강의 재계산 (자동 갱신)
    const sessions = computeRoom(room);
    if (!sessions.length) {
        box.innerHTML = `<div class="card empty-state">아직 세션이 없습니다.<br><b>+ 세션 추가</b>로 오전/점심/오후 등을 만드세요.</div>`;
        return;
    }

    box.innerHTML = sessions.map(s => renderSessionBlock(room.id, s)).join('');

    // 세션 순서 드래그
    enableSort(box, '.session-block', 'data-session', ids => persistSessionOrder(room.id, ids), 'session');
    // 강의 드래그 (세션 내 순서변경 + 세션 간 이동 모두 지원)
    enableLectureDrag(room.id);
}

function renderSessionBlock(roomId, s) {
    const room = getRoom(roomId);
    const lang = effectiveLang(room, s);
    const range = `${formatTime(s._start)} - ${formatTime(s._end)}`;
    const lectures = s.lectures.map(lec => renderLectureRow(roomId, s.id, lec, lang)).join('');
    const mod = s.moderator;
    let modHtml = '';
    if (mod && (mod.id || mod.nameKo)) {
        const master = mod.id ? Masters.speaker(mod.id) : null;
        const m = master || mod;
        const nm = escapeHtml(pickLang(lang, (master && master.nameKo) || mod.nameKo, (master && master.nameEn) || mod.nameEn));
        const affv = pickLang(lang, (master && master.affiliationKo) || mod.affiliationKo, (master && master.affiliationEn) || mod.affiliationEn);
        const aff = affv ? ` <span class="mod-aff">(${escapeHtml(affv)})</span>` : '';
        const dup = CONFLICT_IDS.has('mod:' + s.id) ? '<span class="dup-badge" title="사회자가 같은 날 다른 곳과 시간 겹침">중복</span>' : '';
        modHtml = `<div class="session-mod"><span class="mod-inline">${speakerAvatar(m, 20)}사회자: ${nm}${aff}</span>${dup}</div>`;
    }
    // 세션 언어 개별설정 (전체 적용에서 제외)
    const excluded = !!s.langExcluded;
    const slang = s.lang === 'en' ? 'en' : 'ko';
    const langCtrl = `
        <div class="session-lang">
            <label class="check-inline" title="이 세션을 룸 전체 언어 적용에서 제외">
                <input type="checkbox" ${excluded ? 'checked' : ''} onchange="setSessionLangExcluded('${roomId}','${s.id}',this.checked)"> 언어 개별설정
            </label>
            ${excluded ? `
                <button type="button" class="lang-btn sm ${slang === 'ko' ? 'active' : ''}" onclick="setSessionLang('${roomId}','${s.id}','ko')">한글</button>
                <button type="button" class="lang-btn sm ${slang === 'en' ? 'active' : ''}" onclick="setSessionLang('${roomId}','${s.id}','en')">영어</button>` : ''}
        </div>`;
    return `
    <div class="session-block" data-session="${s.id}">
        <div class="session-head">
            <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>
            <div>
                <h3 class="session-title">${escapeHtml(s.name || '(세션)')}</h3>
                <div class="session-sub">${range} · ${s._count}건 · 총 ${s._total}분</div>
                ${modHtml}
                ${langCtrl}
            </div>
            <div class="spacer"></div>
            <button class="btn btn-primary btn-sm" onclick="openPlaceModal('${roomId}','${s.id}')">+ 강의 배치</button>
            <button class="btn btn-sm" onclick="openBreakModal('${roomId}','${s.id}')">+ 개회/브레이크</button>
            <button class="txt-btn" onclick="editSession('${roomId}','${s.id}')">수정</button>
            <button class="txt-btn danger" onclick="deleteSession('${roomId}','${s.id}')">삭제</button>
        </div>
        <div class="lecture-list" data-session="${s.id}">
            ${lectures || '<div style="padding:16px 18px;color:var(--text-dim);font-size:0.84rem">강의가 없습니다.</div>'}
        </div>
    </div>`;
}

// 세션 강의 연자 목록 (패널 표시용) — 원본 데이터에서 중복 제거
function panelSpeakersOfSession(roomId, sessionId) {
    const sess = CONF.rooms[roomId] && CONF.rooms[roomId].sessions && CONF.rooms[roomId].sessions[sessionId];
    const map = new Map();
    if (sess) Object.values(sess.lectures || {}).forEach(l => {
        if (l.isBreak || l.isPanel) return;
        (l.speakers || []).forEach(s => {
            const key = (s.id || s.nameKo || '').trim();
            if (key && !map.has(key)) map.set(key, s);
        });
    });
    return [...map.values()];
}

function renderLectureRow(roomId, sessionId, lec, lang) {
    lang = lang || 'ko';
    const range = `${formatTime(lec._start)} - ${formatTime(lec._end)}`;
    // Q&A / 패널 토론 — 이 세션 강의 연자 전원이 참여 (해당 시간 중복 체크)
    if (lec.isPanel) {
        const t = pickLang(lang, lec.titleKo, lec.titleEn) || 'Q&A & Panel Discussion';
        const parts = panelSpeakersOfSession(roomId, sessionId);
        const names = parts.map(s => {
            const master = s.id ? Masters.speaker(s.id) : null;
            return escapeHtml(pickLang(lang, (master && master.nameKo) || s.nameKo, (master && master.nameEn) || s.nameEn));
        }).join(', ') || '<span style="color:var(--text-dim)">이 세션에 연자 강의가 없습니다</span>';
        const dup = CONFLICT_IDS.has(lec.id) ? '<span class="dup-badge" title="패널 연자 중 일부가 같은 시간 다른 곳과 겹침">중복</span>' : '';
        return `
        <div class="lecture-row panel-row" data-lec="${lec.id}">
            <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>
            <div class="lec-main">
                <div class="lec-tags">
                    <span class="time-badge">${range}</span>
                    <span class="dur-badge">${lec.duration || 0}분</span>
                    <span class="chip panel-chip">패널 · 전체 연자</span>
                    ${dup}
                </div>
                <div class="lec-title panel-title">${escapeHtml(t)}</div>
                <div class="lec-speaker">패널 연자(${parts.length}): ${names}</div>
            </div>
            <div class="lec-actions">
                <button class="txt-btn" onclick="openMoveModal('${roomId}','${sessionId}','${lec.id}')">이동</button>
                <button class="txt-btn" onclick="openDurModal('${roomId}','${sessionId}','${lec.id}')">시간</button>
                <button class="txt-btn danger" onclick="deleteLecture('${roomId}','${sessionId}','${lec.id}')">삭제</button>
            </div>
        </div>`;
    }
    // 개회식/브레이크/점심 등 행사 항목 (연자·파트너 없음, 중복·혜택 계산 제외)
    if (lec.isBreak) {
        const t = pickLang(lang, lec.titleKo, lec.titleEn) || '행사 항목';
        return `
        <div class="lecture-row break-row" data-lec="${lec.id}">
            <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>
            <div class="lec-main">
                <div class="lec-tags">
                    <span class="time-badge">${range}</span>
                    <span class="dur-badge">${lec.duration || 0}분</span>
                    <span class="chip break-chip">행사</span>
                </div>
                <div class="lec-title break-title">${escapeHtml(t)}</div>
            </div>
            <div class="lec-actions">
                <button class="txt-btn" onclick="openMoveModal('${roomId}','${sessionId}','${lec.id}')">이동</button>
                <button class="txt-btn" onclick="openDurModal('${roomId}','${sessionId}','${lec.id}')">시간</button>
                <button class="txt-btn danger" onclick="deleteLecture('${roomId}','${sessionId}','${lec.id}')">삭제</button>
            </div>
        </div>`;
    }
    const n = normalizeLecture(lec);
    // 파트너 영문/국문은 마스터(최신)에서 우선 조회 후 사본으로 폴백
    const pMaster = n.partnerId ? Masters.partner(n.partnerId) : null;
    const partnerDisp = pickLang(lang, (pMaster && pMaster.nameKo) || n.partnerKo, (pMaster && pMaster.nameEn) || n.partnerEn);
    const partner = (n.partnerKo || partnerDisp) ? `<span class="partner-badge">${escapeHtml(partnerDisp)}</span>` : '';
    const speakers = n.speakers.length
        ? n.speakers.map(s => {
            const master = s.id ? Masters.speaker(s.id) : null;   // 이름·소속·사진 최신값
            const m = master || s;
            const nm = escapeHtml(pickLang(lang, (master && master.nameKo) || s.nameKo, (master && master.nameEn) || s.nameEn));
            const affv = pickLang(lang, (master && master.affiliationKo) || s.affiliationKo, (master && master.affiliationEn) || s.affiliationEn);
            const aff = affv ? ` <span style="color:var(--text-dim)">(${escapeHtml(affv)})</span>` : '';
            return `<span class="spk-inline">${speakerAvatar(m, 22)}${nm}${aff}</span>`;
        }).join('')
        : '<span style="color:var(--text-dim)">미정</span>';
    let product = '';
    if (n.productKo || n.productEn) {
        const cat = n.productCategory ? ` · ${escapeHtml(n.productCategory)}` : '';
        product = `<div class="lec-product">제품: ${escapeHtml(pickLang(lang, n.productKo, n.productEn))}${cat}</div>`;
        if (n.productDesc) product += `<div class="lec-product" style="opacity:.85">└ ${escapeHtml(n.productDesc)}</div>`;
    }
    // 제목도 강의 풀(최신)에서 우선 조회 후 사본으로 폴백
    const pool = lec.lectureId ? POOL.find(p => p.id === lec.lectureId) : null;
    const titleKo = (pool && pool.titleKo) || n.titleKo;
    const titleEn = (pool && pool.titleEn) || n.titleEn;
    const title = escapeHtml(pickLang(lang, titleKo, titleEn) || '(제목 없음)');
    const subtitle = lang === 'en' ? titleKo : titleEn;   // 보조로 반대 언어 표시
    return `
    <div class="lecture-row" data-lec="${lec.id}">
        <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>
        <div class="lec-main">
            <div class="lec-tags">
                <span class="time-badge">${range}</span>
                <span class="dur-badge">${lec.duration || 0}분</span>
                ${partner}
                ${(n.types || []).map(t => `<span class="chip type">${escapeHtml(t)}</span>`).join('')}
                ${CONFLICT_IDS.has(lec.id) ? '<span class="dup-badge" title="같은 날 동일 연자 시간 겹침(또는 이동 10분 부족)">중복</span>' : ''}
            </div>
            <div class="lec-title">${title}</div>
            ${subtitle ? `<div class="lec-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            <div class="lec-speaker">연자: ${speakers}</div>
            ${product}
        </div>
        <div class="lec-actions">
            <button class="txt-btn" onclick="openMoveModal('${roomId}','${sessionId}','${lec.id}')">이동</button>
            <button class="txt-btn" onclick="openDurModal('${roomId}','${sessionId}','${lec.id}')">시간</button>
            <button class="txt-btn danger" onclick="deleteLecture('${roomId}','${sessionId}','${lec.id}')">삭제</button>
        </div>
    </div>`;
}

/**
 * 구/신 데이터 포맷 호환 정규화
 * 구: {title, subtitle, speakers:[문자열], partner}
 * 신: {titleKo, titleEn, speakers:[객체], partnerId, partnerKo, partnerEn, productKo, productEn}
 */
function normalizeLecture(lec) {
    lec = lec || {};
    let speakers = [];
    if (Array.isArray(lec.speakers)) {
        speakers = lec.speakers.map(s => typeof s === 'string'
            ? { id: '', nameKo: s, nameEn: '', affiliationKo: '', affiliationEn: '' }
            : {
                id: s.id || '', nameKo: s.nameKo || '', nameEn: s.nameEn || '',
                affiliationKo: s.affiliationKo || '', affiliationEn: s.affiliationEn || ''
            });
    }
    return {
        titleKo: lec.titleKo != null ? lec.titleKo : (lec.title || ''),
        titleEn: lec.titleEn != null ? lec.titleEn : (lec.subtitle || ''),
        duration: lec.duration,
        speakers,
        partnerId: lec.partnerId || '',
        partnerKo: lec.partnerKo != null ? lec.partnerKo : (lec.partner || ''),
        partnerEn: lec.partnerEn || '',
        productKo: lec.productKo || '',
        productEn: lec.productEn || '',
        productCategory: lec.productCategory || '',
        productDesc: lec.productDesc || '',
        types: Array.isArray(lec.types) ? lec.types : []
    };
}

/* ============================================================
   세션 모달 + 사회자(Moderator)
   ============================================================ */
let moderatorDraft = null;   // { id, nameKo, nameEn, affiliationKo }

// 연자를 이 행사 연자/사회자 목록(confSpeakers)에 없으면 추가
function ensureConfSpeaker(id, role) {
    if (!id) return;
    const ref = confRef().child('confSpeakers/' + id);
    ref.once('value').then(s => {
        if (!s.exists()) ref.set({ role: role || '연자', order: 999 }).catch(() => { });
    }).catch(() => { });
}

function setModerator(s) {
    moderatorDraft = { id: s.id || '', nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: s.affiliationKo || '' };
    renderModChosen();
}
window.clearModerator = function () { moderatorDraft = null; renderModChosen(); };
function renderModChosen() {
    const el = document.getElementById('modChosen');
    if (!el) return;
    if (!moderatorDraft) { el.innerHTML = ''; return; }
    const m = (moderatorDraft.id && Masters.speaker(moderatorDraft.id)) || moderatorDraft;
    const aff = moderatorDraft.affiliationKo ? ` (${escapeHtml(moderatorDraft.affiliationKo)})` : '';
    el.innerHTML = `<span class="chip">${speakerAvatar(m, 20)} ${escapeHtml(moderatorDraft.nameKo || moderatorDraft.nameEn)}${aff}<span class="x" onclick="clearModerator()">×</span></span>`;
}

// ASLS 관계자(임원·엠베서더)만 사회자로 지정 가능
function isAslsStaff(s) { return !!(s && (s.roleExec || s.roleAdvisor || s.roleAmb)); }
function aslsRoleText(s) {
    const r = [];
    if (s.roleExec) r.push('ASLS 임원');
    if (s.roleAdvisor) r.push('ASLS 고문');
    if (s.roleAmb) r.push('엠베서더');
    return r.join('·');
}

// 사회자 검색 자동완성 (ASLS 관계자만 검색 + 새로 등록)
setupAutocomplete(
    document.getElementById('modInput'),
    document.getElementById('modAc'),
    q => {
        const ql = q.toLowerCase();
        const staff = Masters.speakers.filter(isAslsStaff);
        const items = staff
            .filter(s => [s.nameKo, s.nameEn, s.affiliationKo, s.affiliationEn].join(' ').toLowerCase().includes(ql))
            .map(s => ({ label: `${escapeHtml(s.nameKo || '')} <span class="sub">${aslsRoleText(s)}${s.affiliationKo ? ' · ' + escapeHtml(s.affiliationKo) : ''}</span>`, value: { type: 'existing', s } }));
        if (!items.length) {
            items.push({ label: q
                ? `ASLS 관계자 중 "<b>${escapeHtml(q)}</b>" 검색 결과가 없습니다. ➕ 새 ASLS 관계자로 등록`
                : 'ASLS 관계자(임원·엠베서더)만 사회자로 지정할 수 있습니다. 연자 관리에서 먼저 지정하세요.',
                value: q ? { type: 'new', name: q } : { type: 'none' } });
        }
        return items;
    },
    async val => {
        if (val.type === 'none') return;
        if (val.type === 'existing') { setModerator(val.s); return; }
        const name = (val.name || '').trim(); if (!name) return;
        const ok = await confirmDialog(`"${name}" 님이 ASLS 관계자 목록에 없습니다.\n새 연자로 등록하고 ASLS 임원으로 지정하여 사회자로 넣을까요? (연자 관리에도 추가됨 · 임원/엠베서더 구분은 연자 관리에서 변경 가능)`, { okText: '등록' });
        if (!ok) return;
        const id = uuid();
        database.ref('/adminSpeakers/' + id).set({ nameKo: name, nameEn: '', affiliationKo: '', affiliationEn: '', roleExec: true, roleAmb: false, order: Masters.speakers.length, createdAt: firebase.database.ServerValue.TIMESTAMP })
            .then(() => { setModerator({ id, nameKo: name }); Toast.success(`"${name}" ASLS 임원으로 등록`); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
);

window.openSessionModal = function () {
    if (!AdminAuth.requireEdit()) return;
    editingSession = { roomId: CURRENT_ROOM };
    document.getElementById('sessionModalTitle').textContent = '세션 추가';
    document.getElementById('sessionName').value = '';
    document.getElementById('modInput').value = '';
    moderatorDraft = null; renderModChosen();
    document.getElementById('sessionModal').classList.add('open');
};
window.editSession = function (roomId, sessionId) {
    if (!AdminAuth.requireEdit()) return;
    const s = CONF.rooms[roomId].sessions[sessionId];
    editingSession = { roomId, sessionId };
    document.getElementById('sessionModalTitle').textContent = '세션 수정';
    document.getElementById('sessionName').value = s.name || '';
    document.getElementById('modInput').value = '';
    moderatorDraft = (s.moderator && (s.moderator.id || s.moderator.nameKo))
        ? { id: s.moderator.id || '', nameKo: s.moderator.nameKo || '', nameEn: s.moderator.nameEn || '', affiliationKo: s.moderator.affiliationKo || '' }
        : null;
    renderModChosen();
    document.getElementById('sessionModal').classList.add('open');
};
window.closeSessionModal = function () { document.getElementById('sessionModal').classList.remove('open'); };
window.saveSession = function () {
    if (!AdminAuth.requireEdit()) return;
    const name = document.getElementById('sessionName').value.trim();
    if (!name) { Toast.warning('세션 이름을 입력하세요.'); return; }
    const { roomId, sessionId } = editingSession;
    const mod = moderatorDraft ? {
        id: moderatorDraft.id || '', nameKo: moderatorDraft.nameKo || '',
        nameEn: moderatorDraft.nameEn || '', affiliationKo: moderatorDraft.affiliationKo || ''
    } : null;
    if (sessionId) {
        const updates = {};
        updates[`rooms/${roomId}/sessions/${sessionId}/name`] = name;
        updates[`rooms/${roomId}/sessions/${sessionId}/moderator`] = mod;   // null이면 제거
        confRef().update(updates)
            .then(() => {
                if (mod && mod.id) ensureConfSpeaker(mod.id, '사회자');
                logActivity('update', 'session', `세션 "${name}" 수정${mod ? ` (사회자: ${mod.nameKo})` : ''}`, { confId: CONF_ID, confTitle: ctitle(), entityId: sessionId });
                Toast.success('저장되었습니다.'); closeSessionModal();
            });
    } else {
        const sessions = toOrderedArray(CONF.rooms[roomId].sessions);
        const id = uuid();
        const data = { name, order: sessions.length };
        if (mod) data.moderator = mod;
        confRef().child(`rooms/${roomId}/sessions/${id}`).set(data)
            .then(() => {
                if (mod && mod.id) ensureConfSpeaker(mod.id, '사회자');
                logActivity('create', 'session', `세션 "${name}" 추가${mod ? ` (사회자: ${mod.nameKo})` : ''}`, { confId: CONF_ID, confTitle: ctitle(), entityId: id });
                Toast.success('세션이 추가되었습니다.'); closeSessionModal();
            });
    }
};
window.deleteSession = async function (roomId, sessionId) {
    if (!AdminAuth.requireEdit()) return;
    const s = CONF.rooms[roomId].sessions[sessionId];
    const ok = await confirmDialog(`"${s ? s.name : ''}" 세션을 삭제할까요?\n포함된 강의가 모두 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    confRef().child(`rooms/${roomId}/sessions/${sessionId}`).remove().then(() => {
        logActivity('delete', 'session', `세션 "${s ? s.name : ''}" 삭제`, { confId: CONF_ID, confTitle: ctitle(), entityId: sessionId });
        Toast.success('삭제되었습니다.');
    });
};
function persistSessionOrder(roomId, ids) {
    if (!AdminAuth.requireEdit()) return;
    const updates = {};
    ids.forEach((id, i) => updates[`rooms/${roomId}/sessions/${id}/order`] = i);
    confRef().update(updates);
}

/* ============================================================
   강의 배치 (강의 관리 풀에서 검색·선택 → 세션에 배치)
   ============================================================ */
function placedLectureIdSet() {
    const ids = new Set();
    orderedRooms().forEach(r => {
        toOrderedArray(r.sessions).forEach(s => {
            toOrderedArray(s.lectures).forEach(l => { if (l.lectureId) ids.add(l.lectureId); });
        });
    });
    return ids;
}

window.openPlaceModal = function (roomId, sessionId) {
    if (!AdminAuth.requireEdit()) return;
    placingTarget = { roomId, sessionId };
    const room = getRoom(roomId);
    const sName = (room && room.sessions && room.sessions[sessionId]) ? room.sessions[sessionId].name : '';
    document.getElementById('placeModalTitle').textContent = `강의 배치 — ${room ? room.name : ''} › ${sName}`;
    document.getElementById('placeSearch').value = '';
    document.getElementById('placeCatFilter').value = '';
    document.getElementById('placeHidePlaced').checked = true;
    document.getElementById('placeManageLink').href = 'lectures.html?id=' + CONF_ID;
    renderPlaceList();
    document.getElementById('placeModal').classList.add('open');
};
window.closePlaceModal = function () { document.getElementById('placeModal').classList.remove('open'); };

function renderPlaceList() {
    const q = document.getElementById('placeSearch').value.trim().toLowerCase();
    const cat = document.getElementById('placeCatFilter').value;
    const hidePlaced = document.getElementById('placeHidePlaced').checked;
    const placed = placedLectureIdSet();

    let list = POOL.slice().sort((a, b) => (a.titleKo || '').localeCompare(b.titleKo || '', 'ko'));
    if (cat) list = list.filter(l => (l.categories || []).includes(cat));
    if (hidePlaced) list = list.filter(l => !placed.has(l.id));
    if (q) list = list.filter(l => {
        const hay = [l.titleKo, l.titleEn, ...(l.tags || []), ...(l.categories || []), ...(l.types || []),
        ...((l.speakers || []).map(s => s.nameKo + ' ' + s.nameEn)), l.partnerKo, l.productKo].join(' ').toLowerCase();
        return hay.includes(q);
    });

    const box = document.getElementById('placeList');
    if (!POOL.length) {
        box.innerHTML = `<div class="empty-state" style="padding:30px">이 행사에 등록된 강의가 없습니다.<br><a href="lectures.html" target="_blank">강의 관리</a>에서 먼저 강의를 등록하세요.</div>`;
        return;
    }
    if (!list.length) { box.innerHTML = `<div class="empty-state" style="padding:30px">조건에 맞는 강의가 없습니다.</div>`; return; }

    box.innerHTML = list.map(l => {
        const isPlaced = placed.has(l.id);
        const cats = (l.categories || []).map(c => `<span class="chip cat">${escapeHtml(c)}</span>`).join('');
        const tags = (l.tags || []).map(t => `<span class="chip tag">${escapeHtml(t)}</span>`).join('');
        const types = (l.types || []).map(t => `<span class="chip type">${escapeHtml(t)}</span>`).join('');
        const spk = (l.speakers || []).map(s => escapeHtml(s.nameKo || s.nameEn)).join(', ') || '미정';
        return `
        <div class="place-row ${isPlaced ? 'is-placed' : ''}">
            <div class="p-main">
                <div class="p-title">${escapeHtml(l.titleKo || '(제목 없음)')} <span style="color:var(--text-dim);font-weight:400">· ${l.duration || 0}분</span></div>
                <div class="chips" style="margin:4px 0">${types}${cats}${tags}</div>
                <div class="p-meta">연자: ${spk}${l.partnerKo ? ' · ' + escapeHtml(l.partnerKo) : ''}${isPlaced ? ' · <b>이미 배치됨</b>' : ''}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="placeLecture('${l.id}')">배치</button>
        </div>`;
    }).join('');
}

window.placeLecture = function (poolId) {
    if (!AdminAuth.requireEdit()) return;
    const { roomId, sessionId } = placingTarget;
    const pool = POOL.find(l => l.id === poolId);
    if (!pool) { Toast.error('강의를 찾을 수 없습니다.'); return; }

    // 중복이어도 배치는 허용 — 중복은 시간표에서 빨간 '중복' 배지로 표시됨
    const data = {
        lectureId: pool.id,
        titleKo: pool.titleKo || '', titleEn: pool.titleEn || '',
        duration: Number(pool.duration) || 0,
        categories: pool.categories || [], tags: pool.tags || [], types: pool.types || [],
        speakers: (pool.speakers || []).map(s => ({ ...s })),
        partnerId: pool.partnerId || '', partnerKo: pool.partnerKo || '', partnerEn: pool.partnerEn || '',
        productKo: pool.productKo || '', productEn: pool.productEn || '',
        productCategory: pool.productCategory || '', productDesc: pool.productDesc || '',
        order: toOrderedArray(CONF.rooms[roomId].sessions[sessionId].lectures).length
    };
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/lectures/${uuid()}`).set(data)
        .then(() => {
            // 배치된 강의의 연자를 이 행사 연자/사회자 목록에 자동 추가
            (pool.speakers || []).forEach(s => { if (s && s.id) ensureConfSpeaker(s.id, '연자'); });
            logActivity('place', 'lecture', `강의 "${data.titleKo}" 시간표 배치`, { confId: CONF_ID, confTitle: ctitle(), entityId: pool.id });
            Toast.success(`"${data.titleKo}" 배치됨`); renderPlaceList();
        })
        .catch(e => Toast.error('배치 실패: ' + e.message));
};

/* ---------- 연자 중복(동선) 체크 ---------- */
function speakerKeysOf(speakers) {
    return (speakers || []).map(s => (typeof s === 'string' ? s : (s.id || s.nameKo || '')).trim()).filter(Boolean);
}
// 현재 배치된 모든 강의를 절대 시각으로 수집
function collectPlaced() {
    const out = [];
    orderedRooms().forEach(room => {
        computeRoom(room).forEach(session => {
            session.lectures.forEach(lec => {
                out.push({
                    roomId: room.id, roomName: room.name, date: room.date || '',
                    lecId: lec.id, titleKo: normalizeLecture(lec).titleKo,
                    start: lec._start, end: lec._end, speakerKeys: speakerKeysOf(lec.speakers)
                });
            });
        });
    });
    return out;
}

// 세션의 모든 강의 연자 key (패널 참여자 = 이 세션 강의 연자 전원)
function panelKeysOfSession(session) {
    const keys = new Set();
    (session.lectures || []).forEach(l => {
        if (l.isBreak || l.isPanel) return;
        speakerKeysOf(l.speakers).forEach(k => keys.add(k));
    });
    return [...keys];
}

// 강의 + 사회자 + 패널 점유를 함께 수집 (사회자는 세션 전체, 패널은 그 항목 시간 동안 세션 연자 전원)
function collectOccupancy() {
    const out = [];
    orderedRooms().forEach(room => {
        computeRoom(room).forEach(session => {
            session.lectures.forEach(lec => {
                if (lec.isBreak) return;                       // 브레이크는 점유 없음
                const keys = lec.isPanel ? panelKeysOfSession(session) : speakerKeysOf(lec.speakers);
                out.push({
                    kind: lec.isPanel ? 'panel' : 'lecture', roomId: room.id, sessionId: session.id, date: room.date || '',
                    refId: lec.id, start: lec._start, end: lec._end, keys
                });
            });
            const mod = session.moderator;
            const modKey = mod && (mod.id || mod.nameKo);
            if (modKey) {
                out.push({
                    kind: 'moderator', roomId: room.id, sessionId: session.id, date: room.date || '',
                    refId: 'mod:' + session.id, start: session._start, end: session._end,
                    keys: [String(modKey).trim()].filter(Boolean)
                });
            }
        });
    });
    return out;
}

// 충돌하는 항목 id 집합 (강의 id + 'mod:세션id'). 렌더마다 재계산 → 자동 갱신
// 사회자는 세션 전체 동안 묶임. 단, 같은 세션 내부(사회자↔그 세션 연자)는 제외.
function computeConflictIds() {
    const occ = collectOccupancy();
    const ids = new Set();
    for (let i = 0; i < occ.length; i++) {
        for (let j = i + 1; j < occ.length; j++) {
            const a = occ[i], b = occ[j];
            if ((a.date || '') !== (b.date || '')) continue;                 // 다른 날짜면 충돌 아님
            if (a.roomId === b.roomId && a.sessionId === b.sessionId) continue; // 같은 세션 내부는 제외
            if (!a.keys.some(k => b.keys.includes(k))) continue;             // 같은 사람 아님
            const buffer = (a.roomId === b.roomId) ? 0 : SPEAKER_TRAVEL_MIN;  // 같은 룸은 이동 불필요
            if (a.start < b.end + buffer && b.start < a.end + buffer) {
                ids.add(a.refId); ids.add(b.refId);
            }
        }
    }
    return ids;
}

// 후보 강의가 기존 배치와 연자·시간 충돌하는지 (같은 날짜만, 다른 룸은 이동 10분 버퍼)
function findSpeakerConflict(targetRoomId, targetDate, candStart, candEnd, candSpeakers, ignoreLecId) {
    const candKeys = speakerKeysOf(candSpeakers);
    if (!candKeys.length) return null;
    for (const p of collectPlaced()) {
        if (p.lecId === ignoreLecId) continue;
        if ((p.date || '') !== (targetDate || '')) continue;         // 다른 날짜면 충돌 아님
        const shared = p.speakerKeys.find(k => candKeys.includes(k));
        if (!shared) continue;
        const buffer = (p.roomId === targetRoomId) ? 0 : SPEAKER_TRAVEL_MIN; // 같은 룸은 이동 불필요
        if (candStart < p.end + buffer && p.start < candEnd + buffer) {
            return { key: shared, other: p, buffer, candStart, candEnd };
        }
    }
    return null;
}
function speakerLabel(key) {
    const sp = (Masters.speakers || []).find(s => s.id === key || s.nameKo === key);
    return sp ? sp.nameKo : key;
}
function conflictMessage(c) {
    const travel = c.buffer ? `(다른 룸 이동 ${c.buffer}분 필요) ` : '';
    return `⛔ 연자 중복: "${speakerLabel(c.key)}" 님이 같은 날 ${c.other.roomName} ${formatTime(c.other.start)}~${formatTime(c.other.end)} "${c.other.titleKo}" 와 겹칩니다 ${travel}— 배치할 수 없습니다.`;
}

/* ---------- 강의 시간 수정 ---------- */
window.openDurModal = function (roomId, sessionId, lecId) {
    if (!AdminAuth.requireEdit()) return;
    editingDuration = { roomId, sessionId, lecId };
    const lec = CONF.rooms[roomId].sessions[sessionId].lectures[lecId];
    document.getElementById('durLecTitle').textContent = normalizeLecture(lec).titleKo || '';
    document.getElementById('durInput').value = lec.duration ?? 0;
    document.getElementById('durModal').classList.add('open');
};
window.closeDurModal = function () { document.getElementById('durModal').classList.remove('open'); };
window.saveDuration = function () {
    if (!AdminAuth.requireEdit()) return;
    const { roomId, sessionId, lecId } = editingDuration;
    const dur = Number(document.getElementById('durInput').value) || 0;
    const cur = CONF.rooms[roomId] && CONF.rooms[roomId].sessions[sessionId] && CONF.rooms[roomId].sessions[sessionId].lectures[lecId];
    const lectureId = cur && cur.lectureId;   // 강의 풀과 연결된 강의면 목록·다른 배치도 함께 반영

    const updates = {};
    updates[`rooms/${roomId}/sessions/${sessionId}/lectures/${lecId}/duration`] = dur;
    if (lectureId) {
        // 강의 관리(풀) 반영
        updates[`lecturePool/${lectureId}/duration`] = dur;
        updates[`lecturePool/${lectureId}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
        // 같은 풀 강의를 배치한 모든 사본도 동일 시간으로 반영
        Object.entries(CONF.rooms || {}).forEach(([rid, room]) => {
            Object.entries(room.sessions || {}).forEach(([sid, sess]) => {
                Object.entries(sess.lectures || {}).forEach(([lid, l]) => {
                    if (l.lectureId === lectureId) updates[`rooms/${rid}/sessions/${sid}/lectures/${lid}/duration`] = dur;
                });
            });
        });
    }
    confRef().update(updates)
        .then(() => { Toast.success('시간이 수정되었습니다.' + (lectureId ? ' (강의 목록·다른 배치에도 반영)' : '')); closeDurModal(); })
        .catch(e => Toast.error('저장 실패: ' + e.message));
};

window.deleteLecture = async function (roomId, sessionId, lecId) {
    if (!AdminAuth.requireEdit()) return;
    const lec = CONF.rooms[roomId].sessions[sessionId].lectures[lecId];
    const ok = await confirmDialog(`"${lec ? normalizeLecture(lec).titleKo : ''}" 강의를 삭제할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/lectures/${lecId}`).remove()
        .then(() => {
            logActivity('delete', 'lecture', `시간표 강의 "${lec ? normalizeLecture(lec).titleKo : ''}" 삭제`, { confId: CONF_ID, confTitle: ctitle(), entityId: lec && lec.lectureId ? lec.lectureId : lecId });
            Toast.success('삭제되었습니다.');
        });
};

function persistLectureOrder(roomId, sessionId, ids) {
    if (!AdminAuth.requireEdit()) return;
    const updates = {};
    ids.forEach((id, i) => updates[`rooms/${roomId}/sessions/${sessionId}/lectures/${id}/order`] = i);
    confRef().update(updates);
}

/* ============================================================
   강의 이동 (다른 세션/룸으로)
   ============================================================ */
window.openMoveModal = function (roomId, sessionId, lecId) {
    if (!AdminAuth.requireEdit()) return;
    movingLecture = { roomId, sessionId, lecId };
    const sel = document.getElementById('moveTarget');
    const opts = [];
    orderedRooms().forEach(r => {
        toOrderedArray(r.sessions).forEach(s => {
            const isCurrent = r.id === roomId && s.id === sessionId;
            opts.push(`<option value="${r.id}|${s.id}" ${isCurrent ? 'disabled' : ''}>${escapeHtml(r.name)} › ${escapeHtml(s.name)}${isCurrent ? ' (현재)' : ''}</option>`);
        });
    });
    sel.innerHTML = opts.join('') || '<option disabled>이동 가능한 세션이 없습니다</option>';
    document.getElementById('moveModal').classList.add('open');
};
window.closeMoveModal = function () { document.getElementById('moveModal').classList.remove('open'); };
window.confirmMove = function () {
    if (!AdminAuth.requireEdit()) return;
    const val = document.getElementById('moveTarget').value;
    if (!val || !val.includes('|')) return;
    const [toRoom, toSession] = val.split('|');
    const { roomId, sessionId, lecId } = movingLecture;
    const lec = CONF.rooms[roomId].sessions[sessionId].lectures[lecId];
    if (!lec) return;
    const targetLectures = toOrderedArray(CONF.rooms[toRoom].sessions[toSession].lectures);
    const moved = { ...lec, order: targetLectures.length };
    const updates = {};
    updates[`rooms/${roomId}/sessions/${sessionId}/lectures/${lecId}`] = null;
    updates[`rooms/${toRoom}/sessions/${toSession}/lectures/${lecId}`] = moved;
    confRef().update(updates).then(() => { Toast.success('이동되었습니다.'); closeMoveModal(); });
};

/* ============================================================
   드래그 정렬 (공통) — 종류(type)+컨테이너별로 격리
   강의를 드래그해도 상위 세션이 함께 이동하지 않도록 함
   ============================================================ */
let activeDrag = null;      // { type, el, container }
let pendingDragItem = null; // 그립을 잡은 아이템 (어느 것을 드래그하는지 확실히 구분)

function enableSort(container, itemSelector, idAttr, onReorder, type) {
    if (!container) return;
    container.querySelectorAll(itemSelector).forEach(item => {
        const grip = item.querySelector('.grip');
        if (grip) {
            const arm = () => { pendingDragItem = item; item.setAttribute('draggable', 'true'); };
            grip.addEventListener('mousedown', arm);
            grip.addEventListener('touchstart', arm, { passive: true });
        }
        item.addEventListener('dragstart', e => {
            // 이 아이템의 그립을 잡은 게 아니면 무시 (자식 강의 드래그가 세션을 끌지 않도록)
            if (pendingDragItem !== item) return;
            activeDrag = { type, el: item, container };
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');  // Firefox 대응
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging'); item.removeAttribute('draggable');
            container.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover'));
            activeDrag = null;
            pendingDragItem = null;
        });
        const sameCtx = () => activeDrag && activeDrag.type === type && activeDrag.container === container;
        item.addEventListener('dragover', e => {
            if (!sameCtx()) return;          // 다른 종류/다른 세션의 드래그는 무시
            e.preventDefault();
            if (activeDrag.el !== item) item.classList.add('dragover');
        });
        item.addEventListener('dragleave', () => item.classList.remove('dragover'));
        item.addEventListener('drop', e => {
            if (!sameCtx()) return;
            e.preventDefault();
            item.classList.remove('dragover');
            const dragEl = activeDrag.el;
            if (!dragEl || dragEl === item) return;
            const items = [...container.querySelectorAll(itemSelector)];
            const from = items.indexOf(dragEl), to = items.indexOf(item);
            if (from < 0 || to < 0) return;
            if (from < to) item.after(dragEl); else item.before(dragEl);
            const ids = [...container.querySelectorAll(itemSelector)].map(el => el.getAttribute(idAttr));
            onReorder(ids);
        });
    });
}

/* ---------- 강의 드래그: 세션 내 순서변경 + 세션 간 이동 ---------- */
function enableLectureDrag(roomId) {
    const box = document.getElementById('sessions');
    const lists = [...box.querySelectorAll('.lecture-list[data-session]')];

    box.querySelectorAll('.lecture-row').forEach(row => {
        const grip = row.querySelector('.grip');
        if (grip) {
            const arm = () => { pendingDragItem = row; row.setAttribute('draggable', 'true'); };
            grip.addEventListener('mousedown', arm);
            grip.addEventListener('touchstart', arm, { passive: true });
        }
        row.addEventListener('dragstart', e => {
            if (pendingDragItem !== row) return;
            activeDrag = { type: 'lecture', el: row };
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging'); row.removeAttribute('draggable');
            box.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover'));
            activeDrag = null; pendingDragItem = null;
        });
        row.addEventListener('dragover', e => {
            if (!activeDrag || activeDrag.type !== 'lecture') return;
            e.preventDefault();
            if (activeDrag.el !== row) row.classList.add('dragover');
        });
        row.addEventListener('dragleave', () => row.classList.remove('dragover'));
        row.addEventListener('drop', e => {
            if (!activeDrag || activeDrag.type !== 'lecture') return;
            e.preventDefault();
            row.classList.remove('dragover');
            const dragEl = activeDrag.el;
            if (!dragEl || dragEl === row) return;
            const sameParent = dragEl.parentElement === row.parentElement;
            const rows = [...row.parentElement.querySelectorAll('.lecture-row')];
            const from = sameParent ? rows.indexOf(dragEl) : -1;
            const to = rows.indexOf(row);
            if (sameParent && from < to) row.after(dragEl); else row.before(dragEl);
            rebuildRoomLecturesFromDOM(roomId);
        });
    });

    // 빈 영역/세션 끝에 드롭 → 그 세션 마지막에 배치
    lists.forEach(list => {
        list.addEventListener('dragover', e => {
            if (!activeDrag || activeDrag.type !== 'lecture') return;
            e.preventDefault();
        });
        list.addEventListener('drop', e => {
            if (!activeDrag || activeDrag.type !== 'lecture') return;
            if (e.target.closest('.lecture-row')) return;   // 행 위 드롭은 행 핸들러가 처리
            e.preventDefault();
            if (activeDrag.el) { list.appendChild(activeDrag.el); rebuildRoomLecturesFromDOM(roomId); }
        });
    });
}

// DOM(각 세션 리스트의 강의 순서)을 기준으로 룸 전체 강의 배치를 재구성해 저장
function rebuildRoomLecturesFromDOM(roomId) {
    if (!AdminAuth.canEdit()) return;   // 뷰어면 무시(재렌더로 원복)
    const room = CONF.rooms[roomId];
    if (!room) return;
    // 강의 id → 원본 데이터
    const lecById = {};
    Object.values(room.sessions || {}).forEach(sess => {
        Object.entries(sess.lectures || {}).forEach(([lid, l]) => { lecById[lid] = l; });
    });
    const updates = {};
    document.querySelectorAll('#sessions .lecture-list[data-session]').forEach(listEl => {
        const sid = listEl.getAttribute('data-session');
        const ids = [...listEl.querySelectorAll('.lecture-row')].map(el => el.getAttribute('data-lec'));
        const newLectures = {};
        ids.forEach((lid, i) => { if (lecById[lid]) newLectures[lid] = { ...lecById[lid], order: i }; });
        updates[`rooms/${roomId}/sessions/${sid}/lectures`] = Object.keys(newLectures).length ? newLectures : null;
    });
    confRef().update(updates).catch(e => Toast.error('이동 저장 실패: ' + e.message));
}

/* ============================================================
   엑셀 다운로드
   ============================================================ */
window.exportExcel = function () {
    if (typeof XLSX === 'undefined') { Toast.error('엑셀 모듈을 불러오지 못했습니다.'); return; }
    if (!CONF) return;
    const rows = [['룸', '세션', '시작', '종료', '시간(분)',
        '제목(국문)', '제목(영문)', '연자(국문)', '연자(영문)', '소속(국문)', '소속(영문)',
        '파트너사(국문)', '파트너사(영문)', '제품(국문)', '제품(영문)', '제품분류', '제품설명']];
    const join = arr => arr.filter(Boolean).join('; ');
    orderedRooms().forEach(r => {
        computeRoom(r).forEach(s => {
            s.lectures.forEach(lec => {
                const n = normalizeLecture(lec);
                rows.push([
                    r.name, s.name, formatTime(lec._start), formatTime(lec._end), lec.duration || 0,
                    n.titleKo, n.titleEn,
                    join(n.speakers.map(x => x.nameKo)), join(n.speakers.map(x => x.nameEn)),
                    join(n.speakers.map(x => x.affiliationKo)), join(n.speakers.map(x => x.affiliationEn)),
                    n.partnerKo, n.partnerEn, n.productKo, n.productEn, n.productCategory, n.productDesc
                ]);
            });
        });
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 7 }, { wch: 7 }, { wch: 8 },
        { wch: 40 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
        { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '시간표');
    const safe = (CONF.title || '시간표').replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(wb, `${safe}_시간표.xlsx`);
    Toast.success('엑셀 파일을 내려받았습니다.');
};

/* 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호) */
