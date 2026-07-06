/**
 * timetable.js — 시간표 및 프로그램 구성 (리스트형)
 * 구조: 행사 > 룸(탭) > 세션 > 강의(순서대로, 시작시각 자동 계산)
 * 데이터: /adminConferences/<id>/rooms/<roomId>/sessions/<sessionId>/lectures/<lecId>
 */

const CONF_ID = new URLSearchParams(location.search).get('id');
const confRef = () => database.ref('/adminConferences/' + CONF_ID);

let CONF = null;              // 전체 행사 객체
let CURRENT_ROOM = null;      // 현재 선택된 룸 id
let editingLecture = null;    // { roomId, sessionId, lecId } | { roomId, sessionId }(신규)
let editingSession = null;    // { roomId, sessionId } | { roomId }(신규)
let movingLecture = null;     // { roomId, sessionId, lecId }
let speakerDraft = [];        // 강의 모달 연자 칩 배열

/* ---------- 초기화 ---------- */
document.getElementById('sidebarMount').innerHTML = renderSidebar('events');
Masters.init();

// 마스터(연자/파트너사) 로드/변경 시, 강의 모달이 열려 있으면 셀렉트 갱신
document.addEventListener('masters-change', () => {
    const modal = document.getElementById('lectureModal');
    if (modal && modal.classList.contains('open')) {
        const pv = document.getElementById('lecPartnerSelect').value;
        populateMasterSelects();
        document.getElementById('lecPartnerSelect').value = pv;
        onPartnerChange();
    }
});

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
    box.innerHTML = tabs + `<button class="room-tab add-tab" onclick="addRoom()">+ 룸 추가</button>`;

    enableSort(box, '.room-tab[data-room]', 'data-room', ids => persistRoomOrder(ids));
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

window.addRoom = function () {
    if (!AdminAuth.requireEdit()) return;
    const rooms = orderedRooms();
    const id = uuid();
    confRef().child('rooms/' + id).set({
        name: `룸 ${rooms.length + 1}`,
        topic: '',
        startTime: '09:00',
        defaultDuration: 10,
        visible: true,
        order: rooms.length
    }).then(() => { CURRENT_ROOM = id; }).catch(e => Toast.error(e.message));
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
    enableSort(box, '.session-block', 'data-session', ids => persistSessionOrder(room.id, ids));
    // 각 세션 내 강의 순서 드래그
    sessions.forEach(s => {
        const listEl = box.querySelector(`.lecture-list[data-session="${s.id}"]`);
        if (listEl) enableSort(listEl, '.lecture-row', 'data-lec', ids => persistLectureOrder(room.id, s.id, ids));
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
            <button class="btn btn-primary btn-sm" onclick="openLectureModal('${roomId}','${s.id}')">+ 강의 추가</button>
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
            <button class="txt-btn" onclick="openLectureModal('${roomId}','${sessionId}','${lec.id}')">수정</button>
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
   강의 모달
   ============================================================ */
// 등록된 연자/파트너사로 셀렉트 채우기
function populateMasterSelects() {
    const spkSel = document.getElementById('lecSpeakerSelect');
    spkSel.innerHTML = '<option value="">-- 연자 선택 --</option>' +
        Masters.speakers.map(s =>
            `<option value="${s.id}">${escapeHtml(s.nameKo || s.nameEn)}${s.affiliationKo ? ' (' + escapeHtml(s.affiliationKo) + ')' : ''}</option>`
        ).join('');

    const ptnSel = document.getElementById('lecPartnerSelect');
    ptnSel.innerHTML = '<option value="">-- 파트너사 선택 --</option>' +
        Masters.partners.map(p => `<option value="${p.id}">${escapeHtml(p.nameKo || p.nameEn)}</option>`).join('');

    document.getElementById('lecSpeakerHint').innerHTML = Masters.speakers.length ? '' :
        `<div class="master-empty-hint">등록된 연자가 없습니다. <a href="speakers.html" target="_blank">연자 관리</a>에서 먼저 등록하세요.</div>`;
    document.getElementById('lecPartnerHint').innerHTML = Masters.partners.length ? '' :
        `<div class="master-empty-hint">등록된 파트너사가 없습니다. <a href="partners.html" target="_blank">파트너사 관리</a>에서 먼저 등록하세요.</div>`;
}

// 선택한 파트너사의 제품 목록으로 제품 셀렉트 채우기
window.onPartnerChange = function () {
    const pid = document.getElementById('lecPartnerSelect').value;
    const prodSel = document.getElementById('lecProductSelect');
    const p = Masters.partner(pid);
    const products = (p && Array.isArray(p.products)) ? p.products : [];
    prodSel.innerHTML = '<option value="">-- 제품 선택 --</option>' +
        products.map((pr, i) => `<option value="${i}">${escapeHtml(pr.nameKo || pr.nameEn || '')}</option>`).join('');
    prodSel.disabled = !products.length;
};

// 연자 추가 (칩)
window.addSelectedSpeaker = function () {
    const sel = document.getElementById('lecSpeakerSelect');
    const id = sel.value;
    if (!id) { Toast.info('추가할 연자를 선택하세요.'); return; }
    if (speakerDraft.find(s => s.id === id)) { Toast.info('이미 추가된 연자입니다.'); return; }
    const s = Masters.speaker(id);
    if (!s) return;
    speakerDraft.push({
        id: s.id, nameKo: s.nameKo || '', nameEn: s.nameEn || '',
        affiliationKo: s.affiliationKo || '', affiliationEn: s.affiliationEn || ''
    });
    sel.value = '';
    renderSpeakerChips();
};

window.openLectureModal = function (roomId, sessionId, lecId) {
    if (!AdminAuth.requireEdit()) return;
    editingLecture = lecId ? { roomId, sessionId, lecId } : { roomId, sessionId };
    const room = CONF.rooms[roomId];
    const isEdit = !!lecId;
    document.getElementById('lecModalTitle').textContent = isEdit ? '강의 수정' : '강의 추가';

    populateMasterSelects();

    const n = isEdit
        ? normalizeLecture(room.sessions[sessionId].lectures[lecId])
        : normalizeLecture({ duration: Number(room.defaultDuration) || 10 });

    document.getElementById('lecTitleKo').value = n.titleKo || '';
    document.getElementById('lecTitleEn').value = n.titleEn || '';
    document.getElementById('lecDuration').value = (isEdit ? n.duration : (Number(room.defaultDuration) || 10)) ?? 10;

    speakerDraft = n.speakers.map(s => ({ ...s }));
    renderSpeakerChips();

    // 파트너사 + 제품
    document.getElementById('lecPartnerSelect').value = n.partnerId || '';
    onPartnerChange();
    if (n.partnerId) {
        const p = Masters.partner(n.partnerId);
        if (p && Array.isArray(p.products) && (n.productKo || n.productEn)) {
            const idx = p.products.findIndex(pr =>
                (pr.nameKo || '') === (n.productKo || '') && (pr.nameEn || '') === (n.productEn || ''));
            if (idx >= 0) document.getElementById('lecProductSelect').value = String(idx);
        }
    }

    document.getElementById('lectureModal').classList.add('open');
    setTimeout(() => document.getElementById('lecTitleKo').focus(), 50);
};
window.closeLectureModal = function () { document.getElementById('lectureModal').classList.remove('open'); };

function renderSpeakerChips() {
    document.getElementById('lecSpeakerChips').innerHTML = speakerDraft.map((s, i) =>
        `<span class="chip">${escapeHtml(s.nameKo || s.nameEn || '')}<span class="x" onclick="removeSpeaker(${i})">×</span></span>`).join('');
}
window.removeSpeaker = function (i) { speakerDraft.splice(i, 1); renderSpeakerChips(); };

window.saveLecture = function () {
    if (!AdminAuth.requireEdit()) return;
    const titleKo = document.getElementById('lecTitleKo').value.trim();
    if (!titleKo) { Toast.warning('강의 제목(국문)을 입력하세요.'); return; }

    // 파트너사 + 제품 (마스터에서 해석)
    const pid = document.getElementById('lecPartnerSelect').value;
    const partner = Masters.partner(pid);
    let productKo = '', productEn = '', productCategory = '', productDesc = '';
    if (partner) {
        const pIdx = document.getElementById('lecProductSelect').value;
        const products = Array.isArray(partner.products) ? partner.products : [];
        if (pIdx !== '' && products[Number(pIdx)]) {
            const pr = products[Number(pIdx)];
            productKo = pr.nameKo || '';
            productEn = pr.nameEn || '';
            productCategory = pr.category || '';
            productDesc = pr.description || '';
        }
    }

    const data = {
        titleKo,
        titleEn: document.getElementById('lecTitleEn').value.trim(),
        duration: Number(document.getElementById('lecDuration').value) || 0,
        speakers: speakerDraft.map(s => ({
            id: s.id || '', nameKo: s.nameKo || '', nameEn: s.nameEn || '',
            affiliationKo: s.affiliationKo || '', affiliationEn: s.affiliationEn || ''
        })),
        partnerId: pid || '',
        partnerKo: partner ? (partner.nameKo || '') : '',
        partnerEn: partner ? (partner.nameEn || '') : '',
        productKo, productEn, productCategory, productDesc,
        // 구 포맷 필드 제거
        title: null, subtitle: null, partner: null
    };
    const { roomId, sessionId, lecId } = editingLecture;
    const base = `rooms/${roomId}/sessions/${sessionId}/lectures`;
    if (lecId) {
        confRef().child(`${base}/${lecId}`).update(data)
            .then(() => { Toast.success('저장되었습니다.'); closeLectureModal(); })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        const lectures = toOrderedArray(CONF.rooms[roomId].sessions[sessionId].lectures);
        data.order = lectures.length;
        confRef().child(`${base}/${uuid()}`).set(data)
            .then(() => { Toast.success('강의가 추가되었습니다.'); closeLectureModal(); })
            .catch(e => Toast.error('추가 실패: ' + e.message));
    }
};

window.deleteLecture = async function (roomId, sessionId, lecId) {
    if (!AdminAuth.requireEdit()) return;
    const lec = CONF.rooms[roomId].sessions[sessionId].lectures[lecId];
    const ok = await confirmDialog(`"${lec ? lec.title : ''}" 강의를 삭제할까요?`, { danger: true, okText: '삭제' });
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
    const targetLectures = toOrderedArray(CONF.rooms[toRoom].sessions[toSession].lectures);
    const moved = { ...lec, order: targetLectures.length };
    const updates = {};
    updates[`rooms/${roomId}/sessions/${sessionId}/lectures/${lecId}`] = null;
    updates[`rooms/${toRoom}/sessions/${toSession}/lectures/${lecId}`] = moved;
    confRef().update(updates).then(() => { Toast.success('이동되었습니다.'); closeMoveModal(); });
};

/* ============================================================
   드래그 정렬 (공통)
   ============================================================ */
function enableSort(container, itemSelector, idAttr, onReorder) {
    if (!container) return;
    let dragEl = null;
    container.querySelectorAll(itemSelector).forEach(item => {
        const grip = item.querySelector('.grip');
        if (grip) {
            grip.addEventListener('mousedown', () => item.setAttribute('draggable', 'true'));
            grip.addEventListener('touchstart', () => item.setAttribute('draggable', 'true'), { passive: true });
        }
        item.addEventListener('dragstart', e => {
            dragEl = item; item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging'); item.removeAttribute('draggable');
            container.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover'));
            dragEl = null;
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            if (dragEl && dragEl !== item) item.classList.add('dragover');
        });
        item.addEventListener('dragleave', () => item.classList.remove('dragover'));
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('dragover');
            if (!dragEl || dragEl === item) return;
            const items = [...container.querySelectorAll(itemSelector)];
            const from = items.indexOf(dragEl), to = items.indexOf(item);
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
