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
 *       // 각 강의에는 고유 id 있음: lec.id  (관심강의/내 스케줄 담기 저장용)
 *       // 연자별 강의목록:  var idx = AslsAgenda.speakerIndex(feed);
 *       // 저장한 관심강의 렌더: AslsAgenda.findLectures(feed, ['<lec.id>', ...])
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
            id: s.id || '',                 // 연자 고유 id(연자 페이지 링크·매칭용)
            name: nameKo, nameEn: nameEn,
            affiliation: affKo, affiliationEn: affEn,
            // 국적(나라)은 룸 토글과 무관하게 항상 제공 — 연자 목록 페이지의 국가 표시용
            nationality: (m && m.nationalityKo) || s.nationalityKo || '',
            nationalityEn: (m && m.nationalityEn) || s.nationalityEn || '',
            photo: (m && (m.photo || m.photoURL)) || '',  // 연자 사진(마스터의 photo, base64 data URL)
            cv: (m && m.cv) || s.cv || ''                  // 연자 CV/약력(마스터)
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
                    id: lec.id || '',              // 이 강의 슬롯의 고유 id (관심강의/내 스케줄 담기 저장용, 행사 내 유일)
                    lectureId: lec.lectureId || '', // 강의 원본 id (같은 강의가 여러 곳 배치된 경우 그룹화용, 참고)
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

    /* ---------- 성(last name) 추출 (연자 목록 정렬용) ---------- */
    function lastName(n) {
        n = (n || '').replace(/^(Dr\.?|Prof\.?|Professor|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').trim();
        var p = n.split(/\s+/);
        return (p[p.length - 1] || n).toLowerCase();
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
                                id: spk.id || '',
                                name: spk.name, nameEn: spk.nameEn, photo: spk.photo,
                                affiliation: spk.affiliation, affiliationEn: spk.affiliationEn,
                                nationality: spk.nationality, nationalityEn: spk.nationalityEn,
                                cv: spk.cv || '',
                                lectures: []
                            };
                            else if (!map[key].id && spk.id) map[key].id = spk.id;
                            map[key].lectures.push({
                                id: lec.id || '', lectureId: lec.lectureId || '',
                                date: day.date, room: room.name, roomEn: room.nameEn,
                                session: s.name, sessionEn: s.nameEn,
                                role: 'speaker',   // 이 인덱스는 연자(발표) 역할 기준
                                start: lec.start, end: lec.end,
                                title: lec.title, titleEn: lec.titleEn
                            });
                        });
                    });
                });
            });
        });
        // 성(영문 기준) 알파벳순 — 영문명 없으면 국문명 기준
        return Object.keys(map).map(function (k) { return map[k]; })
            .sort(function (a, b) {
                return lastName(a.nameEn || a.name).localeCompare(lastName(b.nameEn || b.name), 'en')
                    || (a.nameEn || a.name || '').localeCompare(b.nameEn || b.name || '', 'en');
            });
    }

    /* ---------- 강의 id로 강의 찾기 (내 스케줄/관심강의 렌더용) ---------- */
    // 저장해 둔 강의 id로 그 강의의 룸·세션·시간·제목 등을 다시 찾아 돌려준다.
    function findLecture(feed, id) {
        var out = null;
        (feed && feed.days || []).forEach(function (day) {
            day.rooms.forEach(function (room) {
                room.sessions.forEach(function (s) {
                    s.lectures.forEach(function (lec) {
                        if (lec.id && lec.id === id) out = {
                            date: day.date,
                            room: room.name, roomEn: room.nameEn,
                            topic: room.topic, topicEn: room.topicEn,
                            session: s.name, sessionEn: s.nameEn,
                            lecture: lec
                        };
                    });
                });
            });
        });
        return out;
    }
    // 여러 id를 한 번에 (입력 순서 유지, 못 찾은 id는 건너뜀)
    function findLectures(feed, ids) {
        return (ids || []).map(function (id) { return findLecture(feed, id); }).filter(Boolean);
    }

    /* ---------- 캘린더 내보내기 (.ics / 구글 캘린더) ---------- */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    // 'YYYY-MM-DD' + 'HH:MM'(한국시간) → UTC 'YYYYMMDDTHHMMSSZ'
    function toUTCStamp(date, hm) {
        var p = String(date || '').split('-'), t = String(hm || '00:00').split(':');
        var d = new Date(Date.UTC(Number(p[0]) || 1970, (Number(p[1]) || 1) - 1, Number(p[2]) || 1, Number(t[0]) || 0, Number(t[1]) || 0, 0));
        d.setUTCHours(d.getUTCHours() - 9);   // KST(UTC+9) → UTC
        return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
            + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z';
    }
    function nowStamp() {
        var d = new Date();
        return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
            + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
    }
    function icsEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function titleFor(lec, lang) { return lang === 'en' ? (lec.titleEn || lec.title || '') : (lec.title || lec.titleEn || ''); }

    // 구글 캘린더 '이벤트 추가' 링크 (강의 1개) — 클릭 시 구글 캘린더에 바로 추가
    function toGoogleCalendarUrl(feed, id, opts) {
        opts = opts || {};
        var e = findLecture(feed, id); if (!e) return '';
        var lang = opts.lang === 'en' ? 'en' : 'ko', lec = e.lecture;
        var loc = lang === 'en' ? (e.roomEn || e.room || '') : (e.room || e.roomEn || '');
        var sess = lang === 'en' ? (e.sessionEn || e.session || '') : (e.session || '');
        var params = 'action=TEMPLATE'
            + '&text=' + encodeURIComponent(titleFor(lec, lang))
            + '&dates=' + toUTCStamp(e.date, lec.start) + '/' + toUTCStamp(e.date, lec.end)
            + '&location=' + encodeURIComponent(loc)
            + (sess ? '&details=' + encodeURIComponent(sess) : '');
        return 'https://calendar.google.com/calendar/render?' + params;
    }

    // .ics 캘린더 파일 내용 (강의 여러 개) — 구글·네이버·애플·아웃룩 '가져오기'로 한 번에 등록
    function toICS(feed, ids, opts) {
        opts = opts || {};
        var lang = opts.lang === 'en' ? 'en' : 'ko';
        var name = opts.calendarName || (feed && (lang === 'en' ? feed.titleEn : feed.title)) || 'ASLS';
        var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ASLS//Agenda//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(name)];
        var stamp = nowStamp();
        findLectures(feed, ids).forEach(function (e, i) {
            var lec = e.lecture;
            var loc = lang === 'en' ? (e.roomEn || e.room || '') : (e.room || e.roomEn || '');
            var sess = lang === 'en' ? (e.sessionEn || e.session || '') : (e.session || '');
            out.push('BEGIN:VEVENT');
            out.push('UID:' + (lec.id || ('lec' + i)) + '@asls.kr');
            out.push('DTSTAMP:' + stamp);
            out.push('DTSTART:' + toUTCStamp(e.date, lec.start));
            out.push('DTEND:' + toUTCStamp(e.date, lec.end));
            out.push('SUMMARY:' + icsEsc(titleFor(lec, lang)));
            if (loc) out.push('LOCATION:' + icsEsc(loc));
            if (sess) out.push('DESCRIPTION:' + icsEsc(sess));
            out.push('END:VEVENT');
        });
        out.push('END:VCALENDAR');
        return out.join('\r\n');
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

    global.AslsAgenda = {
        DB: DB, load: load, speakerIndex: speakerIndex,
        findLecture: findLecture, findLectures: findLectures,
        toICS: toICS, toGoogleCalendarUrl: toGoogleCalendarUrl,
        _build: build
    };

})(typeof window !== 'undefined' ? window : this);
