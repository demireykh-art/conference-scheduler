// ============================================
// Service Worker - conference-scheduler
// 버전을 올리면 기존 캐시 자동 삭제 후 재캐싱
// ============================================
const CACHE_VERSION = 'scheduler-v4';
const OFFLINE_URL   = '/conference-scheduler/scheduler/offline.html';

const STATIC_ASSETS = [
  '/conference-scheduler/scheduler/',
  '/conference-scheduler/scheduler/index.html',
  '/conference-scheduler/scheduler/css/styles.css',
  '/conference-scheduler/scheduler/js/config.js',
  '/conference-scheduler/scheduler/js/state.js',
  '/conference-scheduler/scheduler/js/utils.js',
  '/conference-scheduler/scheduler/js/auth.js',
  '/conference-scheduler/scheduler/js/lectures.js',
  '/conference-scheduler/scheduler/js/sessions.js',
  '/conference-scheduler/scheduler/js/schedule.js',
  '/conference-scheduler/scheduler/js/chairs.js',
  '/conference-scheduler/scheduler/js/upload.js',
  '/conference-scheduler/scheduler/js/typo-check.js',
  '/conference-scheduler/scheduler/js/modals.js',
  '/conference-scheduler/scheduler/js/sponsor.js',
  '/conference-scheduler/scheduler/js/leaflet.js',
  '/conference-scheduler/scheduler/js/app.js',
  OFFLINE_URL,
];

// ============================================
// Install: 정적 자산 캐싱
// ============================================
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] 캐시 프리로드 일부 실패:', err))
  );
});

// ============================================
// Activate: 구버전 캐시 모두 삭제
// ============================================
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => {
            console.log('[SW] 구버전 캐시 삭제:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================
// Fetch: 네트워크 우선 → 캐시 → 오프라인 fallback
// ============================================
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Firebase / Google API / CDN은 SW 개입 안 함
  if (
    url.includes('firebase') ||
    url.includes('googleapis') ||
    url.includes('gstatic') ||
    url.includes('cdnjs.cloudflare') ||
    url.includes('firebaseio.com')
  ) {
    return;
  }

  // GET 요청만 캐싱 처리
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(networkRes => {
        // 정상 응답이면 캐시 갱신 후 반환
        if (networkRes && networkRes.status === 200) {
          const cloned = networkRes.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, cloned));
        }
        return networkRes;
      })
      .catch(() => {
        // 네트워크 실패 → 캐시에서 찾기
        return caches.match(e.request).then(cached => {
          if (cached) return cached;

          // HTML 요청이면 오프라인 페이지 반환
          if (e.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL);
          }

          // 그 외는 빈 응답
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// ============================================
// Message: 클라이언트로부터 캐시 갱신 요청 처리
// ============================================
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data?.type === 'GET_VERSION') {
    e.source?.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});
