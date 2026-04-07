// 학술대회 스케줄러 — Service Worker
// 앱 껍데기(shell)만 캐시, 데이터는 항상 Firebase에서 실시간 수신

const CACHE_NAME = 'scheduler-v1';
const SHELL = [
  '/conference-scheduler/scheduler/',
  '/conference-scheduler/scheduler/index.html',
  '/conference-scheduler/scheduler/css/styles.css',
  '/conference-scheduler/scheduler/favicon.png',
  '/conference-scheduler/scheduler/favicon-192.png',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap',
  // CDN 라이브러리
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
];

// 설치: 셸 캐시
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 요청 처리: Network-first (Firebase/외부), Cache-first (셸)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase, Google Auth → 항상 네트워크
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('accounts.google')
  ) {
    return; // 기본 fetch 동작
  }

  // 셸 파일 → Cache-first, 실패 시 네트워크
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // 성공적인 GET 응답만 캐시
        if (e.request.method === 'GET' && res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // 오프라인 + 캐시 없음 → 메인 페이지 반환
        if (e.request.destination === 'document') {
          return caches.match('/conference-scheduler/scheduler/index.html');
        }
      });
    })
  );
});
