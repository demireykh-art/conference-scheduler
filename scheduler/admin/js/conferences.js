/**
 * conferences.js — 행사 개설/관리 (컨퍼런스 목록)
 * 데이터: /adminConferences/<id>
 */

const CONF_ROOT = database.ref('/adminConferences');

let CONFS = [];          // [{id, ...}]
let CURRENT_TAB = 'public';
let EDIT_ID = null;      // 수정 중인 행사 id (null=신규)

/* ---------- 초기화 ---------- */
document.getElementById('sidebarMount').innerHTML = renderSidebar('events');

document.querySelectorAll('#confTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#confTabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        CURRENT_TAB = tab.dataset.tab;
        renderList();
    });
});

/* ---------- 데이터 구독 ---------- */
CONF_ROOT.on('value', snap => {
    const val = snap.val() || {};
    CONFS = toOrderedArray(val);
    renderList();
});

/* ---------- 목록 렌더 ---------- */
function renderList() {
    const pub = CONFS.filter(c => c.visibility !== 'private');
    const priv = CONFS.filter(c => c.visibility === 'private');
    document.getElementById('cntPublic').textContent = pub.length;
    document.getElementById('cntPrivate').textContent = priv.length;

    const list = CURRENT_TAB === 'public' ? pub : priv;
    const box = document.getElementById('confList');

    if (!list.length) {
        box.innerHTML = `<div class="card empty-state">
            ${CURRENT_TAB === 'public' ? '공개' : '비공개'} 행사가 없습니다.<br>
            우측 상단 <b>+ 신규 행사 등록</b>으로 행사를 추가하세요.</div>`;
        return;
    }

    box.innerHTML = list.map(c => {
        const st = confStatus(c);
        const poster = c.posterUrl
            ? `<img class="conf-poster" src="${escapeHtml(c.posterUrl)}" alt="poster" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'conf-poster',textContent:'포스터 없음'}))">`
            : `<div class="conf-poster">포스터<br>없음</div>`;
        return `
        <div class="card conf-card">
            ${poster}
            <div class="conf-info">
                <div class="conf-title-row">
                    <h3 class="conf-title">${escapeHtml(c.title || '(제목 없음)')}</h3>
                    <span class="badge badge-${st.key}">${st.label}</span>
                </div>
                ${c.titleEn ? `<div style="color:var(--text-dim);font-size:0.85rem;margin-top:2px">${escapeHtml(c.titleEn)}</div>` : ''}
                <div class="conf-meta">
                    <span class="icon-line">🗓️ 일시: ${escapeHtml(fmtDateRange(c.startDate, c.endDate))}</span>
                    <span class="icon-line">📍 장소: ${escapeHtml(c.location || '-')}</span>
                </div>
                <div class="conf-actions">
                    <button class="btn btn-sm" onclick="editConference('${c.id}')">⚙️ 행사설정</button>
                    <button class="btn btn-sm" data-soon="1">👥 연자/사회자</button>
                    <button class="btn btn-sm" data-soon="1">🏢 파트너사</button>
                    <button class="btn btn-sm btn-primary" onclick="location.href='timetable.html?id=${c.id}'">🗓️ 시간표</button>
                    <button class="btn btn-sm" data-soon="1">♡ 강의 좋아요</button>
                    <button class="btn btn-sm" data-soon="1">🏷️ 무료등록코드</button>
                    <button class="btn btn-sm btn-danger-ghost" onclick="deleteConference('${c.id}')">🗑️ 삭제</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

/* ---------- 모달 ---------- */
window.openConferenceModal = function () {
    if (!AdminAuth.requireEdit()) return;
    EDIT_ID = null;
    document.getElementById('confModalTitle').textContent = '신규 행사 등록';
    document.getElementById('cfTitle').value = '';
    document.getElementById('cfTitleEn').value = '';
    document.getElementById('cfStart').value = '';
    document.getElementById('cfEnd').value = '';
    document.getElementById('cfLocation').value = '';
    document.getElementById('cfPoster').value = '';
    document.getElementById('cfPublic').checked = true;
    document.getElementById('confModal').classList.add('open');
};

window.editConference = function (id) {
    if (!AdminAuth.requireEdit()) return;
    const c = CONFS.find(x => x.id === id);
    if (!c) return;
    EDIT_ID = id;
    document.getElementById('confModalTitle').textContent = '행사 설정';
    document.getElementById('cfTitle').value = c.title || '';
    document.getElementById('cfTitleEn').value = c.titleEn || '';
    document.getElementById('cfStart').value = c.startDate || '';
    document.getElementById('cfEnd').value = c.endDate || '';
    document.getElementById('cfLocation').value = c.location || '';
    document.getElementById('cfPoster').value = c.posterUrl || '';
    document.getElementById('cfPublic').checked = c.visibility !== 'private';
    document.getElementById('confModal').classList.add('open');
};

window.closeConferenceModal = function () {
    document.getElementById('confModal').classList.remove('open');
};

window.saveConference = function () {
    if (!AdminAuth.requireEdit()) return;
    const title = document.getElementById('cfTitle').value.trim();
    const startDate = document.getElementById('cfStart').value;
    if (!title) { Toast.warning('행사명을 입력하세요.'); return; }
    if (!startDate) { Toast.warning('시작일을 입력하세요.'); return; }

    const data = {
        title,
        titleEn: document.getElementById('cfTitleEn').value.trim(),
        startDate,
        endDate: document.getElementById('cfEnd').value || startDate,
        location: document.getElementById('cfLocation').value.trim(),
        posterUrl: document.getElementById('cfPoster').value.trim(),
        visibility: document.getElementById('cfPublic').checked ? 'public' : 'private',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (EDIT_ID) {
        CONF_ROOT.child(EDIT_ID).update(data)
            .then(() => { Toast.success('저장되었습니다.'); closeConferenceModal(); })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        const id = uuid();
        data.order = CONFS.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        CONF_ROOT.child(id).set(data)
            .then(() => { Toast.success('행사가 등록되었습니다.'); closeConferenceModal(); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
};

window.deleteConference = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const c = CONFS.find(x => x.id === id);
    const ok = await confirmDialog(`"${c ? c.title : ''}" 행사를 삭제할까요?\n시간표 등 모든 데이터가 함께 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    CONF_ROOT.child(id).remove()
        .then(() => Toast.success('삭제되었습니다.'))
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

// 모달 배경 클릭 닫기
document.getElementById('confModal').addEventListener('click', e => {
    if (e.target.id === 'confModal') closeConferenceModal();
});
