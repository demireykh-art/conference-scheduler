/**
 * lectures.js — 강의 관리 (행사별 강의 풀)
 * 데이터: /adminConferences/<confId>/lecturePool/<id>
 * 필드: titleKo, titleEn, duration, categories[], tags[], speakers[{...}],
 *       partnerId, partnerKo, partnerEn, productKo, productEn, productCategory, productDesc
 */

let CONFS = [];
let CONF_ID = new URLSearchParams(location.search).get('id') || '';
let CONF_ROOMS = null;      // 배치 여부 판단용
let POOL = [];
let LEC_EDIT_ID = null;
let catDraft = [], tagDraft = [], spkDraft = [];

const adminConfRef = () => database.ref('/adminConferences/' + CONF_ID);

document.getElementById('sidebarMount').innerHTML = renderSidebar('lectures');
Masters.init();

// 분류 필터 옵션
document.getElementById('catFilter').innerHTML =
    '<option value="">전체 분류</option>' + PRODUCT_CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

document.getElementById('lecSearch').addEventListener('input', renderPool);

// 행사 목록 로드 → 셀렉트 (1회 로드; 풀은 별도 구독)
database.ref('/adminConferences').once('value').then(snap => {
    CONFS = toOrderedArray(snap.val());
    const sel = document.getElementById('confSelect');
    if (!CONFS.length) {
        sel.innerHTML = '<option value="">등록된 행사가 없습니다</option>';
        document.getElementById('poolArea').style.display = 'none';
        return;
    }
    if (!CONF_ID || !CONFS.find(c => c.id === CONF_ID)) CONF_ID = CONFS[0].id;
    sel.innerHTML = CONFS.map(c => `<option value="${c.id}" ${c.id === CONF_ID ? 'selected' : ''}>${escapeHtml(c.title || '(제목 없음)')}</option>`).join('');
    subscribeConf();
});

window.onConfChange = function () {
    CONF_ID = document.getElementById('confSelect').value;
    const url = new URL(location);
    url.searchParams.set('id', CONF_ID);
    history.replaceState(null, '', url);
    subscribeConf();
};

let _poolSub = null, _roomsSub = null;
function subscribeConf() {
    try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
    document.getElementById('poolArea').style.display = '';
    if (_poolSub) _poolSub.off();
    if (_roomsSub) _roomsSub.off();
    _poolSub = adminConfRef().child('lecturePool');
    _poolSub.on('value', snap => { POOL = toOrderedArray(snap.val()); renderPool(); });
    _roomsSub = adminConfRef().child('rooms');
    _roomsSub.on('value', snap => { CONF_ROOMS = snap.val() || {}; renderPool(); });
}

// 시간표에 배치된 풀 강의 id 집합
function placedLectureIds() {
    const ids = new Set();
    if (!CONF_ROOMS) return ids;
    Object.values(CONF_ROOMS).forEach(room => {
        Object.values(room.sessions || {}).forEach(session => {
            Object.values(session.lectures || {}).forEach(lec => {
                if (lec.lectureId) ids.add(lec.lectureId);
            });
        });
    });
    return ids;
}

/* ---------- 목록 렌더 ---------- */
function renderPool() {
    const placed = placedLectureIds();
    const q = document.getElementById('lecSearch').value.trim().toLowerCase();
    const cat = document.getElementById('catFilter').value;

    let list = POOL.slice().sort((a, b) => (a.titleKo || '').localeCompare(b.titleKo || '', 'ko'));
    if (cat) list = list.filter(l => (l.categories || []).includes(cat));
    if (q) list = list.filter(l => {
        const hay = [l.titleKo, l.titleEn, ...(l.tags || []), ...(l.categories || []),
        ...((l.speakers || []).map(s => s.nameKo + ' ' + s.nameEn)), l.partnerKo, l.productKo]
            .join(' ').toLowerCase();
        return hay.includes(q);
    });

    document.getElementById('lecCount').textContent = POOL.length;
    document.getElementById('unplacedCount').textContent = POOL.filter(l => !placed.has(l.id)).length;

    const body = document.getElementById('poolBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:40px">
            ${POOL.length ? '검색/필터 결과가 없습니다.' : '등록된 강의가 없습니다. <b>+ 강의 등록</b>으로 추가하세요.'}</td></tr>`;
        return;
    }
    body.innerHTML = list.map(l => {
        const cats = (l.categories || []).map(c => `<span class="chip cat">${escapeHtml(c)}</span>`).join('');
        const tags = (l.tags || []).map(t => `<span class="chip tag">${escapeHtml(t)}</span>`).join('');
        const spk = (l.speakers || []).map(s => escapeHtml(s.nameKo || s.nameEn)).join(', ') || '<span class="dim">-</span>';
        const pp = [l.partnerKo, l.productKo].filter(Boolean).map(escapeHtml).join(' · ') || '<span class="dim">-</span>';
        const isPlaced = placed.has(l.id);
        return `
        <tr>
            <td><b>${escapeHtml(l.titleKo || '(제목 없음)')}</b>${l.titleEn ? `<div class="dim" style="font-size:0.8rem">${escapeHtml(l.titleEn)}</div>` : ''}</td>
            <td><div class="chips" style="margin:0">${cats || ''}${tags || ''}</div></td>
            <td>${spk}</td>
            <td class="dim" style="font-size:0.82rem">${pp}</td>
            <td style="text-align:center">${l.duration || 0}분</td>
            <td style="text-align:center">${isPlaced ? '<span class="badge badge-ended">배치됨</span>' : '<span class="badge badge-upcoming">미배치</span>'}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-sm" onclick="editLecture('${l.id}')">수정</button>
                    <button class="btn btn-sm btn-danger-ghost" onclick="deleteLecture('${l.id}')">삭제</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/* ---------- 분류 셀렉트 + 힌트 ---------- */
let partnerDraft = null;  // 선택된 파트너사 {id,nameKo,nameEn}

function populateMasterSelects() {
    document.getElementById('lecCatSelect').innerHTML = productCategoryOptions('').replace('제품분류 선택', '분류 선택');
    document.getElementById('lecSpeakerHint').innerHTML = Masters.speakers.length ? '' :
        `<div class="master-empty-hint">등록된 연자가 없습니다. <a href="speakers.html" target="_blank">연자 관리</a>에서 먼저 등록하세요.</div>`;
    document.getElementById('lecPartnerHint').innerHTML = Masters.partners.length ? '' :
        `<div class="master-empty-hint">등록된 파트너사가 없습니다. <a href="partners.html" target="_blank">파트너사 관리</a>에서 먼저 등록하세요.</div>`;
}
document.addEventListener('masters-change', () => {
    if (document.getElementById('lectureModal').classList.contains('open')) populateMasterSelects();
});

/* ---------- 타이핑 검색 자동완성 ---------- */
function setupAutocomplete(input, listEl, getItems, onPick) {
    let items = [], active = -1;
    const close = () => { listEl.classList.remove('open'); listEl.innerHTML = ''; active = -1; items = []; };
    const highlight = () => [...listEl.children].forEach((c, i) => c.classList.toggle('active', i === active));
    const render = () => {
        items = getItems(input.value.trim()).slice(0, 8);
        if (!items.length) { listEl.innerHTML = '<div class="ac-empty">일치하는 항목이 없습니다.</div>'; listEl.classList.add('open'); active = -1; return; }
        active = 0;
        listEl.innerHTML = items.map((it, i) => `<div class="ac-item ${i === 0 ? 'active' : ''}" data-i="${i}">${it.label}</div>`).join('');
        listEl.classList.add('open');
    };
    const pick = i => { if (items[i]) { onPick(items[i].value); input.value = ''; close(); } };
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', e => {
        if (!listEl.classList.contains('open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); highlight(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); highlight(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); }
        else if (e.key === 'Escape') { close(); }
    });
    listEl.addEventListener('mousedown', e => {
        const it = e.target.closest('.ac-item'); if (!it) return;
        e.preventDefault(); pick(Number(it.dataset.i));
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
}

function addSpeakerToDraft(s) {
    if (spkDraft.find(x => x.id === s.id && s.id)) { Toast.info('이미 추가된 연자입니다.'); return; }
    if (spkDraft.find(x => (x.nameKo || '') === (s.nameKo || '') && x.nameKo)) { Toast.info('이미 추가된 연자입니다.'); return; }
    spkDraft.push({ id: s.id || '', nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: s.affiliationKo || '', affiliationEn: s.affiliationEn || '' });
    renderSpeakerChips();
}

setupAutocomplete(
    document.getElementById('lecSpeakerInput'),
    document.getElementById('lecSpeakerAc'),
    q => {
        const ql = q.toLowerCase();
        const items = Masters.speakers
            .filter(s => [s.nameKo, s.nameEn, s.affiliationKo, s.affiliationEn].join(' ').toLowerCase().includes(ql))
            .map(s => ({ label: `${escapeHtml(s.nameKo || '')} <span class="sub">${escapeHtml(s.nameEn || '')}${s.affiliationKo ? ' · ' + escapeHtml(s.affiliationKo) : ''}</span>`, value: { type: 'existing', s } }));
        const exact = Masters.speakers.some(s => (s.nameKo || '').toLowerCase() === ql || (s.nameEn || '').toLowerCase() === ql);
        if (q && !exact) items.push({ label: `➕ "<b>${escapeHtml(q)}</b>" 새 연자로 등록`, value: { type: 'new', name: q } });
        return items;
    },
    async val => {
        if (val.type === 'existing') { addSpeakerToDraft(val.s); return; }
        const name = (val.name || '').trim();
        if (!name) return;
        const ok = await confirmDialog(`"${name}" 연자가 목록에 없습니다.\n새 연자로 등록할까요? (연자 관리 목록에도 추가됩니다)`, { okText: '등록' });
        if (!ok) return;
        const id = uuid();
        const sdata = { nameKo: name, nameEn: '', affiliationKo: '', affiliationEn: '', order: Masters.speakers.length, createdAt: firebase.database.ServerValue.TIMESTAMP };
        database.ref('/adminSpeakers/' + id).set(sdata)
            .then(() => { addSpeakerToDraft({ id, ...sdata }); Toast.success(`"${name}" 연자를 등록했습니다. (연자 관리에서 소속·영문명 보완 가능)`); })
            .catch(e => Toast.error('연자 등록 실패: ' + e.message));
    }
);
function setPartner(p) {
    partnerDraft = { id: p.id, nameKo: p.nameKo || '', nameEn: p.nameEn || '' };
    renderPartnerChosen();
    loadProducts(Masters.partner(p.id));
}
setupAutocomplete(
    document.getElementById('lecPartnerInput'),
    document.getElementById('lecPartnerAc'),
    q => {
        const ql = q.toLowerCase();
        const items = Masters.partners
            .filter(p => [p.nameKo, p.nameEn].join(' ').toLowerCase().includes(ql))
            .map(p => ({ label: `${escapeHtml(p.nameKo || '')} <span class="sub">${escapeHtml(p.nameEn || '')}</span>`, value: { type: 'existing', p } }));
        const exact = Masters.partners.some(p => (p.nameKo || '').toLowerCase() === ql || (p.nameEn || '').toLowerCase() === ql);
        if (q && !exact) items.push({ label: `➕ "<b>${escapeHtml(q)}</b>" 새 파트너사로 등록`, value: { type: 'new', name: q } });
        return items;
    },
    async val => {
        if (val.type === 'existing') { setPartner(val.p); return; }
        const name = (val.name || '').trim();
        if (!name) return;
        const ok = await confirmDialog(`"${name}" 파트너사가 목록에 없습니다.\n새 파트너사로 등록할까요? (파트너사 관리 목록에도 추가되며, 제품은 거기서 추가)`, { okText: '등록' });
        if (!ok) return;
        const id = uuid();
        const pdata = { nameKo: name, nameEn: '', products: [], order: Masters.partners.length, createdAt: firebase.database.ServerValue.TIMESTAMP };
        database.ref('/adminPartners/' + id).set(pdata)
            .then(() => { setPartner({ id, ...pdata }); Toast.success(`"${name}" 파트너사를 등록했습니다. (파트너사 관리에서 제품 추가 가능)`); })
            .catch(e => Toast.error('파트너사 등록 실패: ' + e.message));
    }
);

function loadProducts(partner) {
    const products = (partner && Array.isArray(partner.products)) ? partner.products : [];
    const sel = document.getElementById('lecProductSelect');
    sel.innerHTML = '<option value="">-- 제품 선택 --</option>' +
        products.map((pr, i) => `<option value="${i}">${escapeHtml(pr.nameKo || pr.nameEn || '')}</option>`).join('');
    sel.disabled = !products.length;
}
function renderPartnerChosen() {
    document.getElementById('lecPartnerChosen').innerHTML = partnerDraft
        ? `<span class="chip">${escapeHtml(partnerDraft.nameKo || partnerDraft.nameEn)}<span class="x" onclick="clearPartner()">×</span></span>` : '';
}
window.clearPartner = function () { partnerDraft = null; renderPartnerChosen(); loadProducts(null); };

/* ---------- 분류/태그/연자 칩 ---------- */
window.addCategory = function () {
    const v = document.getElementById('lecCatSelect').value;
    if (!v) return;
    if (!catDraft.includes(v)) { catDraft.push(v); renderCatChips(); }
    document.getElementById('lecCatSelect').value = '';
};
function renderCatChips() {
    document.getElementById('lecCatChips').innerHTML = catDraft.map((c, i) =>
        `<span class="chip cat">${escapeHtml(c)}<span class="x" onclick="removeCategory(${i})">×</span></span>`).join('');
}
window.removeCategory = function (i) { catDraft.splice(i, 1); renderCatChips(); };

document.getElementById('lecTagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v && !tagDraft.includes(v)) { tagDraft.push(v); renderTagChips(); }
        e.target.value = '';
    }
});
function renderTagChips() {
    document.getElementById('lecTagChips').innerHTML = tagDraft.map((t, i) =>
        `<span class="chip tag">${escapeHtml(t)}<span class="x" onclick="removeTag(${i})">×</span></span>`).join('');
}
window.removeTag = function (i) { tagDraft.splice(i, 1); renderTagChips(); };

function renderSpeakerChips() {
    document.getElementById('lecSpeakerChips').innerHTML = spkDraft.map((s, i) =>
        `<span class="chip">${escapeHtml(s.nameKo || s.nameEn)}<span class="x" onclick="removeSpeaker(${i})">×</span></span>`).join('');
}
window.removeSpeaker = function (i) { spkDraft.splice(i, 1); renderSpeakerChips(); };

/* ---------- 등록/수정 모달 ---------- */
window.openLectureModal = function () {
    if (!AdminAuth.requireEdit()) return;
    if (!CONF_ID) { Toast.warning('먼저 행사를 선택하세요.'); return; }
    LEC_EDIT_ID = null;
    document.getElementById('lecModalTitle').textContent = '강의 등록';
    populateMasterSelects();
    document.getElementById('lecTitleKo').value = '';
    document.getElementById('lecTitleEn').value = '';
    document.getElementById('lecDuration').value = 20;
    catDraft = []; tagDraft = []; spkDraft = []; partnerDraft = null;
    renderCatChips(); renderTagChips(); renderSpeakerChips(); renderPartnerChosen();
    loadProducts(null);
    document.getElementById('lecTagInput').value = '';
    document.getElementById('lecSpeakerInput').value = '';
    document.getElementById('lecPartnerInput').value = '';
    document.getElementById('lectureModal').classList.add('open');
    setTimeout(() => document.getElementById('lecTitleKo').focus(), 50);
};

window.editLecture = function (id) {
    if (!AdminAuth.requireEdit()) return;
    const l = POOL.find(x => x.id === id);
    if (!l) return;
    LEC_EDIT_ID = id;
    document.getElementById('lecModalTitle').textContent = '강의 수정';
    populateMasterSelects();
    document.getElementById('lecTitleKo').value = l.titleKo || '';
    document.getElementById('lecTitleEn').value = l.titleEn || '';
    document.getElementById('lecDuration').value = l.duration ?? 20;
    catDraft = [...(l.categories || [])];
    tagDraft = [...(l.tags || [])];
    spkDraft = (l.speakers || []).map(s => ({ ...s }));
    partnerDraft = l.partnerId ? { id: l.partnerId, nameKo: l.partnerKo || '', nameEn: l.partnerEn || '' } : null;
    renderCatChips(); renderTagChips(); renderSpeakerChips(); renderPartnerChosen();
    const p = l.partnerId ? Masters.partner(l.partnerId) : null;
    loadProducts(p);
    if (p && Array.isArray(p.products) && (l.productKo || l.productEn)) {
        const idx = p.products.findIndex(pr => (pr.nameKo || '') === (l.productKo || '') && (pr.nameEn || '') === (l.productEn || ''));
        if (idx >= 0) document.getElementById('lecProductSelect').value = String(idx);
    }
    document.getElementById('lecTagInput').value = '';
    document.getElementById('lecSpeakerInput').value = '';
    document.getElementById('lecPartnerInput').value = '';
    document.getElementById('lectureModal').classList.add('open');
};

window.closeLectureModal = function () { document.getElementById('lectureModal').classList.remove('open'); };

function buildLectureData() {
    const pid = partnerDraft ? partnerDraft.id : '';
    const partner = pid ? Masters.partner(pid) : null;
    let productKo = '', productEn = '', productCategory = '', productDesc = '';
    if (partner) {
        const idx = document.getElementById('lecProductSelect').value;
        const products = Array.isArray(partner.products) ? partner.products : [];
        if (idx !== '' && products[Number(idx)]) {
            const pr = products[Number(idx)];
            productKo = pr.nameKo || ''; productEn = pr.nameEn || '';
            productCategory = pr.category || ''; productDesc = pr.description || '';
        }
    }
    // 입력 중이던 태그 반영
    const pendingTag = document.getElementById('lecTagInput').value.trim();
    if (pendingTag && !tagDraft.includes(pendingTag)) tagDraft.push(pendingTag);

    return {
        titleKo: document.getElementById('lecTitleKo').value.trim(),
        titleEn: document.getElementById('lecTitleEn').value.trim(),
        duration: Number(document.getElementById('lecDuration').value) || 0,
        categories: [...catDraft],
        tags: [...tagDraft],
        speakers: spkDraft.map(s => ({ id: s.id || '', nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: s.affiliationKo || '', affiliationEn: s.affiliationEn || '' })),
        partnerId: pid || '',
        partnerKo: partner ? (partner.nameKo || '') : (partnerDraft ? partnerDraft.nameKo : ''),
        partnerEn: partner ? (partner.nameEn || '') : (partnerDraft ? partnerDraft.nameEn : ''),
        productKo, productEn, productCategory, productDesc
    };
}

window.saveLecture = function () {
    if (!AdminAuth.requireEdit()) return;
    const data = buildLectureData();
    if (!data.titleKo) { Toast.warning('강의 제목(국문)을 입력하세요.'); return; }
    data.updatedAt = firebase.database.ServerValue.TIMESTAMP;

    if (LEC_EDIT_ID) {
        adminConfRef().child('lecturePool/' + LEC_EDIT_ID).update(data)
            .then(() => { propagateToPlacements(LEC_EDIT_ID, data); Toast.success('저장되었습니다.'); closeLectureModal(); })
            .catch(e => Toast.error('저장 실패: ' + e.message));
    } else {
        data.order = POOL.length;
        data.createdAt = firebase.database.ServerValue.TIMESTAMP;
        adminConfRef().child('lecturePool/' + uuid()).set(data)
            .then(() => { Toast.success('강의가 등록되었습니다.'); closeLectureModal(); })
            .catch(e => Toast.error('등록 실패: ' + e.message));
    }
};

// 풀 강의 수정 시, 시간표에 배치된 사본도 갱신 (order/lectureId 유지)
function propagateToPlacements(lectureId, data) {
    if (!CONF_ROOMS) return;
    const updates = {};
    Object.entries(CONF_ROOMS).forEach(([rid, room]) => {
        Object.entries(room.sessions || {}).forEach(([sid, session]) => {
            Object.entries(session.lectures || {}).forEach(([lid, lec]) => {
                if (lec.lectureId === lectureId) {
                    Object.entries(data).forEach(([k, v]) => {
                        if (k === 'createdAt' || k === 'order') return;
                        updates[`rooms/${rid}/sessions/${sid}/lectures/${lid}/${k}`] = v;
                    });
                }
            });
        });
    });
    if (Object.keys(updates).length) adminConfRef().update(updates);
}

window.deleteLecture = async function (id) {
    if (!AdminAuth.requireEdit()) return;
    const l = POOL.find(x => x.id === id);
    const placed = placedLectureIds().has(id);
    const msg = placed
        ? `"${l ? l.titleKo : ''}" 강의를 풀에서 삭제할까요?\n(시간표에 이미 배치된 사본은 그대로 남습니다.)`
        : `"${l ? l.titleKo : ''}" 강의를 삭제할까요?`;
    const ok = await confirmDialog(msg, { danger: true, okText: '삭제' });
    if (!ok) return;
    adminConfRef().child('lecturePool/' + id).remove()
        .then(() => Toast.success('삭제되었습니다.'))
        .catch(e => Toast.error('삭제 실패: ' + e.message));
};

// 배경 클릭으로는 닫지 않음 — 닫기/취소 버튼으로만 닫힘 (입력 보호)
