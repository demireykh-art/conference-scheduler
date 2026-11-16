/**
 * trip-submit.js — 해외 연자 '여행 일정 + 강의' 자가 제출 폼 (공개, 로그인 불필요)
 * 링크: trip-submit.html?c=<confId>&s=<speakerId>  또는  ?t=<token>
 * 제출: /tripSubmissions/<pushId> = {
 *   confId, speakerId, nameKo, nameEn, affiliationKo, nationality, email, phone,
 *   travel:{status, arriveDate, arriveTime, departDate, departTime, nights, companions, flight, requests},
 *   lectures:[{title, titleEn, lang, duration, note}], note, lang, status:'pending', submittedAt }
 */
(function () {
    const params = new URLSearchParams(location.search);
    let CONF_ID = params.get('c') || '';
    let SPK_ID = params.get('s') || '';
    const TOKEN = params.get('t') || '';
    let LANG = 'en';
    let CONF_TITLE = '';

    const $ = id => document.getElementById(id);
    function setMsg(t, cls) { const m = $('tpMsg'); if (m) { m.textContent = t || ''; m.className = 'tp-msg' + (cls ? ' ' + cls : ''); } }

    window.setLang = function (l) {
        LANG = l;
        $('tpLangEn').classList.toggle('on', l === 'en');
        $('tpLangKo').classList.toggle('on', l === 'ko');
        document.documentElement.lang = l;
        document.querySelectorAll('[data-en]').forEach(el => {
            const v = l === 'ko' ? el.getAttribute('data-ko') : el.getAttribute('data-en');
            if (v != null) el.textContent = v;
        });
        $('tpSub').innerHTML = l === 'ko'
            ? (CONF_TITLE ? '<b>' + esc(CONF_TITLE) + '</b> · ' : '') + '여행 일정과 강의 제목을 입력해 <b>제출</b>해 주세요. 제출하면 학회 시스템에 반영됩니다.'
            : (CONF_TITLE ? '<b>' + esc(CONF_TITLE) + '</b> · ' : '') + 'Please fill in your travel schedule and lecture title, then <b>Submit</b>.';
        $('tpTitle').textContent = l === 'ko' ? '연자 여행·강의 제출' : 'Speaker Travel & Lecture';
    };
    function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function lecRow(data) {
        data = data || {};
        const d = document.createElement('div');
        d.className = 'tp-lec';
        d.innerHTML =
            '<button type="button" class="tp-lec-del" onclick="this.closest(\'.tp-lec\').remove()">✕</button>' +
            '<div class="tp-field"><label data-en="Lecture title" data-ko="강의 제목">Lecture title</label><input class="lec-title" placeholder=""></div>' +
            '<div class="tp-grid2">' +
            '<div class="tp-field"><label data-en="Language" data-ko="발표 언어">Language</label>' +
            '<select class="lec-lang"><option value="EN">English</option><option value="KO">Korean</option><option value="EN/KO">EN + KO</option></select></div>' +
            '<div class="tp-field"><label data-en="Desired duration (min)" data-ko="희망 시간(분)">Duration (min)</label><input class="lec-dur" type="number" min="5" step="5" placeholder="20"></div>' +
            '</div>' +
            '<div class="tp-field"><label data-en="Note (topic, product, etc.)" data-ko="메모(주제·제품 등)">Note</label><input class="lec-note"></div>';
        d.querySelector('.lec-title').value = data.title || '';
        $('tpLectures').appendChild(d);
        // 현재 언어 라벨 적용
        d.querySelectorAll('[data-en]').forEach(el => { const v = LANG === 'ko' ? el.getAttribute('data-ko') : el.getAttribute('data-en'); if (v != null) el.textContent = v; });
        return d;
    }
    window.addLecture = function () { lecRow(); };

    window.onStatus = function () {
        const v = document.querySelector('input[name="tpst"]:checked').value;
        document.querySelectorAll('#tpStatus label').forEach(l => l.classList.toggle('on', l.getAttribute('data-val') === v));
        $('tpDates').style.display = v === 'confirmed' ? '' : 'none';
    };
    window.calcNights = function () {
        const a = $('tpArrDate').value, d = $('tpDepDate').value;
        if (a && d) {
            const n = Math.round((new Date(d) - new Date(a)) / 86400000);
            $('tpNights').textContent = n >= 0 ? (LANG === 'ko' ? `숙박 ${n}박` : `${n} night(s)`) : '';
            if (n >= 0) $('tpNightsManual').value = n;
        } else $('tpNights').textContent = '';
    };

    function init() {
        if (!SPK_ID) { $('tpSub').innerHTML = '<span class="tp-err">Invalid link. Please use the submission link provided by the committee. / 잘못된 링크입니다.</span>'; return; }
        Promise.all([
            CONF_ID ? database.ref('/adminConferences/' + CONF_ID + '/title').once('value').then(s => s.val()).catch(() => '') : Promise.resolve(''),
            database.ref('/adminSpeakers/' + SPK_ID).once('value').then(s => s.val() || {}).catch(() => ({}))
        ]).then(([title, spk]) => {
            CONF_TITLE = title || '';
            $('tpNameEn').value = spk.nameEn || '';
            $('tpNameKo').value = spk.nameKo || '';
            $('tpAffEn').value = spk.affiliationEn || spk.affiliationKo || '';
            $('tpNat').value = spk.nationalityEn || spk.nationalityKo || '';
            $('tpEmail').value = spk.email || '';
            $('tpPhone').value = spk.phone || '';
            lecRow();   // 기본 강의 1행
            setLang('en');
            onStatus();
            $('tpForm').style.display = '';
        });
    }

    window.submitTrip = function () {
        const nameEn = $('tpNameEn').value.trim(), nameKo = $('tpNameKo').value.trim();
        if (!nameEn && !nameKo) { setMsg(LANG === 'ko' ? '이름을 입력해 주세요.' : 'Please enter your name.', 'tp-err'); return; }
        const status = document.querySelector('input[name="tpst"]:checked').value;
        const lectures = [...document.querySelectorAll('#tpLectures .tp-lec')].map(d => ({
            title: d.querySelector('.lec-title').value.trim(),
            lang: d.querySelector('.lec-lang').value,
            duration: Number(d.querySelector('.lec-dur').value) || 0,
            note: d.querySelector('.lec-note').value.trim()
        })).filter(l => l.title);
        $('tpSubmitBtn').disabled = true; setMsg(LANG === 'ko' ? '제출 중…' : 'Submitting…');
        const entry = {
            confId: CONF_ID, speakerId: SPK_ID, nameEn, nameKo,
            affiliationEn: $('tpAffEn').value.trim(), nationality: $('tpNat').value.trim(),
            email: $('tpEmail').value.trim(), phone: $('tpPhone').value.trim(),
            travel: {
                status,
                arriveDate: status === 'confirmed' ? $('tpArrDate').value : '',
                arriveTime: status === 'confirmed' ? $('tpArrTime').value : '',
                departDate: status === 'confirmed' ? $('tpDepDate').value : '',
                departTime: status === 'confirmed' ? $('tpDepTime').value : '',
                nights: Number($('tpNightsManual').value) || 0,
                companions: Number($('tpComp').value) || 0,
                flight: $('tpFlight').value.trim(),
                requests: $('tpReq').value.trim()
            },
            lectures,
            note: $('tpNote').value.trim(),
            lang: LANG, status: 'pending',
            submittedAt: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref('/tripSubmissions').push(entry).then(() => {
            $('tpCard').innerHTML = '<div class="tp-done"><div class="ico">✅</div>'
                + '<h2 style="margin:10px 0 6px">' + (LANG === 'ko' ? '제출이 완료되었습니다.' : 'Submitted. Thank you!') + '</h2>'
                + '<div style="color:var(--text-dim)">' + (LANG === 'ko' ? '학회에서 확인 후 반영됩니다. 수정이 필요하면 다시 제출해 주세요.' : 'The committee will review it. You can submit again to update.') + '</div></div>';
        }).catch(e => { $('tpSubmitBtn').disabled = false; setMsg((LANG === 'ko' ? '제출 실패: ' : 'Submit failed: ') + e.message, 'tp-err'); });
    };

    function start() {
        if (TOKEN && (!CONF_ID || !SPK_ID)) {
            database.ref('/tripTokens/' + TOKEN).once('value').then(snap => {
                const v = snap.val(); if (v) { CONF_ID = v.c || CONF_ID; SPK_ID = v.s || SPK_ID; }
                init();
            }).catch(() => init());
        } else init();
    }
    if (window.database) start();
    else setTimeout(() => { if (window.database) start(); else $('tpSub').innerHTML = '<span class="tp-err">Connection failed. Please refresh.</span>'; }, 800);
})();
