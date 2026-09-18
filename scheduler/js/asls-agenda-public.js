/**
 * asls-agenda-public.js — ASLS 학술대회 시간표 공개 데이터 피드 (외부 홈페이지 연동용)
 *
 * 목적: 홈페이지(메드소프트 등)가 자체 디자인을 유지하면서, 스케줄러의 시간표를
 *       자동으로 받아 표시하도록 "정리된 데이터(JSON)"만 제공한다.
 *       데이터 가져오기·시간계산·국문/영문 정리는 이 파일이 처리하고,
 *       홈페이지는 받은 데이터를 원하는 디자인으로 그리기만 하면 된다.
 *
 * 사용법:
 *   <script src="https://demireykh-art.github.io/conference-scheduler/scheduler/js/asls-agenda-public.js"></script>
 *   <script>
 *     AslsAgenda.load('<행사ID>').then(function (feed) {
 *       // feed.days[].rooms[].sessions[].lectures[] 를 홈페이지 디자인으로 렌더
 *       console.log(feed.title, feed.days.length);
 *     });
 *   </script>
 *
 * 특징:
 *   - 로그인 불필요(공개 읽기), CORS 허용(브라우저 fetch 가능)
 *   - 스케줄러에서 수정하면 다음 로드 시 자동 반영(캐시 안 함)
 *   - 반환 데이터는 홈페이지 렌더에 필요한 값만 담은 안정적 구조(내부 필드 미노출)
 */
(function (global) {
    'use strict';

    var DB = 'https://conference-scheduler-a5656-default-rtdb.asia-southeast1.firebasedatabase.app';

    /* ---------- 시간/정렬 헬퍼 ---------- */
    function parseTime(t) {
        if (!t || typeof t !== 'string' || t.indexOf(':') < 0) return 9 * 60;
        var p = t.split(':');
        return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
    }
    function fmt(mins) {
        mins = ((mins % 1440) + 1440) % 1440;
        var h = Math.floor(mins / 60), m = mins % 60;
        return (String(h)).padStart(2, '0') + ':' + (String(m)).padStart(2, '0');
    }
    function toArr(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj).map(function (id) {
            var v = obj[id] || {};
            var o = { id: id };
            for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = v[k];
            return o;
        }).sort(function (a, b) {
            return (a.order == null ? 0 : a.order) - (b.order == null ? 0 : b.order);
        });
    }

    /* ---------- 연자/좌장 정리 ---------- */
    function normSpeakers(lec) {
        if (!Array.isArray(lec.speakers)) return [];
        return lec.speakers.map(function (s) {
            if (typeof s === 'string') return { name: s, nameEn: '', affiliation: '', affiliationEn: '' };
            return {
                name: s.nameKo || '', nameEn: s.nameEn || '',
                affiliation: s.affiliationKo || '', affiliationEn: s.affiliationEn || ''
            };
        });
    }
    function normMods(session) {
        var mods = Array.isArray(session.moderators)
            ? session.moderators.filter(function (m) { return m && (m.id || m.nameKo || m.nameEn); })
            : (session.moderator && (session.moderator.nameKo || session.moderator.nameEn)
                ? [session.moderator] : []);
        return mods.slice(0, 2).map(function (m) {
            return {
                name: m.nameKo || '', nameEn: m.nameEn || '',
                affiliation: m.affiliationKo || '', affiliationEn: m.affiliationEn || ''
            };
        });
    }

    /* ---------- 룸 1개 → 정리된 세션/강의 (누적 시간 계산) ---------- */
    function buildRoom(room) {
        var cursor = parseTime(room && room.startTime ? room.startTime : '09:00');
        var sessions = toArr(room && room.sessions).map(function (session) {
            var sStart = cursor;
            var lectures = toArr(session.lectures).map(function (lec) {
                var s = cursor;
                cursor += (Number(lec.duration) || 0);
                var type = lec.isBreak ? 'break' : (lec.isPanel ? 'panel' : 'lecture');
                return {
                    start: fmt(s), end: fmt(cursor), duration: Number(lec.duration) || 0,
                    type: type,   // 'lecture' | 'break' | 'panel'
                    title: lec.titleKo != null ? lec.titleKo : (lec.title || ''),
                    titleEn: lec.titleEn != null ? lec.titleEn : (lec.subtitle || ''),
                    speakers: type === 'lecture' ? normSpeakers(lec) : [],
                    partner: lec.partnerKo != null ? lec.partnerKo : (lec.partner || ''),
                    partnerEn: lec.partnerEn || '',
                    product: lec.productKo || '', productEn: lec.productEn || '',
                    memo: lec.memo || ''
                };
            });
            return {
                name: session.name || '', nameEn: session.nameEn || '',
                start: fmt(sStart), end: fmt(cursor),
                moderators: normMods(session),
                lectures: lectures
            };
        });
        return {
            name: room.name || '', nameEn: room.nameEn || '',
            lang: room.lang === 'en' ? 'en' : 'ko',
            sessionless: !!room.sessionless,
            date: room.date || '',
            sessions: sessions
        };
    }

    /* ---------- 전체 행사 → 날짜별 그룹 피드 ---------- */
    function build(conf) {
        conf = conf || {};
        // 홈페이지 공개(publicOpen=true)로 설정한 룸만 노출 (임시·작업용 룸 자동 제외)
        var rooms = toArr(conf.rooms).filter(function (r) { return r.publicOpen === true; }).map(buildRoom);
        var byDate = {}, order = [];
        rooms.forEach(function (r) {
            var d = r.date || '';
            if (!byDate[d]) { byDate[d] = []; order.push(d); }
            byDate[d].push(r);
        });
        order.sort(function (a, b) { return (!a ? 1 : !b ? -1 : String(a).localeCompare(String(b))); });
        var days = order.map(function (d) { return { date: d, rooms: byDate[d] }; });
        return {
            id: conf.id || '',
            title: conf.title || '', titleEn: conf.titleEn || '',
            startDate: conf.startDate || '', endDate: conf.endDate || '',
            days: days
        };
    }

    /* ---------- Firebase REST 읽기 ---------- */
    function jget(path) {
        return fetch(DB + path + '?_=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; });
    }

    /**
     * load(confId) → Promise<feed>
     * 필요한 필드만 부분 조회(내부 데이터 최소 노출) 후 정리해 반환.
     */
    function load(confId) {
        if (!confId) return Promise.reject(new Error('confId required'));
        var base = '/adminConferences/' + confId;
        return Promise.all([
            jget(base + '/rooms.json'),
            jget(base + '/title.json'),
            jget(base + '/titleEn.json'),
            jget(base + '/startDate.json'),
            jget(base + '/endDate.json')
        ]).then(function (res) {
            return build({
                id: confId, rooms: res[0], title: res[1], titleEn: res[2],
                startDate: res[3], endDate: res[4]
            });
        });
    }

    global.AslsAgenda = { DB: DB, load: load, _build: build };

})(typeof window !== 'undefined' ? window : this);
