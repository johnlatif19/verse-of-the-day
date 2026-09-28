"use strict";

const admin = require("firebase-admin");

let app = null;
let db = null;

function initFirebase() {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[db] Firebase credentials missing. Falling back to memory store.");
    return null;
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: projectId,
      clientEmail: clientEmail,
      privateKey: privateKey
    })
  });

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  return app;
}

function isEnabled() {
  return db !== null;
}

function getDb() {
  return db;
}

const memory = {
  devices: new Map(),
  notifications: [],
  sentPairs: new Set(),
  verse: {
    text: "«تَوَكَّلْ عَلَى الرَّبِّ بِكُلِّ قَلْبِكَ، وَعَلَى فَهْمِكَ لاَ تَعْتَمِدْ.»",
    ref: "أمثال 3: 5",
    updatedAt: new Date().toISOString()
  }
};

const VERSE_DOC = "verse/current";
const DEVICES_COL = "devices";
const NOTIFICATIONS_COL = "notifications";

async function getVerse() {
  if (!isEnabled()) return memory.verse;

  try {
    const snap = await db.doc(VERSE_DOC).get();
    if (!snap.exists) {
      await db.doc(VERSE_DOC).set(memory.verse);
      return memory.verse;
    }
    const data = snap.data();
    return {
      text: data.text || memory.verse.text,
      ref: data.ref || memory.verse.ref,
      updatedAt: data.updatedAt || memory.verse.updatedAt
    };
  } catch (err) {
    console.error("[db] getVerse failed:", err.message);
    return memory.verse;
  }
}

async function setVerse(text, ref) {
  const payload = {
    text: text,
    ref: ref,
    updatedAt: new Date().toISOString()
  };

  if (!isEnabled()) {
    memory.verse = payload;
    return payload;
  }

  try {
    await db.doc(VERSE_DOC).set(payload, { merge: true });
    return payload;
  } catch (err) {
    console.error("[db] setVerse failed:", err.message);
    memory.verse = payload;
    return payload;
  }
}

async function registerDevice(device) {
  const now = new Date().toISOString();

  if (!isEnabled()) {
    const existing = memory.devices.get(device.deviceId);
    memory.devices.set(device.deviceId, {
      deviceId: device.deviceId,
      subscription: device.subscription || null,
      userAgent: device.userAgent || "",
      language: device.language || "",
      platform: device.platform || "",
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });
    return { ok: true };
  }

  try {
    const ref = db.collection(DEVICES_COL).doc(device.deviceId);
    const snap = await ref.get();

    const payload = {
      deviceId: device.deviceId,
      subscription: device.subscription || null,
      userAgent: device.userAgent || "",
      language: device.language || "",
      platform: device.platform || "",
      createdAt: snap.exists ? snap.data().createdAt || now : now,
      updatedAt: now
    };

    await ref.set(payload, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error("[db] registerDevice failed:", err.message);
    return { ok: false };
  }
}

async function unregisterDevice(deviceId) {
  if (!isEnabled()) {
    memory.devices.delete(deviceId);
    return { ok: true };
  }

  try {
    await db.collection(DEVICES_COL).doc(deviceId).delete();
    return { ok: true };
  } catch (err) {
    console.error("[db] unregisterDevice failed:", err.message);
    return { ok: false };
  }
}

async function countDevices() {
  if (!isEnabled()) return memory.devices.size;

  try {
    const snap = await db.collection(DEVICES_COL).count().get();
    return snap.data().count || 0;
  } catch (err) {
    console.error("[db] countDevices failed:", err.message);
    return 0;
  }
}

async function listDeviceIds() {
  if (!isEnabled()) return Array.from(memory.devices.keys());

  try {
    const snap = await db.collection(DEVICES_COL).select().get();
    return snap.docs.map((d) => d.id);
  } catch (err) {
    console.error("[db] listDeviceIds failed:", err.message);
    return [];
  }
}

async function saveNotification(record) {
  if (!isEnabled()) {
    memory.notifications.unshift(record);
    if (memory.notifications.length > 500) {
      memory.notifications.length = 500;
    }
    return record;
  }

  try {
    await db.collection(NOTIFICATIONS_COL).doc(record.id).set(record, { merge: true });
    return record;
  } catch (err) {
    console.error("[db] saveNotification failed:", err.message);
    memory.notifications.unshift(record);
    return record;
  }
}

async function markSent(notificationId, deviceId) {
  if (!isEnabled()) {
    memory.sentPairs.add(notificationId + "::" + deviceId);
    return true;
  }

  try {
    await db.collection(NOTIFICATIONS_COL).doc(notificationId).set(
      {
        sentDeviceIds: admin.firestore.FieldValue.arrayUnion(deviceId)
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error("[db] markSent failed:", err.message);
    return false;
  }
}

async function listNotifications(limit) {
  const max = limit || 100;

  if (!isEnabled()) {
    return memory.notifications.slice(0, max);
  }

  try {
    const snap = await db
      .collection(NOTIFICATIONS_COL)
      .orderBy("createdAt", "desc")
      .limit(max)
      .get();

    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.error("[db] listNotifications failed:", err.message);
    return [];
  }
}

async function getNotification(id) {
  if (!isEnabled()) {
    return memory.notifications.find((n) => n.id === id) || null;
  }

  try {
    const snap = await db.collection(NOTIFICATIONS_COL).doc(id).get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error("[db] getNotification failed:", err.message);
    return null;
  }
}

async function countNotifications() {
  if (!isEnabled()) return memory.notifications.length;

  try {
    const snap = await db.collection(NOTIFICATIONS_COL).count().get();
    return snap.data().count || 0;
  } catch (err) {
    console.error("[db] countNotifications failed:", err.message);
    return 0;
  }
}

async function lastNotificationAt() {
  if (!isEnabled()) {
    return memory.notifications[0] ? memory.notifications[0].createdAt : null;
  }

  try {
    const snap = await db
      .collection(NOTIFICATIONS_COL)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0].data().createdAt || null;
  } catch (err) {
    console.error("[db] lastNotificationAt failed:", err.message);
    return null;
  }
}

module.exports = {
  initFirebase: initFirebase,
  isEnabled: isEnabled,
  getDb: getDb,
  getVerse: getVerse,
  setVerse: setVerse,
  registerDevice: registerDevice,
  unregisterDevice: unregisterDevice,
  countDevices: countDevices,
  listDeviceIds: listDeviceIds,
  saveNotification: saveNotification,
  markSent: markSent,
  listNotifications: listNotifications,
  getNotification: getNotification,
  countNotifications: countNotifications,
  lastNotificationAt: lastNotificationAt
};
