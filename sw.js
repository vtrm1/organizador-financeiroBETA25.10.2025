const APP_VERSION = 'of-pwa-v2025.10.25.0';
const CACHE_PREFIX = 'of-cache-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${APP_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${APP_VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}font-${APP_VERSION}`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
];

const OPTIONAL_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
];

const FONT_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.fontawesome.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
]);

const DATA_HOSTS = new Set([
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCpBfq801WlkxgHhWwORDvnKWpXGXz3k4c',
  authDomain: 'organizacao-financeira1.firebaseapp.com',
  projectId: 'organizacao-financeira1',
  storageBucket: 'organizacao-financeira1.firebasestorage.app',
  messagingSenderId: '896359450111',
  appId: '1:896359450111:web:bd8d7c2f2e35d4f27a93ca',
  measurementId: 'G-58ZVECNK3B',
};

const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192.png';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn('[SW] Recurso opcional não foi armazenado em cache:', asset, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => {
      if (!key.startsWith(CACHE_PREFIX)) {
        return Promise.resolve();
      }
      if (![STATIC_CACHE, RUNTIME_CACHE, FONT_CACHE].includes(key)) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE, event));
    return;
  }

  if (DATA_HOSTS.has(url.hostname)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, event));
});

function createOfflineResponse() {
  const offlineHtml = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Organizador Financeiro</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 2rem; background: #0f172a; color: #f8fafc; display: grid; min-height: 100vh; place-content: center; text-align: center; }
      h1 { font-size: 1.5rem; margin-bottom: 1rem; }
      p { font-size: 1rem; line-height: 1.5; color: #e2e8f0; }
    </style>
  </head>
  <body>
    <h1>Você está offline</h1>
    <p>Conecte-se à internet para sincronizar seus dados. O conteúdo salvo continuará disponível assim que a conexão retornar.</p>
  </body>
</html>`;

  return new Response(offlineHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    status: 503,
    statusText: 'Service Unavailable',
  });
}

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    cache.put('/index.html', response.clone());
    return response;
  } catch (error) {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request) || await cache.match('/index.html');
    if (cachedResponse) {
      return cachedResponse;
    }
    return createOfflineResponse();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cachedResponse) {
    if (event && typeof event.waitUntil === 'function') {
      event.waitUntil(fetchPromise);
    }
    return cachedResponse;
  }

  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return cache.match(request);
}

function initializeFirebaseMessaging() {
  try {
    importScripts(
      'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js',
    );

    if (!self.firebase?.apps?.length) {
      self.firebase.initializeApp(FIREBASE_CONFIG);
    }

    const messaging = self.firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const notification = payload?.notification || {};
      const title = notification.title || 'Organizador Financeiro';
      const options = {
        body: notification.body || 'Você tem novidades no seu painel financeiro.',
        icon: notification.icon || DEFAULT_NOTIFICATION_ICON,
        badge: notification.badge || DEFAULT_NOTIFICATION_ICON,
        data: {
          url: payload?.data?.url || '/',
          ...payload?.data,
        },
      };

      self.registration.showNotification(title, options);
    });
  } catch (error) {
    console.warn('[SW] Firebase Messaging indisponível:', error);
  }
}

initializeFirebaseMessaging();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingClient = allClients.find((client) => client.url.includes(targetUrl));
    if (matchingClient) {
      matchingClient.focus();
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});