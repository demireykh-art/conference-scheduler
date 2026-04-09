const CACHE = 'scheduler-v1';
const ASSETS = [
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
  '/conference-scheduler/scheduler/js/modals.js',
  '/conference-scheduler/scheduler/js/sponsor.js',
  '/conference-scheduler/scheduler/js/leaflet.js',
  '/conference-scheduler/scheduler/js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Firebase / Google API는 캐시 안 함
  if (e.request.url.includes('firebase') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('gstatic')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
