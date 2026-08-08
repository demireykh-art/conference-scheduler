/**
 * feedback.js — 인기 강의 (설문 집계)
 * 학술대회 종료 후 "좋았던 강의" 추천 수를 집계해 랭킹으로 보여준다.
 * 데이터: /adminConferences/<id>/feedback/<placedLectureId> = { votes, updatedAt }
 * 자리(순번) 편향 참고: 각 룸에서 몇 번째 강의였는지(ordinal)별 평균 추천을 함께 표시.
 * (1단계 = 수동 입력. 2단계에서 공개 설문 페이지가 같은 feedback 값을 자동으로 채우도록 호환.)
 */

const CONF_ID = new URLSearchParams(location.search).get('id');
try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
const confRef = () => database.ref('/adminConferences/' + CONF_ID);

let CONF = null;
let CONFS = [];
let POOL = [];
let MODE = 'view';      // 'view' | 'input'
let RANK = 'votes';     // 'votes' | 'adj'
let QUERY = '';

/* ---------- 초기화 ---------- */
document.getElementById('sidebarMount').innerHTML = renderSidebar('feedback');
Masters.init();
document.addEventListener('masters-change', () => { if (CONF) render(); });

document.getElementById('fbSearch').addEventListener('input', e => { QUERY = e.target.value; render(); });

database.ref('/adminConferences').once('value').then(snap => {
    CONFS = toOrderedArray(snap.val());
    if (!CONF_ID && CONFS.length) {
        let last = ''; try { last = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { }
        const target = CONFS.find(c => c.id === last) ? last : CONFS[0].id;
        location.replace('feedback.html?id=' + target); return;
    }
    renderConfSwitcher();
});

function renderConfSwitcher() {
    const el = document.getElementById('confSwitcher');
    if (!el || !CONFS.length) { if (el) el.innerHTML = ''; return; }
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
window.gotoConf = function (id) { if (id && id !== CONF_ID) location.href = 'feedback.html?id=' + id; };
window.gotoTimetable = function () { location.href = 'timetable.html?id=' + encodeURIComponent(CONF_ID || ''); };

window.setMode = function (m) { MODE = m; render(); };
window.setRank = function (r) { RANK = r; render(); };

/* ---------- 데이터 구독 ---------- */
if (!CONF_ID) {
    document.getElementById('fbBody').innerHTML =
        '<div class="card empty-state">행사 id가 없습니다. <a href="index.html">행사 목록</a>에서 선택하세요.</div>';
} else {
    confRef().on('value', snap => { CONF = snap.val(); render(); });
}

/* ---------- 언어/정규화 헬퍼 (timetable.js와 동일 규칙) ---------- */
function roomLang(room) { return room && room.lang === 'en' ? 'en' : 'ko'; }
function effectiveLang(room, session) {
    if (session && session.langExcluded) return session.lang === 'en' ? 'en' : 'ko';
    return roomLang(room);
}
function pickLang(lang, ko, en) {
    ko = ko || ''; en = en || '';
    return lang === 'en' ? (en || ko) : (ko || en);
}
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
        speakers,
        partnerId: lec.partnerId || '',
        partnerKo: lec.partnerKo != null ? lec.partnerKo : (lec.partner || ''),
        partnerEn: lec.partnerEn || '',
        productKo: lec.productKo || '',
        productEn: lec.productEn || '',
        productCategory: lec.productCategory || ''
    };
}
// 연자 이름·소속: 마스터(최신) 우선, 없으면 사본 값 폴백
const spkName = (x, lang) => { const m = x.id && Masters.speaker(x.id); return pickLang(lang, (m && m.nameKo) || x.nameKo, (m && m.nameEn) || x.nameEn); };
const spkAff = (x, lang) => { const m = x.id && Masters.speaker(x.id); return pickLang(lang, (m && m.affiliationKo) || x.affiliationKo, (m && m.affiliationEn) || x.affiliationEn); };

/* ---------- 강의 목록 구성 (룸 → 세션 → 실제 강의) ---------- */
function buildItems() {
    POOL = toOrderedArray(CONF.lecturePool);
    const fb = CONF.feedback || {};
    const rooms = toOrderedArray(CONF.rooms)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order ?? 0) - (b.order ?? 0));
    const items = [];
    rooms.forEach(room => {
        let ordinal = 0;   // 룸 내 '실제 강의' 순번 (개회/휴식/패널 제외)
        computeRoom(room).forEach(s => {
            const lang = effectiveLang(room, s);
            s.lectures.forEach(lec => {
                if (lec.isBreak || lec.isPanel) return;   // 개회/휴식/행사·패널은 평가 대상 아님
                ordinal++;
                const n = normalizeLecture(lec);
                const pool = lec.lectureId ? POOL.find(p => p.id === lec.lectureId) : null;
                const titleKo = (pool && pool.titleKo) || n.titleKo;
                const titleEn = (pool && pool.titleEn) || n.titleEn;
                const pMaster = n.partnerId ? Masters.partner(n.partnerId) : null;
                const partner = pickLang(lang, (pMaster && pMaster.nameKo) || n.partnerKo, (pMaster && pMaster.nameEn) || n.partnerEn);
                const rec = fb[lec.id];
                items.push({
                    id: lec.id,
                    roomName: room.name || '', date: room.date || '',
                    sessionName: s.name || '', ordinal,
                    start: lec._start, end: lec._end, duration: lec.duration || 0,
                    title: pickLang(lang, titleKo, titleEn) || '(제목 없음)',
                    speakers: n.speakers.map(x => ({ name: spkName(x, lang), aff: spkAff(x, lang) })),
                    partner: partner || '',
                    product: pickLang(lang, n.productKo, n.productEn) || '',
                    productCategory: n.productCategory || '',
                    votes: Number(rec && rec.votes) || 0
                });
            });
        });
    });
    return items;
}

// 순번(자리)별 평균 추천 — 편향 참고 기준선
function baselineByOrdinal(items) {
    const map = {};
    items.forEach(it => { (map[it.ordinal] = map[it.ordinal] || []).push(it.votes); });
    const res = {};
    Object.keys(map).forEach(k => {
        const a = map[k];
        res[k] = { avg: a.reduce((s, v) => s + v, 0) / a.length, n: a.length };
    });
    return res;
}

/* ---------- 렌더 ---------- */
function render() {
    renderConfSwitcher();
    syncSegs();
    const body = document.getElementById('fbBody');
    if (!CONF) { body.innerHTML = '<div class="card empty-state">행사를 찾을 수 없습니다.</div>'; return; }

    const items = buildItems();
    const base = baselineByOrdinal(items);
    items.forEach(it => { const b = base[it.ordinal]; it.adj = it.votes - (b ? b.avg : 0); });

    // 요약
    const totalVotes = items.reduce((s, it) => s + it.votes, 0);
    const withVotes = items.filter(it => it.votes > 0).length;
    document.getElementById('fbSummary').innerHTML =
        `총 강의 <b>${items.length}</b>개 · 추천 입력됨 <b>${withVotes}</b>개 · 총 추천 <b>${totalVotes}</b>표`;

    if (!items.length) {
        body.innerHTML = '<div class="card empty-state">평가할 강의가 없습니다. 시간표에 강의를 먼저 배치하세요.</div>';
        return;
    }

    body.innerHTML = MODE === 'input' ? renderInput(items) : renderView(items, base);
}

// 세그먼트 버튼 활성표시 동기화
function syncSegs() {
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === MODE));
    document.querySelectorAll('#rankSeg button').forEach(b => b.classList.toggle('active', b.dataset.rank === RANK));
}

function matchQuery(it) {
    const q = QUERY.trim().toLowerCase();
    if (!q) return true;
    const hay = [it.title, it.partner, it.product, it.roomName, it.sessionName,
        ...it.speakers.map(s => s.name + ' ' + s.aff)].join(' ').toLowerCase();
    return hay.includes(q);
}

function spkText(it) {
    if (!it.speakers.length) return '<span class="dim">미정</span>';
    return it.speakers.map(s => escapeHtml(s.name) + (s.aff ? ` <span class="dim">(${escapeHtml(s.aff)})</span>` : '')).join(', ');
}
function timeText(it) {
    const d = it.date ? `${escapeHtml(it.date)} ` : '';
    return `${d}${formatTime(it.start)}–${formatTime(it.end)} · ${it.duration}분`;
}

/* ----- 보기(랭킹) ----- */
function renderView(items, base) {
    const list = items.filter(matchQuery).slice().sort((a, b) =>
        RANK === 'adj' ? (b.adj - a.adj || b.votes - a.votes) : (b.votes - a.votes || b.adj - a.adj));

    // 자리(순번)별 평균 추천 미니표
    const ords = Object.keys(base).map(Number).sort((a, b) => a - b);
    const biasRows = ords.map(o => `
        <div class="fb-bias-cell">
            <div class="ord">${o}번째</div>
            <div class="avg">${base[o].avg.toFixed(1)}</div>
            <div class="n">강의 ${base[o].n}개</div>
        </div>`).join('');
    const biasPanel = `
        <div class="card fb-bias">
            <div class="fb-bias-head">📉 자리(순번)별 평균 추천 <span class="dim">— 각 룸에서 몇 번째 강의였는지에 따른 평균. 앞 순번이 높으면 자리 편향이 있다는 신호입니다. “순번보정순”은 이 평균 대비 초과분으로 순위를 매깁니다.</span></div>
            <div class="fb-bias-row">${biasRows || '<span class="dim">데이터 없음</span>'}</div>
        </div>`;

    // 상위 카드 (추천이 있는 강의만, 최대 3개)
    const top = list.filter(it => it.votes > 0).slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const cards = top.length ? `<div class="fb-cards">${top.map((it, i) => `
        <div class="fb-card">
            <div class="fb-card-top"><span class="rank">${medals[i] || (i + 1)}</span>
                <span class="votes">${it.votes}<span class="unit">표</span></span></div>
            <div class="fb-card-title">${escapeHtml(it.title)}</div>
            <div class="fb-card-meta">${escapeHtml(it.roomName)} · ${escapeHtml(it.sessionName)} · <b>${it.ordinal}번째</b> · ${timeText(it)}</div>
            <div class="fb-card-spk">${spkText(it)}</div>
            ${it.partner ? `<div class="fb-card-sub">🏢 ${escapeHtml(it.partner)}</div>` : ''}
            ${it.product ? `<div class="fb-card-sub">💊 ${escapeHtml(it.product)}${it.productCategory ? ` · ${escapeHtml(it.productCategory)}` : ''}</div>` : ''}
            <div class="fb-card-adj ${it.adj > 0 ? 'pos' : it.adj < 0 ? 'neg' : ''}">자리평균 ${base[it.ordinal].avg.toFixed(1)} · 보정 ${it.adj >= 0 ? '+' : ''}${it.adj.toFixed(1)}</div>
        </div>`).join('')}</div>`
        : '<div class="card empty-state" style="margin:8px 0 18px">아직 입력된 추천이 없습니다. <b>✏️ 추천수 입력</b>에서 강의별 추천 수를 입력하세요.</div>';

    // 전체 랭킹표
    const rows = list.map((it, i) => {
        const rank = it.votes > 0 ? (i + 1) : '-';
        return `<tr>
            <td class="rank-cell">${rank}</td>
            <td>${escapeHtml(it.roomName)}<div class="dim" style="font-size:0.76rem">${escapeHtml(it.date)}</div></td>
            <td>${escapeHtml(it.sessionName)}</td>
            <td style="text-align:center"><b>${it.ordinal}</b></td>
            <td class="dim" style="white-space:nowrap;font-size:0.8rem">${formatTime(it.start)}–${formatTime(it.end)}<br>${it.duration}분</td>
            <td>${escapeHtml(it.title)}</td>
            <td>${spkText(it)}</td>
            <td>${escapeHtml(it.partner) || '<span class="dim">-</span>'}</td>
            <td>${it.product ? escapeHtml(it.product) : '<span class="dim">-</span>'}<div class="dim" style="font-size:0.74rem">${escapeHtml(it.productCategory)}</div></td>
            <td style="text-align:center"><b style="color:var(--primary);font-size:1.02rem">${it.votes}</b></td>
            <td style="text-align:center" class="${it.adj > 0 ? 'adj-pos' : it.adj < 0 ? 'adj-neg' : 'dim'}">${it.adj >= 0 ? '+' : ''}${it.adj.toFixed(1)}</td>
        </tr>`;
    }).join('');

    return biasPanel + cards + `
        <div class="card table-card">
            <table class="data-table fb-table">
                <thead><tr>
                    <th style="width:44px">순위</th><th style="width:96px">룸/날짜</th><th style="width:90px">세션</th>
                    <th style="width:48px" title="룸에서 몇 번째 강의였는지">순번</th><th style="width:74px">시간</th>
                    <th>제목</th><th style="width:180px">연자(소속)</th><th style="width:110px">회사</th>
                    <th style="width:150px">제품</th><th style="width:56px">추천</th>
                    <th style="width:60px" title="같은 순번 평균 대비 초과분">보정</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

/* ----- 입력 (일정 순서대로, 룸별 그룹) ----- */
function renderInput(items) {
    const groups = [];
    const byRoom = new Map();
    items.filter(matchQuery).forEach(it => {
        const key = it.roomName + '|' + it.date;
        if (!byRoom.has(key)) { byRoom.set(key, []); groups.push(key); }
        byRoom.get(key).push(it);
    });
    if (!groups.length) return '<div class="card empty-state">검색 결과가 없습니다.</div>';

    const blocks = groups.map(key => {
        const [roomName, date] = key.split('|');
        const rows = byRoom.get(key).map(it => `
            <div class="fb-input-row">
                <div class="fb-in-ord">${it.ordinal}</div>
                <div class="fb-in-main">
                    <div class="fb-in-title">${escapeHtml(it.title)}</div>
                    <div class="dim" style="font-size:0.78rem">${escapeHtml(it.sessionName)} · ${formatTime(it.start)}–${formatTime(it.end)} · ${spkText(it)}${it.partner ? ` · 🏢 ${escapeHtml(it.partner)}` : ''}</div>
                </div>
                <div class="fb-in-votes">
                    <input type="number" min="0" step="1" value="${it.votes || ''}" placeholder="0"
                        onchange="saveVotes('${it.id}', this.value)" aria-label="추천수">
                    <span class="dim" style="font-size:0.76rem">표</span>
                </div>
            </div>`).join('');
        return `<div class="card fb-input-group">
            <div class="fb-input-head">${escapeHtml(roomName)} <span class="dim">${escapeHtml(date)}</span></div>
            ${rows}
        </div>`;
    }).join('');

    return `<div class="info-banner" style="margin-bottom:12px">
            <div class="info-ico">✎</div>
            <div class="info-title">강의별 추천 수를 입력하세요. 입력칸을 벗어나면 자동 저장됩니다. (일정 순서대로 정렬 — 왼쪽 숫자는 룸에서 몇 번째 강의인지)</div>
        </div>${blocks}`;
}

window.saveVotes = function (lecId, val) {
    const v = Math.max(0, parseInt(val, 10) || 0);
    confRef().child('feedback/' + lecId).set({ votes: v, updatedAt: firebase.database.ServerValue.TIMESTAMP })
        .catch(() => Toast.error('저장에 실패했습니다.'));
};

console.log('✅ feedback.js 로드 완료');
