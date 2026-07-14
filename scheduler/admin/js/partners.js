/**
 * partners.js — 파트너사 관리 (마스터)
 * 데이터: /adminPartners/<id> = { nameKo, nameEn, products:[{nameKo,nameEn}], order }
 */

const PTN_ROOT = database.ref('/adminPartners');
let PARTNERS = [];
let PTN_EDIT_ID = null;
let PTN_SEARCH = '';
let BOOTH = { columns: DEFAULT_BOOTH_COLUMNS.slice(), grades: DEFAULT_BOOTH_GRADES.slice(), cells: JSON.parse(JSON.stringify(DEFAULT_BOOTH_CELLS)) };
let BOOTH_TEMPLATE = null;   // 전역 템플릿(행사에 표가 없을 때 fallback)
let CONF_BOOTH = null;       // 선택한 행사의 부스 혜택 표
let PLACED = {};              // { partnerId: { type: 배치수 } } — 선택한 행사 기준
let PLACED_CONF_NAME = '';
let CONF_PARTNERS = new Set(); // 선택한 행사에 참가하는 파트너사 id
let PRE_PARTNERS = new Set();  // 선택한 행사에 '신청전(참가 망설임)' 파트너사 id
let CONF_PARTNER_MAP = {};     // { partnerId: { order, grade } } — 행사별 등급
let CONF_CONTACTS = {};        // { partnerId: [{name,phone,email}] } — 행사별 담당자
let PTN_SORT = 'nameAsc';

document.getElementById('sidebarMount').innerHTML = renderSidebar('partners');

PTN_ROOT.on('value', snap => {
    PARTNERS = toOrderedArray(snap.val())
        .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));
    renderPartners();
});

// 부스 혜택 표는 행사별(/adminConferences/<id>/boothBenefits) — 아래 subscribePlacedConf에서 반영.
// 행사에 표가 없을 때를 위한 전역 템플릿 1회 로드.
database.ref('/adminBoothBenefits').once('value').then(s => {
    const v = s.val();
    if (v && Array.isArray(v.columns) && Array.isArray(v.grades)) BOOTH_TEMPLATE = v;
    applyBooth(); populateGradeSelect(); renderPartners();
}).catch(() => { populateGradeSelect(); renderPartners(); });

// 현재 선택 행사의 부스 표 → BOOTH 반영 (없으면 템플릿 → 기본값)
// 등급(grades)이 비어 있으면 등급 드롭다운이 텅 비게 되므로, 비어 있으면 다음 소스로 폴백한다.
function applyBooth() {
    const hasGrades = s => s && Array.isArray(s.grades) && s.grades.length > 0;
    const src = hasGrades(CONF_BOOTH) ? CONF_BOOTH
        : hasGrades(BOOTH_TEMPLATE) ? BOOTH_TEMPLATE
            : null;
    if (src) {
        BOOTH = {
            columns: (Array.isArray(src.columns) && src.columns.length) ? src.columns : DEFAULT_BOOTH_COLUMNS.slice(),
            grades: src.grades,
            cells: src.cells || {}
        };
    } else {
        BOOTH = { columns: DEFAULT_BOOTH_COLUMNS.slice(), grades: DEFAULT_BOOTH_GRADES.slice(), cells: JSON.parse(JSON.stringify(DEFAULT_BOOTH_CELLS)) };
    }
}

// 선택한 행사 기준으로 배치된 강의 수 집계 (파트너 + 강의유형)
let CONF_LIST = [];
let PLACED_CONF_ID = '';
try { PLACED_CONF_ID = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { }
let placedRef = null;

// 행사 목록 구독 → 드롭다운 채우기
database.ref('/adminConferences').on('value', snap => {
    CONF_LIST = toOrderedArray(snap.val());
    if (!PLACED_CONF_ID || !CONF_LIST.find(c => c.id === PLACED_CONF_ID)) {
        PLACED_CONF_ID = CONF_LIST.length ? CONF_LIST[0].id : '';
    }
    populateConfSelect();
    subscribePlacedConf();
});

function populateConfSelect() {
    const sel = document.getElementById('placedConfSelect');
    if (!sel) return;
    sel.innerHTML = CONF_LIST.length
        ? CONF_LIST.map(c => `<option value="${c.id}">${escapeHtml(c.title || '(제목 없음)')}</option>`).join('')
        : '<option value="">(행사 없음)</option>';
    sel.value = PLACED_CONF_ID;
}

function subscribePlacedConf() {
    if (placedRef) { placedRef.off(); placedRef = null; }
    PLACED = {};
    PLACED_CONF_NAME = '';
    if (!PLACED_CONF_ID) { renderPartners(); return; }
    placedRef = database.ref('/adminConferences/' + PLACED_CONF_ID);
    placedRef.on('value', snap => {
        const conf = snap.val() || {};
        PLACED_CONF_NAME = conf.title || '';
        CONF_PARTNER_MAP = conf.confPartners || {};
        CONF_PARTNERS = new Set(Object.keys(CONF_PARTNER_MAP));
        PRE_PARTNERS = new Set(Object.keys(conf.prePartners || {}));
        CONF_CONTACTS = conf.partnerContacts || {};   // 행사별 담당자 연락처
        CONF_BOOTH = (conf.boothBenefits && Array.isArray(conf.boothBenefits.columns) && Array.isArray(conf.boothBenefits.grades)) ? conf.boothBenefits : null;
        applyBooth();
        populateGradeSelect();
        PLACED = {};
        Object.values(conf.rooms || {}).forEach(room =>
            Object.values(room.sessions || {}).forEach(sess =>
                Object.values(sess.lectures || {}).forEach(lec => {
                    if (!lec.partnerId) return;
                    (Array.isArray(lec.types) ? lec.types : []).forEach(t => {
                        PLACED[lec.partnerId] = PLACED[lec.partnerId] || {};
                        PLACED[lec.partnerId][t] = (PLACED[lec.partnerId][t] || 0) + 1;
                    });
                })));
        renderPartners();
    });
}

window.changePlacedConf = function (id) {
    PLACED_CONF_ID = id;
    try { localStorage.setItem('asls_lastConfId', id); } catch (e) { }
    subscribePlacedConf();
};

function populateGradeSelect() {
    const sel = document.getElementById('ptnGrade');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">(등급 없음)</option>' +
        BOOTH.grades.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    sel.value = cur;
}

// 선택 행사 기준 파트너 등급 (없으면 예전 마스터 등급으로 폴백)
function confGradeOf(p) {
    const cp = CONF_PARTNER_MAP[p.id];
    return (cp && cp.grade) || p.grade || '';
}

// 파트너 등급 → 혜택(숫자) 태그: "정규강의(일) 미배치 X · 배치 Y"
function benefitTags(p) {
    const grade = confGradeOf(p);
    if (!grade || !BOOTH.cells[grade]) return '';
    const cells = BOOTH.cells[grade];
    const placed = PLACED[p.id] || {};
    const tags = [];
    BOOTH.columns.forEach(col => {
        const val = cells[col];
        if (val == null || String(val).trim() === '') return;
        const n = parseInt(val, 10);
        if (!isNaN(n) && String(n) === String(val).trim()) {   // 숫자 혜택만
            const done = placed[col] || 0;
            const un = Math.max(0, n - done);
            tags.push(`<span class="benefit-tag">${escapeHtml(col)} <span class="un">미배치 ${un}</span>${done ? ` · <b>배치 ${done}</b>` : ''}</span>`);
        }
    });
    return tags.join('');
}

document.getElementById('ptnSearch').addEventListener('input', e => {
    PTN_SEARCH = e.target.value.trim().toLowerCase();
    renderPartners();
});

// 정렬 드롭다운
(function initSort() {
    const sel = document.getElementById('ptnSort');
    if (!sel) return;
    sel.innerHTML = sortOptionsHtml(PTN_SORT, '이름');
    sel.addEventListener('change', () => { PTN_SORT = sel.value; renderPartners(); });
})();

// 참가 현황별 보기 필터 — 마지막 선택 유지 (localStorage)
(function initStatusFilter() {
    const sel = document.getElementById('ptnStatusFilter');
    if (!sel) return;
    try { sel.value = localStorage.getItem('asls_ptnStatusFilter') || ''; } catch (e) { }
})();
window.onPtnStatusChange = function () {
    const sel = document.getElementById('ptnStatusFilter');
    try { localStorage.setItem('asls_ptnStatusFilter', sel ? sel.value : ''); } catch (e) { }
    renderPartners();
};

// 선택 행사 참가여부 토글 (참가 체크 시 '신청전'은 자동 해제)
window.toggleParticipation = function (id, on) {
    if (!AdminAuth.requireEdit()) { renderPartners(); return; }
    if (!PLACED_CONF_ID) { Toast.warning('먼저 행사를 선택하세요.'); renderPartners(); return; }
    const base = '/adminConferences/' + PLACED_CONF_ID;
    const updates = {};
    if (on) {
        updates['confPartners/' + id] = { order: CONF_PARTNERS.size, grade: (CONF_PARTNER_MAP[id] && CONF_PARTNER_MAP[id].grade) || '' };
        updates['prePartners/' + id] = null;   // 참가 → 신청전 해제
    } else {
        updates['confPartners/' + id] = null;
    }
    const p = PARTNERS.find(x => x.id === id);
    database.ref(base).update(updates)
        .then(() => logActivity('participate', 'partner',
            `파트너사 "${p ? p.nameKo : ''}" ${on ? '참가 추가' : '참가 해제'}`,
            { confId: PLACED_CONF_ID, confTitle: PLACED_CONF_NAME, entityId: id }))
        .catch(e => Toast.error('참가 설정 실패: ' + e.message));
};

// 선택 행사 '신청전' 토글 (신청전 지정 시 참가는 자동 해제, 다시 누르면 미참가)
window.togglePreApply = function (id) {
    if (!AdminAuth.requireEdit()) { renderPartners(); return; }
    if (!PLACED_CONF_ID) { Toast.warning('먼저 행사를 선택하세요.'); renderPartners(); return; }
    const base = '/adminConferences/' + PLACED_CONF_ID;
    const on = !PRE_PARTNERS.has(id);   // 현재 신청전이 아니면 → 신청전으로
    const updates = {};
    if (on) {
        updates['prePartners/' + id] = true;
        updates['confPartners/' + id] = null;   // 신청전 → 참가 해제
    } else {
        updates['prePartners/' + id] = null;     // 신청전 해제 → 미참가
    }
    const p = PARTNERS.find(x => x.id === id);
    database.ref(base).update(updates)
        .then(() => logActivity('participate', 'partner',
            `파트너사 "${p ? p.nameKo : ''}" ${on ? '신청전 지정' : '신청전 해제'}`,
            { confId: PLACED_CONF_ID, confTitle: PLACED_CONF_NAME, entityId: id }))
        .catch(e => Toast.error('신청전 설정 실패: ' + e.message));
};

// 선택 행사 기준 파트너 등급 저장 (행사별)
window.setPartnerGrade = function (id, grade) {
    if (!AdminAuth.requireEdit()) { renderPartners(); return; }
    if (!PLACED_CONF_ID) { Toast.warning('먼저 행사를 선택하세요.'); renderPartners(); return; }
    const p = PARTNERS.find(x => x.id === id);
    database.ref('/adminConferences/' + PLACED_CONF_ID + '/confPartners/' + id).update({ grade: grade || '' })
        .then(() => logActivity('update', 'partner', `파트너사 "${p ? p.nameKo : ''}" 등급 → ${grade || '(없음)'}`,
            { confId: PLACED_CONF_ID, confTitle: PLACED_CONF_NAME, entityId: id }))
        .catch(e => Toast.error('등급 저장 실패: ' + e.message));
};

function partnerProducts(p) { return Array.isArray(p.products) ? p.products : []; }

/* ---------- 행사별 담당자 연락처 ---------- */
function contactsOf(pid) { const c = CONF_CONTACTS[pid]; return Array.isArray(c) ? c : []; }
let CONTACT_PID = null;

window.openContactModal = function (pid) {
    if (!AdminAuth.requireEdit()) return;
    if (!PLACED_CONF_ID) { Toast.warning('먼저 행사를 선택하세요.'); return; }
    CONTACT_PID = pid;
    const p = PARTNERS.find(x => x.id === pid);
    document.getElementById('contactModalTitle').textContent = `담당자 — ${p ? (p.nameKo || p.nameEn) : ''}`;
    document.getElementById('contactConfLabel').textContent = `행사: ${PLACED_CONF_NAME} (행사별로 담당자가 다르게 저장됩니다)`;
    const rows = contactsOf(pid);
    document.getElementById('contactRows').innerHTML = '';
    if (rows.length) rows.forEach(c => addContactRow(c)); else addContactRow();
    document.getElementById('contactModal').classList.add('open');
};
window.addContactRow = function (c) {
    c = (c && typeof c === 'object') ? c : {};
    document.getElementById('contactRows').insertAdjacentHTML('beforeend', `
        <div class="contact-item">
            <input class="ct-name" placeholder="담당자 이름" value="${escapeHtml(c.name || '')}">
            <input class="ct-phone" placeholder="전화번호" value="${escapeHtml(c.phone || '')}">
            <input class="ct-email" placeholder="이메일" value="${escapeHtml(c.email || '')}">
            <button type="button" class="btn btn-sm btn-danger-ghost" title="삭제" onclick="this.closest('.contact-item').remove()">✕</button>
        </div>`);
};
window.closeContactModal = function () { document.getElementById('contactModal').classList.remove('open'); };
window.saveContacts = function () {
    if (!AdminAuth.requireEdit()) return;
    const list = [...document.querySelectorAll('#contactRows .contact-item')].map(r => ({
        name: r.querySelector('.ct-name').value.trim(),
        phone: r.querySelector('.ct-phone').value.trim(),
        email: r.querySelector('.ct-email').value.trim()
    })).filter(c => c.name || c.phone || c.email);
    const p = PARTNERS.find(x => x.id === CONTACT_PID);
    database.ref('/adminConferences/' + PLACED_CONF_ID + '/partnerContacts/' + CONTACT_PID).set(list.length ? list : null)
        .then(() => {
            logActivity('update', 'partner', `파트너사 "${p ? p.nameKo : ''}" 담당자 ${list.length}명 저장`, { confId: PLACED_CONF_ID, confTitle: PLACED_CONF_NAME, entityId: CONTACT_PID });
            Toast.success('담당자 정보를 저장했습니다.'); closeContactModal();
        })
        .catch(e => Toast.error('저장 실패: ' + e.message));
};

function renderPartners() {
    document.getElementById('ptnCount').textContent = PARTNERS.length;
    const partCountEl = document.getElementById('ptnPartCount');
    if (partCountEl) partCountEl.textContent = CONF_PARTNERS.size;
    const preCountEl = document.getElementById('ptnPreCount');
    if (preCountEl) preCountEl.textContent = PRE_PARTNERS.size;

    const q = PTN_SEARCH;
    const statusSel = document.getElementById('ptnStatusFilter');
    const statusMode = statusSel ? statusSel.value : '';
    const hasConf = !!PLACED_CONF_ID;

    let list = q
        ? PARTNERS.filter(p => [p.nameKo, p.nameEn].some(v => (v || '').toLowerCase().includes(q))
            || partnerProducts(p).some(pr => [pr.nameKo, pr.nameEn].some(v => (v || '').toLowerCase().includes(q))))
        : PARTNERS.slice();
    // 참가 현황별 보기: 전체 / 본행사 참가 / 신청전 / 미참가
    if (statusMode === 'joined') list = list.filter(p => CONF_PARTNERS.has(p.id));
    else if (statusMode === 'pre') list = list.filter(p => PRE_PARTNERS.has(p.id));
    else if (statusMode === 'none') list = list.filter(p => !CONF_PARTNERS.has(p.id) && !PRE_PARTNERS.has(p.id));
    list = sortList(list, PTN_SORT, 'nameKo');

    const body = document.getElementById('ptnBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:40px">
            ${PARTNERS.length ? '검색/필터 결과가 없습니다.' : '등록된 파트너사가 없습니다. <b>+ 파트너사 등록</b>으로 추가하세요.'}</td></tr>`;
        return;
    }
    body.innerHTML = list.map(p => {
        const prods = partnerProducts(p);
        const prodText = prods.length
            ? prods.map(pr => escapeHtml(pr.nameKo || pr.nameEn || '')).join(', ')
            : '<span class="dim">-</span>';
        const tags = benefitTags(p);
        const joined = CONF_PARTNERS.has(p.id);
        const isPre = PRE_PARTNERS.has(p.id);
        const grade = confGradeOf(p);
        const contacts = contactsOf(p.id);
        const contactCell = hasConf
            ? `<button class="btn btn-sm" onclick="openContactModal('${p.id}')">👤 ${contacts.length ? contacts.length + '명' : '추가'}</button>${contacts.length ? `<div class="dim" style="font-size:0.75rem;margin-top:3px">${escapeHtml(contacts.map(c => c.name || c.phone || c.email).filter(Boolean).join(', '))}</div>` : ''}`
            : '<span class="dim">-</span>';
        const gradeCell = joined
            ? `<select class="row-grade" onchange="setPartnerGrade('${p.id}', this.value)">
                    <option value="">(등급 없음)</option>
                    ${BOOTH.grades.map(g => `<option value="${escapeHtml(g)}" ${g === grade ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
               </select>`
            : (grade ? `<span class="grade-badge" style="opacity:.5" title="참가 후 이 행사 등급을 지정하세요">${escapeHtml(grade)}</span>` : '<span class="dim">-</span>');
        return `
        <tr class="${joined ? 'row-joined' : isPre ? 'row-pre' : ''}">
            <td>
                <div class="join-cell">
                    <button class="join-btn ${joined ? 'active' : ''}" ${hasConf ? '' : 'disabled'}
                        title="${hasConf ? '이 행사 참가 (클릭하여 토글)' : '먼저 행사를 선택하세요'}"
                        onclick="toggleParticipation('${p.id}', ${joined ? 'false' : 'true'})">참가</button>
                    <button class="pre-btn ${isPre ? 'active' : ''}" ${hasConf ? '' : 'disabled'}
                        title="참가를 망설이는 회사 — 신청전으로 표시(참가 자동 해제)"
                        onclick="togglePreApply('${p.id}')">신청전</button>
                </div>
            </td>
            <td><b>${escapeHtml(p.nameKo || '')}</b></td>
            <td class="en">${escapeHtml(p.nameEn || '-')}</td>
            <td><span class="count-pill">${prods.length}</span> <span style="color:var(--text-dim);font-size:0.82rem">${prodText}</span></td>
            <td>${gradeCell}</td>
            <td>${contactCell}</td>
            <td>${tags || '<span class="dim">-</span>'}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-sm" onclick="editPartner('${p.id}')">수정</button>
                    <button class="btn btn-sm btn-danger-ghost" onclick="deletePartner('${p.id}')">삭제</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/* ---------- 제품 입력 행 ---------- */
function productRowHtml(pr = {}) {
    return `<div class="product-item">
        <div class="product-item-head">
            <span class="product-item-title">제품</span>
            <button type="button" class="del" onclick="this.closest('.product-item').remove()" title="삭제">✕ 삭제</button>
        </div>
        <div class="modal-grid2">
            <input type="text" class="prod-ko" placeholder="제품명 (국문)" value="${escapeHtml(pr.nameKo || '')}">
            <input type="text" class="prod-en" placeholder="제품명 (영문)" value="${escapeHtml(pr.nameEn || '')}">
        </div>
        <div style="margin-top:8px">
            <select class="prod-cat">${productCategoryOptions(pr.category || '')}</select>
        </div>
        <div style="margin-top:8px">
            <input type="text" class="prod-desc" placeholder="제품 설명 (수동 입력)" value="${escapeHtml(pr.description || '')}">
        </div>
    </div>`;
}
window.addProductRow = function (pr) {
    document.getElementById('ptnProducts').insertAdjacentHTML('beforeend', productRowHtml(pr));
};
function collectProducts() {
    return [...document.querySelectorAll('#ptnProducts .product-item')].map(row => ({
        nameKo: row.querySelector('.prod-ko').value.trim(),
        nameEn: row.querySelector('.prod-en').value.trim(),
        category: row.querySelector('.prod-cat').value,
        description: row.querySelector('.prod-desc').value.trim()
    })).filter(pr => pr.nameKo || pr.nameEn);
}

/* ---------- 모달 ---------- */
window.openPartnerModal = function () {
    if (!AdminAuth.requireEdit()) return;
    PTN_EDIT_ID = null;
    document.getElementById('ptnModalTitle').textContent = '파트너사 등록';
    document.getElementById('ptnNameKo').value = '';
    document.getElementById('ptnNameEn').value = '';
    document.getElementById('ptnProducts').innerHTML = '';
    document.getElementById('ptnModal').classList.add('open');
    setTimeout(() => document.getElementById('ptnNameKo').focus(), 50);
};

window.editPartner = function (id) {
    if (!AdminAuth.requireEdit()) return;
    const p = PARTNERS.find(x => x.id === id);
    if (!p) return;
    PTN_EDIT_ID = id;
    document.getElementById('ptnModalTitle').textContent = '파트너사 수정';
    document.getElementById('ptnNameKo').value = p.nameKo || '';
    document.getElementById('ptnNameEn').value = p.nameEn || '';
    document.getElementById('ptnProducts').innerHTML = '';
    partnerProducts(p).forEach(pr => addProductRow(pr));
    document.getElementById('ptnModal').classList.add('open');
};

window.closePartnerModal = function () { document.getElementById('ptnModal').classList.remove('open'); };

window.savePartner = function () {
    if (!AdminAuth.requireEdit()) return;
    const nameKo = document.getElementById('ptnNameKo').value.trim();
    if (!nameKo) { Toast.warning('파트너사 이름(국문)을 입력하세요.'); return; }

    const dup = PARTNERS.find(p => p.id !== PTN_EDIT_ID && (p.nameKo || '').trim() === nameKo);
    if (dup) { Toast.warning('이미 등록된 파트너사입니다.'); return; }

    const data = {
        nameKo,
        nameEn: document.getElementById('ptnNameEn').value.trim(),
        products: collectProducts(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (PTN_EDIT_ID) {
        PTN_ROOT.child(PTN_EDIT_ID).update(data)
            .then(() => {
                logActivity('update', 'partner', `파트너사 "${nameKo}" 수정`, { entityId: PTN_EDIT_ID });
                Toast.success('저장되었습니다.'); closePartnerModal();
            })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        data.order = PARTNERS.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        const id = uuid();
        PTN_ROOT.child(id).set(data)
            .then(() => {
                logActivity('create', 'partner', `파트너사 "${nameKo}" 등록`, { entityId: id });
                Toast.success('파트너사가 등록되었습니다.'); closePartnerModal();
            })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
};

window.deletePartner = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const p = PARTNERS.find(x => x.id === id);
    const ok = await confirmDialog(`"${p ? p.nameKo : ''}" 파트너사를 삭제할까요?\n등록된 제품 정보도 함께 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    PTN_ROOT.child(id).remove()
        .then(() => {
            logActivity('delete', 'partner', `파트너사 "${p ? p.nameKo : ''}" 삭제`, { entityId: id });
            Toast.success('삭제되었습니다.');
        })
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

// 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호)
