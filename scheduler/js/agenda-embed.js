/**
 * agenda-embed.js — 공개(읽기전용) 학술대회 시간표 — 외부 사이트 임베드용
 * URL: agenda.html?id=<confId>[&lang=ko|en][&date=YYYY-MM-DD]
 * 데이터: /adminConferences/<id> (공개 읽기) — 내부 데이터(변경이력·설문·연락처 등)는 렌더하지 않음.
 * 로그인 불필요. 실시간 반영(.on). 부모창으로 높이(postMessage) 전송 → iframe 자동 크기.
 */
(function () {
    const params = new URLSearchParams(location.search);
    const CONF_ID = params.get('id') || '';
    let LANG = params.get('lang') || 'auto';     // 'auto' | 'ko' | 'en'
    let DATE = params.get('date') || '';          // 특정 날짜만
    let CONF = null;

    const $ = id => document.getElementById(id);
    const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ---------- 시간/정렬 헬퍼 ---------- */
    function parseTime(t) { if (!t || typeof t !== 'string' || !t.includes(':')) return 9 * 60; const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); }
    function fmt(mins) { mins = ((mins % 1440) + 1440) % 1440; const h = Math.floor(mins / 60), m = mins % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
    function toArr(obj) { if (!obj) return []; return Object.entries(obj).map(([id, v]) => Object.assign({ id }, v)).sort((a, b) => (a.order == null ? 0 : a.order) - (b.order == null ? 0 : b.order)); }

    /* ---------- 언어 ---------- */
    function roomLang(room) { return room && room.lang === 'en' ? 'en' : 'ko'; }
    function effLang(room, session) {
        if (LANG === 'ko' || LANG === 'en') return LANG;          // 전체 토글이 켜져 있으면 우선
        if (session && session.langExcluded) return session.lang === 'en' ? 'en' : 'ko';
        return roomLang(room);
    }
    function pick(lang, ko, en) { ko = ko || ''; en = en || ''; return lang === 'en' ? (en || ko) : (ko || en); }

    /* ---------- 룸 시간 계산 ---------- */
    function computeRoom(room) {
        let cursor = parseTime(room && room.startTime ? room.startTime : '09:00');
        return toArr(room && room.sessions).map(session => {
            const sStart = cursor;
            const lectures = toArr(session.lectures).map(lec => {
                const s = cursor; cursor += (Number(lec.duration) || 0);
                return Object.assign({}, lec, { _start: s, _end: cursor });
            });
            return Object.assign({}, session, { lectures, _start: sStart, _end: cursor, _count: lectures.length });
        });
    }

    function lecSpeakers(lec) {
        if (!Array.isArray(lec.speakers)) return [];
        return lec.speakers.map(s => typeof s === 'string'
            ? { nameKo: s, nameEn: '', affiliationKo: '', affiliationEn: '' }
            : { nameKo: s.nameKo || '', nameEn: s.nameEn || '', affiliationKo: s.affiliationKo || '', affiliationEn: s.affiliationEn || '' });
    }

    /* ---------- 렌더 ---------- */
    function orderedRooms() {
        return toArr(CONF.rooms).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order == null ? 0 : a.order) - (b.order == null ? 0 : b.order));
    }
    function allDates() {
        return [...new Set(orderedRooms().map(r => r.date).filter(Boolean))].sort();
    }

    function render() {
        const wrap = $('agenda');
        if (!CONF_ID) { wrap.innerHTML = msg('행사 정보가 없습니다.', '주소에 <code>?id=행사ID</code> 가 필요합니다.'); return; }
        if (!CONF) { wrap.innerHTML = msg('행사를 찾을 수 없습니다.', '링크를 다시 확인해 주세요.'); return; }

        const dates = allDates();
        const rooms = orderedRooms().filter(r => !DATE || r.date === DATE);

        // 헤더
        const range = CONF.startDate ? (CONF.endDate && CONF.endDate !== CONF.startDate ? CONF.startDate + ' ~ ' + CONF.endDate : CONF.startDate) : '';
        let html = `<div class="ag-head">
            <h1 class="ag-title">${esc(CONF.title || '학술대회 프로그램')}</h1>
            ${range ? `<div class="ag-range">${esc(range)}</div>` : ''}
            <div class="ag-controls">
                <div class="ag-seg">
                    <button class="${!DATE ? 'on' : ''}" onclick="AGENDA.setDate('')">전체</button>
                    ${dates.map(d => `<button class="${DATE === d ? 'on' : ''}" onclick="AGENDA.setDate('${d}')">${esc(fmtDay(d))}</button>`).join('')}
                </div>
                <div class="ag-seg ag-lang">
                    <button class="${LANG === 'auto' ? 'on' : ''}" onclick="AGENDA.setLang('auto')">자동</button>
                    <button class="${LANG === 'ko' ? 'on' : ''}" onclick="AGENDA.setLang('ko')">국문</button>
                    <button class="${LANG === 'en' ? 'on' : ''}" onclick="AGENDA.setLang('en')">EN</button>
                </div>
            </div>
        </div>`;

        if (!rooms.length) { html += msg('표시할 프로그램이 없습니다.', ''); wrap.innerHTML = html; postHeight(); return; }

        // 날짜별 그룹 → 룸 → 세션 → 강의
        const byDate = {};
        rooms.forEach(r => { (byDate[r.date || ''] = byDate[r.date || ''] || []).push(r); });
        Object.keys(byDate).sort().forEach(d => {
            html += `<div class="ag-day">${d ? esc(fmtDayLong(d)) : ''}</div>`;
            byDate[d].forEach(room => { html += renderRoom(room); });
        });

        html += `<div class="ag-foot">이 프로그램은 실시간으로 업데이트됩니다.</div>`;
        wrap.innerHTML = html;
        postHeight();
    }

    function renderRoom(room) {
        const sessions = computeRoom(room);
        const body = sessions.map(s => renderSession(room, s)).join('') ||
            `<div class="ag-empty">등록된 세션이 없습니다.</div>`;
        return `<section class="ag-room">
            <div class="ag-room-name">${esc(room.name || '룸')}</div>
            ${body}
        </section>`;
    }

    function renderSession(room, s) {
        const lang = effLang(room, s);
        const time = `${fmt(s._start)}–${fmt(s._end)}`;
        let mod = '';
        const mods = Array.isArray(s.moderators)
            ? s.moderators.filter(x => x && (x.id || x.nameKo || x.nameEn)).slice(0, 2)
            : (s.moderator && (s.moderator.nameKo || s.moderator.nameEn || s.moderator.id) ? [s.moderator] : []);
        if (mods.length) {
            const label = lang === 'en' ? 'Moderator' : '좌장';
            const txt = mods.map(x => {
                const nm = pick(lang, x.nameKo, x.nameEn);
                const aff = (x.affiliationKo || x.affiliationEn) ? ` (${esc(pick(lang, x.affiliationKo, x.affiliationEn))})` : '';
                return esc(nm) + aff;
            }).join(', ');
            mod = `<span class="ag-mod">${label}: ${txt}</span>`;
        }
        const rows = s.lectures.map(lec => renderLecture(lec, lang)).join('') ||
            `<div class="ag-empty">강의가 없습니다.</div>`;
        return `<div class="ag-session">
            <div class="ag-session-head">
                <span class="ag-session-name">${esc(s.name || '세션')}</span>
                <span class="ag-session-time">${time}</span>
                ${mod}
            </div>
            ${rows}
        </div>`;
    }

    function renderLecture(lec, lang) {
        const time = `${fmt(lec._start)}–${fmt(lec._end)}`;
        // 개회/휴식/점심 등 행사 항목
        if (lec.isBreak) {
            const t = pick(lang, lec.titleKo, lec.titleEn) || (lang === 'en' ? 'Break' : '행사');
            return `<div class="ag-lec ag-break">
                <div class="ag-time">${time}</div>
                <div class="ag-lec-main"><div class="ag-lec-title">${esc(t)}</div></div>
            </div>`;
        }
        // 패널 토론
        if (lec.isPanel) {
            const t = pick(lang, lec.titleKo, lec.titleEn) || 'Panel Discussion';
            return `<div class="ag-lec ag-panel">
                <div class="ag-time">${time}</div>
                <div class="ag-lec-main"><div class="ag-lec-title">${esc(t)}</div>
                    <div class="ag-lec-spk">${lang === 'en' ? 'Panel · All speakers' : '패널 · 전체 연자'}</div></div>
            </div>`;
        }
        const title = esc(pick(lang, lec.titleKo != null ? lec.titleKo : lec.title, lec.titleEn != null ? lec.titleEn : lec.subtitle) || (lang === 'en' ? '(Untitled)' : '(제목 없음)'));
        const spks = lecSpeakers(lec);
        const spkHtml = spks.length ? spks.map(x => {
            const nm = esc(pick(lang, x.nameKo, x.nameEn));
            const aff = (x.affiliationKo || x.affiliationEn) ? ` <span class="ag-aff">(${esc(pick(lang, x.affiliationKo, x.affiliationEn))})</span>` : '';
            return `<span class="ag-spk">${nm}${aff}</span>`;
        }).join('<span class="ag-sep">, </span>') : '';
        const partner = pick(lang, lec.partnerKo != null ? lec.partnerKo : lec.partner, lec.partnerEn);
        const product = pick(lang, lec.productKo, lec.productEn);
        const meta = [
            partner ? `<span class="ag-partner">🏢 ${esc(partner)}</span>` : '',
            product ? `<span class="ag-product">💊 ${esc(product)}</span>` : ''
        ].filter(Boolean).join('');
        return `<div class="ag-lec">
            <div class="ag-time">${time}</div>
            <div class="ag-lec-main">
                <div class="ag-lec-title">${title}</div>
                ${spkHtml ? `<div class="ag-lec-spk">${spkHtml}</div>` : ''}
                ${meta ? `<div class="ag-lec-meta">${meta}</div>` : ''}
            </div>
        </div>`;
    }

    /* ---------- 유틸 ---------- */
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    function fmtDay(d) { const dt = new Date(d + 'T00:00:00'); if (isNaN(dt)) return d; const p = n => String(n).padStart(2, '0'); return `${p(dt.getMonth() + 1)}/${p(dt.getDate())}(${WD[dt.getDay()]})`; }
    function fmtDayLong(d) { const dt = new Date(d + 'T00:00:00'); if (isNaN(dt)) return d; return `${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()} (${WD[dt.getDay()]})`; }
    function msg(t, sub) { return `<div class="ag-msg"><div class="ag-msg-t">${t}</div>${sub ? `<div class="ag-msg-s">${sub}</div>` : ''}</div>`; }
    function postHeight() { try { parent.postMessage({ type: 'asls-agenda-height', id: CONF_ID, height: document.documentElement.scrollHeight }, '*'); } catch (e) { } }
    window.addEventListener('resize', postHeight);

    /* ---------- 공개 컨트롤 ---------- */
    window.AGENDA = {
        setDate(d) { DATE = d; render(); },
        setLang(l) { LANG = l; render(); }
    };

    /* ---------- 구독 ---------- */
    function start() {
        if (!CONF_ID) { render(); return; }
        database.ref('/adminConferences/' + CONF_ID).on('value', snap => {
            CONF = snap.val();
            render();
        }, () => { $('agenda').innerHTML = msg('프로그램을 불러올 수 없습니다.', '잠시 후 다시 시도해 주세요.'); });
    }
    if (window.database) start();
    else setTimeout(() => { if (window.database) start(); else $('agenda').innerHTML = msg('연결 초기화에 실패했습니다.', '새로고침해 주세요.'); }, 800);
})();
