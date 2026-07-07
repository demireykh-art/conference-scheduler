/**
 * timetable.js — 시간표 및 프로그램 구성 (리스트형)
 * 구조: 행사 > 룸(탭) > 세션 > 강의(순서대로, 시작시각 자동 계산)
 * 데이터: /adminConferences/<id>/rooms/<roomId>/sessions/<sessionId>/lectures/<lecId>
 */

const CONF_ID = new URLSearchParams(location.search).get('id');
try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
const confRef = () => database.ref('/adminConferences/' + CONF_ID);

let CONF = null;              // 전체 행사 객체
let CURRENT_ROOM = null;      // 현재 선택된 룸 id
let editingSession = null;    // { roomId, sessionId } | { roomId }(신규)
let movingLecture = null;     // { roomId, sessionId, lecId }
let placingTarget = null;     // { roomId, sessionId } (배치 대상 세션)
let editingDuration = null;   // { roomId, sessionId, lecId }
let POOL = [];                // 이 행사의 강의 풀
let newRoomDate = '';         // 룸 추가 모달에서 선택한 날짜

const SPEAKER_TRAVEL_MIN = 10; // 다른 룸 이동 시간(분)

/* ---------- 초기화 ---------- */
document.getElementById('sidebarMount').innerHTML = renderSidebar('timetable');
Masters.init();   // 연자 이름 표시(중복 알림)용

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
    document.getElementById('confContext').textContent =
        (CONF.title || '') + (CONF.startDate ? ` · ${fmtDateRange(CONF.startDate, CONF.endDate)}` : '');

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
        <div class="field">
            <label>기본 강의시간(분)</label>
            <input type="number" min="0" step="5" value="${Number(room.defaultDuration) || 10}" onchange="updateRoom('defaultDuration', this.value)">
        </div>
        <label class="check-inline">
            <input type="checkbox" ${room.visible !== false ? 'checked' : ''} onchange="updateRoom('visible', this.checked)">
            사용자 화면 공개
        </label>
        <button class="btn btn-danger-ghost btn-sm" onclick="deleteRoom('${room.id}')">룸 삭제</button>
        <div class="settings-hint">체크 해제 시 학술대회 상세 페이지의 프로그램 탭에서 이 룸이 보이지 않습니다.</div>
    `;
}

window.updateRoom = function (field, value) {
    if (!AdminAuth.requireEdit()) { renderRoomSettings(); return; }
    if (field === 'defaultDuration') value = Number(value) || 0;
    confRef().child('rooms/' + CURRENT_ROOM + '/' + field).set(value)
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
        name, topic: '', date: newRoomDate, startTime: '09:00', defaultDuration: 10, visible: true, order: orderedRooms().length
    }).then(() => { CURRENT_ROOM = id; closeRoomModal(); Toast.success('룸이 추가되었습니다.'); })
        .catch(e => Toast.error(e.message));
};

window.deleteRoom = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const r = getRoom(id);
    const ok = await confirmDialog(`"${r ? r.name : ''}" 룸을 삭제할까요?\n포함된 세션·강의가 모두 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    CURRENT_ROOM = null;
    confRef().child('rooms/' + id).remove().then(() => Toast.success('삭제되었습니다.'));
};

function persistRoomOrder(ids) {
    if (!AdminAuth.requireEdit()) return;
    const updates = {};
    ids.forEach((id, i) => updates['rooms/' + id + '/order'] = i);
    confRef().update(updates);
}

/* ---------- 세션 + 강의 ---------- */
function renderSessions() {
    const box = document.getElementById('sessions');
    const room = getRoom(CURRENT_ROOM);
    if (!room) { box.innerHTML = ''; return; }

    const sessions = computeRoom(room);
    if (!sessions.length) {
        box.innerHTML = `<div class="card empty-state">아직 세션이 없습니다.<br><b>+ 세션 추가</b>로 오전/점심/오후 등을 만드세요.</div>`;
        return;
    }

    box.innerHTML = sessions.map(s => renderSessionBlock(room.id, s)).join('');

    // 세션 순서 드래그
    enableSort(box, '.session-block', 'data-session', ids => persistSessionOrder(room.id, ids), 'session');
    // 각 세션 내 강의 순서 드래그
    sessions.forEach(s => {
        const listEl = box.querySelector(`.lecture-list[data-session="${s.id}"]`);
        if (listEl) enableSort(listEl, '.lecture-row', 'data-lec', ids => persistLectureOrder(room.id, s.id, ids), 'lecture');
    });
}

function renderSessionBlock(roomId, s) {
    const range = `${formatTime(s._start)} - ${formatTime(s._end)}`;
    const lectures = s.lectures.map(lec => renderLectureRow(roomId, s.id, lec)).join('');
    return `
    <div class="session-block" data-session="${s.id}">
        <div class="session-head">
            <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>
            <div>
                <h3 class="session-title">${escapeHtml(s.name || '(세션)')}</h3>
                <div class="session-sub">${range} · ${s._count}건 · 총 ${s._total}분</div>
            </div>
            <div class="spacer"></div>
            <button class="btn btn-primary btn-sm" onclick="openPlaceModal('${roomId}','${s.id}')">+ 강의 배치</button>
            <button class="txt-btn" onclick="editSession('${roomId}','${s.id}')">수정</button>
            <button class="txt-btn danger" onclick="deleteSession('${roomId}','${s.id}')">삭제</button>
        </div>
        <div class="lecture-list" data-session="${s.id}">
            ${lectures || '<div style="padding:16px 18px;color:var(--text-dim);font-size:0.84rem">강의가 없습니다.</div>'}
        </div>
    </div>`;
}

function renderLectureRow(roomId, sessionId, lec) {
    const n = normalizeLecture(lec);
    const range = `${formatTime(lec._start)} - ${formatTime(lec._end)}`;
    const partner = n.partnerKo ? `<span class="partner-badge">${escapeHtml(n.partnerKo)}</span>` : '';
    const speakers = n.speakers.length
        ? n.speakers.map(s => {
            const nm = s.nameKo || s.nameEn || '';
            return s.affiliationKo ? `${nm} (${s.affiliationKo})` : nm;
        }).join(', ')
        : '미정';
    let product = '';
    if (n.productKo || n.productEn) {
        const cat = n.productCategory ? ` · ${escapeHtml(n.productCategory)}` : '';
        product = `<div class="lec-product">제품: ${escapeHtml(n.productKo || n.productEn)}${cat}</div>`;
        if (n.productDesc) product += `<div class="lec-product" style="opacity:.85">└ ${escapeHtml(n.productDesc)}</div>`;
    }
    return `
    <div class="lecture-row" data-lec="${lec.id}">
        <span class="grip" title="드래그하여 순서 변경">⋮⋮</span>
        <div class="lec-main">
            <div class="lec-tags">
                <span class="time-badge">${range}</span>
                <span class="dur-badge">${lec.duration || 0}분</span>
                ${partner}
            </div>
            <div class="lec-title">${escapeHtml(n.titleKo || '(제목 없음)')}</div>
            ${n.titleEn ? `<div class="lec-subtitle">${escapeHtml(n.titleEn)}</div>` : ''}
            <div class="lec-speaker">연자: ${escapeHtml(speakers)}</div>
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
        productDesc: lec.productDesc || ''
    };
}

/* ============================================================
   세션 모달
   ============================================================ */
window.openSessionModal = function () {
    if (!AdminAuth.requireEdit()) return;
    editingSession = { roomId: CURRENT_ROOM };
    document.getElementById('sessionModalTitle').textContent = '세션 추가';
    document.getElementById('sessionName').value = '';
    document.getElementById('sessionModal').classList.add('open');
};
window.editSession = function (roomId, sessionId) {
    if (!AdminAuth.requireEdit()) return;
    const s = CONF.rooms[roomId].sessions[sessionId];
    editingSession = { roomId, sessionId };
    document.getElementById('sessionModalTitle').textContent = '세션 수정';
    document.getElementById('sessionName').value = s.name || '';
    document.getElementById('sessionModal').classList.add('open');
};
window.closeSessionModal = function () { document.getElementById('sessionModal').classList.remove('open'); };
window.saveSession = function () {
    if (!AdminAuth.requireEdit()) return;
    const name = document.getElementById('sessionName').value.trim();
    if (!name) { Toast.warning('세션 이름을 입력하세요.'); return; }
    const { roomId, sessionId } = editingSession;
    if (sessionId) {
        confRef().child(`rooms/${roomId}/sessions/${sessionId}/name`).set(name)
            .then(() => { Toast.success('저장되었습니다.'); closeSessionModal(); });
    } else {
        const sessions = toOrderedArray(CONF.rooms[roomId].sessions);
        const id = uuid();
        confRef().child(`rooms/${roomId}/sessions/${id}`).set({ name, order: sessions.length })
            .then(() => { Toast.success('세션이 추가되었습니다.'); closeSessionModal(); });
    }
};
window.deleteSession = async function (roomId, sessionId) {
    if (!AdminAuth.requireEdit()) return;
    const s = CONF.rooms[roomId].sessions[sessionId];
    const ok = await confirmDialog(`"${s ? s.name : ''}" 세션을 삭제할까요?\n포함된 강의가 모두 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    confRef().child(`rooms/${roomId}/sessions/${sessionId}`).remove().then(() => Toast.success('삭제되었습니다.'));
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
        const hay = [l.titleKo, l.titleEn, ...(l.tags || []), ...(l.categories || []),
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
        const spk = (l.speakers || []).map(s => escapeHtml(s.nameKo || s.nameEn)).join(', ') || '미정';
        return `
        <div class="place-row ${isPlaced ? 'is-placed' : ''}">
            <div class="p-main">
                <div class="p-title">${escapeHtml(l.titleKo || '(제목 없음)')} <span style="color:var(--text-dim);font-weight:400">· ${l.duration || 0}분</span></div>
                <div class="chips" style="margin:4px 0">${cats}${tags}</div>
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

    // 배치될 시각 = 대상 세션의 현재 종료 시각
    const room = getRoom(roomId);
    const sessions = computeRoom(room);
    const targetSession = sessions.find(s => s.id === sessionId);
    const startMin = targetSession ? targetSession._end : parseTime(room.startTime || '09:00');
    const endMin = startMin + (Number(pool.duration) || 0);

    // 연자 중복(동선) 체크
    const conflict = findSpeakerConflict(roomId, room.date || '', startMin, endMin, pool.speakers || [], null);
    if (conflict) { Toast.error(conflictMessage(conflict), 7000); return; }

    const data = {
        lectureId: pool.id,
        titleKo: pool.titleKo || '', titleEn: pool.titleEn || '',
        duration: Number(pool.duration) || 0,
        categories: pool.categories || [], tags: pool.tags || [],
        speakers: (pool.speakers || []).map(s => ({ ...s })),
        partnerId: pool.partnerId || '', partnerKo: pool.partnerKo || '', partnerEn: pool.partnerEn || '',
        productKo: pool.productKo || '', productEn: pool.productEn || '',
        productCategory: pool.productCategory || '', productDesc: pool.productDesc || '',
        order: toOrderedArray(CONF.rooms[roomId].sessions[sessionId].lectures).length
    };
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/lectures/${uuid()}`).set(data)
        .then(() => { Toast.success(`"${data.titleKo}" 배치됨`); renderPlaceList(); })
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
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/lectures/${lecId}/duration`).set(dur)
        .then(() => { Toast.success('시간이 수정되었습니다.'); closeDurModal(); })
        .catch(e => Toast.error('저장 실패: ' + e.message));
};

window.deleteLecture = async function (roomId, sessionId, lecId) {
    if (!AdminAuth.requireEdit()) return;
    const lec = CONF.rooms[roomId].sessions[sessionId].lectures[lecId];
    const ok = await confirmDialog(`"${lec ? normalizeLecture(lec).titleKo : ''}" 강의를 삭제할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    confRef().child(`rooms/${roomId}/sessions/${sessionId}/lectures/${lecId}`).remove()
        .then(() => Toast.success('삭제되었습니다.'));
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
    // 이동 대상에서의 시각으로 연자 중복 체크 (자기 자신 제외)
    const toRoomObj = getRoom(toRoom);
    const toSessions = computeRoom(toRoomObj);
    const tSession = toSessions.find(s => s.id === toSession);
    const startMin = tSession ? tSession._end : parseTime(toRoomObj.startTime || '09:00');
    const endMin = startMin + (Number(lec.duration) || 0);
    const conflict = findSpeakerConflict(toRoom, toRoomObj.date || '', startMin, endMin, lec.speakers || [], lecId);
    if (conflict) { Toast.error(conflictMessage(conflict), 7000); return; }

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
let activeDrag = null; // { type, el, container }

function enableSort(container, itemSelector, idAttr, onReorder, type) {
    if (!container) return;
    container.querySelectorAll(itemSelector).forEach(item => {
        const grip = item.querySelector('.grip');
        if (grip) {
            grip.addEventListener('mousedown', () => item.setAttribute('draggable', 'true'));
            grip.addEventListener('touchstart', () => item.setAttribute('draggable', 'true'), { passive: true });
        }
        item.addEventListener('dragstart', e => {
            if (e.target !== item) return;   // 자식(강의)에서 버블링된 이벤트 무시 → 세션이 끌려가지 않음
            activeDrag = { type, el: item, container };
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');  // Firefox 대응
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging'); item.removeAttribute('draggable');
            container.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover'));
            activeDrag = null;
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
