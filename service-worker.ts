
/// <reference lib="webworker" />

const CACHE_NAME = 'smartbudget-v8';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  // Critical External Assets for Offline Mode
  'https://cdn.tailwindcss.com',
  'https://esm.sh/react@^19.2.4',
  'https://esm.sh/react-dom@^19.2.4'
];

const sw = self as unknown as ServiceWorkerGlobalScope;

// Install event: Cache core assets immediately
sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // We attempt to cache these. If one fails (e.g. offline during install), it won't block install entirely
      // but best effort is made.
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn("Some assets failed to cache", err));
    })
  );
  sw.skipWaiting();
});

// Activate event: Clean up old caches
sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  sw.clients.claim();
});

// Fetch event: Stale-while-revalidate strategy
sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORE: Non-GET requests (POST/PUT/DELETE)
  if (event.request.method !== 'GET') return;

  // 2. IGNORE: API calls (Supabase, Google AI) to ensure fresh data
  if (url.hostname.includes('supabase.co') || 
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // 3. CACHE: Assets, CDN libs, and App Shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Cache valid responses. 
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });

      // If cached response exists, return it immediately.
      if (cachedResponse) {
        fetchPromise.catch(() => { /* mute background errors */ });
        return cachedResponse;
      }

      return fetchPromise;
    })
  );
});