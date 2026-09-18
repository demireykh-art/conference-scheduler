/**
 * asls-agenda-public.js — ASLS 학술대회 시간표 공개 데이터 피드 (외부 홈페이지 연동용)
 *
 * 목적: 홈페이지(메드소프트 등)가 자체 디자인을 유지하면서, 스케줄러의 시간표를
 *       자동으로 받아 표시하도록 "정리된 데이터(JSON)"만 제공한다.
 *       데이터 가져오기·시간계산·국문/영문·연자 사진/국적 정리는 이 파일이 처리하고,
 *       홈페이지는 받은 데이터를 원하는 디자인으로 그리기만 하면 된다.
 *
 * 사용법:
 *   <script src="https://demireykh-art.github.io/conference-scheduler/scheduler/js/asls-agenda-public.js"></script>
 *   <script>
 *     AslsAgenda.load('<행사ID>').then(function (feed) {
 *       // feed.days[].rooms[].sessions[].lectures[] 를 홈페이지 디자인으로 렌더
 *       // 연자별 강의목록:  var idx = AslsAgenda.speakerIndex(feed);
 *     });
 *   </script>
 *
 * 특징:
 *   - 로그인 불필요(공개 읽기), CORS 허용(브라우저 fetch 가능)
 *   - 스케줄러에서 수정하면 다음 로드 시 자동 반영(캐시 안 함)
 *   - '홈페이지 공개(publicOpen)'로 켠 룸만 노출
 *   - 파트너사·제품 정보는 공개 피드에서 제외(홈페이지 미노출)
 *   - 연자 사진(photo)·국적(nationality) 포함, 국문/영문 값 모두 제공(영문 없으면 국문 폴백은 홈페이지에서)
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

    /* ---------- 연자/좌장 정리 (연자 마스터 조인: 사진·국적·최신 이름/소속) ---------- */
    function personOut(s, speakerMap, showNat) {
        if (typeof s === 'string') s = { nameKo: s };
        s = s || {};
        var m = (s.id && speakerMap && speakerMap[s.id]) || null;   // 마스터(최신) 우선
        var nameKo = (m && m.nameKo) || s.nameKo || '';
        var nameEn = (m && m.nameEn) || s.nameEn || '';
        var affKo, affEn;
        if (showNat) {   // 국적 표시 룸: 국적 우선, 없으면 소속으로 폴백
            affKo = (m && m.nationalityKo) || s.nationalityKo || (m && m.affiliationKo) || s.affiliationKo || '';
            affEn = (m && m.nationalityEn) || s.nationalityEn || (m && m.affiliationEn) || s.affiliationEn || '';
        } else {
            affKo = (m && m.affiliationKo) || s.affiliationKo || '';
            affEn = (m && m.affiliationEn) || s.affiliationEn || '';
        }
        return {
            name: nameKo, nameEn: nameEn,
            affiliation: affKo, affiliationEn: affEn,
            photo: (m && (m.photo || m.photoURL)) || ''   // 연자 사진(마스터의 photo, base64 data URL)
        };
    }
    function normSpeakers(lec, speakerMap, showNat) {
        if (!Array.isArray(lec.speakers)) return [];
        return lec.speakers.map(function (s) { return personOut(s, speakerMap, showNat); });
    }
    function normMods(session, speakerMap, showNat) {
        var mods = Array.isArray(session.moderators)
            ? session.moderators.filter(function (m) { return m && (m.id || m.nameKo || m.nameEn); })
            : (session.moderator && (session.moderator.nameKo || session.moderator.nameEn)
                ? [session.moderator] : []);
        return mods.slice(0, 2).map(function (m) { return personOut(m, speakerMap, showNat); });
    }

    /* ---------- 룸 1개 → 정리된 세션/강의 (누적 시간 계산) ---------- */
    function buildRoom(room, speakerMap) {
        var showNat = !!room.showNationality;
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
                    speakers: type === 'lecture' ? normSpeakers(lec, speakerMap, showNat) : [],
                    memo: lec.memo || ''
                    // 주의: 파트너사(회사)·제품 정보는 공개 피드에서 의도적으로 제외
                };
            });
            return {
                name: session.name || '', nameEn: session.nameEn || '',
                start: fmt(sStart), end: fmt(cursor),
                moderators: normMods(session, speakerMap, showNat),
                lectures: lectures
            };
        });
        return {
            name: room.name || '', nameEn: room.nameEn || '',
            topic: room.topic || '', topicEn: room.topicEn || '',
            lang: room.lang === 'en' ? 'en' : 'ko',
            sessionless: !!room.sessionless,
            showNationality: showNat,
            date: room.date || '',
            sessions: sessions
        };
    }

    /* ---------- 전체 행사 → 날짜별 그룹 피드 ---------- */
    function build(conf, speakers) {
        conf = conf || {};
        var speakerMap = speakers || {};   // { <speakerId>: {nameKo,nameEn,affiliationKo,affiliationEn,nationalityKo,nationalityEn,photoURL} }
        // 홈페이지 공개(publicOpen=true)로 설정한 룸만 노출 (임시·작업용 룸 자동 제외)
        var rooms = toArr(conf.rooms).filter(function (r) { return r.publicOpen === true; })
            .map(function (r) { return buildRoom(r, speakerMap); });
        var byDate = {}, order = [];
        rooms.forEach(function (r) {
            var d = r.date || '';
            if (!byDate[d]) { byDate[d] = []; order.push(d); }
            byDate[d].push(r);
        });
        order.sort(function (a, b) { return (!a ? 1 : !b ? -1 : String(a).localeCompare(String(b))); });
        var days = order.map(function (d) { return { date: d, rooms: byDate[d] }; });
        var allRooms = toArr(conf.rooms);
        return {
            id: conf.id || '',
            title: conf.title || '', titleEn: conf.titleEn || '',
            startDate: conf.startDate || '', endDate: conf.endDate || '',
            days: days,
            _roomsTotal: allRooms.length,          // 진단용: 행사의 전체 룸 수
            _roomsPublic: rooms.length             // 진단용: 홈페이지 공개(publicOpen)로 켠 룸 수
        };
    }

    /* ---------- 연자별 강의목록 인덱스 (연자 클릭 → 강의 리스트용) ---------- */
    function speakerIndex(feed) {
        var map = {};
        (feed && feed.days || []).forEach(function (day) {
            day.rooms.forEach(function (room) {
                room.sessions.forEach(function (s) {
                    s.lectures.forEach(function (lec) {
                        if (lec.type !== 'lecture') return;
                        lec.speakers.forEach(function (spk) {
                            var key = (spk.name || spk.nameEn || '').trim();
                            if (!key) return;
                            if (!map[key]) map[key] = {
                                name: spk.name, nameEn: spk.nameEn, photo: spk.photo,
                                affiliation: spk.affiliation, affiliationEn: spk.affiliationEn,
                                lectures: []
                            };
                            map[key].lectures.push({
                                date: day.date, room: room.name, roomEn: room.nameEn,
                                session: s.name, sessionEn: s.nameEn,
                                start: lec.start, end: lec.end,
                                title: lec.title, titleEn: lec.titleEn
                            });
                        });
                    });
                });
            });
        });
        return Object.keys(map).map(function (k) { return map[k]; })
            .sort(function (a, b) { return (a.name || a.nameEn || '').localeCompare(b.name || b.nameEn || '', 'ko'); });
    }

    /* ---------- Firebase REST 읽기 ---------- */
    // 엄격: 실패(권한·CORS·네트워크)하면 예외를 던져 호출측 .catch로 전달
    function jgetStrict(path) {
        return fetch(DB + path + '?_=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + path); return r.json(); });
    }
    // 관대: 실패해도 null (부가 데이터용 — 없어도 렌더 가능)
    function jgetSoft(path) { return jgetStrict(path).catch(function () { return null; }); }

    /**
     * load(confId) → Promise<feed>
     * 필요한 필드만 부분 조회(내부 데이터 최소 노출) 후 정리해 반환.
     * 연자 사진·국적을 위해 공개 연자 목록(adminSpeakers)도 함께 조회.
     * rooms 조회는 엄격 모드 — 읽기 실패 시 예외(=연결/권한 문제 구분).
     */
    function load(confId) {
        if (!confId) return Promise.reject(new Error('confId required'));
        var base = '/adminConferences/' + confId;
        return Promise.all([
            jgetStrict(base + '/rooms.json'),   // 핵심: 실패하면 전체 reject
            jgetSoft(base + '/title.json'),
            jgetSoft(base + '/titleEn.json'),
            jgetSoft(base + '/startDate.json'),
            jgetSoft(base + '/endDate.json'),
            jgetSoft('/adminSpeakers.json')
        ]).then(function (res) {
            return build({
                id: confId, rooms: res[0], title: res[1], titleEn: res[2],
                startDate: res[3], endDate: res[4]
            }, res[5]);
        });
    }

    global.AslsAgenda = { DB: DB, load: load, speakerIndex: speakerIndex, _build: build };

})(typeof window !== 'undefined' ? window : this);
