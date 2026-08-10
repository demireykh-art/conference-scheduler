/**
 * speaker-dupes.js — 중복 연자 점검 · 통합
 * 같은 이름으로 중복 등록된 연자를 찾고, 각 레코드에 매칭된 강의/좌장 사용처를 집계한다.
 * "이 연자로 통합" → 나머지 중복의 사용처(강의 speakers[], 세션 moderator)를 대표 id로 재매칭 후 중복 레코드 삭제.
 * 데이터: /adminSpeakers/<id>, /adminConferences/<confId>/{lecturePool, rooms/../sessions/../lectures, moderator}
 */

const SPK_ROOT = database.ref('/adminSpeakers');
let CONFS_DATA = [];   // [{id, title, lecturePool, rooms}]
let USAGE = {};        // speakerId -> [{confId, confTitle, roleText, title, containerType:'speakers'|'moderator', path}]
let GROUPS = [];       // 렌더된 중복 그룹 (버튼 onclick에서 인덱스로 참조)

document.getElementById('sidebarMount').innerHTML = renderSidebar('spkdupes');
Masters.init();
document.addEventListener('masters-change', () => { if (CONFS_DATA.length) render(); });
document.getElementById('dupSearch').addEventListener('input', render);
document.getElementById('dupOnlyRisk').addEventListener('change', render);

window.reloadAll = loadAll;
AdminAuth.onReady(loadAll);

/* ---------- 로드 & 사용처 집계 ---------- */
function loadAll() {
    document.getElementById('dupBody').innerHTML = '<div class="card" style="padding:22px;color:var(--text-dim)">전체 행사 데이터를 불러오는 중…</div>';
    return database.ref('/adminConferences').once('value').then(snap => {
        CONFS_DATA = [];
        const val = snap.val() || {};
        Object.entries(val).forEach(([id, c]) => CONFS_DATA.push(Object.assign({ id }, c)));
        buildUsage();
        render();
    }).catch(e => {
        document.getElementById('dupBody').innerHTML = `<div class="card empty-state">데이터를 불러올 수 없습니다. (${escapeHtml(e.message)})</div>`;
    });
}

function pushUsage(id, u) { if (!id) return; (USAGE[id] = USAGE[id] || []).push(u); }
function lecTitle(l) { return (l && (l.titleKo || l.titleEn || l.title)) || '(제목 없음)'; }

function buildUsage() {
    USAGE = {};
    CONFS_DATA.forEach(c => {
        const confTitle = c.title || '(제목 없음)';
        // 강의 풀
        Object.entries(c.lecturePool || {}).forEach(([lecId, l]) => {
            (l.speakers || []).forEach(sp => {
                if (sp && sp.id) pushUsage(sp.id, { confId: c.id, confTitle, roleText: '강의(풀)', title: lecTitle(l), containerType: 'speakers', path: `/adminConferences/${c.id}/lecturePool/${lecId}/speakers` });
            });
        });
        // 배치된 룸/세션/강의 + 좌장
        Object.entries(c.rooms || {}).forEach(([roomId, r]) => {
            const roomName = r.name || '';
            Object.entries(r.sessions || {}).forEach(([sid, s]) => {
                if (s.moderator && s.moderator.id) {
                    pushUsage(s.moderator.id, { confId: c.id, confTitle, roleText: '좌장', title: (s.name || '세션') + (roomName ? ' · ' + roomName : ''), containerType: 'moderator', path: `/adminConferences/${c.id}/rooms/${roomId}/sessions/${sid}/moderator` });
                }
                Object.entries(s.lectures || {}).forEach(([lid, l]) => {
                    (l.speakers || []).forEach(sp => {
                        if (sp && sp.id) pushUsage(sp.id, { confId: c.id, confTitle, roleText: '강의(배치)', title: lecTitle(l) + (roomName ? ' · ' + roomName : ''), containerType: 'speakers', path: `/adminConferences/${c.id}/rooms/${roomId}/sessions/${sid}/lectures/${lid}/speakers` });
                    });
                });
            });
        });
    });
}

/* ---------- 그룹핑 ---------- */
function normKey(s) {
    const ko = (s.nameKo || '').trim();
    if (ko) return 'k:' + ko;
    const en = (s.nameEn || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return en ? 'e:' + en : '';
}
function usageCount(id) { return (USAGE[id] || []).length; }
function usageSplit(id) {
    const u = USAGE[id] || [];
    return { lec: u.filter(x => x.containerType === 'speakers').length, mod: u.filter(x => x.containerType === 'moderator').length };
}

function computeGroups() {
    const map = new Map();
    (Masters.speakers || []).forEach(s => {
        const k = normKey(s); if (!k) return;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(s);
    });
    let arr = [...map.entries()].filter(([, v]) => v.length >= 2)
        .map(([key, recs]) => {
            // 사용 많은 → 사진 있는 → 먼저 등록된 순으로 대표 후보 정렬
            const records = recs.slice().sort((a, b) =>
                usageCount(b.id) - usageCount(a.id) ||
                (b.photo ? 1 : 0) - (a.photo ? 1 : 0) ||
                (a.createdAt || 0) - (b.createdAt || 0));
            return { key, name: records[0].nameKo || records[0].nameEn || '(이름 없음)', records };
        });
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    return arr;
}

/* ---------- 렌더 ---------- */
function render() {
    if (!CONFS_DATA.length && !(Masters.speakers || []).length) return;
    const q = document.getElementById('dupSearch').value.trim().toLowerCase();
    const onlyRisk = document.getElementById('dupOnlyRisk').checked;

    GROUPS = computeGroups();
    let list = GROUPS;
    if (q) list = list.filter(g => (g.name || '').toLowerCase().includes(q) || g.records.some(r => (r.nameEn || '').toLowerCase().includes(q)));
    if (onlyRisk) list = list.filter(g => g.records.filter(r => usageCount(r.id) > 0).length >= 2);

    const totalRecs = GROUPS.reduce((n, g) => n + g.records.length, 0);
    const riskGroups = GROUPS.filter(g => g.records.filter(r => usageCount(r.id) > 0).length >= 2).length;
    document.getElementById('dupSummary').innerHTML =
        `중복 의심 <b>${GROUPS.length}</b>그룹 · 연자 레코드 <b>${totalRecs}</b>개` +
        (riskGroups ? ` · <b style="color:var(--danger)">양쪽 다 사용 중 ${riskGroups}그룹</b>(주의)` : '');

    const body = document.getElementById('dupBody');
    if (!GROUPS.length) { body.innerHTML = '<div class="card empty-state">🎉 같은 이름으로 중복 등록된 연자가 없습니다.</div>'; return; }
    if (!list.length) { body.innerHTML = '<div class="card empty-state">조건에 맞는 그룹이 없습니다.</div>'; return; }

    body.innerHTML = list.map(g => {
        const gi = GROUPS.indexOf(g);
        const recs = g.records.map(r => renderRecord(g, gi, r)).join('');
        return `<div class="card dup-group">
            <div class="dup-group-head">
                <span class="dup-name">${escapeHtml(g.name)}</span>
                <span class="dup-badge">${g.records.length}개 중복</span>
            </div>
            <div class="dup-recs">${recs}</div>
        </div>`;
    }).join('');
}

function renderRecord(g, gi, r) {
    const { lec, mod } = usageSplit(r.id);
    const uses = usageCount(r.id);
    const safe = uses === 0;
    const aff = r.affiliationKo || r.affiliationEn || '';
    const detail = (USAGE[r.id] || []);
    const detById = 'det-' + r.id;

    // 사용처 상세 (행사별로 묶어 표시)
    const byConf = {};
    detail.forEach(u => { (byConf[u.confTitle] = byConf[u.confTitle] || []).push(u); });
    const detailHtml = detail.length ? Object.entries(byConf).map(([ct, arr]) =>
        `<div class="dup-det-conf"><div class="dup-det-conf-t">${escapeHtml(ct)}</div>` +
        arr.map(u => `<div class="dup-det-row"><span class="dup-role dup-role-${u.containerType}">${escapeHtml(u.roleText)}</span> ${escapeHtml(u.title)}</div>`).join('') +
        `</div>`).join('') : '<div class="dim" style="padding:6px 2px;color:var(--text-dim)">연결된 강의·좌장이 없습니다.</div>';

    return `<div class="dup-rec ${safe ? 'is-safe' : 'is-used'}">
        <div class="dup-rec-main">
            ${speakerAvatar(r, 40)}
            <div class="dup-rec-info">
                <div class="dup-rec-top">
                    <b>${escapeHtml(r.nameKo || r.nameEn || '(이름 없음)')}</b>
                    ${r.nameEn && r.nameKo ? `<span class="dim">${escapeHtml(r.nameEn)}</span>` : ''}
                    ${r.photo ? '<span class="dup-flag ok">사진</span>' : '<span class="dup-flag none">사진없음</span>'}
                    ${r.roleExec ? '<span class="dup-flag role">임원</span>' : ''}${r.roleAmb ? '<span class="dup-flag role">엠베서더</span>' : ''}
                </div>
                <div class="dup-rec-sub">${aff ? escapeHtml(aff) : '<span class="dim">소속 미입력</span>'} · <span class="dim">id ${escapeHtml(r.id.slice(0, 6))}…</span></div>
                <div class="dup-use">
                    ${uses ? `<span class="dup-usebadge used">강의 ${lec} · 좌장 ${mod}</span> <button class="txt-btn" onclick="toggleDetail('${r.id}')">사용처 보기 ▾</button>`
            : '<span class="dup-usebadge safe">미사용 · 삭제해도 안전</span>'}
                </div>
                <div class="dup-det" id="${detById}" style="display:none">${detailHtml}</div>
            </div>
        </div>
        <div class="dup-rec-actions">
            <button class="btn btn-sm btn-primary" onclick="mergeGroup(${gi},'${r.id}')" title="이 연자를 대표로, 같은 이름의 나머지 중복을 여기로 합칩니다">✓ 이 연자로 통합</button>
            <button class="btn btn-sm" onclick="deleteOne('${r.id}')">삭제</button>
        </div>
    </div>`;
}

window.toggleDetail = function (id) {
    const el = document.getElementById('det-' + id);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

/* ---------- 통합(재매칭 후 삭제) ---------- */
async function repointAll(loserId, keepId, keep) {
    const seen = new Set();
    for (const u of (USAGE[loserId] || [])) {
        if (seen.has(u.path)) continue;
        seen.add(u.path);
        const ref = database.ref(u.path);
        const snap = await ref.once('value');
        const val = snap.val();
        if (u.containerType === 'moderator') {
            if (val && val.id === loserId) {
                await ref.set({ id: keepId, nameKo: keep.nameKo || '', nameEn: keep.nameEn || '', affiliationKo: keep.affiliationKo || '' });
            }
        } else {
            // speakers 배열 (또는 객체) — 항상 배열로 되돌려 저장
            const listRaw = Array.isArray(val) ? val : (val ? Object.values(val) : []);
            let changed = false;
            const replaced = listRaw.map(el => {
                if (el && el.id === loserId) {
                    changed = true;
                    return { id: keepId, nameKo: keep.nameKo || '', nameEn: keep.nameEn || '', affiliationKo: keep.affiliationKo || '', affiliationEn: keep.affiliationEn || '' };
                }
                return el;
            });
            // 같은 강의에 대표 id가 이미 있으면 중복 제거(첫 항목 유지)
            const seenIds = new Set();
            const dedup = replaced.filter(el => {
                if (el && el.id) { if (seenIds.has(el.id)) return false; seenIds.add(el.id); }
                return true;
            });
            if (changed) await ref.set(dedup);
        }
    }
}

window.mergeGroup = async function (gi, keepId) {
    const g = GROUPS[gi]; if (!g) return;
    const keep = Masters.speaker(keepId); if (!keep) { Toast.error('대표 연자를 찾을 수 없습니다.'); return; }
    const losers = g.records.filter(r => r.id !== keepId);
    if (!losers.length) { Toast.info('통합할 다른 레코드가 없습니다.'); return; }
    const totalUses = losers.reduce((n, r) => n + usageCount(r.id), 0);
    const ok = await confirmDialog(
        `"${keep.nameKo || keep.nameEn}" 한 명으로 통합합니다.\n같은 이름의 나머지 ${losers.length}개 레코드의 강의·좌장 ${totalUses}건을 이 연자로 옮긴 뒤, 그 중복 레코드는 삭제됩니다.\n계속할까요?`,
        { okText: '통합', danger: true });
    if (!ok) return;
    Toast.info('통합 처리 중…');
    try {
        for (const l of losers) {
            await repointAll(l.id, keepId, keep);
            await SPK_ROOT.child(l.id).remove();
            logActivity('update', 'speaker', `중복 연자 통합: "${l.nameKo || l.nameEn}" → "${keep.nameKo || keep.nameEn}" (${usageCount(l.id)}건 재매칭)`, { entityId: keepId });
        }
        Toast.success(`통합 완료 — ${losers.length}개 중복을 정리했습니다.`);
        await loadAll();
    } catch (e) { Toast.error('통합 실패: ' + e.message); }
};

window.deleteOne = async function (id) {
    const s = Masters.speaker(id);
    const uses = usageCount(id);
    const warn = uses > 0
        ? `\n⚠️ 이 연자는 강의·좌장 ${uses}건에 사용 중입니다. 삭제해도 강의는 남지만(이름·소속은 사본으로 유지) 사진과 마스터 연동이 끊깁니다. 통합을 권장합니다.`
        : `\n(연결된 강의·좌장 없음 — 삭제해도 안전합니다.)`;
    const ok = await confirmDialog(`"${s ? (s.nameKo || s.nameEn) : ''}" 연자 레코드를 삭제할까요?${warn}`, { okText: '삭제', danger: true });
    if (!ok) return;
    SPK_ROOT.child(id).remove()
        .then(() => { logActivity('delete', 'speaker', `중복점검에서 연자 삭제 "${s ? (s.nameKo || s.nameEn) : ''}"`, { entityId: id }); Toast.success('삭제되었습니다.'); loadAll(); })
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

console.log('✅ speaker-dupes.js 로드 완료');
