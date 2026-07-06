/**
 * speakers.js — 연자 관리 (마스터)
 * 데이터: /adminSpeakers/<id> = { nameKo, nameEn, affiliationKo, affiliationEn, order }
 */

const SPK_ROOT = database.ref('/adminSpeakers');
let SPEAKERS = [];
let SPK_EDIT_ID = null;
let SPK_SEARCH = '';

document.getElementById('sidebarMount').innerHTML = renderSidebar('speakers');

SPK_ROOT.on('value', snap => {
    SPEAKERS = toOrderedArray(snap.val())
        .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));
    renderSpeakers();
});

document.getElementById('spkSearch').addEventListener('input', e => {
    SPK_SEARCH = e.target.value.trim().toLowerCase();
    renderSpeakers();
});

function renderSpeakers() {
    document.getElementById('spkCount').textContent = SPEAKERS.length;
    const q = SPK_SEARCH;
    const list = q
        ? SPEAKERS.filter(s => [s.nameKo, s.nameEn, s.affiliationKo, s.affiliationEn]
            .some(v => (v || '').toLowerCase().includes(q)))
        : SPEAKERS;

    const body = document.getElementById('spkBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:40px">
            ${SPEAKERS.length ? '검색 결과가 없습니다.' : '등록된 연자가 없습니다. <b>+ 연자 등록</b>으로 추가하세요.'}</td></tr>`;
        return;
    }
    body.innerHTML = list.map(s => `
        <tr>
            <td><b>${escapeHtml(s.nameKo || '')}</b></td>
            <td class="en">${escapeHtml(s.nameEn || '-')}</td>
            <td>${escapeHtml(s.affiliationKo || '-')}</td>
            <td class="en">${escapeHtml(s.affiliationEn || '-')}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-sm" onclick="editSpeaker('${s.id}')">수정</button>
                    <button class="btn btn-sm btn-danger-ghost" onclick="deleteSpeaker('${s.id}')">삭제</button>
                </div>
            </td>
        </tr>`).join('');
}

window.openSpeakerModal = function () {
    if (!AdminAuth.requireEdit()) return;
    SPK_EDIT_ID = null;
    document.getElementById('spkModalTitle').textContent = '연자 등록';
    ['spkNameKo', 'spkNameEn', 'spkAffKo', 'spkAffEn'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('spkModal').classList.add('open');
    setTimeout(() => document.getElementById('spkNameKo').focus(), 50);
};

window.editSpeaker = function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SPEAKERS.find(x => x.id === id);
    if (!s) return;
    SPK_EDIT_ID = id;
    document.getElementById('spkModalTitle').textContent = '연자 수정';
    document.getElementById('spkNameKo').value = s.nameKo || '';
    document.getElementById('spkNameEn').value = s.nameEn || '';
    document.getElementById('spkAffKo').value = s.affiliationKo || '';
    document.getElementById('spkAffEn').value = s.affiliationEn || '';
    document.getElementById('spkModal').classList.add('open');
};

window.closeSpeakerModal = function () { document.getElementById('spkModal').classList.remove('open'); };

window.saveSpeaker = function () {
    if (!AdminAuth.requireEdit()) return;
    const nameKo = document.getElementById('spkNameKo').value.trim();
    if (!nameKo) { Toast.warning('연자 이름(국문)을 입력하세요.'); return; }

    // 중복 체크 (국문 이름 + 소속국문 조합)
    const affKo = document.getElementById('spkAffKo').value.trim();
    const dup = SPEAKERS.find(s => s.id !== SPK_EDIT_ID
        && (s.nameKo || '').trim() === nameKo && (s.affiliationKo || '').trim() === affKo);
    if (dup) { Toast.warning('이미 같은 이름·소속의 연자가 등록되어 있습니다.'); return; }

    const data = {
        nameKo,
        nameEn: document.getElementById('spkNameEn').value.trim(),
        affiliationKo: affKo,
        affiliationEn: document.getElementById('spkAffEn').value.trim(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (SPK_EDIT_ID) {
        SPK_ROOT.child(SPK_EDIT_ID).update(data)
            .then(() => { Toast.success('저장되었습니다.'); closeSpeakerModal(); })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        data.order = SPEAKERS.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        SPK_ROOT.child(uuid()).set(data)
            .then(() => { Toast.success('연자가 등록되었습니다.'); closeSpeakerModal(); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
};

window.deleteSpeaker = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SPEAKERS.find(x => x.id === id);
    const ok = await confirmDialog(`"${s ? s.nameKo : ''}" 연자를 삭제할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    SPK_ROOT.child(id).remove()
        .then(() => Toast.success('삭제되었습니다.'))
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

document.getElementById('spkModal').addEventListener('click', e => {
    if (e.target.id === 'spkModal') closeSpeakerModal();
});
