/**
 * sponsor-roster.js — 부스 등급별 스폰서 강의 점검
 * 파트너사별 배정 강의 수(부스 등급 혜택) vs 등록·배치 강의를 등급별로 모아 누락을 점검.
 * 데이터: /adminConferences/<id> (boothBenefits, confPartners, lecturePool, rooms)
 */

let CONFS = [];
let CONF_ID = new URLSearchParams(location.search).get('id') || '';
let CONF = {};
let confSub = null;

const cRef = () => database.ref('/adminConferences/' + CONF_ID);

document.getElementById('sidebarMount').innerHTML = renderSidebar('sponsor');
Masters.init();
document.addEventListener('masters-change', renderRoster);

// 행사 목록
database.ref('/adminConferences').once('value').then(snap => {
    CONFS = toOrderedArray(snap.val());
    const sel = document.getElementById('rosterConfSelect');
    if (!CONFS.length) { sel.innerHTML = '<option value="">등록된 행사가 없습니다</option>'; document.getElementById('rosterBody').innerHTML = ''; return; }
    if (!CONF_ID) { try { CONF_ID = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { } }
    if (!CONF_ID || !CONFS.find(c => c.id === CONF_ID)) CONF_ID = CONFS[0].id;
    sel.innerHTML = CONFS.map(c => `<option value="${c.id}" ${c.id === CONF_ID ? 'selected' : ''}>${escapeHtml(c.title || '(제목 없음)')}</option>`).join('');
    subscribeConf();
});

window.onRosterConfChange = function () {
    CONF_ID = document.getElementById('rosterConfSelect').value;
    try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
    const url = new URL(location); url.searchParams.set('id', CONF_ID); history.replaceState(null, '', url);
    subscribeConf();
};

function subscribeConf() {
    if (confSub) confSub.off();
    confSub = cRef();
    confSub.on('value', snap => { CONF = snap.val() || {}; renderRoster(); });
}

/* ---------- 데이터 헬퍼 ---------- */
function boothData() {
    const b = CONF.boothBenefits;
    if (b && Array.isArray(b.columns) && Array.isArray(b.grades)) return b;
    return { columns: DEFAULT_BOOTH_COLUMNS.slice(), grades: DEFAULT_BOOTH_GRADES.slice(), cells: DEFAULT_BOOTH_CELLS };
}
function pool() { return toOrderedArray(CONF.lecturePool); }
function confPartners() { return CONF.confPartners || {}; }

// 파트너 등급 (행사별 우선, 없으면 마스터 폴백)
function gradeOf(pid) {
    const cp = confPartners()[pid];
    if (cp && cp.grade) return cp.grade;
    const m = Masters.partner(pid);
    return (m && m.grade) || '';
}
function partnerName(pid) {
    const m = Masters.partner(pid);
    return (m && (m.nameKo || m.nameEn)) || '(삭제된 파트너사)';
}
function contactsOf(pid) { const c = (CONF.partnerContacts || {})[pid]; return Array.isArray(c) ? c : []; }
function contactText(pid) {
    return contactsOf(pid).map(c => [c.name, c.phone, c.email].filter(Boolean).join(' · ')).join(' / ');
}

// 부스표: 등급 → 숫자 배정 (총합 + 유형별)
function entitledOf(grade) {
    const b = boothData();
    const cells = (b.cells && b.cells[grade]) || {};
    let total = 0; const byType = {};
    (b.columns || []).forEach(col => {
        const v = cells[col];
        const n = parseInt(v, 10);
        if (!isNaN(n) && String(n) === String(v == null ? '' : v).trim()) { total += n; byType[col] = n; }
    });
    return { total, byType };
}
// 파트너의 추가 유료강의 신청 { col: count }
function paidOf(pid) {
    const cp = confPartners()[pid];
    return (cp && cp.paidLectures && typeof cp.paidLectures === 'object') ? cp.paidLectures : {};
}
// 파트너 실제 배정 = 등급 숫자 배정 + 추가 유료강의 신청 (총합·유형별)
function entitledForPartner(pid) {
    const base = entitledOf(gradeOf(pid));
    const byType = { ...base.byType };
    let total = base.total;
    const paid = paidOf(pid);
    Object.keys(paid).forEach(col => {
        const n = parseInt(paid[col], 10) || 0;
        if (n > 0) { byType[col] = (byType[col] || 0) + n; total += n; }
    });
    return { total, byType };
}

// 강의 id → 배치 위치
function placementMap() {
    const m = {};
    Object.values(CONF.rooms || {}).forEach(room => {
        Object.values(room.sessions || {}).forEach(sess => {
            Object.values(sess.lectures || {}).forEach(l => {
                if (!l.lectureId) return;
                (m[l.lectureId] = m[l.lectureId] || []).push({ room: room.name || '(룸)', date: room.date || '', session: sess.name || '' });
            });
        });
    });
    return m;
}

/* ---------- 렌더 ---------- */
function renderRoster() {
    if (!CONF_ID) return;
    const b = boothData();
    const P = pool();
    const placements = placementMap();
    const onlyShort = document.getElementById('rosterOnlyShort').checked;

    // 대상 파트너: 참가 지정 + 강의가 등록된 파트너 모두
    const partnerIds = new Set(Object.keys(confPartners()));
    P.forEach(l => { if (l.partnerId) partnerIds.add(l.partnerId); });

    // 등급별 그룹 (부스 등급 순서 + 미지정)
    const groups = {};   // grade -> [partner objects]
    const gradeOrder = b.grades.slice();
    const NOGRADE = '(등급 미지정)';

    let sumEntitled = 0, sumRegistered = 0, sumPlaced = 0, shortPartners = 0;

    const partners = [...partnerIds].map(pid => {
        const grade = gradeOf(pid);
        const ent = entitledForPartner(pid);
        const lects = P.filter(l => l.partnerId === pid);
        const registered = lects.length;
        const placedCount = lects.filter(l => placements[l.id]).length;
        const short = Math.max(0, ent.total - registered);
        sumEntitled += ent.total; sumRegistered += registered; sumPlaced += placedCount;
        if (ent.total > 0 && registered < ent.total) shortPartners++;
        return { pid, grade: grade || NOGRADE, ent, lects, registered, placedCount, short };
    });

    // 요약
    document.getElementById('rosterSummary').innerHTML = `
        <div class="rs-tile"><div class="rs-n">${partners.length}</div><div class="rs-l">파트너사</div></div>
        <div class="rs-tile"><div class="rs-n">${sumEntitled}</div><div class="rs-l">총 배정 강의</div></div>
        <div class="rs-tile"><div class="rs-n">${sumRegistered}</div><div class="rs-l">등록됨</div></div>
        <div class="rs-tile"><div class="rs-n">${sumPlaced}</div><div class="rs-l">시간표 배치</div></div>
        <div class="rs-tile ${shortPartners ? 'warn' : 'ok'}"><div class="rs-n">${shortPartners}</div><div class="rs-l">⚠️ 부족(누락 위험)</div></div>`;

    partners.forEach(p => { (groups[p.grade] = groups[p.grade] || []).push(p); });

    const orderedGrades = [...gradeOrder.filter(g => groups[g]), ...Object.keys(groups).filter(g => !gradeOrder.includes(g))];

    const body = document.getElementById('rosterBody');
    if (!partners.length) { body.innerHTML = `<div class="card empty-state">이 행사에 참가 파트너사·스폰서 강의가 없습니다.</div>`; return; }

    body.innerHTML = orderedGrades.map(grade => {
        let list = groups[grade].slice().sort((a, b2) => partnerName(a.pid).localeCompare(partnerName(b2.pid), 'ko'));
        if (onlyShort) list = list.filter(p => p.ent.total > 0 && p.registered < p.ent.total);
        if (!list.length) return '';
        const gEnt = list.reduce((s, p) => s + p.ent.total, 0);
        const gReg = list.reduce((s, p) => s + p.registered, 0);
        return `
        <div class="roster-group">
            <div class="roster-group-head">
                <span class="grade-badge lg">${escapeHtml(grade)}</span>
                <span class="rg-count">${list.length}개사 · 배정 ${gEnt} / 등록 ${gReg}${gReg < gEnt ? ` <span class="rg-short">(부족 ${gEnt - gReg})</span>` : ''}</span>
            </div>
            ${list.map(p => renderPartnerCard(p, placements)).join('')}
        </div>`;
    }).join('') || `<div class="card empty-state">표시할 항목이 없습니다. (부족만 보기 해제)</div>`;
}

function renderPartnerCard(p, placements) {
    const name = partnerName(p.pid);
    const isShort = p.ent.total > 0 && p.registered < p.ent.total;
    const noGrade = p.grade === '(등급 미지정)';

    // 유형별 배정 vs 등록
    const regByType = {};
    p.lects.forEach(l => (l.types || []).forEach(t => { regByType[t] = (regByType[t] || 0) + 1; }));
    const typeLines = Object.keys(p.ent.byType).map(col => {
        const need = p.ent.byType[col], got = regByType[col] || 0;
        return `<span class="type-need ${got < need ? 'short' : 'ok'}">${escapeHtml(col)} ${got}/${need}</span>`;
    }).join('');

    const lectRows = p.lects.length ? p.lects.map(l => {
        const spk = (l.speakers || []).map(s => escapeHtml(s.nameKo || s.nameEn || '')).filter(Boolean).join(', ') || '<span class="dim">연자 미정</span>';
        const spots = placements[l.id] || [];
        const place = spots.length
            ? spots.map(s => `<span class="room-chip">📍 ${escapeHtml(s.room)}</span>`).join('')
            : '<span class="badge badge-upcoming">미배치</span>';
        const types = (l.types || []).map(t => `<span class="chip type">${escapeHtml(t)}</span>`).join('');
        return `<tr>
            <td>${escapeHtml(l.titleKo || l.titleEn || '(제목 없음)')}</td>
            <td>${spk}</td>
            <td>${types || '<span class="dim">-</span>'}</td>
            <td>${l.productKo || l.productEn ? escapeHtml(l.productKo || l.productEn) : '<span class="dim">-</span>'}</td>
            <td style="text-align:center">${l.duration || 0}분</td>
            <td>${place}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="6" class="dim" style="padding:12px">등록된 강의가 없습니다.${p.ent.total ? ` <b style="color:var(--danger)">배정 ${p.ent.total}개 — 강의 등록 필요</b>` : ''}</td></tr>`;

    return `
    <div class="roster-card ${isShort ? 'is-short' : ''}">
        <div class="rc-head">
            <div>
                <b class="rc-name">${escapeHtml(name)}</b>
                ${noGrade ? '<span class="badge badge-ended" style="margin-left:6px">등급 미지정</span>' : ''}
            </div>
            <div class="rc-stat">
                배정 <b>${p.ent.total}</b> · 등록 <b class="${p.registered < p.ent.total ? 'txt-danger' : ''}">${p.registered}</b> · 배치 <b>${p.placedCount}</b>
                ${isShort ? `<span class="rc-warn">⚠️ 부족 ${p.short}</span>` : (p.ent.total > 0 ? '<span class="rc-ok">✔ 충족</span>' : '')}
            </div>
        </div>
        ${contactsOf(p.pid).length ? `<div class="rc-contacts">👤 담당자: ${escapeHtml(contactText(p.pid))}</div>` : ''}
        ${typeLines ? `<div class="rc-types">${typeLines}</div>` : ''}
        <table class="data-table rc-table">
            <thead><tr><th>제목</th><th>연자</th><th>유형</th><th>제품</th><th style="text-align:center">시간</th><th>배치</th></tr></thead>
            <tbody>${lectRows}</tbody>
        </table>
    </div>`;
}

/* ---------- 엑셀 ---------- */
window.exportRosterExcel = function () {
    if (typeof XLSX === 'undefined') { Toast.error('엑셀 모듈 로드 실패'); return; }
    const b = boothData();
    const P = pool();
    const placements = placementMap();
    const partnerIds = new Set(Object.keys(confPartners()));
    P.forEach(l => { if (l.partnerId) partnerIds.add(l.partnerId); });

    const rows = [['부스등급', '파트너사', '담당자', '배정', '등록', '배치', '제품', '제목', '연자', '유형', '시간(분)', '배치위치']];
    const gradeIndex = g => { const i = b.grades.indexOf(g); return i < 0 ? 999 : i; };
    [...partnerIds]
        .sort((a, c) => gradeIndex(gradeOf(a)) - gradeIndex(gradeOf(c)) || partnerName(a).localeCompare(partnerName(c), 'ko'))
        .forEach(pid => {
            const grade = gradeOf(pid) || '(미지정)';
            const ent = entitledForPartner(pid).total;
            const lects = P.filter(l => l.partnerId === pid);
            const ct = contactText(pid);
            if (!lects.length) {
                rows.push([grade, partnerName(pid), ct, ent, 0, 0, '', '(등록된 강의 없음)', '', '', '', '']);
                return;
            }
            lects.forEach(l => {
                const spk = (l.speakers || []).map(s => s.nameKo || s.nameEn || '').filter(Boolean).join(', ');
                const place = (placements[l.id] || []).map(s => `${s.room}${s.date ? '(' + s.date + ')' : ''}`).join(', ');
                rows.push([grade, partnerName(pid), ct, ent, lects.length, lects.filter(x => placements[x.id]).length,
                    l.productKo || l.productEn || '', l.titleKo || l.titleEn || '', spk, (l.types || []).join('/'), l.duration || 0, place]);
            });
        });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '스폰서강의점검');
    const title = (CONFS.find(c => c.id === CONF_ID) || {}).title || '행사';
    XLSX.writeFile(wb, `스폰서강의점검_${title}.xlsx`);
};
