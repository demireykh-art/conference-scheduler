/**
 * cv-inbox.js — 연자 CV 제출함 (검토·승인)
 * 데이터: /cvSubmissions/<id> = { confId, speakerId, nameKo, nameEn, affiliationKo, affiliationEn, email, cv, photo, status, submittedAt }
 * 승인 시 /adminSpeakers/<speakerId> 에 반영.
 */
document.getElementById('sidebarMount').innerHTML = renderSidebar('cvinbox');
Masters.init();

let SUBS = [];
let CONF_TITLES = {};
let subRef = null;

database.ref('/adminConferences').once('value').then(s => {
    (s.val() && Object.entries(s.val()) || []).forEach(([id, c]) => { CONF_TITLES[id] = (c && c.title) || ''; });
    render();
}).catch(() => { });

function gate() {
    const notice = document.getElementById('cvNotice');
    const area = document.getElementById('cvArea');
    const stop = () => { if (subRef) { subRef.off(); subRef = null; } };
    if (!AdminAuth.user) {
        notice.innerHTML = '이 페이지는 로그인이 필요합니다. <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="openLoginGate()">로그인</button>';
        notice.style.display = ''; area.style.display = 'none'; stop(); return;
    }
    if (AdminAuth.role && !AdminAuth.canEdit()) {
        notice.innerHTML = '편집 권한이 있는 사용자만 볼 수 있습니다.';
        notice.style.display = ''; area.style.display = 'none'; stop(); return;
    }
    if (!AdminAuth.role) { notice.textContent = '권한 확인 중…'; notice.style.display = ''; area.style.display = 'none'; return; }
    notice.style.display = 'none'; area.style.display = '';
    if (!subRef) {
        subRef = database.ref('/cvSubmissions');
        subRef.on('value', snap => {
            SUBS = Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }))
                .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
            render();
        }, err => { notice.textContent = '불러올 수 없습니다: ' + err.message; notice.style.display = ''; area.style.display = 'none'; });
    }
}
document.addEventListener('admin-auth-change', gate);
AdminAuth.onReady(gate);
document.addEventListener('masters-change', render);

function fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function render() {
    const list = document.getElementById('cvList');
    if (!list) return;
    const pending = SUBS.filter(s => s.status !== 'approved');
    const cnt = document.getElementById('cvPendingCount'); if (cnt) cnt.textContent = pending.length;
    if (!pending.length) { list.innerHTML = '<div style="color:var(--text-dim);padding:24px">대기 중인 제출이 없습니다.</div>'; return; }
    list.innerHTML = pending.map(s => {
        const cur = Masters.speaker(s.speakerId) || {};
        const conf = CONF_TITLES[s.confId] || '(행사)';
        const photo = s.photo ? `<img src="${escapeHtml(s.photo)}" class="cvi-photo" alt="">` : `<div class="cvi-photo cvi-noimg">사진없음</div>`;
        const nameNew = escapeHtml(s.nameKo || s.nameEn || '');
        const nameCur = escapeHtml(cur.nameKo || cur.nameEn || '(마스터에 없음)');
        return `<div class="cvi-card">
            ${photo}
            <div class="cvi-main">
                <div class="cvi-head"><b>${nameNew}</b> <span class="cvi-en">${escapeHtml(s.nameEn || '')}</span>
                    <span class="cvi-meta">· ${escapeHtml(conf)} · ${fmt(s.submittedAt)}</span></div>
                <div class="cvi-line">소속: ${escapeHtml(s.affiliationKo || '-')}${s.affiliationEn ? ' / ' + escapeHtml(s.affiliationEn) : ''}</div>
                ${s.email ? `<div class="cvi-line">이메일: ${escapeHtml(s.email)}</div>` : ''}
                ${s.cv ? `<div class="cvi-cv">${escapeHtml(s.cv)}</div>` : ''}
                <div class="cvi-line cvi-target">→ 반영 대상 연자: <b>${nameCur}</b></div>
                <div class="cvi-acts">
                    <button class="btn btn-sm btn-success" onclick="approveSub('${s.id}')">✔ 승인·반영</button>
                    <button class="btn btn-sm btn-danger-ghost" onclick="rejectSub('${s.id}')">반려·삭제</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.approveSub = function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SUBS.find(x => x.id === id); if (!s) return;
    let sid = s.speakerId;
    const apply = {};
    if (s.nameKo) apply.nameKo = s.nameKo;
    if (s.nameEn) apply.nameEn = s.nameEn;
    if (s.affiliationKo) apply.affiliationKo = s.affiliationKo;
    if (s.affiliationEn) apply.affiliationEn = s.affiliationEn;
    if (s.email) apply.email = s.email;
    if (s.cv) apply.cv = s.cv;
    if (s.photo) apply.photo = s.photo;
    apply.updatedAt = firebase.database.ServerValue.TIMESTAMP;

    const p = sid
        ? database.ref('/adminSpeakers/' + sid).update(apply)
        : (function () { sid = uuid(); apply.order = Masters.speakers.length; apply.createdAt = firebase.database.ServerValue.TIMESTAMP; return database.ref('/adminSpeakers/' + sid).set(apply); })();

    p.then(() => database.ref('/cvSubmissions/' + id).remove())
        .then(() => {
            logActivity('update', 'speaker', `연자 "${s.nameKo || s.nameEn || ''}" CV 제출 승인·반영`, { confId: s.confId, confTitle: CONF_TITLES[s.confId] || '', entityId: sid });
            Toast.success('연자 정보에 반영했습니다.');
        })
        .catch(e => Toast.error('반영 실패: ' + e.message));
};

window.rejectSub = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const s = SUBS.find(x => x.id === id);
    const ok = await confirmDialog(`"${s ? (s.nameKo || s.nameEn) : ''}" 제출을 반려(삭제)할까요?`, { danger: true, okText: '삭제' });
    if (!ok) return;
    database.ref('/cvSubmissions/' + id).remove()
        .then(() => Toast.success('삭제되었습니다.'))
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};
