"use strict";

const CACHE_NAME = "vod-static-v1";
const OFFLINE_URL = "/";
const NOTIFICATION_ICON = "https://i.postimg.cc/2SvchTqS/verse-of-the-day.png";
const NOTIFICATION_BADGE = "https://i.postimg.cc/2SvchTqS/verse-of-the-day.png";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/css/index.css",
  "/js/index.js",
  "/login.html",
  "/css/login.css",
  "/js/login.js",
  NOTIFICATION_ICON
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          })
          .catch(() => {});
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "آية اليوم",
    body: "كلمة الله رفيقك كل يوم.",
    ref: "",
    url: "/",
    notificationId: null,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = Object.assign(payload, data);
    } catch (err) {
      try {
        payload.body = event.data.text() || payload.body;
      } catch (e) {}
    }
  }

  const tag = payload.notificationId
    ? "vod-" + payload.notificationId
    : "vod-" + Date.now();

  const options = {
    body: payload.body,
    icon: payload.icon || NOTIFICATION_ICON,
    badge: payload.badge || NOTIFICATION_BADGE,
    tag: tag,
    renotify: false,
    requireInteraction: false,
    dir: "rtl",
    lang: "ar",
    data: {
      url: payload.url || "/",
      notificationId: payload.notificationId || null,
      ref: payload.ref || ""
    },
    actions: [
      { action: "open", title: "افتح الموقع" }
    ]
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              return client.focus().then((c) => {
                if ("navigate" in c) {
                  return c.navigate(targetUrl).catch(() => c);
                }
                return c;
              });
            }
          } catch (err) {}
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return null;
      })
  );
});

self.addEventListener("notificationclose", () => {});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "PING") {
    if (event.source && event.source.postMessage) {
      event.source.postMessage({ type: "PONG" });
    }
  }
});
