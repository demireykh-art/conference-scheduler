/**
 * poster.js — 연자 홍보 포스터 생성기
 * 데이터: /adminConferences/<id>/poster = { template(dataURL), w, h, slots{label,event,name,photo} }
 * 연자 목록: confSpeakers ∪ lecturePool 연자 → Masters(/adminSpeakers)에서 사진 조회
 */

const PVW = 330;                 // 편집 미리보기 폭(px)
let CONFS = [], CONF_ID = new URLSearchParams(location.search).get('id') || '';
let CONF_RAW = null;             // 선택 행사 원본
let POSTER = null;               // { template, w, h, slots }
let TEMPLATE_IMG = null;         // 캔버스 합성용 Image
let scale = 1, SELECTED = 'event';
let GEN = [];                    // [{name, canvas}]

document.getElementById('sidebarMount').innerHTML = renderSidebar('poster');
Masters.init();

function confTitle() { return (CONF_RAW && CONF_RAW.title) || (CONFS.find(c => c.id === CONF_ID) || {}).title || '행사'; }

/* ---------- 행사 선택 ---------- */
database.ref('/adminConferences').once('value').then(snap => {
    CONFS = toOrderedArray(snap.val());
    const sel = document.getElementById('posConfSelect');
    if (!CONFS.length) { sel.innerHTML = '<option value="">등록된 행사가 없습니다</option>'; return; }
    if (!CONF_ID) { try { CONF_ID = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { } }
    if (!CONF_ID || !CONFS.find(c => c.id === CONF_ID)) CONF_ID = CONFS[0].id;
    sel.innerHTML = CONFS.map(c => `<option value="${c.id}" ${c.id === CONF_ID ? 'selected' : ''}>${escapeHtml(c.title || '(제목 없음)')}</option>`).join('');
    loadConf();
});

window.onPosConfChange = function () {
    CONF_ID = document.getElementById('posConfSelect').value;
    try { if (CONF_ID) localStorage.setItem('asls_lastConfId', CONF_ID); } catch (e) { }
    const url = new URL(location); url.searchParams.set('id', CONF_ID); history.replaceState(null, '', url);
    loadConf();
};

function loadConf() {
    TEMPLATE_IMG = null; GEN = [];
    document.getElementById('posGrid').innerHTML = '';
    document.getElementById('posCount').textContent = '';
    database.ref('/adminConferences/' + CONF_ID).once('value').then(snap => {
        CONF_RAW = snap.val() || {};
        const p = CONF_RAW.poster;
        if (p && p.template && p.w && p.h) {
            POSTER = { template: p.template, w: p.w, h: p.h, slots: Object.assign(defaultSlots(p.w, p.h), p.slots || {}) };
        } else {
            POSTER = null;
        }
        renderStage();
    });
}

/* ---------- 배경 업로드 ---------- */
document.getElementById('posTplFile').addEventListener('change', async e => {
    if (!AdminAuth.requireEdit()) { e.target.value = ''; return; }
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { Toast.warning('이미지 파일만 가능합니다.'); return; }
    try {
        const dataUrl = await compressImage(file, 1200, 0.86);
        const img = await loadImg(dataUrl);
        const w = img.naturalWidth, h = img.naturalHeight;
        POSTER = { template: dataUrl, w, h, slots: (POSTER && POSTER.slots) ? POSTER.slots : defaultSlots(w, h) };
        TEMPLATE_IMG = img;
        renderStage();
        Toast.success('배경을 올렸습니다. 사진·이름·문구 위치를 맞춘 뒤 저장하세요.');
    } catch (err) { Toast.error('이미지 처리 실패: ' + (err.message || err)); }
});

function defaultSlots(w, h) {
    const F = "Georgia, 'Nanum Myeongjo', serif", C = '#0b2a4a';
    return {
        label: { text: "I'M SPEAKING AT", x: w * 0.5, y: h * 0.58, fontPx: h * 0.026, color: C, font: F, weight: '700' },
        event: { text: '', x: w * 0.5, y: h * 0.635, fontPx: h * 0.055, color: C, font: F, weight: '700' },
        photo: { x: w * 0.39, y: h * 0.68, size: w * 0.22, ring: true, ringColor: '#ffffff' },
        name: { text: '', x: w * 0.5, y: h * 0.925, fontPx: h * 0.038, color: C, font: F, weight: '700' },
        nameEn: { text: '', x: w * 0.5, y: h * 0.965, fontPx: h * 0.026, color: C, font: F, weight: '400' }
    };
}

/* ---------- 미리보기 편집기 ---------- */
function sampleName() {
    const list = collectSpeakers();
    return (list[0] && (list[0].nameKo || list[0].nameEn)) || 'Dr. 홍길동';
}
function sampleNameEn() {
    const list = collectSpeakers();
    return (list[0] && list[0].nameEn) || 'Dr. Gil-dong Hong';
}
function slotText(key) {
    if (key === 'label') return POSTER.slots.label.text || "I'M SPEAKING AT";
    if (key === 'event') return POSTER.slots.event.text || confTitle();
    if (key === 'name') return sampleName();
    if (key === 'nameEn') return sampleNameEn();
    return '';
}

function renderStage() {
    const stage = document.getElementById('posStage');
    const empty = document.getElementById('posEmpty');
    if (!POSTER || !POSTER.template) {
        stage.style.width = ''; stage.style.height = '';
        stage.innerHTML = ''; stage.appendChild(empty); empty.style.display = '';
        document.getElementById('posCtrls').style.display = 'none';
        return;
    }
    scale = PVW / POSTER.w;
    stage.style.width = PVW + 'px';
    stage.style.height = (POSTER.h * scale) + 'px';
    stage.innerHTML =
        `<img src="${POSTER.template}" class="pe-tpl-img" draggable="false">` +
        `<div class="pe-handle pe-text" id="pe-h-label"></div>` +
        `<div class="pe-handle pe-text" id="pe-h-event"></div>` +
        `<div class="pe-handle pe-text" id="pe-h-name"></div>` +
        `<div class="pe-handle pe-text" id="pe-h-nameEn"></div>` +
        `<div class="pe-handle pe-photo" id="pe-h-photo"><span>사진</span></div>`;
    ['label', 'event', 'name', 'nameEn', 'photo'].forEach(k => {
        const el = document.getElementById('pe-h-' + k);
        styleHandle(k);
        makeDraggable(el, k);
    });
    document.getElementById('posCtrls').style.display = '';
    selectElement(SELECTED);
}

function styleHandle(key) {
    const el = document.getElementById('pe-h-' + key);
    if (!el) return;
    const s = POSTER.slots[key];
    el.style.left = (s.x * scale) + 'px';
    el.style.top = (s.y * scale) + 'px';
    if (key === 'photo') {
        el.style.width = (s.size * scale) + 'px';
        el.style.height = (s.size * scale) + 'px';
        el.style.borderColor = s.ring ? (s.ringColor || '#fff') : 'rgba(255,255,255,.7)';
    } else {
        el.style.fontSize = (s.fontPx * scale) + 'px';
        el.style.color = s.color; el.style.fontFamily = s.font; el.style.fontWeight = s.weight;
        el.textContent = slotText(key);
    }
    el.classList.toggle('sel', SELECTED === key);
}

function makeDraggable(el, key) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    el.addEventListener('pointerdown', e => {
        if (!AdminAuth.canEdit || !AdminAuth.canEdit()) { selectElement(key); return; }
        dragging = true; moved = false;
        sx = e.clientX; sy = e.clientY; ox = POSTER.slots[key].x; oy = POSTER.slots[key].y;
        el.setPointerCapture(e.pointerId); selectElement(key); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = (e.clientX - sx) / scale, dy = (e.clientY - sy) / scale;
        if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 2) moved = true;
        POSTER.slots[key].x = Math.max(0, Math.min(POSTER.w, ox + dx));
        POSTER.slots[key].y = Math.max(0, Math.min(POSTER.h, oy + dy));
        styleHandle(key);
    });
    el.addEventListener('pointerup', e => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (x) { } });
}

/* ---------- 요소 선택 & 설정 ---------- */
window.posSelectFromDropdown = function () { selectElement(document.getElementById('posSel').value); };
function selectElement(key) {
    SELECTED = key;
    document.getElementById('posSel').value = key;
    ['label', 'event', 'name', 'nameEn', 'photo'].forEach(k => { const el = document.getElementById('pe-h-' + k); if (el) el.classList.toggle('sel', k === key); });
    const isText = key !== 'photo';
    document.getElementById('posTextCtrls').style.display = isText ? '' : 'none';
    document.getElementById('posPhotoCtrls').style.display = isText ? 'none' : '';
    const s = POSTER.slots[key];
    if (isText) {
        const editable = (key === 'label' || key === 'event');
        document.getElementById('posTextRow').style.display = editable ? '' : 'none';
        if (editable) document.getElementById('posText').value = (key === 'event') ? (s.text || confTitle()) : (s.text || '');
        document.getElementById('posSize').value = (s.fontPx / POSTER.h * 100).toFixed(1);
        document.getElementById('posFont').value = s.font;
        document.getElementById('posBold').checked = (s.weight === '700' || s.weight === 'bold');
        document.getElementById('posColor').value = toHex(s.color);
    } else {
        document.getElementById('posPhotoSize').value = (s.size / POSTER.w * 100).toFixed(1);
        document.getElementById('posRing').checked = !!s.ring;
        document.getElementById('posRingColor').value = toHex(s.ringColor || '#ffffff');
    }
}
window.onPosTextEdit = function () { POSTER.slots[SELECTED].text = document.getElementById('posText').value; styleHandle(SELECTED); };
window.onPosSize = function () { POSTER.slots[SELECTED].fontPx = Number(document.getElementById('posSize').value) / 100 * POSTER.h; styleHandle(SELECTED); };
window.onPosFont = function () { POSTER.slots[SELECTED].font = document.getElementById('posFont').value; styleHandle(SELECTED); };
window.onPosBold = function () { POSTER.slots[SELECTED].weight = document.getElementById('posBold').checked ? '700' : '400'; styleHandle(SELECTED); };
window.onPosColor = function () { POSTER.slots[SELECTED].color = document.getElementById('posColor').value; styleHandle(SELECTED); };
window.onPosPhotoSize = function () { POSTER.slots.photo.size = Number(document.getElementById('posPhotoSize').value) / 100 * POSTER.w; styleHandle('photo'); };
window.onPosRing = function () { POSTER.slots.photo.ring = document.getElementById('posRing').checked; POSTER.slots.photo.ringColor = document.getElementById('posRingColor').value; styleHandle('photo'); };

function toHex(c) {
    if (!c) return '#000000';
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
    const m = c.match(/\d+/g);
    if (m && m.length >= 3) return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
    return '#0b2a4a';
}

/* ---------- 저장 ---------- */
window.savePoster = function () {
    if (!AdminAuth.requireEdit()) return;
    if (!POSTER || !POSTER.template) { Toast.warning('먼저 배경 이미지를 올려주세요.'); return; }
    database.ref('/adminConferences/' + CONF_ID + '/poster').set({
        template: POSTER.template, w: POSTER.w, h: POSTER.h, slots: POSTER.slots,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        logActivity('update', 'conference', `연자 포스터 템플릿·배치 저장`, { confId: CONF_ID, confTitle: confTitle() });
        Toast.success('저장되었습니다. 아래에서 포스터를 생성하세요.');
        generateAll();
    }).catch(e => Toast.error('저장 실패: ' + e.message));
};

/* ---------- 연자 수집 ---------- */
function collectSpeakers() {
    if (!CONF_RAW) return [];
    const map = new Map();
    const add = (id, nameKo, nameEn) => {
        const key = id || ((nameKo || '') + '|' + (nameEn || ''));
        if (!key.trim() || map.has(key)) return;
        const m = id ? Masters.speaker(id) : null;
        const nk = (m && m.nameKo) || nameKo || '';
        const ne = (m && m.nameEn) || nameEn || '';
        if (!nk && !ne) return;
        map.set(key, { id: id || '', nameKo: nk, nameEn: ne, photo: (m && m.photo) || '' });
    };
    Object.keys(CONF_RAW.confSpeakers || {}).forEach(id => add(id));
    Object.values(CONF_RAW.lecturePool || {}).forEach(lec =>
        (lec.speakers || []).forEach(s => add(s.id, s.nameKo, s.nameEn)));
    return [...map.values()].sort((a, b) => (a.nameKo || a.nameEn || '').localeCompare(b.nameKo || b.nameEn || '', 'ko'));
}

/* ---------- 합성 ---------- */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('이미지 로드 실패')); i.src = src; }); }

function drawCircle(ctx, img, x, y, size, ring, ringColor) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (img) {
        const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.max(size / iw, size / ih);
        const dw = iw * s, dh = ih * s;
        ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    } else {
        ctx.fillStyle = '#e5e8ec'; ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
    if (ring) {
        ctx.save(); ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 - size * 0.008, 0, Math.PI * 2);
        ctx.lineWidth = size * 0.02; ctx.strokeStyle = ringColor || '#fff'; ctx.stroke(); ctx.restore();
    }
}
function drawText(ctx, slot, text) {
    if (!text) return;
    ctx.save();
    ctx.font = `${slot.weight || '700'} ${slot.fontPx}px ${slot.font || 'Georgia, serif'}`;
    ctx.fillStyle = slot.color || '#0b2a4a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, slot.x, slot.y);
    ctx.restore();
}
async function drawPoster(canvas, spk) {
    if (!TEMPLATE_IMG) TEMPLATE_IMG = await loadImg(POSTER.template);
    canvas.width = POSTER.w; canvas.height = POSTER.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(TEMPLATE_IMG, 0, 0, POSTER.w, POSTER.h);
    const ph = POSTER.slots.photo;
    let img = null;
    if (spk.photo) { try { img = await loadImg(spk.photo); } catch (e) { img = null; } }
    drawCircle(ctx, img, ph.x, ph.y, ph.size, ph.ring, ph.ringColor);
    drawText(ctx, POSTER.slots.label, POSTER.slots.label.text || "I'M SPEAKING AT");
    drawText(ctx, POSTER.slots.event, POSTER.slots.event.text || confTitle());
    drawText(ctx, POSTER.slots.name, spk.nameKo || spk.nameEn);
    if (POSTER.slots.nameEn) drawText(ctx, POSTER.slots.nameEn, spk.nameEn || '');
}

/* ---------- 생성 ---------- */
window.generateAll = async function () {
    if (!POSTER || !POSTER.template) { Toast.warning('먼저 배경 이미지를 올리고 저장하세요.'); return; }
    const list = collectSpeakers();
    const grid = document.getElementById('posGrid');
    if (!list.length) { grid.innerHTML = '<div style="color:var(--text-dim);padding:24px">이 행사의 연자가 없습니다. 강의/연자 관리에서 연자를 먼저 등록하세요.</div>'; document.getElementById('posCount').textContent = ''; return; }
    grid.innerHTML = '<div style="color:var(--text-dim);padding:16px">생성 중…</div>';
    if (!TEMPLATE_IMG) { try { TEMPLATE_IMG = await loadImg(POSTER.template); } catch (e) { Toast.error('배경 로드 실패'); return; } }
    GEN = [];
    const noPhoto = [];
    grid.innerHTML = '';
    for (const spk of list) {
        const canvas = document.createElement('canvas');
        await drawPoster(canvas, spk);
        const name = spk.nameKo || spk.nameEn;
        GEN.push({ name, canvas });
        if (!spk.photo) noPhoto.push(name);
        grid.appendChild(posterCard(name, canvas, !spk.photo));
    }
    document.getElementById('posCount').innerHTML =
        `총 <b>${list.length}</b>명 생성됨` + (noPhoto.length ? ` · <span style="color:#c0392b">사진 없음 ${noPhoto.length}명</span> (연자 관리에서 CV 사진 등록 권장)` : '');
};

function posterCard(name, canvas, noPhoto) {
    const card = document.createElement('div');
    card.className = 'poster-card';
    const img = document.createElement('img');
    img.className = 'poster-thumb'; img.src = canvas.toDataURL('image/png');
    card.appendChild(img);
    const cap = document.createElement('div');
    cap.className = 'poster-cap';
    cap.innerHTML = `<b>${escapeHtml(name)}</b>${noPhoto ? '<span class="poster-nophoto">사진없음</span>' : ''}`;
    card.appendChild(cap);
    const acts = document.createElement('div');
    acts.className = 'poster-acts';
    const dl = document.createElement('button'); dl.className = 'btn btn-sm'; dl.textContent = '⬇️ 저장';
    dl.onclick = () => downloadCanvas(canvas, name);
    acts.appendChild(dl);
    if (navigator.canShare) {
        const sh = document.createElement('button'); sh.className = 'btn btn-sm'; sh.textContent = '📤 공유';
        sh.onclick = () => shareCanvas(canvas, name);
        acts.appendChild(sh);
    }
    card.appendChild(acts);
    return card;
}

function canvasToBlob(canvas) { return new Promise(res => canvas.toBlob(res, 'image/png')); }
function fileName(name) { return `${(confTitle() || '행사').replace(/[\\/:*?"<>|]/g, '_')}_${(name || '연자').replace(/[\\/:*?"<>|]/g, '_')}.png`; }

function downloadCanvas(canvas, name) {
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName(name);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}
async function shareCanvas(canvas, name) {
    try {
        const blob = await canvasToBlob(canvas);
        const file = new File([blob], fileName(name), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: confTitle(), text: `I'M SPEAKING AT ${confTitle()} — ${name}` });
        } else { downloadCanvas(canvas, name); }
    } catch (e) { if (e && e.name !== 'AbortError') Toast.error('공유 실패: ' + e.message); }
}

window.downloadAllZip = async function () {
    if (!GEN.length) { Toast.warning('먼저 생성/새로고침을 눌러 포스터를 만드세요.'); return; }
    if (typeof JSZip === 'undefined') { Toast.error('ZIP 모듈 로드 실패'); return; }
    Toast.info('ZIP 생성 중…');
    const zip = new JSZip();
    for (const g of GEN) { const blob = await canvasToBlob(g.canvas); zip.file(fileName(g.name), blob); }
    const out = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(out);
    const a = document.createElement('a'); a.href = url; a.download = `${(confTitle() || '행사').replace(/[\\/:*?"<>|]/g, '_')}_연자포스터.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    Toast.success(`${GEN.length}장 ZIP 다운로드`);
};
