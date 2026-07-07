/**
 * conf-partners.js — 행사별 참여 파트너사 선택
 * 데이터: /adminConferences/<id>/confPartners/<partnerId> = { order }
 * 상세(이름·제품)는 파트너사 마스터(/adminPartners)에서 조회
 */

const CONF_ID = new URLSearchParams(location.search).get('id');
const cRef = () => database.ref('/adminConferences/' + CONF_ID);
let CONF_PTN = [];   // [{id, order}]

document.getElementById('sidebarMount').innerHTML = renderSidebar('events');
Masters.init();

if (!CONF_ID) {
    document.getElementById('peopleList').innerHTML =
        '<div class="card empty-state">행사 id가 없습니다. <a href="index.html">행사 목록</a>에서 선택하세요.</div>';
} else {
    cRef().child('title').once('value').then(s => { document.getElementById('confName').textContent = s.val() || ''; });
    cRef().child('confPartners').on('value', snap => { CONF_PTN = toOrderedArray(snap.val()); render(); });
}

document.addEventListener('masters-change', render);

function render() {
    document.getElementById('ptnCount').textContent = CONF_PTN.length;
    const box = document.getElementById('peopleList');
    if (!CONF_PTN.length) {
        box.innerHTML = `<div class="card empty-state">아직 추가된 파트너사가 없습니다.<br>위 검색창에 이름을 입력해 추가하세요.</div>`;
        return;
    }
    box.innerHTML = CONF_PTN.map(e => {
        const m = Masters.partner(e.id) || {};
        const name = m.nameKo || m.nameEn || '(삭제된 파트너사)';
        const en = m.nameEn && m.nameEn !== name ? m.nameEn : '';
        const grade = m.grade || '';
        return `
        <div class="person-row">
            <div class="p-logo">${escapeHtml((name[0] || '?').toUpperCase())}</div>
            <div class="p-main">
                <div class="p-name">${escapeHtml(name)}${grade ? ` <span class="grade-badge">${escapeHtml(grade)}</span>` : ''}</div>
                ${en ? `<div class="p-aff">${escapeHtml(en)}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-danger-ghost" onclick="removePartner('${e.id}')">제거</button>
        </div>`;
    }).join('');
}

/* 자동완성 (마스터에서 검색 + 새 파트너사 등록) */
setupAutocomplete(
    document.getElementById('ptnInput'),
    document.getElementById('ptnAc'),
    q => {
        const ql = q.toLowerCase();
        const inConf = new Set(CONF_PTN.map(e => e.id));
        const items = Masters.partners
            .filter(p => !inConf.has(p.id) && [p.nameKo, p.nameEn].join(' ').toLowerCase().includes(ql))
            .map(p => ({ label: `${escapeHtml(p.nameKo || '')} <span class="sub">${escapeHtml(p.nameEn || '')}</span>`, value: { type: 'existing', p } }));
        const exact = Masters.partners.some(p => (p.nameKo || '').toLowerCase() === ql);
        if (q && !exact) items.push({ label: `➕ "<b>${escapeHtml(q)}</b>" 새 파트너사로 등록`, value: { type: 'new', name: q } });
        return items;
    },
    async val => {
        if (!AdminAuth.requireEdit()) return;
        if (val.type === 'existing') { addPartner(val.p.id); return; }
        const name = (val.name || '').trim(); if (!name) return;
        const ok = await confirmDialog(`"${name}" 파트너사가 목록에 없습니다.\n새 파트너사로 등록하고 이 행사에 추가할까요? (파트너사 관리에도 추가됨)`, { okText: '등록' });
        if (!ok) return;
        const id = uuid();
        database.ref('/adminPartners/' + id).set({ nameKo: name, nameEn: '', grade: '', products: [], order: Masters.partners.length, createdAt: firebase.database.ServerValue.TIMESTAMP })
            .then(() => { addPartner(id); Toast.success(`"${name}" 등록 후 추가했습니다.`); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
);

function addPartner(id) {
    if (!AdminAuth.requireEdit()) return;
    if (CONF_PTN.find(e => e.id === id)) { Toast.info('이미 추가된 파트너사입니다.'); return; }
    cRef().child('confPartners/' + id).set({ order: CONF_PTN.length })
        .catch(e => Toast.error('추가 실패: ' + e.message));
}
window.removePartner = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const m = Masters.partner(id) || {};
    const ok = await confirmDialog(`"${m.nameKo || m.nameEn || ''}" 을(를) 이 행사에서 제거할까요?\n(파트너사 마스터에서는 삭제되지 않습니다.)`, { danger: true, okText: '제거' });
    if (!ok) return;
    cRef().child('confPartners/' + id).remove().catch(e => Toast.error('제거 실패: ' + e.message));
};
