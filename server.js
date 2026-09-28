"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

const COOKIE_NAME = "vod_token";
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
const IS_PROD = process.env.NODE_ENV === "production";

if (!JWT_SECRET) {
  console.warn("[startup] JWT_SECRET is missing. Admin endpoints will be disabled.");
}

if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
  console.warn("[startup] ADMIN_USERNAME or ADMIN_PASSWORD_HASH missing. Login will fail.");
}

const store = {
  devices: new Map(),
  notifications: [],
  sentPairs: new Set(),
  verse: {
    text: "«تَوَكَّلْ عَلَى الرَّبِّ بِكُلِّ قَلْبِكَ، وَعَلَى فَهْمِكَ لاَ تَعْتَمِدْ.»",
    ref: "أمثال 3: 5",
    updatedAt: new Date().toISOString()
  }
};

function makeId(prefix) {
  return prefix + "_" + crypto.randomBytes(9).toString("hex");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" }
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", publicLimiter);

function signToken(username) {
  return jwt.sign({ sub: username, role: "admin" }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/"
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/"
  });
}

function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const auth = req.headers.authorization;
  if (auth && auth.indexOf("Bearer ") === 0) return auth.slice(7);
  return null;
}

function verifyToken(req) {
  const token = readToken(req);
  if (!token || !JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ error: "unauthorized" });
  }
  req.admin = payload;
  next();
}

function requireAdminPage(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.redirect("/login.html");
  }
  next();
}

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  const userOk = username === ADMIN_USERNAME;

  let passOk = false;
  try {
    passOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  } catch (err) {
    passOk = false;
  }

  if (!userOk || !passOk) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = signToken(username);
  setAuthCookie(res, token);

  return res.json({ ok: true, username: username });
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ username: req.admin.sub, role: "admin" });
});

app.get("/api/devices/public-key", (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  if (!publicKey) {
    return res.status(503).json({ error: "push_not_configured" });
  }
  return res.json({ publicKey: publicKey });
});

app.post("/api/devices/register", (req, res) => {
  const { deviceId, subscription, userAgent, language, platform } = req.body || {};

  if (!deviceId || typeof deviceId !== "string" || deviceId.length > 128) {
    return res.status(400).json({ error: "invalid_device_id" });
  }

  const existing = store.devices.get(deviceId);
  const now = new Date().toISOString();

  store.devices.set(deviceId, {
    deviceId: deviceId,
    subscription: subscription || null,
    userAgent: typeof userAgent === "string" ? userAgent.slice(0, 300) : "",
    language: typeof language === "string" ? language.slice(0, 32) : "",
    platform: typeof platform === "string" ? platform.slice(0, 64) : "",
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now
  });

  return res.json({ ok: true, deviceId: deviceId });
});

app.delete("/api/devices/unregister", (req, res) => {
  const deviceId = req.body && req.body.deviceId;
  if (!deviceId || typeof deviceId !== "string") {
    return res.status(400).json({ error: "invalid_device_id" });
  }
  store.devices.delete(deviceId);
  return res.json({ ok: true });
});

app.get("/api/verse/current", (req, res) => {
  return res.json({
    text: store.verse.text,
    ref: store.verse.ref,
    updatedAt: store.verse.updatedAt
  });
});

app.put("/api/verse", requireAuth, (req, res) => {
  const { text, ref } = req.body || {};

  if (typeof text !== "string" || !text.trim() || text.length > 500) {
    return res.status(400).json({ error: "invalid_text" });
  }

  if (typeof ref !== "string" || !ref.trim() || ref.length > 120) {
    return res.status(400).json({ error: "invalid_ref" });
  }

  store.verse = {
    text: text.trim(),
    ref: ref.trim(),
    updatedAt: new Date().toISOString()
  };

  return res.json(store.verse);
});

app.get("/api/admin/stats", requireAuth, (req, res) => {
  const totalNotifications = store.notifications.length;
  const totalDevices = store.devices.size;

  let lastNotificationAt = null;
  if (totalNotifications > 0) {
    lastNotificationAt = store.notifications[0].createdAt;
  }

  const pushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY);

  return res.json({
    totalNotifications: totalNotifications,
    totalDevices: totalDevices,
    lastNotificationAt: lastNotificationAt,
    serviceStatus: pushConfigured ? "operational" : "degraded"
  });
});

app.post("/api/notifications/send", requireAuth, (req, res) => {
  const { title, body, ref } = req.body || {};

  if (typeof title !== "string" || !title.trim() || title.length > 80) {
    return res.status(400).json({ error: "invalid_title" });
  }

  if (typeof body !== "string" || !body.trim() || body.length > 600) {
    return res.status(400).json({ error: "invalid_body" });
  }

  const notificationId = makeId("ntf");
  const createdAt = new Date().toISOString();

  const record = {
    id: notificationId,
    title: title.trim(),
    body: body.trim(),
    ref: typeof ref === "string" ? ref.trim().slice(0, 120) : "",
    deviceCount: 0,
    status: "sent",
    createdAt: createdAt,
    sentAt: createdAt
  };

  let delivered = 0;

  store.devices.forEach((device) => {
    const pairKey = notificationId + "::" + device.deviceId;
    if (store.sentPairs.has(pairKey)) return;

    store.sentPairs.add(pairKey);
    delivered += 1;
  });

  record.deviceCount = delivered;
  record.status = delivered > 0 ? "sent" : "pending";

  store.notifications.unshift(record);

  if (store.notifications.length > 500) {
    store.notifications.length = 500;
  }

  return res.json({
    ok: true,
    id: record.id,
    deviceCount: record.deviceCount,
    status: record.status,
    createdAt: record.createdAt
  });
});

app.get("/api/notifications", requireAuth, (req, res) => {
  return res.json({
    items: store.notifications.slice(0, 100).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      ref: n.ref,
      deviceCount: n.deviceCount,
      status: n.status,
      createdAt: n.createdAt
    }))
  });
});

app.get("/api/notifications/:id", requireAuth, (req, res) => {
  const item = store.notifications.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ error: "not_found" });
  return res.json(item);
});

const PUBLIC_DIR = path.join(__dirname, "public");

app.get("/dashboard.html", requireAdminPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "dashboard.html"));
});

app.use(express.static(PUBLIC_DIR, { index: "index.html", extensions: false }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html"));
  }
  return res.status(404).json({ error: "not_found" });
});

app.use((err, req, res, next) => {
  console.error("[error]", err && err.message ? err.message : err);
  res.status(500).json({ error: "server_error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("[server] listening on http://localhost:" + PORT);
  });
}

module.exports = app;
