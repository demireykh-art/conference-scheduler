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

let SPK_LOADED = false, SPK_SYNCED = false, LEGACY_CONTACTS = false;
// 공개 레코드에 연락처가 남아 있고 관리자일 때만 [🔒 연락처 비공개 전환] 버튼 표시
function updateContactsBtn() {
    const b = document.getElementById('btnMigrateContacts'); if (!b) return;
    b.style.display = (LEGACY_CONTACTS && window.AdminAuth && AdminAuth.isAdmin()) ? '' : 'none';
    b.title = Contacts.ready ? '공개 레코드의 이메일·전화를 관리자 전용 칸으로 옮김' : 'DB 규칙 추가가 먼저 필요합니다';
}
document.addEventListener('contacts-change', () => { Contacts.merge(SPEAKERS); updateContactsBtn(); if (SPK_LOADED) renderSpeakers(); });
document.addEventListener('admin-auth-change', updateContactsBtn);

SPK_ROOT.on('value', snap => {
    const raw = snap.val() || {};
    LEGACY_CONTACTS = Object.values(raw).some(s => s && (s.email || s.phone));
    SPEAKERS = Contacts.merge(toOrderedArray(raw)
        .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko')));
    SPK_LOADED = true;
    updateContactsBtn();
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
    if (s.roleModerator) h += '<span class="asls-badge asls-mod">좌장</span>';
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
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:40px">
            ${SPEAKERS.length ? '검색 결과가 없습니다.' : '등록된 연자가 없습니다. <b>+ 연자 등록</b>으로 추가하세요.'}</td></tr>`;
        return;
    }
    body.innerHTML = list.map(s => `
        <tr>
            <td data-label="연자"><div style="display:flex;align-items:center;gap:9px">${speakerAvatar(s, 32)}<b>${escapeHtml(s.nameKo || '')}</b></div></td>
            <td data-label="영문명" class="en">${escapeHtml(s.nameEn || '-')}</td>
            <td data-label="소속">${escapeHtml(s.affiliationKo || '-')}</td>
            <td data-label="소속(영문)" class="en">${escapeHtml(s.affiliationEn || '-')}</td>
            <td data-label="국적">${escapeHtml(s.nationalityKo || s.nationalityEn || '-')}</td>
            <td data-label="구분">${aslsBadges(s) || '<span style="color:var(--text-dim)">-</span>'}</td>
            <td data-label="관리">
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
    ['spkNameKo', 'spkNameEn', 'spkAffKo', 'spkAffEn', 'spkNatKo', 'spkNatEn', 'spkCv', 'spkEmail', 'spkPhone'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('spkRoleExec').checked = false;
    document.getElementById('spkRoleAdvisor').checked = false;
    document.getElementById('spkRoleAmb').checked = false;
    document.getElementById('spkRoleModerator').checked = false;
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
    document.getElementById('spkNatKo').value = s.nationalityKo || '';
    document.getElementById('spkNatEn').value = s.nationalityEn || '';
    document.getElementById('spkCv').value = s.cv || '';
    document.getElementById('spkEmail').value = s.email || '';
    document.getElementById('spkPhone').value = s.phone || '';
    document.getElementById('spkRoleExec').checked = !!s.roleExec;
    document.getElementById('spkRoleAdvisor').checked = !!s.roleAdvisor;
    document.getElementById('spkRoleAmb').checked = !!s.roleAmb;
    document.getElementById('spkRoleModerator').checked = !!s.roleModerator;
    spkPhotoData = s.photoURL || s.photo || '';
    document.getElementById('spkPhotoFile').value = '';
    refreshSpkPhotoPreview();
    document.getElementById('spkModal').classList.add('open');
};

window.closeSpeakerModal = function () { document.getElementById('spkModal').classList.remove('open'); };

// 저장 처리 → 저장된 연자 id를 resolve. closeAfter=false면 모달 유지(CV 요청 발송용).
async function doSaveSpeaker(closeAfter) {
    if (!AdminAuth.requireEdit()) return Promise.reject(new Error('권한 없음'));
    const nameKo = document.getElementById('spkNameKo').value.trim();
    if (!nameKo) { Toast.warning('연자 이름(국문)을 입력하세요.'); return Promise.reject(new Error('이름 없음')); }

    // 중복 체크 (국문 이름 + 소속국문 조합)
    const affKo = document.getElementById('spkAffKo').value.trim();
    const dup = SPEAKERS.find(s => s.id !== SPK_EDIT_ID
        && (s.nameKo || '').trim() === nameKo && (s.affiliationKo || '').trim() === affKo);
    if (dup) { Toast.warning('이미 같은 이름·소속의 연자가 등록되어 있습니다.'); return Promise.reject(new Error('중복')); }

    const sid = SPK_EDIT_ID || uuid();

    // 사진: 새로 올린 base64면 Storage 업로드 → photoURL, 이미 URL이면 그대로, 비었으면 제거.
    //  - Storage 미설정/업로드 실패 시 base64로 폴백(기존 동작 유지).
    let photoURL = '', photoLegacy = null;
    if (spkPhotoData) {
        if (/^https?:/.test(spkPhotoData)) {
            photoURL = spkPhotoData;
        } else if (/^data:/.test(spkPhotoData)) {
            try {
                const url = await uploadSpeakerPhoto(sid, spkPhotoData);
                if (url) photoURL = url; else photoLegacy = spkPhotoData;
            } catch (e) { photoLegacy = spkPhotoData; }
        }
    }

    let data = {
        nameKo,
        nameEn: document.getElementById('spkNameEn').value.trim(),
        affiliationKo: affKo,
        affiliationEn: document.getElementById('spkAffEn').value.trim(),
        nationalityKo: document.getElementById('spkNatKo').value.trim(),
        nationalityEn: document.getElementById('spkNatEn').value.trim(),
        cv: document.getElementById('spkCv').value.trim(),
        email: document.getElementById('spkEmail').value.trim(),
        phone: document.getElementById('spkPhone').value.trim(),
        roleExec: document.getElementById('spkRoleExec').checked,
        roleAdvisor: document.getElementById('spkRoleAdvisor').checked,
        roleAmb: document.getElementById('spkRoleAmb').checked,
        roleModerator: document.getElementById('spkRoleModerator').checked,
        photoURL: photoURL,       // Storage 다운로드 URL(공개 사진)
        photo: photoLegacy,       // null이면 레거시 base64 제거(용량 절감)
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    try { data = await Contacts.splitSpeaker(sid, data); }
    catch (e) { Toast.error('연락처 저장 실패: ' + e.message); throw e; }
    if (SPK_EDIT_ID) {
        return SPK_ROOT.child(sid).update(data)
            .then(() => {
                logActivity('update', 'speaker', `연자 "${nameKo}" 수정`, { entityId: sid });
                if (closeAfter) { Toast.success('저장되었습니다.'); closeSpeakerModal(); }
                return sid;
            })
            .catch(e => { Toast.error('저장 실패: ' + e.message); throw e; });
    } else {
        data.order = SPEAKERS.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        return SPK_ROOT.child(sid).set(data)
            .then(() => {
                logActivity('create', 'speaker', `연자 "${nameKo}" 등록`, { entityId: sid });
                SPK_EDIT_ID = sid;   // 이후 편집/재발송이 같은 연자에 반영되도록
                document.getElementById('spkModalTitle').textContent = '연자 수정';
                if (closeAfter) { Toast.success('연자가 등록되었습니다.'); closeSpeakerModal(); }
                return sid;
            })
            .catch(e => { Toast.error('등록 실패: ' + e.message); throw e; });
    }
}
window.saveSpeaker = function () { doSaveSpeaker(true).catch(() => { }); };

/* ---------- 사진 Storage 일괄 이전 (레거시 base64 → Firebase Storage URL) ----------
   DB에 base64로 저장된 연자 사진을 Storage로 옮기고 photoURL 저장 + base64 제거.
   홈페이지/임베드가 사진을 CDN에서 받아 다운로드 사용량을 크게 줄인다. (1회 실행) */
window.migratePhotosToStorage = async function () {
    if (!AdminAuth.requireEdit()) return;
    if (!storageReady()) {
        Toast.error('Firebase Storage가 아직 설정되지 않았습니다. 콘솔에서 Storage 사용 설정 후 다시 시도하세요.');
        return;
    }
    const targets = SPEAKERS.filter(s => /^data:/.test(s.photo || '') && !/^https?:/.test(s.photoURL || ''));
    if (!targets.length) { Toast.info('이전할 base64 사진이 없습니다. (이미 모두 Storage로 이전됨)'); return; }
    const ok = await confirmDialog(`연자 사진 ${targets.length}명을 Firebase Storage로 이전할까요?\n(기존 base64는 제거되고 Storage URL로 교체됩니다. 안전을 위해 먼저 "💾 연자 백업"을 권장)`, { okText: '이전 시작' });
    if (!ok) return;
    const btn = document.getElementById('spkMigrateBtn'); if (btn) btn.disabled = true;
    let done = 0, fail = 0;
    for (const s of targets) {
        try {
            const url = await uploadSpeakerPhoto(s.id, s.photo);
            if (!url) { fail++; continue; }
            await SPK_ROOT.child(s.id).update({ photoURL: url, photo: null, updatedAt: firebase.database.ServerValue.TIMESTAMP });
            done++;
            if (done % 5 === 0 || done === targets.length) Toast.info(`이전 중… ${done}/${targets.length}`);
        } catch (e) { fail++; }
    }
    if (btn) btn.disabled = false;
    logActivity('update', 'speaker', `연자 사진 Storage 이전 ${done}건${fail ? ` (실패 ${fail})` : ''}`, {});
    Toast.success(`사진 이전 완료: ${done}건${fail ? ` · 실패 ${fail}건(다시 시도 가능)` : ''}`);
};

/* ---------- CV 요청 (메일 / 링크복사) — 저장 후 발송 ---------- */
const ORG_NAME = '대한미용성형레이저의학회(ASLS)';

// 전역(행사무관) CV 토큰 → /cvTokens/<t> = {c:'', s:id}
function shortToken(id) {
    const key = 'g|' + id;
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
}
function cvLink(id) {
    const t = shortToken(id);
    database.ref('/cvTokens/' + t).set({ c: '', s: id }).catch(() => { });
    const base = new URL('../../cv.html', location.href);   // 저장소 루트 cv.html?t=<t>
    base.searchParams.set('t', t);
    return base.href;
}
function cvContact(id) {
    if (id === SPK_EDIT_ID) {
        return {
            email: document.getElementById('spkEmail').value.trim(),
            name: document.getElementById('spkNameKo').value.trim() || document.getElementById('spkNameEn').value.trim()
        };
    }
    const s = SPEAKERS.find(x => x.id === id) || {};
    return { email: s.email || '', name: s.nameKo || s.nameEn || '' };
}
function requestCV(id) {
    const { email, name } = cvContact(id);
    const subject = 'ASLS 연자 정보(CV) 및 사진 등록 안내';
    const body =
`안녕하세요, ${name ? name + ' 선생님' : '선생님'}.

${ORG_NAME} 사무국입니다.
연자로 모시게 되어 진심으로 감사드립니다.

행사 준비를 위해 성함과 소속, 약력(CV), 프로필 사진을 아래 페이지에서 등록해 주시면 감사하겠습니다. 등록해 주신 내용은 학회에 자동 반영됩니다.

등록 페이지
${cvLink(id)}

궁금하신 점은 본 메일로 회신 주시면 안내드리겠습니다.
늘 감사드립니다.

${ORG_NAME} 사무국 드림`;
    const gmail = 'https://mail.google.com/mail/?view=cm&fs=1'
        + '&to=' + encodeURIComponent(email || '')
        + '&su=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(body);
    window.open(gmail, '_blank');
    if (!email) Toast.info('이메일이 없습니다. Gmail 작성창에서 수신인을 직접 입력하세요.');
}
function copyCVLink(id) {
    const url = 'ASLS 연자 정보 · CV 제출\n' + cvLink(id);
    const done = () => Toast.success('제출 링크를 복사했습니다. 문자·카톡 등에 붙여넣으세요.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    else fallbackCopy(url, done);
}
function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { Toast.info('복사 실패 — 링크: ' + text); }
    ta.remove();
}
// 모달 버튼 — 입력값 저장 후 발송/복사
window.sendCvMail = function () { doSaveSpeaker(false).then(id => requestCV(id)).catch(() => { }); };
window.copyCvLinkBtn = function () { doSaveSpeaker(false).then(id => copyCVLink(id)).catch(() => { }); };

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
        const cropped = await openImageCropper(file, { out: 400 });
        if (cropped) { spkPhotoData = cropped; refreshSpkPhotoPreview(); }   // 취소 시 기존 사진 유지
    } catch (err) { Toast.error('이미지 처리 실패: ' + err.message); }
    e.target.value = '';
});

// 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호)
