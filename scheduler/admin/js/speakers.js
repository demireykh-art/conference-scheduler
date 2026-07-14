/**
 * speakers.js — 연자 관리 (마스터)
 * 데이터: /adminSpeakers/<id> = { nameKo, nameEn, affiliationKo, affiliationEn, order }
 */

const SPK_ROOT = database.ref('/adminSpeakers');
let SPEAKERS = [];
let SPK_EDIT_ID = null;
let SPK_SEARCH = '';
let SPK_SORT = 'nameAsc';
let spkPhotoData = '';   // 업로드한 사진 data URL

document.getElementById('sidebarMount').innerHTML = renderSidebar('speakers');

let SPK_LOADED = false, SPK_SYNCED = false;

SPK_ROOT.on('value', snap => {
    SPEAKERS = toOrderedArray(snap.val())
        .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));
    SPK_LOADED = true;
    renderSpeakers();
    maybeSyncFromLectures();
});
if (window.AdminAuth && AdminAuth.onReady) AdminAuth.onReady(maybeSyncFromLectures);

/* ------------------------------------------------------------
   강의목록/사회자에 있는 사람을 연자 마스터에 자동 반영
   (마스터에 id·이름으로 없는 사람만 1회 추가)
   ------------------------------------------------------------ */
function normSpkName(s) { return (s || '').trim().toLowerCase(); }

function maybeSyncFromLectures() {
    if (SPK_SYNCED || !SPK_LOADED) return;
    if (!(window.AdminAuth && AdminAuth.canEdit && AdminAuth.canEdit())) return;  // 편집 권한자만
    SPK_SYNCED = true;
    syncSpeakersFromLectures();
}

function syncSpeakersFromLectures() {
    database.ref('/adminConferences').once('value').then(snap => {
        const confs = snap.val() || {};
        const byId = new Set(SPEAKERS.map(s => s.id));
        const byName = new Set();
        SPEAKERS.forEach(s => { [s.nameKo, s.nameEn].forEach(n => { const v = normSpkName(n); if (v) byName.add(v); }); });

        const seen = new Set();
        const toAdd = [];
        const consider = sp => {
            if (!sp) return;
            const nk = normSpkName(sp.nameKo), ne = normSpkName(sp.nameEn);
            if (!nk && !ne) return;
            if (sp.id && byId.has(sp.id)) return;
            if ((nk && byName.has(nk)) || (ne && byName.has(ne))) return;
            const key = nk || ne;
            if (seen.has(key)) return;
            seen.add(key);
            toAdd.push({
                nameKo: sp.nameKo || '', nameEn: sp.nameEn || '',
                affiliationKo: sp.affiliationKo || '', affiliationEn: sp.affiliationEn || ''
            });
        };

        Object.values(confs).forEach(conf => {
            // 강의 풀 연자
            Object.values(conf.lecturePool || {}).forEach(lec =>
                (lec.speakers || []).forEach(consider));
            // 세션 사회자
            Object.values(conf.rooms || {}).forEach(room =>
                Object.values(room.sessions || {}).forEach(sess => consider(sess.moderator)));
        });

        if (!toAdd.length) return;
        const updates = {};
        let order = SPEAKERS.length;
        toAdd.forEach(s => {
            updates[uuid()] = {
                ...s, order: order++, fromLecture: true,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };
        });
        SPK_ROOT.update(updates).then(() => {
            logActivity('create', 'speaker', `강의목록/사회자에서 연자 ${toAdd.length}명 자동 반영`, {});
            Toast.success(`강의목록에서 연자 ${toAdd.length}명을 자동으로 추가했습니다.`);
        }).catch(() => { SPK_SYNCED = false; /* 실패 시 다음 기회에 재시도 */ });
    }).catch(() => { SPK_SYNCED = false; });
}

document.getElementById('spkSearch').addEventListener('input', e => {
    SPK_SEARCH = e.target.value.trim().toLowerCase();
    renderSpeakers();
});

(function initSort() {
    const sel = document.getElementById('spkSort');
    if (!sel) return;
    sel.innerHTML = sortOptionsHtml(SPK_SORT, '이름');
    sel.addEventListener('change', () => { SPK_SORT = sel.value; renderSpeakers(); });
})();

// ASLS 관계자 여부 및 배지
window.isAslsStaff = function (s) { return !!(s && (s.roleExec || s.roleAdvisor || s.roleAmb)); };
function aslsBadges(s) {
    let h = '';
    if (s.roleExec) h += '<span class="asls-badge asls-exec">ASLS 임원</span>';
    if (s.roleAdvisor) h += '<span class="asls-badge asls-advisor">ASLS 고문</span>';
    if (s.roleAmb) h += '<span class="asls-badge asls-amb">엠베서더</span>';
    return h;
}

function renderSpeakers() {
    document.getElementById('spkCount').textContent = SPEAKERS.length;
    const q = SPK_SEARCH;
    let list = q
        ? SPEAKERS.filter(s => [s.nameKo, s.nameEn, s.affiliationKo, s.affiliationEn]
            .some(v => (v || '').toLowerCase().includes(q)))
        : SPEAKERS.slice();
    list = sortList(list, SPK_SORT, 'nameKo');

    const body = document.getElementById('spkBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:40px">
            ${SPEAKERS.length ? '검색 결과가 없습니다.' : '등록된 연자가 없습니다. <b>+ 연자 등록</b>으로 추가하세요.'}</td></tr>`;
        return;
    }
    body.innerHTML = list.map(s => `
        <tr>
            <td><div style="display:flex;align-items:center;gap:9px">${speakerAvatar(s, 32)}<b>${escapeHtml(s.nameKo || '')}</b></div></td>
            <td class="en">${escapeHtml(s.nameEn || '-')}</td>
            <td>${escapeHtml(s.affiliationKo || '-')}</td>
            <td class="en">${escapeHtml(s.affiliationEn || '-')}</td>
            <td>${aslsBadges(s) || '<span style="color:var(--text-dim)">-</span>'}</td>
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
    ['spkNameKo', 'spkNameEn', 'spkAffKo', 'spkAffEn', 'spkCv'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('spkRoleExec').checked = false;
    document.getElementById('spkRoleAdvisor').checked = false;
    document.getElementById('spkRoleAmb').checked = false;
    spkPhotoData = '';
    document.getElementById('spkPhotoFile').value = '';
    refreshSpkPhotoPreview();
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
    document.getElementById('spkCv').value = s.cv || '';
    document.getElementById('spkRoleExec').checked = !!s.roleExec;
    document.getElementById('spkRoleAdvisor').checked = !!s.roleAdvisor;
    document.getElementById('spkRoleAmb').checked = !!s.roleAmb;
    spkPhotoData = s.photo || '';
    document.getElementById('spkPhotoFile').value = '';
    refreshSpkPhotoPreview();
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
        cv: document.getElementById('spkCv').value.trim(),
        roleExec: document.getElementById('spkRoleExec').checked,
        roleAdvisor: document.getElementById('spkRoleAdvisor').checked,
        roleAmb: document.getElementById('spkRoleAmb').checked,
        photo: spkPhotoData || '',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (SPK_EDIT_ID) {
        SPK_ROOT.child(SPK_EDIT_ID).update(data)
            .then(() => {
                logActivity('update', 'speaker', `연자 "${nameKo}" 수정`, { entityId: SPK_EDIT_ID });
                Toast.success('저장되었습니다.'); closeSpeakerModal();
            })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        data.order = SPEAKERS.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        const id = uuid();
        SPK_ROOT.child(id).set(data)
            .then(() => {
                logActivity('create', 'speaker', `연자 "${nameKo}" 등록`, { entityId: id });
                Toast.success('연자가 등록되었습니다.'); closeSpeakerModal();
            })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
};

window.deleteSpeaker = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SPEAKERS.find(x => x.id === id);
    const ok = await confirmDialog(`"${s ? s.nameKo : ''}" 연자를 삭제할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    SPK_ROOT.child(id).remove()
        .then(() => {
            logActivity('delete', 'speaker', `연자 "${s ? s.nameKo : ''}" 삭제`, { entityId: id });
            Toast.success('삭제되었습니다.');
        })
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

/* ---------- 사진 업로드/미리보기 ---------- */
function refreshSpkPhotoPreview() {
    const img = document.getElementById('spkPhotoPreview');
    const empty = document.getElementById('spkPhotoEmpty');
    const clr = document.getElementById('spkPhotoClear');
    if (spkPhotoData) {
        img.src = spkPhotoData; img.style.display = ''; empty.style.display = 'none'; clr.style.display = '';
    } else {
        img.removeAttribute('src'); img.style.display = 'none'; empty.style.display = ''; clr.style.display = 'none';
    }
}
window.clearSpkPhoto = function () {
    spkPhotoData = '';
    document.getElementById('spkPhotoFile').value = '';
    refreshSpkPhotoPreview();
};
document.getElementById('spkPhotoFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { Toast.warning('이미지 파일만 업로드할 수 있습니다.'); e.target.value = ''; return; }
    try {
        spkPhotoData = await compressImage(file, 400, 0.82);
        refreshSpkPhotoPreview();
    } catch (err) { Toast.error('이미지 처리 실패: ' + err.message); }
    e.target.value = '';
});

// 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호)
