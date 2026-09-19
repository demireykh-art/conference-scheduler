/**
 * asls-embed-loader.js — ASLS 학술대회 프로그램 임베드 위젯 (외부 홈페이지 삽입용)
 *
 * 사용법 (홈페이지에 아래 2줄만 넣으면 됩니다):
 *
 *   <!-- 1) 프로그램을 표시할 자리 -->
 *   <div class="asls-agenda" data-conf-id="행사ID"></div>
 *
 *   <!-- 2) 페이지에 1회만 (여러 개 삽입해도 스크립트는 1개면 됨) -->
 *   <script src="https://demireykh-art.github.io/conference-scheduler/scheduler/js/asls-embed-loader.js"></script>
 *
 * 옵션 (data-* 속성):
 *   data-conf-id  : (필수) 행사 ID
 *   data-lang     : auto | ko | en   (기본 auto)
 *   data-date     : YYYY-MM-DD        (특정 날짜만 표시, 생략 시 전체)
 *
 * 동작: 지정 위치에 iframe(agenda.html)을 자동 삽입하고, 내용 높이에 맞춰
 *       스크롤바 없이 자동으로 크기를 조절합니다. 데이터는 실시간 반영됩니다.
 *       홈페이지의 헤더/푸터/디자인은 그대로 두고, 이 영역만 프로그램으로 채워집니다.
 */
(function () {
    if (window.__ASLS_EMBED_LOADED__) return;   // 스크립트 중복 삽입 방지
    window.__ASLS_EMBED_LOADED__ = true;

    // 이 스크립트의 위치로부터 agenda.html 경로를 자동 계산 (배포 위치가 바뀌어도 동작)
    function baseUrl() {
        var s = document.currentScript;
        if (!s) {
            var all = document.getElementsByTagName('script');
            for (var i = all.length - 1; i >= 0; i--) {
                if (all[i].src && all[i].src.indexOf('asls-embed-loader.js') !== -1) { s = all[i]; break; }
            }
        }
        var src = ((s && s.src) || '').split('#')[0].split('?')[0];
        // .../scheduler/js/asls-embed-loader.js  →  .../scheduler/agenda.html
        if (/\/js\/asls-embed-loader\.js$/.test(src)) return src.replace(/\/js\/asls-embed-loader\.js$/, '/agenda.html');
        // 폴백: 같은 폴더에 agenda.html 이 있는 경우
        return src.replace(/asls-embed-loader\.js$/, 'agenda.html');
    }
    var AGENDA_URL = baseUrl();

    var frames = [];   // { el, iframe }

    function buildSrc(el) {
        var conf = el.getAttribute('data-conf-id') || el.getAttribute('data-conf') || el.getAttribute('data-id') || '';
        var lang = el.getAttribute('data-lang') || 'auto';
        var date = el.getAttribute('data-date') || '';
        var q = '?id=' + encodeURIComponent(conf);
        if (lang && lang !== 'auto') q += '&lang=' + encodeURIComponent(lang);
        if (date) q += '&date=' + encodeURIComponent(date);
        return AGENDA_URL + q;
    }

    function mount(el) {
        if (el.getAttribute('data-asls-mounted')) return;
        el.setAttribute('data-asls-mounted', '1');

        var iframe = document.createElement('iframe');
        iframe.src = buildSrc(el);
        iframe.title = 'ASLS 학술대회 프로그램';
        iframe.loading = 'lazy';
        iframe.setAttribute('scrolling', 'no');
        iframe.style.width = '100%';
        iframe.style.border = '0';
        iframe.style.display = 'block';
        iframe.style.minHeight = '360px';
        iframe.style.height = '600px';      // 초기값 — 로드 후 실제 높이로 교체
        iframe.style.overflow = 'hidden';

        el.innerHTML = '';
        el.appendChild(iframe);
        frames.push({ el: el, iframe: iframe });
    }

    function scan() {
        var list = document.querySelectorAll('.asls-agenda, [data-asls-agenda]');
        for (var i = 0; i < list.length; i++) mount(list[i]);
    }

    // 부모창으로 전달되는 높이 메시지 수신 → 해당 iframe 크기 조절
    window.addEventListener('message', function (e) {
        var d = e && e.data;
        if (!d || d.type !== 'asls-agenda-height') return;
        for (var i = 0; i < frames.length; i++) {
            if (frames[i].iframe.contentWindow === e.source) {
                var h = Math.max(360, parseInt(d.height, 10) || 0);
                frames[i].iframe.style.height = h + 'px';
                break;
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
    } else {
        scan();
    }
    // 늦게 추가되는 영역(동적 페이지) 대비: 약간의 지연 후 한 번 더 스캔
    setTimeout(scan, 1200);

    // 필요 시 외부에서 수동 초기화 가능
    window.AslsAgendaEmbed = { scan: scan, url: AGENDA_URL };
})();
