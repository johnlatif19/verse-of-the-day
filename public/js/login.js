(function () {
  "use strict";

  var CONFIG = {
    apiBase: "/api"
  };

  var SELECTORS = {
    form: "#loginForm",
    username: "#username",
    password: "#password",
    togglePassword: "#togglePassword",
    error: "#authError",
    submitBtn: "#loginBtn",
    toast: "#toast"
  };

  var els = {};
  var toastTimer = null;

  function cacheElements() {
    Object.keys(SELECTORS).forEach(function (key) {
      els[key] = document.querySelector(SELECTORS[key]);
    });
  }

  function showToast(message, duration) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, duration || 2400);
  }

  function setError(message) {
    if (!els.error) return;
    els.error.textContent = message || "";
  }

  function setLoading(isLoading) {
    if (!els.submitBtn) return;
    els.submitBtn.classList.toggle("is-loading", isLoading);
    els.submitBtn.disabled = isLoading;
  }

  function initTogglePassword() {
    var btn = els.togglePassword;
    var input = els.password;
    if (!btn || !input) return;

    btn.addEventListener("click", function () {
      var isVisible = input.type === "text";
      input.type = isVisible ? "password" : "text";
      btn.classList.toggle("is-active", !isVisible);
      btn.setAttribute("aria-pressed", String(!isVisible));
      btn.setAttribute(
        "aria-label",
        !isVisible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
      );
      input.focus();
    });
  }

  function validate() {
    var username = els.username ? els.username.value.trim() : "";
    var password = els.password ? els.password.value : "";

    if (!username) {
      setError("يرجى إدخال اسم المستخدم.");
      els.username && els.username.focus();
      return null;
    }

    if (!password) {
      setError("يرجى إدخال كلمة المرور.");
      els.password && els.password.focus();
      return null;
    }

    setError("");
    return { username: username, password: password };
  }

  function postLogin(credentials) {
    return fetch(CONFIG.apiBase + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(credentials)
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
    });
  }

  function initSubmit() {
    var form = els.form;
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (els.submitBtn && els.submitBtn.classList.contains("is-loading")) return;

      var credentials = validate();
      if (!credentials) return;

      setLoading(true);
      setError("");

      postLogin(credentials)
        .then(function (result) {
          if (result.ok) {
            showToast("تم تسجيل الدخول بنجاح");
            window.location.replace("/dashboard");
            return;
          }

          if (result.status === 429) {
            setError("محاولات كثيرة. يرجى المحاولة بعد قليل.");
          } else if (result.status === 401) {
            setError("بيانات الدخول غير صحيحة.");
          } else {
            setError("تعذّر تسجيل الدخول. يرجى المحاولة مرة أخرى.");
          }
        })
        .catch(function () {
          setError("تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
        })
        .then(function () {
          setLoading(false);
        });
    });
  }

  function init() {
    cacheElements();
    initTogglePassword();
    initSubmit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
