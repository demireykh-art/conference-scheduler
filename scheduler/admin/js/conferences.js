/**
 * conferences.js — 행사 개설/관리 (컨퍼런스 목록)
 * 데이터: /adminConferences/<id>
 */

const CONF_ROOT = database.ref('/adminConferences');

let CONFS = [];          // [{id, ...}]
let CURRENT_TAB = 'public';
let EDIT_ID = null;      // 수정 중인 행사 id (null=신규)
let posterData = '';     // 업로드한 포스터 data URL (파일 업로드 시에만 채워짐)

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
            ? `<div class="conf-poster-wrap">
                    <img class="conf-poster" src="${escapeHtml(c.posterUrl)}" alt="poster" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'conf-poster',textContent:'포스터 없음'}))">
                    <button class="poster-dl-btn" onclick="downloadPoster('${c.id}')" title="포스터 다운로드">⬇ 저장</button>
               </div>`
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
                    <button class="btn btn-sm" onclick="location.href='conf-speakers.html?id=${c.id}'">👥 연자/사회자</button>
                    <button class="btn btn-sm" onclick="location.href='conf-partners.html?id=${c.id}'">🏢 파트너사</button>
                    <button class="btn btn-sm btn-primary" onclick="location.href='timetable.html?id=${c.id}'">🗓️ 시간표</button>
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
    setPosterFromValue('');
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
    setPosterFromValue(c.posterUrl || '');
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
        posterUrl: getPosterValue(),
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

// 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호)

/* ============================================================
   포스터 이미지 업로드 / 미리보기 / 다운로드
   ============================================================ */

// 현재 모달의 포스터 값 (업로드 data URL 우선, 없으면 URL 입력값)
function getPosterValue() {
    if (posterData && posterData.startsWith('data:')) return posterData;
    return document.getElementById('cfPoster').value.trim();
}

// 값으로 포스터 필드 초기 설정 (수정/신규 열 때)
function setPosterFromValue(v) {
    const fileInput = document.getElementById('cfPosterFile');
    if (fileInput) fileInput.value = '';
    if (v && v.startsWith('data:')) {
        posterData = v;
        document.getElementById('cfPoster').value = '';
    } else {
        posterData = '';
        document.getElementById('cfPoster').value = v || '';
    }
    refreshPosterPreview();
}

function refreshPosterPreview() {
    const v = getPosterValue();
    const img = document.getElementById('cfPosterPreview');
    const empty = document.getElementById('cfPosterEmpty');
    const dl = document.getElementById('cfPosterDownload');
    const clr = document.getElementById('cfPosterClear');
    if (v) {
        img.src = v;
        img.style.display = '';
        empty.style.display = 'none';
        dl.style.display = '';
        clr.style.display = '';
    } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        empty.style.display = '';
        dl.style.display = 'none';
        clr.style.display = 'none';
    }
}

window.clearPoster = function () {
    posterData = '';
    document.getElementById('cfPoster').value = '';
    document.getElementById('cfPosterFile').value = '';
    refreshPosterPreview();
};

// 이미지 파일 → 가로 maxW로 축소한 JPEG data URL
function compressImage(file, maxW = 1000, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';           // PNG 투명 배경 → 흰색
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
        reader.readAsDataURL(file);
    });
}

// 파일 선택 시
document.getElementById('cfPosterFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        Toast.warning('이미지 파일만 업로드할 수 있습니다.');
        e.target.value = '';
        return;
    }
    try {
        const dataUrl = await compressImage(file, 1000, 0.82);
        posterData = dataUrl;
        document.getElementById('cfPoster').value = '';
        refreshPosterPreview();
        const kb = Math.round((dataUrl.length * 3 / 4) / 1024);
        Toast.success(`포스터 이미지가 추가되었습니다 (약 ${kb}KB).`);
    } catch (err) {
        Toast.error('이미지 처리 실패: ' + err.message);
    }
    e.target.value = '';
});

// URL 직접 입력 시 업로드 이미지 해제
document.getElementById('cfPoster').addEventListener('input', () => {
    posterData = '';
    refreshPosterPreview();
});

// 포스터 값 다운로드 (data URL 또는 외부 URL)
function downloadPosterValue(v, title) {
    if (!v) { Toast.warning('저장할 포스터 이미지가 없습니다.'); return; }
    const safe = (title || '포스터').replace(/[\\/:*?"<>|]/g, '_');
    const a = document.createElement('a');
    a.href = v;
    if (v.startsWith('data:')) {
        const mime = (v.match(/^data:(image\/[\w.+-]+)/) || [])[1] || 'image/jpeg';
        let ext = (mime.split('/')[1] || 'jpg').toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        a.download = `${safe}_포스터.${ext}`;
    } else {
        // 외부 URL은 교차출처라 download 속성이 무시될 수 있어 새 탭으로도 열어둠
        a.download = `${safe}_포스터`;
        a.target = '_blank';
        a.rel = 'noopener';
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// 모달 안에서 현재 포스터 다운로드
window.downloadCurrentPoster = function () {
    downloadPosterValue(getPosterValue(), document.getElementById('cfTitle').value.trim());
};

// 목록 카드에서 포스터 다운로드
window.downloadPoster = function (id) {
    const c = CONFS.find(x => x.id === id);
    if (c) downloadPosterValue(c.posterUrl, c.title);
};
