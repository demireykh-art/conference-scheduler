/**
 * cv-submit.js — 연자 자가 CV 제출 폼 (공개, 로그인 불필요)
 * 링크: cv-submit.html?c=<confId>&s=<speakerId>
 * 제출: /cvSubmissions/<pushId> = { confId, speakerId, nameKo, nameEn, affiliationKo, affiliationEn, email, cv, photo, status:'pending', submittedAt }
 */
(function () {
    const params = new URLSearchParams(location.search);
    const CONF_ID = params.get('c') || '';
    const SPK_ID = params.get('s') || '';
    let photoData = '';

    const $ = id => document.getElementById(id);
    function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function setMsg(t, cls) { const m = $('cvMsg'); m.textContent = t || ''; m.className = 'cv-msg' + (cls ? ' ' + cls : ''); }

    // 이미지 압축 (자체 구현 — admin-common 의존 없음)
    function compress(file, maxW, q) {
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, maxW / img.width);
                    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
                    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                    cv.getContext('2d').drawImage(img, 0, 0, w, h);
                    res(cv.toDataURL('image/jpeg', q || 0.82));
                };
                img.onerror = rej; img.src = fr.result;
            };
            fr.onerror = rej; fr.readAsDataURL(file);
        });
    }

    // 대상 행사/연자 정보 로드(공개 읽기 허용) → 안내 + 프리필
    function init() {
        if (!CONF_ID || !SPK_ID) {
            $('cvSub').innerHTML = '<span class="cv-err">잘못된 링크입니다. 학회에서 받은 제출 링크로 다시 접속해 주세요.</span>';
            return;
        }
        Promise.all([
            database.ref('/adminConferences/' + CONF_ID + '/title').once('value').then(s => s.val()).catch(() => ''),
            database.ref('/adminSpeakers/' + SPK_ID).once('value').then(s => s.val() || {}).catch(() => ({}))
        ]).then(([title, spk]) => {
            $('cvTitle').textContent = (title || '행사') + ' · 연자 정보 제출';
            $('cvSub').innerHTML = '아래에 성함·소속·약력(CV)과 사진을 입력해 <b>제출</b>해 주세요. 제출하시면 학회 시스템에 자동 반영됩니다.';
            $('cvNameKo').value = spk.nameKo || '';
            $('cvNameEn').value = spk.nameEn || '';
            $('cvAffKo').value = spk.affiliationKo || '';
            $('cvAffEn').value = spk.affiliationEn || '';
            $('cvEmail').value = spk.email || '';
            $('cvText').value = spk.cv || '';
            if (spk.photo) { photoData = spk.photo; $('cvPhotoImg').src = spk.photo; $('cvPhotoImg').style.display = ''; $('cvPhotoEmpty').style.display = 'none'; }
            $('cvForm').style.display = '';
        });
    }

    $('cvPhotoFile').addEventListener('change', async e => {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/')) { setMsg('이미지 파일만 가능합니다.', 'cv-err'); return; }
        try {
            photoData = await compress(f, 400, 0.82);
            $('cvPhotoImg').src = photoData; $('cvPhotoImg').style.display = ''; $('cvPhotoEmpty').style.display = 'none';
            setMsg('');
        } catch (x) { setMsg('사진 처리 실패', 'cv-err'); }
    });

    window.submitCV = function () {
        const nameKo = $('cvNameKo').value.trim();
        const nameEn = $('cvNameEn').value.trim();
        if (!nameKo && !nameEn) { setMsg('이름을 입력해 주세요.', 'cv-err'); return; }
        $('cvSubmitBtn').disabled = true; setMsg('제출 중…');
        const entry = {
            confId: CONF_ID, speakerId: SPK_ID,
            nameKo, nameEn,
            affiliationKo: $('cvAffKo').value.trim(),
            affiliationEn: $('cvAffEn').value.trim(),
            email: $('cvEmail').value.trim(),
            cv: $('cvText').value.trim().slice(0, 19000),
            photo: photoData || '',
            status: 'pending',
            submittedAt: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref('/cvSubmissions').push(entry)
            .then(() => {
                $('cvCard').innerHTML = '<div class="cv-done"><div class="ico">✅</div>'
                    + '<h2 style="margin:10px 0 4px">제출이 완료되었습니다.</h2>'
                    + '<div style="color:var(--text-dim)">감사합니다. 입력하신 내용은 학회에서 확인 후 반영됩니다.<br>수정이 필요하면 다시 제출해 주세요.</div></div>';
            })
            .catch(e => { $('cvSubmitBtn').disabled = false; setMsg('제출 실패: ' + e.message, 'cv-err'); });
    };

    if (window.database) init();
    else setTimeout(() => { if (window.database) init(); else $('cvSub').innerHTML = '<span class="cv-err">연결 초기화에 실패했습니다. 새로고침해 주세요.</span>'; }, 800);
})();
