# آية اليوم | Verse of the Day

A Christian Coptic Orthodox daily verse and spiritual notification platform.

The site delivers a verse from the Holy Bible to users every day, and lets
the administrator push notifications to all registered devices.

The interface is Arabic (RTL) by default and is built to feel quiet, sacred,
modern, and premium.

---

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Node.js
- Express.js
- JWT authentication
- bcrypt password hashing
- Web Push (VAPID) via Service Worker
- dotenv
- Vercel-ready

No frontend frameworks. No build step.

---

## Project Structure

```text
public/
├── index.html
├── login.html
├── dashboard.html
├── css/
│   ├── index.css
│   ├── login.css
│   └── dashboard.css
├── js/
│   ├── index.js
│   ├── login.js
│   └── dashboard.js
└── sw.js

server.js
package.json
vercel.json
.env.example
.gitignore
README.md
```

---

## Installation

```bash
git clone <your-repo-url>
cd verse-of-the-day
npm install
```

---

## Generate ADMIN_PASSWORD_HASH

The admin password is never stored in plain text. It is stored as a bcrypt
hash in the environment.

Run the following command and enter your password when prompted:

```bash
node -e "const bcrypt=require('bcrypt');const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});rl.question('Password: ',async (p)=>{const h=await bcrypt.hash(p,12);console.log('\nADMIN_PASSWORD_HASH='+h+'\n');rl.close();});"
```

Copy the printed hash and place it in `.env` as `ADMIN_PASSWORD_HASH`.

You can also generate one quickly:

```bash
node -e "console.log(require('bcrypt').hashSync('YOUR_PASSWORD', 12))"
```

---

## Configure .env

Copy the example file:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
NODE_ENV=development
PORT=3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<paste the bcrypt hash here>

JWT_SECRET=<a long random string, at least 32 characters>
```

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Optional:

```env
CORS_ORIGINS=https://your-domain.com,http://localhost:3000
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

---

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Admin login:

```text
http://localhost:3000/login.html
```

The dashboard is protected on the server. Visiting `/dashboard.html` without
a valid JWT redirects to `/login.html` before the page loads.

---

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Set the environment variables in the Vercel dashboard:

   - `NODE_ENV=production`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `JWT_SECRET`
   - `CORS_ORIGINS`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

4. Deploy.

The `vercel.json` routes:

- `/api/*` to the Express app
- `/dashboard.html` to the Express app (so it can enforce auth)
- everything else to `/public`

Because Vercel serverless functions are stateless, the in-memory store is
reset on each cold start. For production, connect the `store` object in
`server.js` to a hosted database (Postgres, MongoDB, Redis, etc.). All routes
already read and write through that single object, so swapping the storage
layer does not require changing the API.

---

## Configure Firebase Cloud Messaging

The current backend supports standard Web Push via VAPID (no Firebase
required). To use Firebase Cloud Messaging instead:

1. Create a Firebase project.
2. Go to Project Settings → Cloud Messaging.
3. Generate a Web Push certificate (VAPID key pair).
4. Copy the public key into `VAPID_PUBLIC_KEY` and the private key into
   `VAPID_PRIVATE_KEY`.
5. In `public/js/index.js`, `fetchVapidKey()` already reads the public key
   from `GET /api/devices/public-key`. No client change is needed.
6. To send pushes from the server, install `web-push`:

   ```bash
   npm install web-push
   ```

7. In `server.js`, after building the notification `record`, iterate over
   `store.devices` and call:

   ```js
   webpush.sendNotification(device.subscription, JSON.stringify({
     title: record.title,
     body: record.body,
     notificationId: record.id,
     url: "/"
   }));
   ```

   The Service Worker already handles the `push` event and shows the
   notification with `self.registration.showNotification()`.

If you prefer Firebase Admin SDK instead of raw Web Push:

```bash
npm install firebase-admin
```

Then load the service account JSON from an environment variable
(`FIREBASE_CONFIG`) and use `admin.messaging().sendMulticast(...)` with
the FCM tokens stored on each device.

---

## How Notification Permission and Device Registration Work

1. The user opens `/` and clicks **تفعيل الإشعارات**.
2. `index.js` calls `Notification.requestPermission()`.
3. On `granted`, it registers `/sw.js` as the Service Worker.
4. It fetches the VAPID public key from `GET /api/devices/public-key`.
5. It calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
6. The resulting subscription is sent to `POST /api/devices/register`
   together with a stable anonymous `deviceId` stored in `localStorage`.
7. The backend stores `{ deviceId, subscription, userAgent, ... }` in the
   `store.devices` map.

Each device is identified by its own `deviceId`. No user account is
required for regular users.

When the admin sends a notification from the dashboard:

1. `POST /api/notifications/send` runs with `requireAuth`.
2. The server assigns a unique `notificationId` (for example `ntf_ab12...`).
3. It records the pair `notificationId::deviceId` in `store.sentPairs` so a
   retry cannot deliver the same notification twice to the same device.
4. It stores the notification record in `store.notifications`.
5. The dashboard reads history from `GET /api/notifications`.

The Service Worker shows the notification with a `tag` set to
`vod-<notificationId>`, which further prevents visual duplicates in the OS
notification tray.

---

## Offline Behavior

- The Service Worker precaches the core static assets on install.
- Navigations fall back to the cached shell if the network is unavailable.
- API requests are never cached.
- A device that is completely offline cannot receive a network push.
  Delivery resumes according to the push service and browser TTL rules.
- The server assigns a unique ID to every notification and tracks sent
  pairs, so retries do not produce duplicate notifications.

---

## Security Notes

- The admin password is stored only as a bcrypt hash.
- JWT is signed with `JWT_SECRET` and stored in an HTTP-only cookie.
- Cookies are `SameSite=Lax` and `Secure` in production.
- Login is rate-limited (10 attempts per 15 minutes per IP).
- `/dashboard.html` is protected on the server, not only in JavaScript.
- All admin APIs use `requireAuth` and return 401 otherwise.
- Inputs are validated and sanitized on every write endpoint.
- Secrets live only in `.env` and Vercel environment variables. They are
  never committed and never exposed to the frontend.

---

## Wrapping with Median Later

The project is designed to be wrapped inside a Median native app without
rebuilding:

- The frontend has no desktop-only API dependencies.
- All backend logic is exposed through `/api/*` and works with any client.
- The layout is mobile-first and safe-area aware.
- The notification layer is isolated:
  - Web Push via VAPID works today in the browser.
  - For Median, replace the browser subscription flow with the native
    FCM or APNs token and send it to `POST /api/devices/register`.
  - The server-side `store.devices` structure already supports any token
    format, so the same endpoint can accept either a Web Push subscription
    or a native device token.

What changes when wrapping with Median:

1. Point the WebView to `https://your-domain.com`.
2. Replace `Notification.requestPermission()` and `pushManager.subscribe()`
   with the Median native push API.
3. Send the native token to `/api/devices/register` in place of the Web Push
   subscription object.
4. Update the server's send step to use `firebase-admin` (FCM) or an APNs
   library instead of `web-push` for those tokens.

Nothing else in the frontend or backend needs to change.

---

## License

MIT
