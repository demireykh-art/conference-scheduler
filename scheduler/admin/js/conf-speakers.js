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

// 검색: 아래 참여 목록도 필터 (등록된 연자에서 추가하는 자동완성과 별개로, 이미 추가된 목록을 걸러줌)
let SPK_Q = '';
document.getElementById('spkInput').addEventListener('input', e => { SPK_Q = e.target.value.trim().toLowerCase(); render(); });

function render() {
    document.getElementById('spkCount').textContent = CONF_SPK.length;
    const box = document.getElementById('peopleList');
    if (!CONF_SPK.length) {
        box.innerHTML = `<div class="card empty-state">아직 추가된 연자/사회자가 없습니다.<br>위 검색창에 이름을 입력해 추가하세요.</div>`;
        return;
    }
    let list = CONF_SPK;
    if (SPK_Q) {
        list = CONF_SPK.filter(e => {
            const m = Masters.speaker(e.id) || {};
            return [m.nameKo, m.nameEn, m.affiliationKo, m.affiliationEn].some(v => (v || '').toLowerCase().includes(SPK_Q));
        });
    }
    if (!list.length) {
        box.innerHTML = `<div class="card empty-state">"${escapeHtml(SPK_Q)}" 참여 목록 검색 결과가 없습니다.<br>등록된 연자면 목록에서 선택해 추가하세요.</div>`;
        return;
    }
    box.innerHTML = list.map(e => {
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
            <button class="btn btn-sm" title="${m.email ? 'CV 요청 메일(Gmail 작성창 열기)' : '이메일이 없습니다 — 연자 정보에 이메일을 추가하세요'}" onclick="requestCV('${e.id}')">✉ CV 요청</button>
            <button class="btn btn-sm" title="제출 링크 복사(원하는 메신저·메일에 붙여넣기)" onclick="copyCVLink('${e.id}')">🔗 링크 복사</button>
            <button class="btn btn-sm btn-danger-ghost" onclick="removePerson('${e.id}')">제거</button>
        </div>`;
    }).join('');
}

const ORG_NAME = '대한미용성형레이저의학회(ASLS)';

// (행사,연자) → 짧은 결정적 토큰. /cvTokens/<t> = {c,s} 매핑 저장 후 짧은 링크 반환.
function shortToken(id) {
    const key = CONF_ID + '|' + id;
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
}
function cvLink(id) {
    const t = shortToken(id);
    database.ref('/cvTokens/' + t).set({ c: CONF_ID, s: id }).catch(() => { });   // 매핑 저장(멱등)
    // 저장소 루트의 짧은 진입 페이지로 연결: .../conference-scheduler/cv.html?t=<t>
    const base = new URL('../../cv.html', location.href);
    base.searchParams.set('t', t);
    return base.href;
}

/* 스팸에 안 걸리도록 자연스럽고 전문적인 안내문 (한 개의 링크, 명확한 발신 주체, 서명 포함) */
function cvEmailParts(id) {
    const m = Masters.speaker(id) || {};
    const title = confTitleText();
    const name = m.nameKo || m.nameEn || '';
    const subject = `${title} 연자 정보(CV) 및 사진 등록 안내`;
    const body =
`안녕하세요, ${name ? name + ' 선생님' : '선생님'}.

${ORG_NAME} 사무국입니다.
${title} 연자로 모시게 되어 진심으로 감사드립니다.

행사 준비를 위해 성함과 소속, 약력(CV), 프로필 사진을 아래 페이지에서 등록해 주시면 감사하겠습니다. 등록해 주신 내용은 학회 프로그램에 반영됩니다.

등록 페이지
${cvLink(id)}

궁금하신 점은 본 메일로 회신 주시면 안내드리겠습니다.
늘 감사드립니다.

${ORG_NAME} 사무국 드림`;
    return { m, subject, body };
}

/* CV 요청 메일 — Gmail 작성창을 열어 안내문 + CV 등록 링크를 채워준다 */
window.requestCV = function (id) {
    const { m, subject, body } = cvEmailParts(id);
    const gmail = 'https://mail.google.com/mail/?view=cm&fs=1'
        + '&to=' + encodeURIComponent(m.email || '')
        + '&su=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(body);
    window.open(gmail, '_blank');
    if (!m.email) Toast.info('이 연자의 이메일이 없습니다. Gmail 작성창에서 수신인을 직접 입력하거나, 연자 정보에 이메일을 등록하세요.');
};

/* 제출 링크만 클립보드로 복사 — 카톡·문자·다른 메일에 붙여넣기 용 (라벨 + 링크) */
window.copyCVLink = function (id) {
    const url = 'ASLS 연자 정보 · CV 제출\n' + cvLink(id);
    const done = () => Toast.success('제출 링크를 복사했습니다. 원하는 곳에 붙여넣으세요.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else { fallbackCopy(url, done); }
};
function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { Toast.info('복사 실패 — 링크: ' + text); }
    ta.remove();
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
        // 신규 연자 → 연자 관리와 동일한 전체 등록창을 연다 (사진·영문명·소속·ASLS 역할)
        openNewSpeakerModal(name);
    }
);

/* ============================================================
   새 연자 등록 모달 (연자 관리 speakers.js와 동일한 필드 → 마스터에 저장 후 이 행사에 추가)
   ============================================================ */
let spkPhotoData = '';

window.openNewSpeakerModal = function (name) {
    if (!AdminAuth.requireEdit()) return;
    document.getElementById('spkNameKo').value = name || '';
    ['spkNameEn', 'spkAffKo', 'spkAffEn', 'spkCv', 'spkEmail'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('spkRoleExec').checked = false;
    document.getElementById('spkRoleAdvisor').checked = false;
    document.getElementById('spkRoleAmb').checked = false;
    spkPhotoData = '';
    document.getElementById('spkPhotoFile').value = '';
    refreshSpkPhotoPreview();
    document.getElementById('spkModal').classList.add('open');
    setTimeout(() => document.getElementById('spkNameKo').focus(), 50);
    // 검색창 비우기
    const inp = document.getElementById('spkInput'); if (inp) inp.value = '';
};

window.closeSpeakerModal = function () { document.getElementById('spkModal').classList.remove('open'); };

window.saveNewSpeaker = function () {
    if (!AdminAuth.requireEdit()) return;
    const nameKo = document.getElementById('spkNameKo').value.trim();
    if (!nameKo) { Toast.warning('연자 이름(국문)을 입력하세요.'); return; }
    const affKo = document.getElementById('spkAffKo').value.trim();
    // 마스터 중복 체크 (이름+소속국문) → 있으면 그 연자를 이 행사에 추가
    const dup = Masters.speakers.find(s => (s.nameKo || '').trim() === nameKo && (s.affiliationKo || '').trim() === affKo);
    if (dup) {
        Toast.info('이미 등록된 연자입니다. 이 행사에 추가합니다.');
        closeSpeakerModal(); addPerson(dup.id); return;
    }
    const id = uuid();
    const data = {
        nameKo,
        nameEn: document.getElementById('spkNameEn').value.trim(),
        affiliationKo: affKo,
        affiliationEn: document.getElementById('spkAffEn').value.trim(),
        cv: document.getElementById('spkCv').value.trim(),
        email: document.getElementById('spkEmail').value.trim(),
        roleExec: document.getElementById('spkRoleExec').checked,
        roleAdvisor: document.getElementById('spkRoleAdvisor').checked,
        roleAmb: document.getElementById('spkRoleAmb').checked,
        photo: spkPhotoData || '',
        order: Masters.speakers.length,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    database.ref('/adminSpeakers/' + id).set(data)
        .then(() => {
            logActivity('create', 'speaker', `연자 "${nameKo}" 등록`, { entityId: id });
            closeSpeakerModal();
            addPerson(id);
            Toast.success(`"${nameKo}" 연자 관리에 등록 후 이 행사에 추가했습니다.`);
        })
        .catch(e => Toast.error('등록 실패: ' + e.message));
};

/* 사진 업로드/미리보기 (speakers.js와 동일) */
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

function confTitleText() { return document.getElementById('confName').textContent || ''; }

function addPerson(id) {
    if (!AdminAuth.requireEdit()) return;
    if (CONF_SPK.find(e => e.id === id)) { Toast.info('이미 추가된 연자입니다.'); return; }
    const m = Masters.speaker(id) || {};
    cRef().child('confSpeakers/' + id).set({ role: '연자', order: CONF_SPK.length })
        .then(() => logActivity('participate', 'speaker', `연자 "${m.nameKo || m.nameEn || ''}" 행사 추가`, { confId: CONF_ID, confTitle: confTitleText(), entityId: id }))
        .catch(e => Toast.error('추가 실패: ' + e.message));
}
window.setRole = function (id, role) {
    if (!AdminAuth.requireEdit()) return;
    const m = Masters.speaker(id) || {};
    cRef().child('confSpeakers/' + id + '/role').set(role)
        .then(() => logActivity('update', 'speaker', `연자 "${m.nameKo || m.nameEn || ''}" 역할 → ${role}`, { confId: CONF_ID, confTitle: confTitleText(), entityId: id }))
        .catch(e => Toast.error('저장 실패: ' + e.message));
};
window.removePerson = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const m = Masters.speaker(id) || {};
    const ok = await confirmDialog(`"${m.nameKo || m.nameEn || ''}" 을(를) 이 행사에서 제거할까요?\n(연자 마스터에서는 삭제되지 않습니다.)`, { danger: true, okText: '제거' });
    if (!ok) return;
    cRef().child('confSpeakers/' + id).remove()
        .then(() => logActivity('participate', 'speaker', `연자 "${m.nameKo || m.nameEn || ''}" 행사 제거`, { confId: CONF_ID, confTitle: confTitleText(), entityId: id }))
        .catch(e => Toast.error('제거 실패: ' + e.message));
};
