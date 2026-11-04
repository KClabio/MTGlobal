# Launch guide

How to put the website on a live server, in order. Each setting is explained in `.env.example`.

## 1. What the server needs

- Node.js 20.19 or newer.
- MongoDB with automatic backups (a hosted plan, or a nightly backup job).
- HTTPS from the host, with `http://` redirecting to `https://`.
- A clock that sets itself (NTP): staff two-step codes allow only a small time difference.
- About 1 GB of memory for two copies of the site.

## 2. Install

```
git clone https://github.com/KClabio/MTGlobal.git
cd MTGlobal
npm ci --omit=dev
```

`--omit=dev` leaves out the test tools, which the live site doesn't use.

## 3. Settings

Copy `.env.example` to `.env` and fill it in as its notes say for the live server. At every start the server's log names any live setting that is missing, as lines starting with `Live server setting:`. Clear them all before opening the site.

Keep `.env` off git and out of any public place.

## 4. Move the content

Do this with the site stopped on both sides.

**The database.** Copy the content only. Accounts, requests and logs from the test computer stay behind:

```
mongodump --uri="<development MONGO_URI>" --out=launch-dump --excludeCollection=users --excludeCollection=quoterequests --excludeCollection=sessions --excludeCollection=loginthrottles --excludeCollection=pageviews --excludeCollection=errorlogs
mongorestore --uri="<live MONGO_URI>" --nsFrom="mtglobal_db.*" --nsTo="<live database name>.*" launch-dump/mtglobal_db
```

Read the second command's summary, then open the live database and check the numbers of products, projects, partners and help questions.

**The photos and videos.** The content links to files in `public/uploads/`, which are not in git. Copy that whole folder to the same place on the server. Don't copy `cache/`: the server makes its own.

Cloudinary only stores what is uploaded after it is switched on. Files copied here stay on the server's disk, so on a host that wipes its disk at each update, keep `public/uploads/` on a permanent disk or upload those files again through the admin.

## 5. Start with two copies

```
npm install -g pm2
pm2 start server.js --name mtglobal -i 2 --max-memory-restart 450M --kill-timeout 11000
pm2 save
pm2 startup
```

- `-i 2` runs two copies. A saved change to the company settings shows at once on one copy and within a minute on the other.
- `--max-memory-restart` restarts a copy if it grows too large.
- `--kill-timeout` gives visits in progress time to finish during an update: the site allows itself 10 seconds to stop.
- `pm2 startup` prints one more command to run, so the site comes back after the server restarts.

## 6. First accounts

Sign up on the live site with the owner's email, then on the server:

```
node scripts/make-admin.js owner@example.com --owner
```

The next time that account opens Quản trị, it sets up two-step login. Keep the backup codes somewhere safe.

## 7. Fill in and check

In the admin:

- Thông tin công ty: phone, email, address, map, Zalo and Messenger.
- Cài đặt chung → Email thông báo: who receives new requests.
- The privacy policy text, once it has been checked.

Then, on the live address:

1. Send a request and see the staff email and the confirmation arrive.
2. Use "Quên mật khẩu" and see the email arrive.
3. Log in with Google once.
4. Upload one picture in the admin and see it on the site.
5. Check that `ALERT_EMAIL_TO` is set, so server errors reach someone by email.

## 8. Keep it running

- **Uptime:** point a monitor at `/health`. It answers 200 when all is well and 503 when the database is away.
- **Backups:** restore one backup to a test database, to be sure it works.
- **Search engines:** submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- **Updates:** `git pull`, `npm ci --omit=dev`, then `pm2 reload mtglobal`.
