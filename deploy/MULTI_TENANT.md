# ngnix ახალი ორგ დამატება

map $cookie_onebit_tenant $onebit_upstream {
    default  127.0.0.1:3000;
    kgm      127.0.0.1:3001;
    sashvebi 127.0.0.1:3002;
    tegeta   127.0.0.1:3003; < ამას ვამატებთ მხოლოდ>
}

# რამდენიმე ორგანიზაცია ერთ დომენზე: kgm.online.ge

ყველა მომხმარებელი შედის **kgm.online.ge**-ზე. login-ის შემდეგ, მისამართის შეცვლის გარეშე, ის ხვდება თავისი ორგანიზაციის აპში. თითო ორგანიზაციას აქვს ცალკე MySQL ბაზა, `AUTH_SECRET`, BioStar და pm2 პროცესი.

```
ბრაუზერი ─▶ nginx ─┬─ onebit_tenant cookie არ არის ─▶ onebit-portal (3000): მხოლოდ login
                   ├─ onebit_tenant=kgm           ─▶ onebit-kgm    (3001, ბაზა: biostar_status_ops)
                   └─ onebit_tenant=org2          ─▶ onebit-org2   (3002, ბაზა: onebit_org2)
```

- კოდი და build ერთია (`/var/www/monitoring`). pm2 თითო პროცესს უშვებს `/etc/onebit/*.env` ფაილიდან ([ecosystem.config.cjs](../ecosystem.config.cjs)).
- **portal** (`PORTAL_MODE=1`) ბაზას არ იყენებს. login-ისას ელ-ფოსტით პოულობს ორგანიზაციას, login-ს მის პროცესს გადასცემს და ბრაუზერს `onebit_tenant` cookie-ს უყენებს.
- თითო ორგანიზაციის `AUTH_SECRET` განსხვავებული უნდა იყოს. ამიტომ ხელით შეცვლილი `onebit_tenant` სხვა ორგანიზაციის მონაცემებს ვერ გახსნის.
- **login მხოლოდ ელ-ფოსტით.** X-Station კოდით (`101`, `TB-101`) შესვლა გათიშულია. ბაღის ანგარიშს რეალური ელ-ფოსტა უნდა ჰქონდეს (`scripts/import-garden-contacts.mjs` ან მომხმარებლების გვერდი). `TENANT_PREFIX` (ორგანიზაციის ინიციალები) login-ში აღარ გამოიყენება.
- **ელ-ფოსტა ორ ორგანიზაციაში ვერ იქნება.** ასეთ მომხმარებელს portal არ შეუშვებს და `pm2 logs onebit-portal`-ში დაწერს `exists in several organisations`.

---

## 1. ერთჯერადი გადასვლა: არსებული monitoring ხდება kgm

ეს ნაბიჯები სერვერზე root-ით სრულდება. მონაცემები არ იცვლება, არსებული ბაზა `kgm`-ის ბაზა ხდება.

### 1.1 DNS და SSL
- DNS: `kgm.online.ge` A ჩანაწერით მიუთითე სერვერის IP-ზე.
- `certbot certonly --nginx -d kgm.online.ge`

### 1.2 env ფაილები
```bash
mkdir -p /etc/onebit && chmod 700 /etc/onebit
SYNC=$(openssl rand -hex 32)

# kgm = არსებული აპის .env + ახალი ხაზები (TENANT_PREFIX: ორგანიზაციის ინიციალები, 2–6 ლათინური ასო)
cp /var/www/monitoring/.env /etc/onebit/kgm.env
cat >> /etc/onebit/kgm.env <<EOF
TENANT_SLUG=kgm
TENANT_PREFIX=kgm
PORT=3001
PORTAL_SYNC_SECRET=$SYNC
APP_URL=https://kgm.online.ge
EOF
# თუ kgm.env-ში უკვე იყო PORT ან APP_URL, ძველი ხაზები წაშალე.

cat > /etc/onebit/portal.env <<EOF
PORTAL_MODE=1
PORT=3000
PORTAL_SYNC_SECRET=$SYNC
APP_URL=https://kgm.online.ge
EOF
chmod 600 /etc/onebit/*.env
```

### 1.3 კოდი და build
კოდი რჩება `/var/www/monitoring`-ში. 1.3 და 1.4 ერთად გაუშვი, შუაში დიდი პაუზის გარეშე.
```bash
cd /var/www/monitoring
git pull origin main
# build-ისთვის საჭიროა მხოლოდ Google Maps-ის საჯარო გასაღებები.
# აქ სხვა ცვლადი არ ჩაწერო: ეს ფაილი ყველა პროცესში ჩაიტვირთება.
grep '^NEXT_PUBLIC_' .env > .env.production
# .env-ს Next.js ყველა პროცესში ჩატვირთავს და kgm-ის ბაზა/BioStar სხვა
# ორგანიზაციებს გადაედება. მისი ასლი უკვე /etc/onebit/kgm.env-შია.
mv .env /root/monitoring.env.bak
npm install   # npm ci აქ არ მუშაობს: lock ფაილი Mac-ზეა შექმნილი
DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" npm run build
```
⚠️ `/var/www/monitoring`-ში `.env` ფაილი **აღარ** უნდა იყოს. ყველა პარამეტრი `/etc/onebit/*.env`-იდან მოდის.

### 1.4 pm2
```bash
pm2 delete monitoring
cd /var/www/monitoring
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 ls          # onebit-kgm, onebit-portal: online
```

### 1.5 nginx
```bash
cp /var/www/monitoring/deploy/nginx-onebit.conf.example /etc/nginx/sites-available/onebit
ln -s /etc/nginx/sites-available/onebit /etc/nginx/sites-enabled/onebit
nginx -t && systemctl reload nginx
```

### 1.6 cron
`crontab -e`: ყველა `/api/cron/...` გამოძახება გადაიყვანე ორგანიზაციის **პირდაპირ პორტზე**. ეს შეიძლება დომენით არ გაკეთდეს, რადგან დომენზე cookie-ს გარეშე portal-ს მოხვდება:
```
curl -X POST "http://127.0.0.1:3001/api/cron/offline-capture" -H "Authorization: Bearer <kgm-ის OFFLINE_CAPTURE_SECRET>"
```

### 1.7 შემოწმება
- `https://kgm.online.ge` → login. kgm-ის მომხმარებლით შესვლა → ჩვეულებრივი dashboard.
- გასვლა → ისევ login.
- GitHub Actions deploy `/etc/onebit/portal.env`-ს ამოწმებს: თუ არსებობს, `/var/www/monitoring`-ში ააწყობს და `ecosystem.config.cjs`-ით გადატვირთავს ყველა ორგანიზაციას ([deploy.yml](../.github/workflows/deploy.yml)). გადასვლის დროს push არ გააკეთო.

### 1.8 უკან დაბრუნება (თუ რამე არ იმუშავა)
```bash
cd /var/www/monitoring
pm2 delete onebit-portal onebit-kgm
mv /root/monitoring.env.bak .env
rm .env.production
mv /etc/onebit/portal.env /root/portal.env.off   # deploy ისევ ძველ რეჟიმში წავა
npm run build
pm2 start npm --name monitoring -- start && pm2 save
```
nginx-ში `sites-enabled/onebit` ამოიღე და ძველი საიტი დააბრუნე, `crontab` კი `/root/crontab.bak`-იდან აღადგინე.

---

## 2. ახალი ორგანიზაციის დამატება (მაგ. org2)

```bash
# 2.1 ბაზა: სტრუქტურა და როლები/უფლებები kgm-იდან, მონაცემების გარეშე
mysql -e "create database onebit_org2 character set utf8mb4 collate utf8mb4_unicode_ci;
          create user 'onebit_org2'@'localhost' identified by '<პაროლი>';
          grant all on onebit_org2.* to 'onebit_org2'@'localhost';"
mysqldump --no-data biostar_status_ops | mysql onebit_org2
mysqldump --no-create-info biostar_status_ops roles permissions role_permissions app_migrations | mysql onebit_org2

# 2.2 env ფაილი: საკუთარი AUTH_SECRET, ბაზა, BioStar, პორტი
cat > /etc/onebit/org2.env <<EOF
TENANT_SLUG=org2
TENANT_PREFIX=VK
PORT=3002
DATABASE_URL=mysql://onebit_org2:<პაროლი>@127.0.0.1:3306/onebit_org2
AUTH_SECRET=$(openssl rand -hex 32)
OFFLINE_CAPTURE_SECRET=$(openssl rand -hex 32)
APP_URL=https://kgm.online.ge
PORTAL_SYNC_SECRET=$(grep ^PORTAL_SYNC_SECRET= /etc/onebit/portal.env | cut -d= -f2)
BIOSTAR_URL=...
BIOSTAR2_USERNAME=...
BIOSTAR2_PASSWORD=...
EOF
chmod 600 /etc/onebit/org2.env
# kgm.env-იდან გადმოიტანე ის ცვლადებიც, რომლებიც აქ არ წერია და org2-საც სჭირდება.

# 2.3 პირველი admin
cd /var/www/monitoring
node scripts/create-admin.mjs /etc/onebit/org2.env admin@org2.ge "სახელი გვარი"
# ერთჯერადი პაროლი გამოჩნდება, პირველ შესვლაზე შეცვლა მოუწევს.

# 2.4 nginx: map-ში ახალი ხაზი
#   org2    127.0.0.1:3002;
nano /etc/nginx/sites-available/onebit
nginx -t && systemctl reload nginx

# 2.5 პროცესი. portal ახალ ორგანიზაციას ავტომატურად დაინახავს.
pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save

# 2.6 cron: org2-ისთვის იგივე ხაზები http://127.0.0.1:3002-ზე
```

---

## პრობლემების მოგვარება
| სიმპტომი | სად შეამოწმო |
| --- | --- |
| login-ზე „არასწორი ელფოსტა…“, პაროლი სწორია | `pm2 logs onebit-portal`: `could not load identifiers` (ორგანიზაციის პროცესი გათიშულია ან `PORTAL_SYNC_SECRET` არ ემთხვევა) ან `several organisations` |
| login გადის, მაგრამ ისევ login-ზე ბრუნდება | nginx `map`-ში ორგანიზაციის ხაზი აკლია ან პორტი არასწორია |
| 503 „სერვისი დროებით მიუწვდომელია“ | ორგანიზაციის პროცესი გათიშულია: `pm2 ls`, `pm2 logs onebit-<slug>` |
| ახალი მომხმარებელი ვერ შედის | portal სიას 30 წამში ერთხელ ანახლებს. სცადე ნახევარ წუთში |
| ბაღი `TB-101`-ით ვერ შედის | `pm2 logs onebit-portal`: `X-Station prefix ... invalid or already used` (ინიციალები ორ ორგანიზაციას ერთნაირი აქვს ან არ არის 2–6 ლათინური ასო) |
