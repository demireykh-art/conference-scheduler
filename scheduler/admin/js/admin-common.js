/**
 * admin-common.js — 공통 유틸 (Toast / UUID / 시간계산 / 사이드바 / 이스케이프)
 * ASLS 리스트형 컨퍼런스 관리 모듈
 */

/* ------------------------------------------------------------
   Toast 알림
   ------------------------------------------------------------ */
window.Toast = {
    _c: null,
    _box() {
        if (!this._c) {
            this._c = document.createElement('div');
            this._c.id = 'toast-container';
            document.body.appendChild(this._c);
        }
        return this._c;
    },
    show(msg, type = 'info', dur = 3000) {
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        const ico = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
        el.innerHTML = `<span>${ico}</span><span>${escapeHtml(msg)}</span>`;
        this._box().appendChild(el);
        if (dur > 0) setTimeout(() => el.remove(), dur);
    },
    success(m, d) { this.show(m, 'success', d); },
    error(m, d) { this.show(m, 'error', d || 5000); },
    warning(m, d) { this.show(m, 'warning', d || 4000); },
    info(m, d) { this.show(m, 'info', d); }
};

/* ------------------------------------------------------------
   기본 유틸
   ------------------------------------------------------------ */
window.escapeHtml = function (str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// 이미지 파일 → 가로 maxW로 축소한 JPEG data URL (연자 사진 등)
window.compressImage = function (file, maxW = 800, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(c.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
        reader.readAsDataURL(file);
    });
};

// 타이핑 검색 자동완성 (공용) — input에 입력 시 listEl에 후보 표시, Enter/클릭 선택
// getItems(query) → [{label, value}], onPick(value) 호출
window.setupAutocomplete = function (input, listEl, getItems, onPick) {
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
    listEl.addEventListener('mousedown', e => { const it = e.target.closest('.ac-item'); if (!it) return; e.preventDefault(); pick(Number(it.dataset.i)); });
    input.addEventListener('blur', () => setTimeout(close, 150));
};

// 연자 원형 아바타 HTML (사진 없으면 이름 첫 글자)
window.speakerAvatar = function (s, px) {
    px = px || 28;
    if (s && s.photo) return `<img class="spk-avatar" style="width:${px}px;height:${px}px" src="${escapeHtml(s.photo)}" alt="">`;
    const ch = ((s && (s.nameKo || s.nameEn)) || '?').trim().charAt(0);
    return `<span class="spk-avatar" style="width:${px}px;height:${px}px">${escapeHtml(ch)}</span>`;
};

window.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // 폴백
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};

/* ------------------------------------------------------------
   시간 헬퍼 (HH:MM ↔ 분)
   ------------------------------------------------------------ */
window.parseTime = function (t) {
    if (!t || typeof t !== 'string' || !t.includes(':')) return 9 * 60;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};
window.formatTime = function (mins) {
    mins = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
window.formatDuration = function (mins) {
    if (mins < 60) return `${mins}분`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}시간 ${m}분` : `${h}시간`;
};

/* ------------------------------------------------------------
   정렬 헬퍼 — { id: {order, ...} } 오브젝트를 order 순 배열로
   ------------------------------------------------------------ */
window.toOrderedArray = function (obj) {
    if (!obj) return [];
    return Object.entries(obj)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

/* 정렬 헬퍼 — 이름순/역순/등록순 (목록 페이지 공용) */
window.sortList = function (arr, sort, nameKey) {
    nameKey = nameKey || 'nameKo';
    const a = arr.slice();
    const byName = (x, y) => (x[nameKey] || '').localeCompare(y[nameKey] || '', 'ko');
    switch (sort) {
        case 'nameDesc': return a.sort((x, y) => byName(y, x));
        case 'oldest': return a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
        case 'newest': return a.sort((x, y) => (y.order ?? 0) - (x.order ?? 0));
        default: return a.sort(byName);   // nameAsc
    }
};

// 정렬 드롭다운 옵션 HTML
window.sortOptionsHtml = function (cur, nameLabel) {
    nameLabel = nameLabel || '이름';
    return [
        ['nameAsc', nameLabel + '순 (가나다)'],
        ['nameDesc', nameLabel + '순 (역순)'],
        ['newest', '최신 등록순'],
        ['oldest', '오래된 등록순']
    ].map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
};

/* ------------------------------------------------------------
   변경이력(감사 로그) — 누가·언제·무엇을 했는지 append-only 기록
   데이터: /adminActivityLog/<autoKey> = { ts, uid, userName, action, entity, summary, confId?, confTitle?, entityId? }
   ------------------------------------------------------------ */
window.logActivity = function (action, entity, summary, extra) {
    try {
        const u = (window.AdminAuth && AdminAuth.user) || null;
        if (!u) return;   // 로그인 상태에서만 기록
        const entry = {
            ts: firebase.database.ServerValue.TIMESTAMP,
            uid: u.uid,
            userName: u.displayName || u.email || '',
            action: action || 'update',
            entity: entity || '',
            summary: summary || ''
        };
        if (extra && typeof extra === 'object') {
            ['confId', 'confTitle', 'entityId'].forEach(k => { if (extra[k]) entry[k] = extra[k]; });
        }
        database.ref('/adminActivityLog').push(entry).catch(() => { });
    } catch (e) { /* 로깅 실패는 무시 (본 작업에 영향 없음) */ }
};

/* 정렬 헬퍼 — 이름순/역순/등록순 (목록 페이지 공용) */
window.sortList = function (arr, sort, nameKey) {
    nameKey = nameKey || 'nameKo';
    const a = arr.slice();
    const byName = (x, y) => (x[nameKey] || '').localeCompare(y[nameKey] || '', 'ko');
    switch (sort) {
        case 'nameDesc': return a.sort((x, y) => byName(y, x));
        case 'oldest': return a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
        case 'newest': return a.sort((x, y) => (y.order ?? 0) - (x.order ?? 0));
        default: return a.sort(byName);   // nameAsc
    }
};

// 정렬 드롭다운 옵션 HTML
window.sortOptionsHtml = function (cur, nameLabel) {
    nameLabel = nameLabel || '이름';
    return [
        ['nameAsc', nameLabel + '순 (가나다)'],
        ['nameDesc', nameLabel + '순 (역순)'],
        ['newest', '최신 등록순'],
        ['oldest', '오래된 등록순']
    ].map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
};

/* ------------------------------------------------------------
   룸 시간 자동 계산
   sessions/lectures를 order 순으로 정렬하고 시작·종료 시각을 누적 계산
   반환: [{ id, name, order, _start, _end, _count, _total, lectures:[{...,_start,_end}] }]
   ------------------------------------------------------------ */
window.computeRoom = function (room) {
    const base = parseTime(room && room.startTime ? room.startTime : '09:00');
    let cursor = base;
    const sessions = toOrderedArray(room && room.sessions);
    return sessions.map(session => {
        const lectures = toOrderedArray(session.lectures);
        const sStart = cursor;
        const computedLectures = lectures.map(lec => {
            const s = cursor;
            const dur = Number(lec.duration) || 0;
            cursor += dur;
            return { ...lec, _start: s, _end: cursor };
        });
        return {
            ...session,
            lectures: computedLectures,
            _start: sStart,
            _end: cursor,
            _count: computedLectures.length,
            _total: cursor - sStart
        };
    });
};

/* ------------------------------------------------------------
   행사 상태 계산 (예정 / 진행 / 종료)
   ------------------------------------------------------------ */
window.confStatus = function (conf) {
    const today = new Date().toISOString().slice(0, 10);
    const s = conf.startDate, e = conf.endDate || conf.startDate;
    if (!s) return { key: 'upcoming', label: '예정' };
    if (today < s) return { key: 'upcoming', label: '예정' };
    if (today > e) return { key: 'ended', label: '종료' };
    return { key: 'ongoing', label: '진행중' };
};

window.fmtDateRange = function (s, e) {
    if (!s) return '-';
    if (!e || e === s) return s;
    return `${s} ~ ${e}`;
};

/* ------------------------------------------------------------
   확인 다이얼로그 (Promise<boolean>)
   ------------------------------------------------------------ */
window.confirmDialog = function (message, { danger = false, okText = '확인' } = {}) {
    return new Promise(resolve => {
        const ov = document.createElement('div');
        ov.className = 'modal-overlay open';
        ov.innerHTML = `
            <div class="modal" style="max-width:360px">
                <h3>확인</h3>
                <p style="margin:0 0 4px;color:var(--text-dim);font-size:0.9rem;line-height:1.5">${escapeHtml(message)}</p>
                <div class="modal-actions">
                    <button class="btn" data-no>취소</button>
                    <button class="btn ${danger ? 'btn-primary' : 'btn-primary'}" data-yes
                        ${danger ? 'style="background:var(--danger);border-color:var(--danger)"' : ''}>${escapeHtml(okText)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        const close = v => { ov.remove(); resolve(v); };
        ov.querySelector('[data-no]').onclick = () => close(false);
        ov.querySelector('[data-yes]').onclick = () => close(true);
        ov.onclick = e => { if (e.target === ov) close(false); };
    });
};

/* ------------------------------------------------------------
   사이드바 렌더 (모든 admin 페이지 공통)
   activeKey: 현재 활성 메뉴 키
   ------------------------------------------------------------ */
const SIDE_MENU = [
    {
        group: '학술대회 · 행사', items: [
            { key: 'timetable', label: '🗓️ 시간표' },
            { key: 'lectures', label: '강의 관리', href: 'lectures.html' },
            { key: 'speakers', label: '전체 연자 리스트', href: 'speakers.html' },
            { key: 'partners', label: '행사별 참여사 관리', href: 'partners.html' },
            { key: 'booth', label: '부스 등급별 혜택', href: 'booth-benefits.html' },
            { key: 'sponsor', label: '스폰서 강의 점검', href: 'sponsor-roster.html' },
            { key: 'poster', label: '연자 포스터 생성', href: 'poster.html' },
            { key: 'aslsweek', label: 'ASLS Week 관리', href: 'asls-week.html' },
            { key: 'registrants', label: '등록자 관리' },
            { key: 'foreign', label: '외국인 등록자 관리' },
            { key: 'abstracts', label: '초록/간행물 관리' }
        ]
    },
    {
        group: '카카오 · 알림', items: [
            { key: 'kakao', label: '카카오 알림톡 관리' },
            { key: 'templates', label: '브랜드 메시지 템플릿 관리' },
            { key: 'kakao-join', label: '가입·학술대회 카카오 알림' }
        ]
    },
    {
        group: '사이트', items: [
            { key: 'popup', label: '팝업 관리' },
            { key: 'greeting', label: '인사말 관리' },
            { key: 'rules', label: '회칙 관리' },
            { key: 'office', label: '사무국 안내' },
            { key: 'board', label: '게시판 통합 관리' }
        ]
    },
    {
        group: '관리', items: [
            { key: 'activity', label: '🕘 변경이력', href: 'activity.html' },
            { key: 'users', label: '👥 사용자 관리', href: 'users.html' }
        ]
    }
];

window.renderSidebar = function (activeKey) {
    // '시간표' 바로가기 → 마지막에 연 행사의 시간표 (없으면 행사 목록)
    let lastConf = '';
    try { lastConf = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { }
    const timetableHref = lastConf ? `timetable.html?id=${lastConf}` : 'timetable.html';

    const links = SIDE_MENU.map(g => {
        // 아직 개발 전(href 없는) 항목은 숨김 — 나중에 href 연결 시 다시 표시됨
        const visible = g.items.filter(it => it.href || it.key === 'timetable');
        if (!visible.length) return '';   // 항목이 전부 숨겨진 그룹(카카오·알림, 사이트)은 제목도 숨김
        const items = visible.map(it => {
            const active = it.key === activeKey ? ' active' : '';
            const href = it.key === 'timetable' ? timetableHref : it.href;
            return `<a class="side-link${active}" href="${href}">${escapeHtml(it.label)}</a>`;
        }).join('');
        return `<div class="side-group-label">${escapeHtml(g.group)}</div>${items}`;
    }).join('');

    return `
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <span>ASLS 행사 관리</span>
                <span class="collapse-icon" onclick="document.getElementById('sidebar').classList.remove('open')">‹</span>
            </div>
            <a class="sidebar-home${activeKey === 'events' ? ' active' : ''}" href="index.html">🗓️ 행사 개설/관리</a>
            ${links}
            <div class="sidebar-footer" id="sideLogout">로그아웃</div>
        </aside>`;
};

/* ------------------------------------------------------------
   제품 분류 (하드코딩) — 파트너사 제품 등록/강의에서 공용
   ------------------------------------------------------------ */
window.PRODUCT_CATEGORIES = [
    'Energy-Based & Aesthetic Devices',
    'Injectables & Threads',
    'Regeneratives & Bio',
    'Cosmeceuticals & Consumables',
    'Digital, AI & Management',
    'Clinical & Academic',
    'Others'
];

// 부스 등급별 혜택 — 기본 컬럼/등급/셀 (부스 표 시드 + 파트너사 등급/유형 연동)
window.DEFAULT_BOOTH_COLUMNS = ['정규강의(일,20분)', '정규강의(일,15분)', '일반강의(토)', '일반강의(일)', '정규룸 런천', '일반룸 런천', '오픈렉처'];
window.DEFAULT_BOOTH_GRADES = ['얼티밋', '엘리트', '다이아몬드', '에메랄드', '플래티넘', '골드', '클래식', '베이직'];
window.DEFAULT_BOOTH_CELLS = {
    '얼티밋': { '정규강의(일,20분)': '별도 협의', '정규강의(일,15분)': '별도 협의', '일반강의(토)': '별도 협의', '일반강의(일)': '별도 협의', '정규룸 런천': '별도 협의', '일반룸 런천': '별도 협의', '오픈렉처': '별도 협의' },
    '엘리트': { '정규강의(일,20분)': '4', '정규강의(일,15분)': '4', '정규룸 런천': '1', '오픈렉처': '1' },
    '다이아몬드': { '정규강의(일,20분)': '3', '정규강의(일,15분)': '3', '일반강의(일)': '1', '오픈렉처': '1' },
    '에메랄드': { '정규강의(일,20분)': '3', '정규강의(일,15분)': '3', '일반강의(토)': '1', '오픈렉처': '1' },
    '플래티넘': { '정규강의(일,20분)': '2', '정규강의(일,15분)': '2', '일반강의(토)': '1', '오픈렉처': '1' },
    '골드': { '정규강의(일,20분)': '1', '정규강의(일,15분)': '1', '일반강의(토)': '신청가능(유료)', '오픈렉처': '신청가능(유료)' },
    '클래식': { '오픈렉처': '신청가능(유료)' },
    '베이직': { '오픈렉처': '신청가능(유료)' }
};

// 강의 유형 (체크박스, 태그처럼 표시) — 부스 혜택 컬럼과 동일하게 맞춰 연동
window.LECTURE_TYPES = window.DEFAULT_BOOTH_COLUMNS.slice();

window.productCategoryOptions = function (selected) {
    return '<option value="">-- 제품분류 선택 --</option>' +
        PRODUCT_CATEGORIES.map(c =>
            `<option value="${escapeHtml(c)}"${c === selected ? ' selected' : ''}>${escapeHtml(c)}</option>`
        ).join('');
};

// 아직 구현 안 된 메뉴 클릭 시 안내
document.addEventListener('click', function (e) {
    const soon = e.target.closest('[data-soon="1"]');
    if (soon) {
        e.preventDefault();
        Toast.info('이 메뉴는 준비 중입니다. (현재 범위: 행사 개설/관리 · 시간표)');
    }
});

console.log('✅ admin-common.js 로드 완료');
