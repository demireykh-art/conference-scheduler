/**
 * partners.js — 파트너사 관리 (마스터)
 * 데이터: /adminPartners/<id> = { nameKo, nameEn, products:[{nameKo,nameEn}], order }
 */

const PTN_ROOT = database.ref('/adminPartners');
let PARTNERS = [];
let PTN_EDIT_ID = null;
let PTN_SEARCH = '';
let BOOTH = { columns: [], grades: [], cells: {} };
let PLACED = {};              // { partnerId: { type: 배치수 } } — 마지막에 연 행사 기준
let PLACED_CONF_NAME = '';

document.getElementById('sidebarMount').innerHTML = renderSidebar('partners');

PTN_ROOT.on('value', snap => {
    PARTNERS = toOrderedArray(snap.val())
        .sort((a, b) => (a.nameKo || '').localeCompare(b.nameKo || '', 'ko'));
    renderPartners();
});

// 부스 등급별 혜택
database.ref('/adminBoothBenefits').on('value', snap => {
    const v = snap.val() || {};
    BOOTH = {
        columns: v.columns || DEFAULT_BOOTH_COLUMNS.slice(),
        grades: v.grades || DEFAULT_BOOTH_GRADES.slice(),
        cells: v.cells || {}
    };
    populateGradeSelect();
    renderPartners();
});

// 마지막에 연 행사 기준으로 배치된 강의 수 집계 (파트너 + 강의유형)
(function subscribePlaced() {
    let lastConf = '';
    try { lastConf = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { }
    if (!lastConf) return;
    database.ref('/adminConferences/' + lastConf).on('value', snap => {
        const conf = snap.val() || {};
        PLACED_CONF_NAME = conf.title || '';
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
})();

function populateGradeSelect() {
    const sel = document.getElementById('ptnGrade');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">(등급 없음)</option>' +
        BOOTH.grades.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    sel.value = cur;
}

// 파트너 등급 → 혜택(숫자) 태그: "정규강의(일) 미배치 X · 배치 Y"
function benefitTags(p) {
    if (!p.grade || !BOOTH.cells[p.grade]) return '';
    const cells = BOOTH.cells[p.grade];
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

function partnerProducts(p) { return Array.isArray(p.products) ? p.products : []; }

function renderPartners() {
    document.getElementById('ptnCount').textContent = PARTNERS.length;
    const q = PTN_SEARCH;
    const list = q
        ? PARTNERS.filter(p => [p.nameKo, p.nameEn].some(v => (v || '').toLowerCase().includes(q))
            || partnerProducts(p).some(pr => [pr.nameKo, pr.nameEn].some(v => (v || '').toLowerCase().includes(q))))
        : PARTNERS;

    const placedNote = document.getElementById('placedConf');
    if (placedNote) placedNote.textContent = PLACED_CONF_NAME ? `배치 기준 행사: ${PLACED_CONF_NAME}` : '';

    const body = document.getElementById('ptnBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:40px">
            ${PARTNERS.length ? '검색 결과가 없습니다.' : '등록된 파트너사가 없습니다. <b>+ 파트너사 등록</b>으로 추가하세요.'}</td></tr>`;
        return;
    }
    body.innerHTML = list.map(p => {
        const prods = partnerProducts(p);
        const prodText = prods.length
            ? prods.map(pr => escapeHtml(pr.nameKo || pr.nameEn || '')).join(', ')
            : '<span class="dim">-</span>';
        const tags = benefitTags(p);
        return `
        <tr>
            <td><b>${escapeHtml(p.nameKo || '')}</b>${p.grade ? ` <span class="grade-badge">${escapeHtml(p.grade)}</span>` : ''}</td>
            <td class="en">${escapeHtml(p.nameEn || '-')}</td>
            <td><span class="count-pill">${prods.length}</span> <span style="color:var(--text-dim);font-size:0.82rem">${prodText}</span></td>
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
    populateGradeSelect();
    document.getElementById('ptnGrade').value = '';
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
    populateGradeSelect();
    document.getElementById('ptnGrade').value = p.grade || '';
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
        grade: document.getElementById('ptnGrade').value || '',
        products: collectProducts(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (PTN_EDIT_ID) {
        PTN_ROOT.child(PTN_EDIT_ID).update(data)
            .then(() => { Toast.success('저장되었습니다.'); closePartnerModal(); })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        data.order = PARTNERS.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        PTN_ROOT.child(uuid()).set(data)
            .then(() => { Toast.success('파트너사가 등록되었습니다.'); closePartnerModal(); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
};

window.deletePartner = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const p = PARTNERS.find(x => x.id === id);
    const ok = await confirmDialog(`"${p ? p.nameKo : ''}" 파트너사를 삭제할까요?\n등록된 제품 정보도 함께 삭제됩니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    PTN_ROOT.child(id).remove()
        .then(() => Toast.success('삭제되었습니다.'))
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

// 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호)
