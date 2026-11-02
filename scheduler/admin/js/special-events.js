/**
 * special-events.js — 특별행사 참석명단 (행사별)
 * MOU 체결식·만찬 등 강의 일정에 없는 특별행사를 만들고, 연자/사회/좌장 명단에서
 * '참석'을 켜 참석자를 확정한다. 확정 명단은 연자별 강의 일정에도 표시된다.
 * 데이터: /adminConferences/<id>/specialEvents/<eventId>
 *   = { name, date, time, memo, order, attendees:[{key,id,nameKo,nameEn,aff}], createdAt, updatedAt }
 */
let CONF_LIST = [];
let CONF_ID = new URLSearchParams(location.search).get('id') || '';
let CONF_NAME = '', CONF_START = '', CONF_END = '';
let EVENTS = {}, ROOMS = {}, POOL = {}, CONF_SPK = {};
let ROSTER = [];
let evRef = null, roomsRef = null, poolRef = null, spkRef = null;

let EDIT_ID = null;   // 현재 참석자 편집 중인 특별행사 id
let DRAFT = null;     // 편집 중 참석 키 Set

document.getElementById('sidebarMount').innerHTML = renderSidebar('special');
Masters.init();
document.addEventListener('masters-change', () => { buildRoster(); render(); });

/* ---------- 행사 선택 ---------- */
if (!CONF_ID) { try { CONF_ID = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { } }
database.ref('/adminConferences').on('value', snap => {
    const v = snap.val() || {};
    CONF_LIST = Object.entries(v).map(([id, c]) => ({ id, title: c.title || '(제목 없음)', startDate: c.startDate || '', endDate: c.endDate || '' }))
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    if (!CONF_ID || !CONF_LIST.find(c => c.id === CONF_ID)) CONF_ID = CONF_LIST.length ? CONF_LIST[0].id : '';
    const sel = document.getElementById('seConfSelect');
    if (sel) { sel.innerHTML = CONF_LIST.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join(''); sel.value = CONF_ID; }
    subscribeConf();
});

window.changeConf = function (id) {
    CONF_ID = id;
    try { localStorage.setItem('asls_lastConfId', id); } catch (e) { }
    EDIT_ID = null; DRAFT = null;
    subscribeConf();
};

function subscribeConf() {
    [evRef, roomsRef, poolRef, spkRef].forEach(r => { if (r) r.off(); });
    evRef = roomsRef = poolRef = spkRef = null;
    const c = CONF_LIST.find(x => x.id === CONF_ID);
    CONF_NAME = c ? c.title : ''; CONF_START = c ? c.startDate : ''; CONF_END = c ? c.endDate : '';
    document.getElementById('confName').textContent = CONF_NAME + (CONF_START ? ` · ${fmtDateRange(CONF_START, CONF_END)}` : '');
    if (!CONF_ID) { EVENTS = {}; ROOMS = {}; POOL = {}; CONF_SPK = {}; ROSTER = []; render(); return; }
    const base = '/adminConferences/' + CONF_ID + '/';
    evRef = database.ref(base + 'specialEvents');
    evRef.on('value', s => { EVENTS = s.val() || {}; render(); });
    roomsRef = database.ref(base + 'rooms');
    roomsRef.on('value', s => { ROOMS = s.val() || {}; buildRoster(); render(); });
    poolRef = database.ref(base + 'lecturePool');
    poolRef.on('value', s => { POOL = s.val() || {}; buildRoster(); render(); });
    spkRef = database.ref(base + 'confSpeakers');
    spkRef.on('value', s => { CONF_SPK = s.val() || {}; buildRoster(); render(); });
}

/* ---------- 명단(roster) 수집: 연자 ∪ 사회/좌장 ---------- */
function modArr(session) {
    if (Array.isArray(session.moderators)) return session.moderators.filter(m => m && (m.id || m.nameKo || m.nameEn)).slice(0, 2);
    const m = session.moderator;
    return (m && (m.id || m.nameKo || m.nameEn)) ? [m] : [];
}

/* ---------- 시간표 일정 수집 + 특별행사 시간 겹침 체크 ----------
   시간표(강의/좌장) 시간이 수정되면 구독으로 render가 재실행 → 겹침이 자동 재계산된다.   */
const TRAVEL_BUF = 10;   // 다른 장소 이동 버퍼(분)
let SCHED = new Map();    // personKey → [{date,start,end,label}]
function personKeyOf(sp) {
    sp = sp || {};
    const id = sp.id || '';
    const m = id && Masters.speaker ? Masters.speaker(id) : null;
    const nk = (m && m.nameKo) || sp.nameKo || '';
    const ne = (m && m.nameEn) || sp.nameEn || '';
    return (id || nk || ne || '').toString();
}
function parseHM(t) { if (!t || typeof t !== 'string' || !t.includes(':')) return null; const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function buildSchedule() {
    const map = new Map();
    const push = (k, slot) => { if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k).push(slot); };
    toOrderedArray(ROOMS).forEach(room => {
        (computeRoom(room) || []).forEach(session => {
            const panel = [];
            (session.lectures || []).forEach(l => { if (l.isBreak || l.isPanel) return; (l.speakers || []).forEach(sp => panel.push(sp)); });
            (session.lectures || []).forEach(lec => {
                if (lec.isBreak) return;
                const speakers = lec.isPanel ? panel : (lec.speakers || []);
                speakers.forEach(sp => push(personKeyOf(sp), { date: room.date || '', start: lec._start, end: lec._end, label: (lec.titleKo || lec.titleEn || '강의') + ' (' + (room.name || '룸') + ')' }));
            });
            modArr(session).forEach(md => push(personKeyOf(md), { date: room.date || '', start: session._start, end: session._end, label: '좌장/사회: ' + (session.name || '세션') + ' (' + (room.name || '룸') + ')' }));
        });
    });
    return map;
}
// 특별행사 시간과 겹치는 이 사람의 강의/좌장 일정 목록
function evConflicts(key, ev) {
    if (!ev.date) return [];
    const s = parseHM(ev.startTime); if (s == null) return [];
    const e = (ev.endTime) ? parseHM(ev.endTime) : s;
    return (SCHED.get(key) || []).filter(x => x.date === ev.date && x.start != null && x.start < e + TRAVEL_BUF && s < x.end + TRAVEL_BUF);
}
function buildRoster() {
    const map = new Map();
    const add = (id, nameKo, nameEn, aff) => {
        const m = id && Masters.speaker ? Masters.speaker(id) : null;
        const nk = (m && m.nameKo) || nameKo || '';
        const ne = (m && m.nameEn) || nameEn || '';
        const af = (m && m.affiliationKo) || aff || '';
        const key = (id || nk || ne || '').toString();
        if (!key.trim()) return;
        if (!nk && !ne) return;   // 이름이 비어 있는 항목은 후보 명단에서 제외
        if (!map.has(key)) map.set(key, { key, id: id || '', name: nk, nameEn: ne, aff: af });
        else { const p = map.get(key); if (!p.name && nk) p.name = nk; if (!p.aff && af) p.aff = af; }
    };
    // 연자 관리(전체 등록 연자) — 강의 배정과 무관하게 '시간 되는 사람'을 부를 수 있도록 모두 포함
    (Masters.speakers || []).forEach(s => add(s.id, s.nameKo, s.nameEn, s.affiliationKo));
    // 이 행사에 참여/배정된 사람(혹시 마스터에 없을 경우 대비)
    Object.keys(CONF_SPK || {}).forEach(id => add(id));
    Object.values(POOL || {}).forEach(l => (l.speakers || []).forEach(s => add(s.id, s.nameKo, s.nameEn, s.affiliationKo)));
    Object.values(ROOMS || {}).forEach(room => Object.values(room.sessions || {}).forEach(sess => {
        modArr(sess).forEach(m => add(m.id, m.nameKo, m.nameEn, m.affiliationKo));
        Object.values(sess.lectures || {}).forEach(l => (l.speakers || []).forEach(s => add(s.id, s.nameKo, s.nameEn, s.affiliationKo)));
    }));
    ROSTER = [...map.values()].sort((a, b) => (a.name || a.nameEn || '').localeCompare(b.name || b.nameEn || '', 'ko'));
}

/* ---------- 특별행사 추가 ---------- */
window.addEvent = function () {
    if (!AdminAuth.requireEdit()) return;
    if (!CONF_ID) { Toast.warning('행사를 먼저 선택하세요.'); return; }
    const name = document.getElementById('seName').value.trim();
    if (!name) { Toast.warning('특별행사 이름을 입력하세요.'); return; }
    const id = uuid();
    const data = {
        name,
        date: document.getElementById('seDate').value || '',
        startTime: document.getElementById('seStart').value || '',
        endTime: document.getElementById('seEnd').value || '',
        memo: document.getElementById('seMemo').value.trim() || '',
        order: Object.keys(EVENTS).length,
        attendees: [],
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    database.ref('/adminConferences/' + CONF_ID + '/specialEvents/' + id).set(data).then(() => {
        logActivity('create', 'conference', `특별행사 "${name}" 추가`, { confId: CONF_ID, confTitle: CONF_NAME });
        ['seName', 'seDate', 'seStart', 'seEnd', 'seMemo'].forEach(x => document.getElementById(x).value = '');
        Toast.success('특별행사를 추가했습니다. 아래에서 참석자를 지정하세요.');
    }).catch(e => Toast.error('추가 실패: ' + e.message));
};

window.updateEvent = function (id, field, value) {
    if (!AdminAuth.requireEdit()) { render(); return; }
    const ref = database.ref('/adminConferences/' + CONF_ID + '/specialEvents/' + id);
    const u = {}; u[field] = value; u.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    ref.update(u).catch(e => Toast.error('저장 실패: ' + e.message));
};

window.deleteEvent = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const ev = EVENTS[id] || {};
    const ok = await confirmDialog(`특별행사 "${ev.name || ''}"를 삭제할까요?\n참석 명단도 함께 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    if (EDIT_ID === id) { EDIT_ID = null; DRAFT = null; }
    database.ref('/adminConferences/' + CONF_ID + '/specialEvents/' + id).remove().then(() => {
        logActivity('delete', 'conference', `특별행사 "${ev.name || ''}" 삭제`, { confId: CONF_ID, confTitle: CONF_NAME });
        Toast.success('삭제되었습니다.');
    }).catch(e => Toast.error('삭제 실패: ' + e.message));
};

/* ---------- 참석자 편집 ---------- */
window.openAttend = function (id) {
    if (!AdminAuth.requireEdit()) return;
    EDIT_ID = id;
    const ev = EVENTS[id] || {};
    DRAFT = new Set((ev.attendees || []).map(a => a.key).filter(Boolean));
    render();
};
window.cancelAttend = function () { EDIT_ID = null; DRAFT = null; render(); };

// 참석 토글 — 재렌더 없이 DOM만 갱신(검색 포커스/스크롤 유지)
window.toggleAttend = function (btn) {
    if (!DRAFT) return;
    const key = btn.getAttribute('data-key');
    if (DRAFT.has(key)) DRAFT.delete(key); else DRAFT.add(key);
    const on = DRAFT.has(key);
    btn.classList.toggle('on', on);
    btn.innerHTML = (on ? '✓ ' : '') + btn.getAttribute('data-label');
    const cnt = document.querySelector('.se-selcount'); if (cnt) cnt.textContent = DRAFT.size;
};
// 명단 검색 — 버튼 표시/숨김만(재렌더 없음)
window.onRosterSearch = function (input) {
    const q = (input.value || '').trim().toLowerCase();
    input.closest('.se-editor').querySelectorAll('.se-person').forEach(b => {
        b.style.display = (!q || (b.getAttribute('data-search') || '').includes(q)) ? '' : 'none';
    });
};

window.saveAttend = function (id) {
    if (!AdminAuth.requireEdit()) return;
    if (!DRAFT) return;
    const ev = EVENTS[id] || {};
    const prev = {}; (ev.attendees || []).forEach(a => { if (a.key) prev[a.key] = a; });
    const rosterByKey = new Map(ROSTER.map(p => [p.key, p]));
    const attendees = [];
    DRAFT.forEach(k => {
        const p = rosterByKey.get(k) || prev[k];
        if (!p) return;
        attendees.push({ key: k, id: p.id || '', nameKo: p.name || p.nameKo || '', nameEn: p.nameEn || '', aff: p.aff || '' });
    });
    attendees.sort((a, b) => (a.nameKo || a.nameEn || '').localeCompare(b.nameKo || b.nameEn || '', 'ko'));
    const ref = database.ref('/adminConferences/' + CONF_ID + '/specialEvents/' + id);
    ref.update({ attendees, updatedAt: firebase.database.ServerValue.TIMESTAMP }).then(() => {
        logActivity('update', 'conference', `특별행사 "${ev.name || ''}" 참석 명단 저장(${attendees.length}명)`, { confId: CONF_ID, confTitle: CONF_NAME });
        Toast.success(`참석 명단을 저장했습니다 (${attendees.length}명). 연자별 강의 일정에도 반영됩니다.`);
        EDIT_ID = null; DRAFT = null;
    }).catch(e => Toast.error('저장 실패: ' + e.message));
};

/* ---------- 렌더 ---------- */
function render() {
    const host = document.getElementById('seList');
    if (!host) return;
    if (!CONF_ID) { host.innerHTML = '<div class="card empty-state">행사를 선택하세요.</div>'; return; }
    SCHED = buildSchedule();   // 시간표 일정 수집(겹침 체크용) — 시간표 수정 시 자동 갱신
    const events = toOrderedArray(EVENTS);
    if (!events.length) { host.innerHTML = '<div class="card empty-state">아직 등록된 특별행사가 없습니다. 위 <b>＋ 특별행사 추가</b>로 만들어 보세요.</div>'; return; }
    host.innerHTML = events.map(eventCard).join('');
}

function eventCard(ev) {
    const att = ev.attendees || [];
    let conflN = 0;
    const chips = att.length
        ? att.map(a => {
            const c = evConflicts(a.key, ev);
            if (c.length) conflN++;
            const title = c.length ? ` title="⚠ 이 시간에 다른 일정: ${escapeHtml(c.map(x => x.label).join(' / '))}"` : '';
            return `<span class="se-chip${c.length ? ' warn' : ''}"${title}>${escapeHtml(a.nameKo || a.nameEn || '(이름)')}${a.aff ? ` <span class="se-aff">${escapeHtml(a.aff)}</span>` : ''}${c.length ? ' ⚠' : ''}</span>`;
        }).join('')
        : '<span class="dim">아직 지정된 참석자가 없습니다. ‘참석자 지정’에서 명단을 켜세요.</span>';
    const editing = EDIT_ID === ev.id;
    let editor = '';
    if (editing) {
        const rosterHtml = ROSTER.length ? ROSTER.map(p => {
            const on = DRAFT.has(p.key);
            const conf = evConflicts(p.key, ev);
            const busy = conf.length > 0;
            const plain = (p.name || p.nameEn || '(이름)') + (p.aff ? ` · ${p.aff}` : '') + (busy ? ' ⚠' : '');
            const labelEsc = escapeHtml(plain);
            const search = ((p.name || '') + ' ' + (p.nameEn || '') + ' ' + (p.aff || '')).toLowerCase();
            const title = busy ? ` title="⚠ 이 시간에 다른 일정: ${escapeHtml(conf.map(x => x.label).join(' / '))}"` : '';
            return `<button class="se-person ${on ? 'on' : ''}${busy ? ' busy' : ''}"${title} data-key="${escapeHtml(p.key)}" data-label="${labelEsc}" data-search="${escapeHtml(search)}" onclick="toggleAttend(this)">${on ? '✓ ' : ''}${labelEsc}</button>`;
        }).join('') : '<div class="dim" style="padding:10px">명단이 없습니다. 강의/연자 관리에서 연자를 먼저 등록하세요.</div>';
        editor = `<div class="se-editor">
            <input class="se-rsearch" type="text" placeholder="🔍 연자/사회/좌장 이름·소속 검색" oninput="onRosterSearch(this)">
            <div class="se-hint">⚠ 표시는 이 특별행사 시간에 <b>강의·좌장 일정이 있어 겹치는 분</b>입니다. (행사 날짜·시간이 있을 때만 체크)</div>
            <div class="se-roster">${rosterHtml}</div>
            <div class="se-editor-actions">
                <span class="dim">참석 선택 <b class="se-selcount">${DRAFT.size}</b>명</span>
                <button class="btn btn-sm btn-primary" onclick="saveAttend('${ev.id}')">💾 저장</button>
                <button class="btn btn-sm" onclick="cancelAttend()">취소</button>
            </div>
        </div>`;
    }
    const metaLine = [ev.date ? fmtDayLabel(ev.date) : '', timeLabel(ev)].filter(Boolean).join(' · ');
    return `<div class="card se-card">
        <div class="se-head">
            <input class="se-name" type="text" value="${escapeHtml(ev.name || '')}" placeholder="특별행사 이름 (예: MOU 체결식)" onchange="updateEvent('${ev.id}','name',this.value)">
            ${metaLine ? `<span class="se-metaline">${escapeHtml(metaLine)}</span>` : ''}
            <button class="btn btn-sm btn-danger-ghost" onclick="deleteEvent('${ev.id}')" style="margin-left:auto">삭제</button>
        </div>
        <div class="se-meta">
            <label>날짜 <input type="date" value="${escapeHtml(ev.date || '')}" onchange="updateEvent('${ev.id}','date',this.value)"></label>
            <label>시작 <input type="time" step="300" value="${escapeHtml(ev.startTime || '')}" onchange="updateEvent('${ev.id}','startTime',this.value)"></label>
            <label>종료 <input type="time" step="300" value="${escapeHtml(ev.endTime || '')}" onchange="updateEvent('${ev.id}','endTime',this.value)"></label>
            <label class="grow">메모 <input type="text" value="${escapeHtml(ev.memo || '')}" placeholder="장소·비고 등" onchange="updateEvent('${ev.id}','memo',this.value)"></label>
        </div>
        <div class="se-confirmed"><b>확정 참석 ${att.length}명</b>${conflN ? ` <span class="se-warn">⚠ 시간 겹침 ${conflN}명</span>` : ''} <span class="se-chips">${chips}</span></div>
        <div class="se-row">
            <button class="btn btn-sm ${editing ? 'btn-primary' : ''}" onclick="${editing ? 'cancelAttend()' : `openAttend('${ev.id}')`}">${editing ? '닫기' : '👥 참석자 지정/수정'}</button>
            <button class="btn btn-sm" title="행사·시간·참석자 명단을 복사(카톡 등에 붙여넣기)" onclick="copyEvent('${ev.id}',this)">📋 명단 복사</button>
        </div>
        ${editor}
    </div>`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function fmtDayLabel(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return d + (isNaN(dt.getTime()) ? '' : ` (${DOW[dt.getDay()]})`); }

/* ---------- 명단 복사(카톡 등 수동 전달용) ---------- */
function buildEventText(ev) {
    const att = ev.attendees || [];
    let t = `[${CONF_NAME}] ${ev.name || '특별행사'}\n`;
    const dt = [ev.date ? '📅 ' + fmtDayLabel(ev.date) : '', timeLabel(ev) ? '⏰ ' + timeLabel(ev) : ''].filter(Boolean).join('  ');
    if (dt) t += dt + '\n';
    if (ev.memo) t += '📍 ' + ev.memo + '\n';
    t += `\n■ 참석자 (${att.length}명)\n`;
    t += att.length
        ? att.map(a => `- ${a.nameKo || a.nameEn || '(이름)'}${a.aff ? ` (${a.aff})` : ''}`).join('\n')
        : '- (아직 지정된 참석자가 없습니다)';
    return t;
}
window.copyEvent = function (id, btn) {
    const ev = EVENTS[id]; if (!ev) return;
    if (btn && btn.classList.contains('se-copied')) return;
    const text = buildEventText(ev);
    const orig = btn ? btn.innerHTML : '';
    const done = () => { if (!btn) return; btn.classList.add('se-copied'); btn.innerHTML = '✓ 복사 완료'; setTimeout(() => { btn.classList.remove('se-copied'); btn.innerHTML = orig; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => seFallbackCopy(text, done));
    else seFallbackCopy(text, done);
};
function seFallbackCopy(text, done) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { if (window.Toast) Toast.error('복사 실패 — 직접 선택해 복사하세요.'); }
    ta.remove();
}
// 시간 표시: startTime~endTime (구버전 time 텍스트 호환)
function timeLabel(ev) {
    if (ev.startTime) return ev.startTime + (ev.endTime ? ` ~ ${ev.endTime}` : '');
    return ev.time || '';   // 이전 버전 호환
}
