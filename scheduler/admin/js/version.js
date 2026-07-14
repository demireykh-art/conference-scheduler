/**
 * version.js — 앱 버전 & 자동 업데이트
 * 강제 새로고침(Ctrl+Shift+R) 없이 최신 버전을 자동 반영한다.
 * 배포할 때마다 APP_VERSION 값을 갱신한다. (배포 스크립트에서 자동 증가)
 */
window.APP_VERSION = '2026.07.10-4';

(function () {
    const LOADED = window.APP_VERSION;
    const VER_URL = '/conference-scheduler/scheduler/admin/js/version.js';
    let reloading = false;

    function doReload(msg) {
        if (reloading) return; reloading = true;
        try { if (window.Toast) Toast.info(msg || '새 버전이 있어 자동 업데이트합니다…'); } catch (e) { }
        setTimeout(function () { location.reload(); }, 700);
    }

    // 서비스워커 등록 + 주기적 업데이트 확인 (admin 단독 접속자도 SW 적용)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/conference-scheduler/sw.js').then(function (reg) {
            reg.update();
            setInterval(function () { reg.update(); }, 5 * 60 * 1000);
        }).catch(function () { });
        // 새 SW가 제어를 넘겨받으면(=새 버전 배포) 한 번 리로드
        if (navigator.serviceWorker.controller) {
            let swReloaded = false;
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (swReloaded) return; swReloaded = true; location.reload();
            });
        }
    }

    // 배포된 version.js와 비교 → 다르면 새 버전이 나온 것이므로 리로드
    function check() {
        fetch(VER_URL + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.text() : null; })
            .then(function (txt) {
                if (!txt) return;
                const m = txt.match(/APP_VERSION\s*=\s*'([^']+)'/);
                if (m && m[1] && m[1] !== LOADED) doReload();
            })
            .catch(function () { });
    }
    setTimeout(check, 5000);
    setInterval(check, 3 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();
