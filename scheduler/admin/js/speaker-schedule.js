/**
 * speaker-schedule.js — 연자별 강의 일정 (행사별)
 * - 전체 연자의 강의/좌장(사회) 일정을 날짜별로 리스트업
 * - 검색: 전체 / 연자 / 제목 / 회사(소속)
 * - 시간표에 있는 모든 강의가 빠짐없이 표시 (연자 미지정 강의도 별도 그룹)
 * - 중복(같은 날 동일인 시간 겹침) 표시 — 같은 룸·세션(좌장이 그 세션에서 강의)은 중복 아님
 *   · 타 룸 이동은 10분 버퍼 적용 (시간표/연자관리 로직과 동일)
 * - GPT 더블체크용 검증 텍스트 복사
 * 데이터: /adminConferences/<id>/rooms (배치된 강의/좌장), 연자 상세는 Masters
 */
const SPEAKER_TRAVEL_MIN = 10;   // 다른 룸 이동 버퍼(분)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

let CONF_LIST = [];
let CONF_ID = new URLSearchParams(location.search).get('id') || '';
let CONF_NAME = '', CONF_START = '', CONF_END = '';
let ROOMS = {};
let POOL = {};
let roomsRef = null, poolRef = null;
let RID = 0;   // 행 DOM id 카운터(중복 이동용)

let FILTER_DATE = '';     // '' = 전체
let FIELD = 'all';        // all | name | title | company
let Q = '';
let ONLY_CONF = false;    // 중복만 보기
let CONF_RIDS = [], confPtr = -1;   // 현재 화면의 중복 행 rid 목록(다음 중복 이동용)

document.getElementById('sidebarMount').innerHTML = renderSidebar('spksched');
Masters.init();

/* ---------- 행사 선택 ---------- */
if (!CONF_ID) { try { CONF_ID = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { } }
database.ref('/adminConferences').on('value', snap => {
    const v = snap.val() || {};
    CONF_LIST = Object.entries(v).map(([id, c]) => ({ id, title: c.title || '(제목 없음)', startDate: c.startDate || '', endDate: c.endDate || '' }))
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    if (!CONF_ID || !CONF_LIST.find(c => c.id === CONF_ID)) CONF_ID = CONF_LIST.length ? CONF_LIST[0].id : '';
    const sel = document.getElementById('ssConfSelect');
    if (sel) {
        sel.innerHTML = CONF_LIST.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
        sel.value = CONF_ID;
    }
    subscribeConf();
});

window.changeConf = function (id) {
    CONF_ID = id;
    try { localStorage.setItem('asls_lastConfId', id); } catch (e) { }
    subscribeConf();
};

function subscribeConf() {
    if (roomsRef) { roomsRef.off(); roomsRef = null; }
    if (poolRef) { poolRef.off(); poolRef = null; }
    const c = CONF_LIST.find(x => x.id === CONF_ID);
    CONF_NAME = c ? c.title : ''; CONF_START = c ? c.startDate : ''; CONF_END = c ? c.endDate : '';
    document.getElementById('confName').textContent = CONF_NAME + (CONF_START ? ` · ${fmtDateRange(CONF_START, CONF_END)}` : '');
    if (!CONF_ID) { ROOMS = {}; POOL = {}; render(); return; }
    roomsRef = database.ref('/adminConferences/' + CONF_ID + '/rooms');
    roomsRef.on('value', snap => { ROOMS = snap.val() || {}; render(); });
    poolRef = database.ref('/adminConferences/' + CONF_ID + '/lecturePool');
    poolRef.on('value', snap => { POOL = snap.val() || {}; render(); });
}

/* ---------- 좌장(사회) 정규화 — 신형 moderators[](최대 2) + 구형 moderator{} ---------- */
function modArr(session) {
    if (Array.isArray(session.moderators)) return session.moderators.filter(m => m && (m.id || m.nameKo || m.nameEn)).slice(0, 2);
    const m = session.moderator;
    return (m && (m.id || m.nameKo || m.nameEn)) ? [m] : [];
}
function personInfo(sp) {
    sp = sp || {};
    const id = sp.id || '';
    const m = id && Masters.speaker ? Masters.speaker(id) : null;
    const name = (m && m.nameKo) || sp.nameKo || '';
    const nameEn = (m && m.nameEn) || sp.nameEn || '';
    const aff = (m && m.affiliationKo) || sp.affiliationKo || '';
    const affEn = (m && m.affiliationEn) || sp.affiliationEn || '';
    return { key: id || name || nameEn, id, name, nameEn, aff, affEn };
}
function fmtDay(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return d + (isNaN(dt.getTime()) ? '' : ` (${DOW[dt.getDay()]})`); }

/* ---------- 전체 일정 수집 (강의 + 좌장) ---------- */
// 반환: { persons: Map(key→person), noSpeakerLecs: [], dates: Set, totalLec, sessionCnt }
function collect() {
    RID = 0;
    const persons = new Map();
    const noSpeakerLecs = [];
    const dates = new Set();
    const placedPool = new Set();   // 시간표에 배치된 강의(lectureId) 집합
    let totalLec = 0, sessionCnt = 0, unplacedCnt = 0;

    function getPerson(info) {
        if (!persons.has(info.key)) persons.set(info.key, { key: info.key, id: info.id, name: info.name, nameEn: info.nameEn, aff: info.aff, affEn: info.affEn, items: [] });
        const p = persons.get(info.key);
        if (!p.name && info.name) p.name = info.name;
        if (!p.aff && info.aff) p.aff = info.aff;
        return p;
    }

    toOrderedArray(ROOMS).forEach(room => {
        if (room.date) dates.add(room.date);
        (computeRoom(room) || []).forEach(session => {
            sessionCnt++;
            // 패널: 세션 내 (휴식/패널 제외) 강의 연자 전체
            const panelSpeakers = [];
            (session.lectures || []).forEach(l => { if (l.isBreak || l.isPanel) return; (l.speakers || []).forEach(sp => panelSpeakers.push(sp)); });

            // 강의
            (session.lectures || []).forEach(lec => {
                if (lec.isBreak) return;
                totalLec++;
                if (lec.lectureId) placedPool.add(lec.lectureId);
                const speakers = lec.isPanel ? panelSpeakers : (lec.speakers || []);
                const item = {
                    kind: 'lec', date: room.date || '', roomId: room.id, roomName: room.name || '룸',
                    sessionId: session.id, sessionName: session.name || '', start: lec._start, end: lec._end,
                    title: lec.titleKo || lec.titleEn || '(제목 없음)', lecId: lec.id, lectureId: lec.lectureId || '',
                    isPanel: !!lec.isPanel, conflict: false, confWith: []
                };
                const infos = speakers.map(personInfo).filter(i => i.key);
                if (!infos.length) { noSpeakerLecs.push(Object.assign({ rid: 'ssr' + (++RID) }, item)); return; }
                infos.forEach(info => { getPerson(info).items.push(Object.assign({ rid: 'ssr' + (++RID) }, item)); });
            });
            // 좌장(사회)
            modArr(session).forEach(mod => {
                const info = personInfo(mod);
                if (!info.key) return;
                getPerson(info).items.push({
                    rid: 'ssr' + (++RID), kind: 'mod', date: room.date || '', roomId: room.id, roomName: room.name || '룸',
                    sessionId: session.id, sessionName: session.name || '(세션)', start: session._start, end: session._end,
                    title: session.name || '(세션)', lecId: '', lectureId: '', conflict: false, confWith: []
                });
            });
        });
    });

    // 미배치 강의(강의 풀에 있으나 시간표에 없음) — 연자별로 추가, 미배치 표시
    toOrderedArray(POOL).forEach(lec => {
        if (lec.id && placedPool.has(lec.id)) return;
        const infos = (lec.speakers || []).map(personInfo).filter(i => i.key);
        if (!infos.length) return;   // 연자 없는 미배치 강의는 생략
        unplacedCnt++;
        infos.forEach(info => getPerson(info).items.push({
            rid: 'ssr' + (++RID), kind: 'lec', unplaced: true, date: '', roomId: '', roomName: '',
            sessionId: '', sessionName: '', start: null, end: null,
            title: lec.titleKo || lec.titleEn || '(제목 없음)', lecId: '', lectureId: lec.id || '', conflict: false, confWith: []
        }));
    });

    // 중복(겹침) 계산 — 사람별로, 같은 날 · 다른 (룸,세션) · 시간겹침(+버퍼)
    persons.forEach(p => {
        const it = p.items;
        for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) {
            const a = it[i], b = it[j];
            if (a.start == null || b.start == null) continue;
            if ((a.date || '') !== (b.date || '')) continue;
            if (a.roomId === b.roomId && a.sessionId === b.sessionId) continue;   // 같은 룸·세션(좌장+강의)은 중복 아님
            const buffer = (a.roomId === b.roomId) ? 0 : SPEAKER_TRAVEL_MIN;
            if (a.start < b.end + buffer && b.start < a.end + buffer) {
                a.conflict = b.conflict = true;
                a.confWith.push(b.rid); b.confWith.push(a.rid);   // 서로 이동용
            }
        }
        // 미배치는 항상 뒤로, 그 외 날짜·시간순
        it.sort((a, b) => (!!a.unplaced !== !!b.unplaced ? (a.unplaced ? 1 : -1)
            : ((a.date || '').localeCompare(b.date || '') || ((a.start ?? 0) - (b.start ?? 0)))));
    });
    return { persons, noSpeakerLecs, dates: [...dates].sort(), totalLec, sessionCnt, unplacedCnt };
}

/* ---------- 필터 ---------- */
const dayOk = a => !FILTER_DATE || a.date === FILTER_DATE;
const titleOk = a => !Q || (a.title || '').toLowerCase().includes(Q);
function nameHit(p) { return ((p.name || '') + ' ' + (p.nameEn || '')).toLowerCase().includes(Q); }
function compHit(p) { return ((p.aff || '') + ' ' + (p.affEn || '')).toLowerCase().includes(Q); }
// 사람 카드에 표시할 rows + 표시 여부
function visibleRows(p) {
    let rows = p.items.filter(dayOk);
    let textOK = true;
    if (Q) {
        if (FIELD === 'name') textOK = nameHit(p);
        else if (FIELD === 'company') textOK = compHit(p);
        else if (FIELD === 'title') { rows = rows.filter(titleOk); }
        else { // all
            if (nameHit(p) || compHit(p)) textOK = true;
            else { rows = rows.filter(titleOk); textOK = rows.length > 0; }
        }
    }
    if (!textOK) return null;
    if (ONLY_CONF) rows = rows.filter(a => a.conflict);   // 중복만 보기
    return rows.length ? rows : null;
}

/* ---------- 렌더 ---------- */
window.setDay = function (d) { FILTER_DATE = d; render(); };
window.onFieldChange = function (v) { FIELD = v; render(); };
window.onSearch = function (v) { Q = (v || '').trim().toLowerCase(); render(); };
window.toggleOnlyConf = function () { ONLY_CONF = !ONLY_CONF; render(); if (ONLY_CONF) window.scrollTo({ top: 0, behavior: 'smooth' }); };
window.nextConflict = function () {
    if (!CONF_RIDS.length) { if (window.Toast && Toast.warning) Toast.warning('현재 화면에 중복 건이 없습니다. (날짜를 "전체"로 두세요)'); return; }
    confPtr = (confPtr + 1) % CONF_RIDS.length;
    const el = document.getElementById(CONF_RIDS[confPtr]);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ss-flash'); setTimeout(() => el.classList.remove('ss-flash'), 1800); }
    if (window.Toast && Toast.info) Toast.info(`중복 ${confPtr + 1}/${CONF_RIDS.length}`);
};

let LAST = null;   // 마지막 collect 결과(GPT 복사용)

function render() {
    LAST = collect();
    const { persons, noSpeakerLecs, dates, totalLec, unplacedCnt } = LAST;

    // 날짜 탭
    const dayCount = d => { let n = 0; persons.forEach(p => p.items.forEach(a => { if (a.kind === 'lec' && !a.unplaced && (!d || a.date === d)) n++; })); n += noSpeakerLecs.filter(a => !d || a.date === d).length; return n; };
    let tabs = `<button class="ss-tab ${FILTER_DATE === '' ? 'on' : ''}" onclick="setDay('')">전체 <b>${dayCount('')}</b></button>`;
    dates.forEach((d, i) => { tabs += `<button class="ss-tab ${FILTER_DATE === d ? 'on' : ''}" onclick="setDay('${d}')">${i === 0 ? '첫날 ' : (i === 1 ? '둘째날 ' : (i + 1) + '일차 ')}${escapeHtml(fmtDay(d))} <b>${dayCount(d)}</b></button>`; });
    document.getElementById('ssDays').innerHTML = tabs;

    // 전체 중복 건수(필터 무관) — '중복만 보기' 버튼 표시용
    let conflictTotal = 0; persons.forEach(p => p.items.forEach(a => { if (a.conflict) conflictTotal++; }));
    CONF_RIDS = []; confPtr = -1;

    // 사람 카드
    const people = [...persons.values()].sort((a, b) => (a.name || a.nameEn || '').localeCompare(b.name || b.nameEn || '', 'ko'));
    let shownLec = 0, shownPersons = 0, conflictN = 0;
    let html = '';
    people.forEach(p => {
        const rows = visibleRows(p);
        if (!rows) return;
        shownPersons++;
        const lecRows = rows.filter(a => a.kind === 'lec'), modRows = rows.filter(a => a.kind === 'mod');
        shownLec += lecRows.length;
        rows.forEach(a => { if (a.conflict) { conflictN++; CONF_RIDS.push(a.rid); } });
        const nm = escapeHtml(p.name || p.nameEn || '(이름 없음)') + (p.nameEn && p.name ? ` <span class="ss-en">${escapeHtml(p.nameEn)}</span>` : '');
        const aff = (p.aff || p.affEn) ? `<span class="ss-aff">${escapeHtml(p.aff || p.affEn)}</span>` : '';
        html += `<div class="ss-card">
            <div class="ss-card-h"><div class="ss-name">${nm} ${aff}</div>
                <div class="ss-counts"><span class="ss-cnt lec">강의 ${lecRows.length}</span><span class="ss-cnt mod">좌장/사회 ${modRows.length}</span></div></div>
            <div class="ss-rows">${rows.map(rowHtml).join('')}</div>
        </div>`;
    });

    // 연자 미지정 강의 (중복만 보기에서는 숨김 — 연자 없는 강의는 중복 대상 아님)
    const noSpk = ONLY_CONF ? [] : noSpeakerLecs.filter(dayOk).filter(a => FIELD !== 'name' && FIELD !== 'company' ? titleOk(a) : true);
    if (noSpk.length && (FIELD === 'all' || FIELD === 'title' || !Q)) {
        shownLec += noSpk.length;
        html += `<div class="ss-card ss-card-warn">
            <div class="ss-card-h"><div class="ss-name">⚠ 연자 미지정 강의 <span class="ss-en">연자 정보가 비어 있는 강의</span></div>
                <div class="ss-counts"><span class="ss-cnt lec">${noSpk.length}</span></div></div>
            <div class="ss-rows">${noSpk.map(rowHtml).join('')}</div></div>`;
    }

    if (!html) html = `<div class="card empty-state">${ONLY_CONF ? '중복된 일정이 없습니다.' : '표시할 일정이 없습니다.'}</div>`;
    document.getElementById('ssList').innerHTML = html;

    // 중복 바로찾기 컨트롤
    const cb = document.getElementById('ssConfBar');
    if (cb) cb.innerHTML = conflictTotal
        ? `<button class="btn btn-sm ${ONLY_CONF ? 'btn-primary' : ''}" onclick="toggleOnlyConf()">⚠ 중복만 보기 (${conflictTotal})</button>`
        + `<button class="btn btn-sm" onclick="nextConflict()" title="중복 건을 하나씩 순서대로 이동">다음 중복 ▾</button>`
        + (ONLY_CONF ? '<span class="ss-confhint">중복된 건만 표시 중 — 버튼을 다시 누르면 전체</span>' : '')
        : '';

    // 요약
    document.getElementById('ssSummary').innerHTML =
        `시간표 강의 <b>${totalLec}</b>개 · 연자 <b>${shownPersons}</b>명 · 표시 강의 <b>${shownLec}</b>건`
        + (conflictN ? ` · <span class="ss-warn">중복 ${conflictN}건</span>` : ` · 중복 없음`)
        + (unplacedCnt ? ` · <span class="ss-warn">미배치 ${unplacedCnt}건</span>` : '')
        + (noSpeakerLecs.length ? ` · <span class="ss-warn">연자 미지정 ${noSpeakerLecs.length}건</span>` : '');
}

function rowHtml(a) {
    const unplaced = !!a.unplaced;
    const left = unplaced
        ? '<span class="ss-unp-dt">미배치</span>'
        : `<span class="ss-dt"><span class="ss-d">${escapeHtml(fmtDay(a.date))}</span><span class="ss-t">${formatTime(a.start)}–${formatTime(a.end)}</span></span>`;
    const kindBadge = a.kind === 'mod' ? '<span class="ss-k mod">좌장/사회</span>' : (a.isPanel ? '<span class="ss-k panel">패널</span>' : '<span class="ss-k lec">강의</span>');
    const confBadge = a.conflict ? `<span class="sch-badge dup ss-jump" title="겹치는 일정으로 이동" onclick="jumpConflict(event,'${(a.confWith && a.confWith[0]) || ''}')">중복 ⤵</span>` : '';
    const unpBadge = unplaced ? '<span class="ss-unp-badge" title="시간표에 아직 배치되지 않았습니다">미배치</span>' : '';
    const loc = unplaced ? '' : `<span class="ss-loc">📍 ${escapeHtml(a.roomName)}${a.sessionName ? ' · ' + escapeHtml(a.sessionName) : ''}</span>`;
    const canClick = !unplaced && a.roomId;
    const cls = 'ss-row' + (canClick ? ' sch-link' : '') + (unplaced ? ' ss-row-unp' : '');
    const click = canClick ? ` title="시간표에서 보기" onclick="gotoTimetable('${a.roomId}','${a.lecId || ''}')"` : '';
    return `<div id="${a.rid}" class="${cls}"${click}>
        <span class="ss-left">${left}</span>
        <span class="ss-main">${kindBadge}<span class="ss-ttl">${escapeHtml(a.title)}</span>${confBadge}${unpBadge}${loc}</span>
    </div>`;
}

// 중복 배지 클릭 → 겹치는 상대 일정으로 스크롤 + 강조
window.jumpConflict = function (ev, rid) {
    if (ev) ev.stopPropagation();
    if (!rid) return;
    const el = document.getElementById(rid);
    if (!el) { if (window.Toast && Toast.warning) Toast.warning('겹치는 일정이 현재 필터/검색에서 숨겨져 있습니다. 날짜를 "전체"로 두고 다시 눌러보세요.'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ss-flash');
    setTimeout(() => el.classList.remove('ss-flash'), 1800);
};

window.gotoTimetable = function (roomId, lecId) {
    if (!roomId) return;
    location.href = `timetable.html?id=${encodeURIComponent(CONF_ID)}&room=${encodeURIComponent(roomId)}${lecId ? '&lec=' + encodeURIComponent(lecId) : ''}`;
};

/* ---------- GPT 더블체크용 텍스트 ---------- */
function buildVerifyText() {
    const r = LAST || collect();
    const lines = [];
    lines.push('# ASLS 연자별 강의 일정 — 검증 요청');
    lines.push(`행사: ${CONF_NAME} (${fmtDateRange(CONF_START, CONF_END)})`);
    lines.push(`시간표 강의 총 ${r.totalLec}개 · 세션 ${r.sessionCnt}개 · 연자 ${r.persons.size}명 · 연자미지정 강의 ${r.noSpeakerLecs.length}개`);
    lines.push('');
    lines.push('## 데이터 (연자별 · 강의=L / 좌장사회=M, [중복]=시간겹침)');
    [...r.persons.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).forEach(p => {
        lines.push(`- ${p.name}${p.nameEn ? ' (' + p.nameEn + ')' : ''}${p.aff ? ' / ' + p.aff : ''}`);
        p.items.forEach(a => {
            const t = (a.start != null) ? `${formatTime(a.start)}-${formatTime(a.end)}` : '시간미정';
            lines.push(`   [${a.kind === 'mod' ? 'M' : (a.isPanel ? 'L(패널)' : 'L')}] ${fmtDay(a.date)} ${t} / ${a.roomName} / ${a.sessionName} / ${a.title}${a.conflict ? ' [중복]' : ''}`);
        });
    });
    if (r.noSpeakerLecs.length) {
        lines.push('');
        lines.push('## 연자 미지정 강의');
        r.noSpeakerLecs.forEach(a => lines.push(`   ${fmtDay(a.date)} ${formatTime(a.start)}-${formatTime(a.end)} / ${a.roomName} / ${a.sessionName} / ${a.title}`));
    }
    lines.push('');
    lines.push('## 검증 지침 (GPT에게)');
    lines.push('아래를 점검해 오류만 보고해줘:');
    lines.push('1) 위 "시간표 강의 총 N개"와, 연자별 강의(L)+연자미지정 강의의 합이 일치하는가? (중복 배치가 아니라면 한 강의가 여러 연자에 나올 수 있음 — 강의 제목·시간 기준으로 실제 강의 수를 세어볼 것)');
    lines.push('2) 같은 연자가 같은 날 서로 다른 룸에서 시간이 겹치는데 [중복] 표시가 없는 경우가 있는가? (같은 룸·같은 세션에서 좌장+강의는 정상이며 중복 아님. 다른 룸은 이동시간 10분 버퍼 적용)');
    lines.push('3) [중복]으로 표시됐지만 실제로는 겹치지 않는(또는 같은 세션인) 오탐이 있는가?');
    lines.push('4) 좌장/사회(M)나 강의(L) 중 누락돼 보이는 항목이 있는가?');
    return lines.join('\n');
}
window.copyVerify = function () {
    const txt = buildVerifyText();
    const done = () => Toast.success('GPT 검증용 텍스트를 복사했습니다. ChatGPT에 붙여넣어 점검하세요.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
};
function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { Toast.error('복사 실패 — 직접 선택해 복사하세요.'); }
    ta.remove();
}
