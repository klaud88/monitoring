# რამდენიმე ორგანიზაცია ერთ დომენზე: kgm.online.ge

ყველა მომხმარებელი შედის **kgm.online.ge**-ზე. login-ის შემდეგ, მისამართის შეცვლის გარეშე, ის ხვდება თავისი ორგანიზაციის აპში. თითო ორგანიზაციას აქვს ცალკე MySQL ბაზა, `AUTH_SECRET`, BioStar და pm2 პროცესი.

```
ბრაუზერი ─▶ nginx ─┬─ kgm_tenant cookie არ არის ─▶ kgm-portal (3000): მხოლოდ login
                   ├─ kgm_tenant=org1          ─▶ kgm-org1   (3001, ბაზა: biostar_status_ops)
                   └─ kgm_tenant=org2          ─▶ kgm-org2   (3002, ბაზა: kgm_org2)
```

- კოდი და build ერთია (`/var/www/kgm`). pm2 თითო პროცესს უშვებს `/etc/kgm/*.env` ფაილიდან ([ecosystem.config.cjs](../ecosystem.config.cjs)).
- **portal** (`PORTAL_MODE=1`) ბაზას არ იყენებს. login-ისას ელ-ფოსტით პოულობს ორგანიზაციას, login-ს მის პროცესს გადასცემს და ბრაუზერს `kgm_tenant` cookie-ს უყენებს.
- თითო ორგანიზაციის `AUTH_SECRET` განსხვავებული უნდა იყოს. ამიტომ ხელით შეცვლილი `kgm_tenant` სხვა ორგანიზაციის მონაცემებს ვერ გახსნის.
- **login მხოლოდ ელ-ფოსტით.** X-Station კოდით (`101`, `TB-101`) შესვლა გათიშულია. ბაღის ანგარიშს რეალური ელ-ფოსტა უნდა ჰქონდეს (`scripts/import-garden-contacts.mjs` ან მომხმარებლების გვერდი). `TENANT_PREFIX` (ორგანიზაციის ინიციალები) login-ში აღარ გამოიყენება.
- **ელ-ფოსტა ორ ორგანიზაციაში ვერ იქნება.** ასეთ მომხმარებელს portal არ შეუშვებს და `pm2 logs kgm-portal`-ში დაწერს `exists in several organisations`.

---

## 1. ერთჯერადი გადასვლა: არსებული monitoring ხდება org1

ეს ნაბიჯები სერვერზე root-ით სრულდება. მონაცემები არ იცვლება, არსებული ბაზა `org1`-ის ბაზა ხდება.

### 1.1 DNS და SSL
- DNS: `kgm.online.ge` A ჩანაწერით მიუთითე სერვერის IP-ზე.
- `certbot certonly --nginx -d kgm.online.ge`

### 1.2 env ფაილები
```bash
mkdir -p /etc/kgm && chmod 700 /etc/kgm
SYNC=$(openssl rand -hex 32)

# org1 = არსებული აპის .env + ახალი ხაზები (TENANT_PREFIX: ორგანიზაციის ინიციალები, 2–6 ლათინური ასო)
cp /var/www/monitoring/.env /etc/kgm/org1.env
cat >> /etc/kgm/org1.env <<EOF
TENANT_SLUG=org1
TENANT_PREFIX=TB
PORT=3001
PORTAL_SYNC_SECRET=$SYNC
APP_URL=https://kgm.online.ge
EOF
# თუ org1.env-ში უკვე იყო PORT ან APP_URL, ძველი ხაზები წაშალე.

cat > /etc/kgm/portal.env <<EOF
PORTAL_MODE=1
PORT=3000
PORTAL_SYNC_SECRET=$SYNC
APP_URL=https://kgm.online.ge
EOF
chmod 600 /etc/kgm/*.env
```

### 1.3 კოდი და build
```bash
git clone https://github.com/klaud88/monitoring.git /var/www/kgm
cd /var/www/kgm
# build-ისთვის საჭიროა მხოლოდ Google Maps-ის საჯარო გასაღებები.
# აქ სხვა ცვლადი არ ჩაწერო: ეს ფაილი ყველა პროცესში ჩაიტვირთება.
grep '^NEXT_PUBLIC_' /var/www/monitoring/.env > .env.production
npm ci
DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" npm run build
```
⚠️ `/var/www/kgm`-ში `.env` ფაილი **არ** უნდა იყოს. ყველა პარამეტრი `/etc/kgm/*.env`-იდან მოდის.

### 1.4 pm2
```bash
pm2 delete monitoring
cd /var/www/kgm
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 ls          # kgm-org1, kgm-portal: online
```

### 1.5 nginx
```bash
cp /var/www/kgm/deploy/nginx-kgm.conf.example /etc/nginx/sites-available/kgm
ln -s /etc/nginx/sites-available/kgm /etc/nginx/sites-enabled/kgm
nginx -t && systemctl reload nginx
```

### 1.6 cron
`crontab -e`: ყველა `/api/cron/...` გამოძახება გადაიყვანე ორგანიზაციის **პირდაპირ პორტზე**. ეს შეიძლება დომენით არ გაკეთდეს, რადგან დომენზე cookie-ს გარეშე portal-ს მოხვდება:
```
curl -X POST "http://127.0.0.1:3001/api/cron/offline-capture" -H "Authorization: Bearer <org1-ის OFFLINE_CAPTURE_SECRET>"
```

### 1.7 შემოწმება
- `https://kgm.online.ge` → login. org1-ის მომხმარებლით შესვლა → ჩვეულებრივი dashboard.
- გასვლა → ისევ login.
- GitHub Actions deploy ამის შემდეგ ავტომატურად `/var/www/kgm`-ს განაახლებს ([deploy.yml](../.github/workflows/deploy.yml)).
- ძველი `/var/www/monitoring` შეგიძლია წაშალო, როცა ყველაფერი რამდენიმე დღე სტაბილურად იმუშავებს.

---

## 2. ახალი ორგანიზაციის დამატება (მაგ. org2)

```bash
# 2.1 ბაზა: სტრუქტურა და როლები/უფლებები org1-იდან, მონაცემების გარეშე
mysql -e "create database kgm_org2 character set utf8mb4 collate utf8mb4_unicode_ci;
          create user 'kgm_org2'@'localhost' identified by '<პაროლი>';
          grant all on kgm_org2.* to 'kgm_org2'@'localhost';"
mysqldump --no-data biostar_status_ops | mysql kgm_org2
mysqldump --no-create-info biostar_status_ops roles permissions role_permissions app_migrations | mysql kgm_org2

# 2.2 env ფაილი: საკუთარი AUTH_SECRET, ბაზა, BioStar, პორტი
cat > /etc/kgm/org2.env <<EOF
TENANT_SLUG=org2
TENANT_PREFIX=VK
PORT=3002
DATABASE_URL=mysql://kgm_org2:<პაროლი>@127.0.0.1:3306/kgm_org2
AUTH_SECRET=$(openssl rand -hex 32)
OFFLINE_CAPTURE_SECRET=$(openssl rand -hex 32)
APP_URL=https://kgm.online.ge
PORTAL_SYNC_SECRET=$(grep ^PORTAL_SYNC_SECRET= /etc/kgm/portal.env | cut -d= -f2)
BIOSTAR_URL=...
BIOSTAR2_USERNAME=...
BIOSTAR2_PASSWORD=...
EOF
chmod 600 /etc/kgm/org2.env
# org1.env-იდან გადმოიტანე ის ცვლადებიც, რომლებიც აქ არ წერია და org2-საც სჭირდება.

# 2.3 პირველი admin
cd /var/www/kgm
node scripts/create-admin.mjs /etc/kgm/org2.env admin@org2.ge "სახელი გვარი"
# ერთჯერადი პაროლი გამოჩნდება, პირველ შესვლაზე შეცვლა მოუწევს.

# 2.4 nginx: map-ში ახალი ხაზი
#   org2    127.0.0.1:3002;
nano /etc/nginx/sites-available/kgm
nginx -t && systemctl reload nginx

# 2.5 პროცესი. portal ახალ ორგანიზაციას ავტომატურად დაინახავს.
pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save

# 2.6 cron: org2-ისთვის იგივე ხაზები http://127.0.0.1:3002-ზე
```

---

## პრობლემების მოგვარება
| სიმპტომი | სად შეამოწმო |
| --- | --- |
| login-ზე „არასწორი ელფოსტა…“, პაროლი სწორია | `pm2 logs kgm-portal`: `could not load identifiers` (ორგანიზაციის პროცესი გათიშულია ან `PORTAL_SYNC_SECRET` არ ემთხვევა) ან `several organisations` |
| login გადის, მაგრამ ისევ login-ზე ბრუნდება | nginx `map`-ში ორგანიზაციის ხაზი აკლია ან პორტი არასწორია |
| 503 „სერვისი დროებით მიუწვდომელია“ | ორგანიზაციის პროცესი გათიშულია: `pm2 ls`, `pm2 logs kgm-<slug>` |
| ახალი მომხმარებელი ვერ შედის | portal სიას 30 წამში ერთხელ ანახლებს. სცადე ნახევარ წუთში |
| ბაღი `TB-101`-ით ვერ შედის | `pm2 logs kgm-portal`: `X-Station prefix ... invalid or already used` (ინიციალები ორ ორგანიზაციას ერთნაირი აქვს ან არ არის 2–6 ლათინური ასო) |
