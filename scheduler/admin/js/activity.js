/**
 * activity.js — 변경이력(감사 로그) 뷰어
 * 데이터: /adminActivityLog/<autoKey> = { ts, uid, userName, action, entity, summary, confId?, confTitle?, entityId? }
 * 최근 항목이 위. 실시간 구독. 행사/유형/사용자/검색 필터.
 */

const LOG_REF = database.ref('/adminActivityLog');
let LIMIT = 200;
let LOGS = [];
let logSub = null;

document.getElementById('sidebarMount').innerHTML = renderSidebar('activity');

const ACTION_LABEL = { create: '등록', update: '수정', delete: '삭제', place: '배치', participate: '참가', move: '이동' };
const ACTION_CLASS = { create: 'badge-upcoming', update: 'badge-ongoing', delete: 'badge-ended', place: 'badge-upcoming', participate: 'badge-ongoing', move: 'badge-ongoing' };
const ENTITY_LABEL = { conference: '행사', lecture: '강의', speaker: '연자', partner: '파트너사', room: '룸', session: '세션', booth: '부스', user: '사용자' };

function subscribe() {
    if (logSub) logSub.off();
    logSub = LOG_REF.orderByChild('ts').limitToLast(LIMIT);
    logSub.on('value', snap => {
        const arr = [];
        snap.forEach(ch => { arr.push({ id: ch.key, ...ch.val() }); });
        arr.reverse();   // 최신순
        LOGS = arr;
        document.getElementById('loadMoreBtn').style.display = arr.length >= LIMIT ? '' : 'none';
        populateFilters();
        render();
    }, err => {
        document.getElementById('logBody').innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:40px">
            변경이력을 읽을 수 없습니다. (${err.code})<br>
            승인된 사용자만 조회할 수 있으며, 보안 규칙에 <code>/adminActivityLog</code> 읽기 권한이 필요합니다.</td></tr>`;
    });
}

window.loadMore = function () { LIMIT += 200; subscribe(); };

['logSearch', 'logConf', 'logEntity', 'logUser'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', render);
    el.addEventListener('change', render);
});

function fillSelect(id, allLabel, pairs) {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = `<option value="">${allLabel}</option>` +
        pairs.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function populateFilters() {
    const confs = [...new Map(LOGS.filter(l => l.confId).map(l => [l.confId, l.confTitle || l.confId])).entries()];
    fillSelect('logConf', '전체 행사', confs);
    const ents = [...new Set(LOGS.map(l => l.entity).filter(Boolean))].map(e => [e, ENTITY_LABEL[e] || e]);
    fillSelect('logEntity', '전체 유형', ents);
    const users = [...new Map(LOGS.filter(l => l.uid).map(l => [l.uid, l.userName || l.uid])).entries()];
    fillSelect('logUser', '전체 사용자', users);
}

function fmtTs(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function render() {
    const q = document.getElementById('logSearch').value.trim().toLowerCase();
    const fConf = document.getElementById('logConf').value;
    const fEnt = document.getElementById('logEntity').value;
    const fUser = document.getElementById('logUser').value;

    const list = LOGS.filter(l => {
        if (fConf && l.confId !== fConf) return false;
        if (fEnt && l.entity !== fEnt) return false;
        if (fUser && l.uid !== fUser) return false;
        if (q && ![l.summary, l.userName, l.confTitle].join(' ').toLowerCase().includes(q)) return false;
        return true;
    });

    document.getElementById('logCount').textContent = list.length;
    const body = document.getElementById('logBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:40px">기록이 없습니다.</td></tr>`;
        return;
    }
    body.innerHTML = list.map(l => `
        <tr>
            <td class="dim" style="font-size:0.82rem;white-space:nowrap">${fmtTs(l.ts)}</td>
            <td style="font-size:0.85rem">${escapeHtml(l.userName || '-')}</td>
            <td><span class="badge ${ACTION_CLASS[l.action] || ''}">${ACTION_LABEL[l.action] || l.action || ''}</span></td>
            <td>${escapeHtml(l.summary || '')} <span class="dim" style="font-size:0.74rem">${ENTITY_LABEL[l.entity] || l.entity || ''}</span></td>
            <td class="dim" style="font-size:0.82rem">${escapeHtml(l.confTitle || '-')}</td>
        </tr>`).join('');
}

AdminAuth.onReady(subscribe);
