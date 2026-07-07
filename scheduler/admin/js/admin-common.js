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
            { key: 'speakers', label: '연자 관리', href: 'speakers.html' },
            { key: 'partners', label: '파트너사 관리', href: 'partners.html' },
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
    }
];

window.renderSidebar = function (activeKey) {
    // '시간표' 바로가기 → 마지막에 연 행사의 시간표 (없으면 행사 목록)
    let lastConf = '';
    try { lastConf = localStorage.getItem('asls_lastConfId') || ''; } catch (e) { }
    const timetableHref = lastConf ? `timetable.html?id=${lastConf}` : 'index.html';

    const links = SIDE_MENU.map(g => {
        const items = g.items.map(it => {
            const active = it.key === activeKey ? ' active' : '';
            const href = it.key === 'timetable' ? timetableHref : (it.href || '#');
            const soon = (it.href || it.key === 'timetable') ? '' : ' data-soon="1"';
            return `<a class="side-link${active}" href="${href}"${soon}>${escapeHtml(it.label)}</a>`;
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
