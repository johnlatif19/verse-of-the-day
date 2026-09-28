(function () {
  "use strict";

  var CONFIG = {
    apiBase: "/api",
    fallbackVerse: {
      text: "«تَوَكَّلْ عَلَى الرَّبِّ بِكُلِّ قَلْبِكَ، وَعَلَى فَهْمِكَ لاَ تَعْتَمِدْ.»",
      ref: "أمثال 3: 5"
    }
  };

  var SELECTORS = {
    header: "#siteHeader",
    menuToggle: "#menuToggle",
    mainNav: "#mainNav",
    navLinks: ".nav-link",
    verseDate: "#verseDate",
    verseText: "#verseText",
    verseRef: "#verseRef",
    copyBtn: "#copyVerseBtn",
    shareBtn: "#shareVerseBtn",
    verseNotifyBtn: "#verseNotifyBtn",
    enableNotifBtn: "#enableNotifBtn",
    notifStatus: "#notifStatus",
    notificationBadge: "#notificationBadge",
    toast: "#toast",
    reveals: ".reveal",
    scrollLinks: "[data-scroll]",
    privacyLink: "#privacyLink"
  };

  var els = {};
  var toastTimer = null;
  var currentVerse = {
    text: CONFIG.fallbackVerse.text,
    ref: CONFIG.fallbackVerse.ref,
    updatedAt: null
  };

  function cacheElements() {
    Object.keys(SELECTORS).forEach(function (key) {
      var value = SELECTORS[key];
      els[key] =
        value.charAt(0) === "." || value.charAt(0) === "["
          ? document.querySelectorAll(value)
          : document.querySelector(value);
    });
  }

  function showToast(message, duration) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, duration || 2200);
  }

  function initHeaderScroll() {
    var header = els.header;
    if (!header) return;

    function onScroll() {
      if (window.scrollY > 8) header.classList.add("is-scrolled");
      else header.classList.remove("is-scrolled");
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initMobileMenu() {
    var toggle = els.menuToggle;
    var nav = els.mainNav;
    if (!toggle || !nav) return;

    function close() {
      nav.classList.remove("is-open");
      toggle.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "فتح القائمة");
    }

    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.classList.toggle("is-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "إغلاق القائمة" : "فتح القائمة");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", close);
    });

    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      close();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 780) close();
    });
  }

  function initActiveNav() {
    var links = document.querySelectorAll(SELECTORS.navLinks);
    if (!links.length) return;

    var sections = Array.prototype.map
      .call(links, function (link) {
        var href = link.getAttribute("href") || "";
        if (href.charAt(0) !== "#") return null;
        var el = document.getElementById(href.slice(1));
        return el ? { link: link, el: el } : null;
      })
      .filter(Boolean);

    if (!sections.length || !("IntersectionObserver" in window)) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var target = null;
          for (var i = 0; i < sections.length; i++) {
            if (sections[i].el === entry.target) {
              target = sections[i];
              break;
            }
          }
          if (!target) return;
          links.forEach(function (l) {
            l.classList.remove("is-active");
          });
          target.link.classList.add("is-active");
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (s) {
      observer.observe(s.el);
    });
  }

  function initSmoothScroll() {
    document.querySelectorAll(SELECTORS.scrollLinks).forEach(function (link) {
      link.addEventListener("click", function (e) {
        var href = link.getAttribute("href");
        if (!href || href.charAt(0) !== "#") return;
        var target = document.getElementById(href.slice(1));
        if (!target) return;
        e.preventDefault();
        var headerH =
          parseInt(
            getComputedStyle(document.documentElement).getPropertyValue("--header-h")
          ) || 72;
        var top = target.getBoundingClientRect().top + window.scrollY - headerH - 12;
        window.scrollTo({ top: top, behavior: "smooth" });
      });
    });
  }

  function initReveal() {
    var items = document.querySelectorAll(SELECTORS.reveals);
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  function formatArabicDate(date) {
    date = date || new Date();
    try {
      return date.toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch (err) {
      return date.toDateString();
    }
  }

  function initVerseDate() {
    if (els.verseDate) els.verseDate.textContent = formatArabicDate();
  }

  function renderVerse(verse) {
    if (!verse) return;
    currentVerse = {
      text: verse.text || CONFIG.fallbackVerse.text,
      ref: verse.ref || CONFIG.fallbackVerse.ref,
      updatedAt: verse.updatedAt || null
    };

    if (els.verseText) els.verseText.textContent = currentVerse.text;
    if (els.verseRef) els.verseRef.textContent = currentVerse.ref;
  }

  function loadVerse() {
    return fetch(CONFIG.apiBase + "/verse/current", {
      credentials: "include",
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("verse_failed");
        return res.json();
      })
      .then(function (data) {
        renderVerse(data);
      })
      .catch(function () {
        renderVerse(CONFIG.fallbackVerse);
      });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return false;
        }
      );
    }

    return new Promise(function (resolve) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(ta);
      resolve(ok);
    });
  }

  function getVersePayload() {
    return {
      text: currentVerse.text,
      ref: currentVerse.ref,
      full: currentVerse.text + "\n— " + currentVerse.ref
    };
  }

  function initCopyVerse() {
    var btn = els.copyBtn;
    if (!btn) return;

    btn.addEventListener("click", function () {
      var payload = getVersePayload();
      copyText(payload.full).then(function (ok) {
        showToast(ok ? "تم نسخ الآية" : "تعذّر النسخ، حاول مرة أخرى");
      });
    });
  }

  function initShareVerse() {
    var btn = els.shareBtn;
    if (!btn) return;

    btn.addEventListener("click", function () {
      var payload = getVersePayload();
      var shareData = {
        title: "آية اليوم | Verse of the Day",
        text: payload.full,
        url: window.location.origin + "/"
      };

      if (navigator.share) {
        navigator.share(shareData).catch(function (err) {
          if (err && err.name === "AbortError") return;
          copyText(payload.full + "\n" + shareData.url).then(function (ok) {
            showToast(ok ? "تم نسخ الآية للمشاركة" : "تعذّرت المشاركة");
          });
        });
        return;
      }

      copyText(payload.full + "\n" + shareData.url).then(function (ok) {
        showToast(ok ? "تم نسخ الآية للمشاركة" : "تعذّرت المشاركة");
      });
    });
  }

  function setNotifStatus(message, type) {
    var el = els.notifStatus;
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("is-success", "is-error");
    if (type) el.classList.add("is-" + type);
  }

  function notifSupported() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function currentPermission() {
    return "Notification" in window ? Notification.permission : "unsupported";
  }

  function getDeviceId() {
    var KEY = "vod_device_id";
    try {
      var id = localStorage.getItem(KEY);
      if (!id) {
        var rand =
          (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
          Date.now() + "-" + Math.random().toString(36).slice(2);
        id = "web-" + rand;
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (err) {
      return "web-" + Date.now();
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(function (reg) {
        return reg;
      })
      .catch(function () {
        return null;
      });
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  function fetchVapidKey() {
    return fetch(CONFIG.apiBase + "/devices/public-key", { credentials: "include" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        return data && data.publicKey ? data.publicKey : null;
      })
      .catch(function () {
        return null;
      });
  }

  function subscribePush(reg) {
    if (!reg || !("PushManager" in window)) return Promise.resolve(null);

    return reg.pushManager
      .getSubscription()
      .then(function (existing) {
        if (existing) return existing;
        return fetchVapidKey().then(function (vapidKey) {
          if (!vapidKey) return null;
          return reg.pushManager
            .subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey)
            })
            .catch(function () {
              return null;
            });
        });
      })
      .catch(function () {
        return null;
      });
  }

  function registerDeviceWithServer(subscription) {
    var payload = {
      deviceId: getDeviceId(),
      subscription: subscription ? subscription.toJSON() : null,
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform || "web"
    };

    return fetch(CONFIG.apiBase + "/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function markNotificationsEnabled() {
    if (els.notificationBadge) els.notificationBadge.hidden = false;
  }

  function updateNotificationUI() {
    var permission = currentPermission();
    var btn = els.enableNotifBtn;

    if (permission === "granted") {
      setNotifStatus("تم تفعيل الإشعارات ✓", "success");
      if (btn) {
        btn.textContent = "الإشعارات مُفعّلة";
        btn.disabled = true;
      }
      markNotificationsEnabled();
    } else if (permission === "denied") {
      setNotifStatus(
        "الإشعارات محظورة. يمكنك تفعيلها من إعدادات المتصفح ثم إعادة المحاولة.",
        "error"
      );
      if (btn) btn.textContent = "الإشعارات محظورة";
    } else if (permission === "unsupported") {
      setNotifStatus("متصفحك لا يدعم الإشعارات.", "error");
      if (btn) {
        btn.textContent = "غير مدعوم";
        btn.disabled = true;
      }
    } else {
      setNotifStatus("");
      if (btn) btn.textContent = "تفعيل الإشعارات";
    }
  }

  function enableNotifications() {
    var btn = els.enableNotifBtn;
    if (btn) {
      btn.classList.add("is-loading");
      btn.disabled = true;
    }

    if (!notifSupported()) {
      setNotifStatus("متصفحك لا يدعم الإشعارات.", "error");
      updateNotificationUI();
      return;
    }

    Notification.requestPermission()
      .then(function (permission) {
        if (permission !== "granted") {
          setNotifStatus(
            "لم يتم تفعيل الإشعارات. يمكنك المحاولة مرة أخرى في أي وقت.",
            "error"
          );
          return null;
        }
        return registerServiceWorker()
          .then(function (reg) {
            return subscribePush(reg);
          })
          .then(function (subscription) {
            return registerDeviceWithServer(subscription);
          })
          .then(function () {
            setNotifStatus("تم تفعيل الإشعارات ✓", "success");
            markNotificationsEnabled();
            showToast("تم تفعيل الإشعارات بنجاح");
          });
      })
      .catch(function () {
        setNotifStatus("حدث خطأ أثناء تفعيل الإشعارات.", "error");
      })
      .then(function () {
        updateNotificationUI();
      });
  }

  function initNotifications() {
    updateNotificationUI();

    if (els.enableNotifBtn) {
      els.enableNotifBtn.addEventListener("click", enableNotifications);
    }

    if (els.verseNotifyBtn) {
      els.verseNotifyBtn.addEventListener("click", function () {
        if (currentPermission() === "granted") {
          showToast("الإشعارات مُفعّلة بالفعل");
          markNotificationsEnabled();
          return;
        }
        enableNotifications();
      });
    }

    if (notifSupported()) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
    }
  }

  function initPrivacyLink() {
    var link = els.privacyLink;
    if (!link) return;
    link.addEventListener("click", function (e) {
      e.preventDefault();
      showToast("سيتم توفير سياسة الخصوصية قريبًا");
    });
  }

  function init() {
    cacheElements();
    initHeaderScroll();
    initMobileMenu();
    initActiveNav();
    initSmoothScroll();
    initReveal();
    initVerseDate();
    loadVerse();
    initCopyVerse();
    initShareVerse();
    initNotifications();
    initPrivacyLink();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
