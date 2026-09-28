(function () {
  "use strict";

  var CONFIG = {
    apiBase: "/api"
  };

  var SELECTORS = {
    adminName: "#adminName",
    logoutBtn: "#logoutBtn",

    dashLoading: "#dashLoading",
    dashContent: "#dashContent",

    statTotalNotifications: "#statTotalNotifications",
    statTotalDevices: "#statTotalDevices",
    statLastNotification: "#statLastNotification",
    statServiceStatus: "#statServiceStatus",

    verseForm: "#verseForm",
    verseTextInput: "#verseTextInput",
    verseRefInput: "#verseRefInput",
    saveVerseBtn: "#saveVerseBtn",
    verseUpdatedAt: "#verseUpdatedAt",

    notifForm: "#notifForm",
    notifTitleInput: "#notifTitleInput",
    notifBodyInput: "#notifBodyInput",
    notifRefInput: "#notifRefInput",
    sendNotifBtn: "#sendNotifBtn",

    historySearch: "#historySearch",
    historyEmpty: "#historyEmpty",
    historyTableWrap: "#historyTableWrap",
    historyBody: "#historyBody",
    historyCards: "#historyCards",

    confirmModal: "#confirmModal",
    confirmText: "#confirmText",
    confirmCancel: "#confirmCancel",
    confirmSend: "#confirmSend",

    toast: "#toast"
  };

  var els = {};
  var toastTimer = null;
  var notifications = [];
  var currentVerse = { text: "", ref: "", updatedAt: null };
  var isRedirecting = false;

  function cacheElements() {
    Object.keys(SELECTORS).forEach(function (key) {
      els[key] = document.querySelector(SELECTORS[key]);
    });
  }

  function redirectToLogin() {
    if (isRedirecting) return;
    isRedirecting = true;
    window.location.replace("/login");
  }

  function showToast(message, duration) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, duration || 2600);
  }

  function setLoading(btn, isLoading) {
    if (!btn) return;
    btn.classList.toggle("is-loading", isLoading);
    btn.disabled = isLoading;
  }

  function api(path, options) {
    var opts = options || {};
    var fetchOpts = {
      method: opts.method || "GET",
      credentials: "include",
      headers: {}
    };

    if (opts.body !== undefined) {
      fetchOpts.headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(opts.body);
    }

    return fetch(CONFIG.apiBase + path, fetchOpts).then(function (res) {
      if (res.status === 401) {
        redirectToLogin();
        var err = new Error("unauthorized");
        err.status = 401;
        throw err;
      }

      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) {
            var e = new Error(data && data.error ? data.error : "request_failed");
            e.status = res.status;
            throw e;
          }
          return data;
        });
    });
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (err) {
      return d.toISOString();
    }
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initLogout() {
    var btn = els.logoutBtn;
    if (!btn) return;

    btn.addEventListener("click", function () {
      setLoading(btn, true);
      api("/auth/logout", { method: "POST" })
        .catch(function () {})
        .then(function () {
          redirectToLogin();
        });
    });
  }

  function loadMe() {
    return api("/auth/me").then(function (data) {
      if (els.adminName) {
        els.adminName.textContent = (data && data.username) || "المسؤول";
      }
      return data;
    });
  }

  function loadStats() {
    return api("/admin/stats").then(function (data) {
      if (els.statTotalNotifications) {
        els.statTotalNotifications.textContent = String(
          (data && data.totalNotifications) || 0
        );
      }
      if (els.statTotalDevices) {
        els.statTotalDevices.textContent = String(
          (data && data.totalDevices) || 0
        );
      }
      if (els.statLastNotification) {
        els.statLastNotification.textContent = data && data.lastNotificationAt
          ? formatDateTime(data.lastNotificationAt)
          : "—";
      }
      if (els.statServiceStatus) {
        var status = (data && data.serviceStatus) || "unknown";
        var label =
          status === "operational"
            ? "تعمل"
            : status === "degraded"
            ? "متأخرة"
            : status === "offline"
            ? "متوقفة"
            : "غير معروفة";
        els.statServiceStatus.textContent = label;
      }
    });
  }

  function loadCurrentVerse() {
    return api("/verse/current").then(function (data) {
      currentVerse = {
        text: (data && data.text) || "",
        ref: (data && data.ref) || "",
        updatedAt: (data && data.updatedAt) || null
      };
      if (els.verseTextInput) els.verseTextInput.value = currentVerse.text;
      if (els.verseRefInput) els.verseRefInput.value = currentVerse.ref;
      if (els.verseUpdatedAt) {
        els.verseUpdatedAt.textContent = currentVerse.updatedAt
          ? "آخر تحديث: " + formatDateTime(currentVerse.updatedAt)
          : "";
      }
    });
  }

  function saveVerse(e) {
    e.preventDefault();
    var text = els.verseTextInput ? els.verseTextInput.value.trim() : "";
    var ref = els.verseRefInput ? els.verseRefInput.value.trim() : "";

    if (!text) {
      showToast("يرجى إدخال نص الآية");
      els.verseTextInput && els.verseTextInput.focus();
      return;
    }

    if (!ref) {
      showToast("يرجى إدخال المرجع");
      els.verseRefInput && els.verseRefInput.focus();
      return;
    }

    setLoading(els.saveVerseBtn, true);
    api("/verse", { method: "PUT", body: { text: text, ref: ref } })
      .then(function (data) {
        currentVerse = {
          text: data.text,
          ref: data.ref,
          updatedAt: data.updatedAt
        };
        if (els.verseUpdatedAt) {
          els.verseUpdatedAt.textContent =
            "آخر تحديث: " + formatDateTime(data.updatedAt);
        }
        showToast("تم حفظ الآية بنجاح");
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        showToast("تعذّر حفظ الآية، حاول مرة أخرى");
      })
      .then(function () {
        setLoading(els.saveVerseBtn, false);
      });
  }

  function initVerseForm() {
    if (!els.verseForm) return;
    els.verseForm.addEventListener("submit", saveVerse);
  }

  function openConfirmModal() {
    var modal = els.confirmModal;
    if (!modal) return;
    var preview = els.confirmText;
    if (preview) {
      var body = els.notifBodyInput ? els.notifBodyInput.value.trim() : "";
      var ref = els.notifRefInput ? els.notifRefInput.value.trim() : "";
      preview.textContent = ref ? body + "\n— " + ref : body;
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeConfirmModal() {
    var modal = els.confirmModal;
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function initNotifForm() {
    var form = els.notifForm;
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var title = els.notifTitleInput ? els.notifTitleInput.value.trim() : "";
      var body = els.notifBodyInput ? els.notifBodyInput.value.trim() : "";

      if (!title) {
        showToast("يرجى إدخال عنوان الإشعار");
        els.notifTitleInput && els.notifTitleInput.focus();
        return;
      }

      if (!body) {
        showToast("يرجى إدخال نص الإشعار");
        els.notifBodyInput && els.notifBodyInput.focus();
        return;
      }

      openConfirmModal();
    });

    if (els.confirmCancel) {
      els.confirmCancel.addEventListener("click", closeConfirmModal);
    }

    if (els.confirmModal) {
      els.confirmModal.querySelectorAll("[data-close-modal]").forEach(function (el) {
        el.addEventListener("click", closeConfirmModal);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.confirmModal && !els.confirmModal.hidden) {
        closeConfirmModal();
      }
    });

    if (els.confirmSend) {
      els.confirmSend.addEventListener("click", sendNotification);
    }
  }

  function sendNotification() {
    var title = els.notifTitleInput.value.trim();
    var body = els.notifBodyInput.value.trim();
    var ref = els.notifRefInput ? els.notifRefInput.value.trim() : "";

    setLoading(els.confirmSend, true);
    setLoading(els.sendNotifBtn, true);

    api("/notifications/send", {
      method: "POST",
      body: { title: title, body: body, ref: ref }
    })
      .then(function () {
        closeConfirmModal();
        showToast("تم إرسال الإشعار بنجاح");
        if (els.notifBodyInput) els.notifBodyInput.value = "";
        if (els.notifRefInput) els.notifRefInput.value = "";
        loadNotifications();
        loadStats();
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        showToast("تعذّر إرسال الإشعار، حاول مرة أخرى");
      })
      .then(function () {
        setLoading(els.confirmSend, false);
        setLoading(els.sendNotifBtn, false);
      });
  }

  function statusLabel(status) {
    if (status === "sent") return "تم الإرسال";
    if (status === "partial") return "إرسال جزئي";
    if (status === "failed") return "فشل";
    if (status === "pending") return "قيد الإرسال";
    return "غير معروفة";
  }

  function statusClass(status) {
    if (status === "sent") return "is-success";
    if (status === "failed") return "is-error";
    return "is-pending";
  }

  function renderHistory(list) {
    var items = list || [];
    var hasItems = items.length > 0;

    if (els.historyEmpty) els.historyEmpty.hidden = hasItems;
    if (els.historyTableWrap) els.historyTableWrap.hidden = !hasItems;

    var isMobile = window.matchMedia("(max-width: 720px)").matches;

    if (els.historyCards) {
      els.historyCards.hidden = !(hasItems && isMobile);
    }

    if (els.historyBody) {
      els.historyBody.innerHTML = items
        .map(function (item) {
          return (
            "<tr>" +
            '<td class="cell-muted">' + escapeHtml(formatDateTime(item.createdAt)) + "</td>" +
            "<td>" + escapeHtml(item.title || "—") + "</td>" +
            '<td class="cell-message">' + escapeHtml(item.body || "—") + "</td>" +
            "<td>" + escapeHtml(String(item.deviceCount || 0)) + "</td>" +
            '<td><span class="status-pill ' + statusClass(item.status) + '">' +
            escapeHtml(statusLabel(item.status)) +
            "</span></td>" +
            "</tr>"
          );
        })
        .join("");
    }

    if (els.historyCards) {
      els.historyCards.innerHTML = items
        .map(function (item) {
          return (
            '<article class="history-card">' +
            '<div class="history-card-row"><span class="history-card-label">التاريخ</span>' +
            '<span class="history-card-value">' + escapeHtml(formatDateTime(item.createdAt)) + "</span></div>" +
            '<div class="history-card-row"><span class="history-card-label">العنوان</span>' +
            '<span class="history-card-value">' + escapeHtml(item.title || "—") + "</span></div>" +
            '<div class="history-card-row"><span class="history-card-label">الرسالة</span>' +
            '<span class="history-card-value">' + escapeHtml(item.body || "—") + "</span></div>" +
            '<div class="history-card-row"><span class="history-card-label">عدد الأجهزة</span>' +
            '<span class="history-card-value">' + escapeHtml(String(item.deviceCount || 0)) + "</span></div>" +
            '<div class="history-card-row"><span class="history-card-label">الحالة</span>' +
            '<span class="history-card-value"><span class="status-pill ' + statusClass(item.status) + '">' +
            escapeHtml(statusLabel(item.status)) +
            "</span></span></div>" +
            "</article>"
          );
        })
        .join("");
    }
  }

  function applyHistoryFilter() {
    var query = els.historySearch ? els.historySearch.value.trim().toLowerCase() : "";
    if (!query) {
      renderHistory(notifications);
      return;
    }
    var filtered = notifications.filter(function (item) {
      return (
        (item.title || "").toLowerCase().indexOf(query) !== -1 ||
        (item.body || "").toLowerCase().indexOf(query) !== -1 ||
        (item.ref || "").toLowerCase().indexOf(query) !== -1
      );
    });
    renderHistory(filtered);
  }

  function loadNotifications() {
    return api("/notifications").then(function (data) {
      notifications = (data && data.items) || [];
      applyHistoryFilter();
    });
  }

  function initHistorySearch() {
    if (!els.historySearch) return;
    els.historySearch.addEventListener("input", applyHistoryFilter);

    window.addEventListener("resize", function () {
      applyHistoryFilter();
    });
  }

  function showContent() {
    if (els.dashLoading) els.dashLoading.hidden = true;
    if (els.dashContent) els.dashContent.hidden = false;
  }

  function init() {
    cacheElements();
    initLogout();
    initVerseForm();
    initNotifForm();
    initHistorySearch();

    loadMe()
      .then(function () {
        showContent();
        return Promise.all([loadCurrentVerse(), loadStats(), loadNotifications()]);
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
