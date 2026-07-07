/**
 * conf-speakers.js — 행사별 연자/사회자 선택
 * 데이터: /adminConferences/<id>/confSpeakers/<speakerId> = { role, order }
 * 상세(이름·소속·사진)는 연자 마스터(/adminSpeakers)에서 조회
 */

const CONF_ID = new URLSearchParams(location.search).get('id');
const cRef = () => database.ref('/adminConferences/' + CONF_ID);
let CONF_SPK = [];   // [{id, role, order}]

document.getElementById('sidebarMount').innerHTML = renderSidebar('events');
Masters.init();

if (!CONF_ID) {
    document.getElementById('peopleList').innerHTML =
        '<div class="card empty-state">행사 id가 없습니다. <a href="index.html">행사 목록</a>에서 선택하세요.</div>';
} else {
    cRef().child('title').once('value').then(s => { document.getElementById('confName').textContent = s.val() || ''; });
    cRef().child('confSpeakers').on('value', snap => { CONF_SPK = toOrderedArray(snap.val()); render(); });
}

document.addEventListener('masters-change', render);

function render() {
    document.getElementById('spkCount').textContent = CONF_SPK.length;
    const box = document.getElementById('peopleList');
    if (!CONF_SPK.length) {
        box.innerHTML = `<div class="card empty-state">아직 추가된 연자/사회자가 없습니다.<br>위 검색창에 이름을 입력해 추가하세요.</div>`;
        return;
    }
    box.innerHTML = CONF_SPK.map(e => {
        const m = Masters.speaker(e.id) || {};
        const name = m.nameKo || m.nameEn || '(삭제된 연자)';
        const aff = m.affiliationKo || '';
        return `
        <div class="person-row">
            ${speakerAvatar(m, 40)}
            <div class="p-main">
                <div class="p-name">${escapeHtml(name)}</div>
                ${aff ? `<div class="p-aff">${escapeHtml(aff)}</div>` : ''}
            </div>
            <select class="p-role" onchange="setRole('${e.id}', this.value)">
                <option value="연자" ${(e.role || '연자') === '연자' ? 'selected' : ''}>연자</option>
                <option value="사회자" ${e.role === '사회자' ? 'selected' : ''}>사회자</option>
            </select>
            <button class="btn btn-sm btn-danger-ghost" onclick="removePerson('${e.id}')">제거</button>
        </div>`;
    }).join('');
}

/* 자동완성 (마스터에서 검색 + 새 연자 등록) */
setupAutocomplete(
    document.getElementById('spkInput'),
    document.getElementById('spkAc'),
    q => {
        const ql = q.toLowerCase();
        const inConf = new Set(CONF_SPK.map(e => e.id));
        const items = Masters.speakers
            .filter(s => !inConf.has(s.id) && [s.nameKo, s.nameEn, s.affiliationKo, s.affiliationEn].join(' ').toLowerCase().includes(ql))
            .map(s => ({ label: `${escapeHtml(s.nameKo || '')} <span class="sub">${escapeHtml(s.nameEn || '')}${s.affiliationKo ? ' · ' + escapeHtml(s.affiliationKo) : ''}</span>`, value: { type: 'existing', s } }));
        const exact = Masters.speakers.some(s => (s.nameKo || '').toLowerCase() === ql);
        if (q && !exact) items.push({ label: `➕ "<b>${escapeHtml(q)}</b>" 새 연자로 등록`, value: { type: 'new', name: q } });
        return items;
    },
    async val => {
        if (!AdminAuth.requireEdit()) return;
        if (val.type === 'existing') { addPerson(val.s.id); return; }
        const name = (val.name || '').trim(); if (!name) return;
        const ok = await confirmDialog(`"${name}" 연자가 목록에 없습니다.\n새 연자로 등록하고 이 행사에 추가할까요? (연자 관리에도 추가됨)`, { okText: '등록' });
        if (!ok) return;
        const id = uuid();
        database.ref('/adminSpeakers/' + id).set({ nameKo: name, nameEn: '', affiliationKo: '', affiliationEn: '', order: Masters.speakers.length, createdAt: firebase.database.ServerValue.TIMESTAMP })
            .then(() => { addPerson(id); Toast.success(`"${name}" 등록 후 추가했습니다.`); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
);

function addPerson(id) {
    if (!AdminAuth.requireEdit()) return;
    if (CONF_SPK.find(e => e.id === id)) { Toast.info('이미 추가된 연자입니다.'); return; }
    cRef().child('confSpeakers/' + id).set({ role: '연자', order: CONF_SPK.length })
        .catch(e => Toast.error('추가 실패: ' + e.message));
}
window.setRole = function (id, role) {
    if (!AdminAuth.requireEdit()) return;
    cRef().child('confSpeakers/' + id + '/role').set(role).catch(e => Toast.error('저장 실패: ' + e.message));
};
window.removePerson = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const m = Masters.speaker(id) || {};
    const ok = await confirmDialog(`"${m.nameKo || m.nameEn || ''}" 을(를) 이 행사에서 제거할까요?\n(연자 마스터에서는 삭제되지 않습니다.)`, { danger: true, okText: '제거' });
    if (!ok) return;
    cRef().child('confSpeakers/' + id).remove().catch(e => Toast.error('제거 실패: ' + e.message));
};
