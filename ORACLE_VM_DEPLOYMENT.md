# Oracle Cloud VM Deployment Guide

This document describes the production setup used for the RYVL Discord Bot application on an Oracle Cloud Infrastructure (OCI) Ubuntu VM, including:

- OCI compute instance creation
- public networking
- Ubuntu firewall configuration
- Node.js, PM2 and Caddy installation
- backend and frontend deployment
- environment variables
- Discord OAuth configuration
- GitHub Actions automatic deployment
- common troubleshooting commands

The current production architecture is:

```text
Internet
   |
   | TCP 80
   v
Oracle Cloud public IP
   |
   v
Caddy (:80)
   |
   +-- /          -> Angular static files in /var/www/ryvl
   |
   +-- /api/*     -> NestJS backend on 127.0.0.1:3000
                          |
                          +-- Discord bot
                          +-- PostgreSQL / Prisma
```

The backend port `3000` does not need to be publicly exposed. Caddy is the public entry point.

---

## 1. Create the Oracle Cloud VM

The production VM was created with the following general configuration:

- Operating system: Canonical Ubuntu 24.04
- Shape: `VM.Standard.A1.Flex`
- Architecture: ARM64 / Ampere
- OCPUs: 2
- Memory: 12 GB
- Capacity type: On-demand
- Availability domain: any AD with available A1 capacity
- Fault domain: preferably let OCI choose unless there is a specific placement requirement
- Authorization header / IMDSv2 requirement: enabled
- Confidential computing: disabled
- Shielded instance options: disabled for this setup
- Restart after infrastructure maintenance: enabled
- Boot volume: default size/performance
- In-transit volume encryption: enabled
- Customer-managed encryption key: not required

### A1 capacity errors

OCI Always Free A1 capacity is sometimes unavailable in a specific availability domain.

If OCI returns:

```text
Out of capacity for shape VM.Standard.A1.Flex
```

try another availability domain and avoid pinning a fault domain.

The current VM was ultimately created in AD-3 after AD-2 had no capacity.

---

## 2. Create the VCN and public subnet

During instance creation:

- Create a new VCN
- Example VCN name: `vcn-main`
- Create a new public subnet
- Example subnet name: `subnet-public`
- Example subnet CIDR: `10.0.0.0/24`
- Private IPv4: automatically assigned
- IPv6: not required

OCI may not allow the public IPv4 toggle to be selected while the subnet is still being created in the same wizard. That is expected.

After the instance has been created, assign an ephemeral public IPv4 address to the primary private IP if OCI did not assign one automatically.

A typical path is:

```text
Compute
-> Instances
-> <instance>
-> Networking
-> Primary VNIC
-> IP administration
-> primary private IP
-> Edit
-> Ephemeral public IP
```

---

## 3. Connect the public subnet to the Internet

On the instance Networking page, OCI can show a quick action:

```text
Connect public subnet to internet
```

Use it if available.

The public subnet needs:

- an Internet Gateway
- a route table entry:
  - destination: `0.0.0.0/0`
  - target: Internet Gateway
- ingress security rules

The route should effectively be:

```text
0.0.0.0/0 -> Internet Gateway
```

---

## 4. OCI security-list ingress rules

The subnet security list must allow the public services required by the VM.

Recommended rules for this setup:

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH and GitHub Actions deployment |
| 80 | TCP | HTTP / Caddy |
| 443 | TCP | HTTPS when a domain/TLS is configured |

For example:

```text
Source: 0.0.0.0/0
Protocol: TCP
Destination port: 80
```

and similarly for `443`.

### Do not expose port 3000 publicly

NestJS listens on port `3000`, but Caddy proxies `/api/*` to `127.0.0.1:3000`.

Therefore OCI does not need a public port-3000 rule.

For SSH, `0.0.0.0/0` is currently convenient because GitHub-hosted Actions runners use changing public IP addresses. Authentication must remain SSH-key-only. A more locked-down future setup can use a self-hosted runner, VPN or another fixed network path.

---

## 5. SSH into the VM

Connect using the private key downloaded/generated during OCI instance creation:

```powershell
ssh -i "C:\path\to\oracle-private-key.key" ubuntu@<ORACLE_PUBLIC_IP>
```

### Windows private-key permission error

If Windows OpenSSH reports:

```text
WARNING: UNPROTECTED PRIVATE KEY FILE!
Permissions ... are too open.
```

run:

```powershell
icacls "C:\path\to\oracle-private-key.key" /inheritance:r
icacls "C:\path\to\oracle-private-key.key" /grant:r "$($env:USERNAME):(R)"
```

If SSH names another Windows user/group that still has access, remove that entry with `icacls /remove`.

---

## 6. Configure the Ubuntu host firewall

OCI networking and the Ubuntu host firewall are separate layers. Both must allow the traffic.

First inspect the current rule order:

```bash
sudo iptables -L INPUT -n --line-numbers
```

On the current OCI Ubuntu image, a `REJECT` rule appeared before the originally-added HTTP/HTTPS rules.

For example:

```text
4  ACCEPT ... tcp dpt:22
5  REJECT ...
6  ACCEPT ... tcp dpt:443
7  ACCEPT ... tcp dpt:80
```

Anything after the `REJECT` rule is never reached.

Insert HTTP and HTTPS before the reject rule:

```bash
sudo iptables -I INPUT 5 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
sudo netfilter-persistent save
```

Then verify again:

```bash
sudo iptables -L INPUT -n --line-numbers
```

The allow rules for `80` and `443` must appear before the catch-all `REJECT`.

### Important correction to the original setup commands

The first setup attempt used:

```bash
sudo iptables -I INPUT 6 ... --dport 80 ...
sudo iptables -I INPUT 6 ... --dport 443 ...
sudo iptables -I INPUT 6 ... --dport 3000 ...
```

On this image, line 6 was after the reject rule, so those rules did not make the application reachable.

Also, port `3000` is not needed publicly when Caddy is used.

---

## 7. Install Node.js 22, Git and PM2

Angular 22 requires a recent Node.js 22 release. Node.js 20 is not sufficient for the current frontend toolchain.

Install Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

Verify:

```bash
node --version
npm --version
```

Install PM2 globally:

```bash
sudo npm install -g pm2
```

---

## 8. Clone the repository

From the Ubuntu user's home directory:

```bash
cd ~
git clone https://github.com/bogdantoma27/ryvl-bot-v2.git
```

The backend path is:

```text
~/ryvl-bot-v2/ryvl-discord-bot/server
```

The frontend path is:

```text
~/ryvl-bot-v2/ryvl-discord-bot/web
```

This is important: running `npm install` from `/home/ubuntu` will fail because there is no `package.json` there.

---

## 9. Configure the backend environment

The tracked template is:

```text
ryvl-discord-bot/server/.env.example
```

Do not put real secrets into `.env.example` and do not commit a real `.env` file.

Create the production file on the VM:

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
cp .env.example .env
nano .env
```

The production file must contain:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DISCORD_TOKEN=<DISCORD_BOT_TOKEN>
DISCORD_CLIENT_ID=<DISCORD_APPLICATION_CLIENT_ID>
DISCORD_CLIENT_SECRET=<DISCORD_APPLICATION_CLIENT_SECRET>
DISCORD_OAUTH_REDIRECT_URI=http://<ORACLE_PUBLIC_IP>/api/auth/discord/callback
JWT_SECRET=<RANDOM_SECRET_AT_LEAST_32_CHARACTERS>
FRONTEND_URL=http://<ORACLE_PUBLIC_IP>
PORT=3000
```

### DATABASE_URL

Use the PostgreSQL connection string for the production database.

Do not use the example localhost database URL unless PostgreSQL is actually installed and running on the same VM.

### DISCORD_TOKEN

Discord Developer Portal:

```text
Applications
-> RYVL application
-> Bot
-> Token
```

Never commit this value.

### DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET

Discord Developer Portal:

```text
Applications
-> RYVL application
-> OAuth2
```

Never commit the client secret.

### DISCORD_OAUTH_REDIRECT_URI

For the current HTTP/IP deployment:

```env
DISCORD_OAUTH_REDIRECT_URI=http://<ORACLE_PUBLIC_IP>/api/auth/discord/callback
```

The exact same URI must be registered in the Discord Developer Portal OAuth2 redirect list.

### JWT_SECRET

The application requires at least 32 characters.

Generate a secure value with:

```bash
openssl rand -hex 32
```

Paste the generated value into:

```env
JWT_SECRET=<generated-value>
```

### FRONTEND_URL

For the current VM/IP deployment:

```env
FRONTEND_URL=http://<ORACLE_PUBLIC_IP>
```

This is used by the backend after Discord OAuth completes.

### PORT

Keep:

```env
PORT=3000
```

Caddy proxies API requests to this local backend port.

---

## 10. Configure Discord OAuth

In the Discord Developer Portal, add the production redirect URI:

```text
http://<ORACLE_PUBLIC_IP>/api/auth/discord/callback
```

It must match `DISCORD_OAUTH_REDIRECT_URI` exactly.

When a proper domain with HTTPS is added later, change both the backend environment and Discord Developer Portal to something like:

```text
https://app.example.com/api/auth/discord/callback
```

and:

```env
FRONTEND_URL=https://app.example.com
DISCORD_OAUTH_REDIRECT_URI=https://app.example.com/api/auth/discord/callback
```

---

## 11. Install backend dependencies and prepare Prisma

Run:

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
npm ci
npx prisma generate
```

For an initial database setup or a reviewed schema update:

```bash
npx prisma db push
```

### Production database warning

Do not automatically use:

```bash
npx prisma db push --force-reset
```

against a database that contains data. It drops/recreates data.

The GitHub Actions workflow deliberately does not run `prisma db push` automatically. Database schema changes must be reviewed and applied manually.

---

## 12. Build and start the backend with PM2

Build:

```bash
npm run build
```

Start the NestJS backend:

```bash
pm2 start dist/main.js --name ryvl-backend
pm2 save
```

Verify:

```bash
pm2 status
pm2 logs ryvl-backend --lines 100
```

The process should show:

```text
ryvl-backend  online
```

### Start PM2 automatically after VM reboot

Run:

```bash
pm2 startup
```

PM2 prints a `sudo ...` command. Run the exact command it prints.

Then:

```bash
pm2 save
```

---

## 13. Install Caddy

Install the official Caddy package:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo apt update
sudo apt install -y caddy
```

The repository contains the production configuration at:

```text
ryvl-discord-bot/Caddyfile
```

Current configuration:

```caddyfile
:80 {
  handle /api/* {
    reverse_proxy 127.0.0.1:3000
  }

  handle {
    root * /var/www/ryvl
    try_files {path} /index.html
    file_server
  }
}
```

This means:

- Angular is served from `/var/www/ryvl`
- API traffic is reverse-proxied to NestJS
- Angular client-side routes fall back to `index.html`

---

## 14. Frontend production API URL

The Angular frontend uses:

- `http://localhost:3000` only when the browser itself is on localhost
- `window.location.origin` in production

Therefore, when the application is opened as:

```text
http://<ORACLE_PUBLIC_IP>
```

the frontend calls:

```text
http://<ORACLE_PUBLIC_IP>/api/...
```

Caddy then forwards those requests internally to:

```text
127.0.0.1:3000
```

There is no need to hard-code the Oracle IP into the Angular build.

---

## 15. Manual frontend build and publish

GitHub Actions now performs this automatically, but the equivalent manual procedure is:

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/web
npm ci
npm run build
```

Angular normally produces:

```text
dist/web/browser
```

or, depending on the builder version:

```text
dist/web
```

Copy the built files to Caddy's web root:

```bash
sudo mkdir -p /var/www/ryvl
sudo rm -rf /var/www/ryvl/*
sudo cp -a dist/web/browser/. /var/www/ryvl/
sudo chown -R caddy:caddy /var/www/ryvl
```

If `dist/web/browser` does not exist but `dist/web/index.html` does, copy from `dist/web` instead.

Install the repo Caddy configuration:

```bash
sudo cp ~/ryvl-bot-v2/ryvl-discord-bot/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl reload caddy
```

---

## 16. GitHub Actions automatic deployment

The workflow is:

```text
.github/workflows/deploy-oracle.yml
```

It runs automatically when `main` receives changes under:

- `ryvl-discord-bot/server/**`
- `ryvl-discord-bot/web/**`
- `ryvl-discord-bot/Caddyfile`
- the deployment workflow itself

It can also be started manually from the GitHub Actions UI.

The deployment performs:

```text
GitHub push to main
        |
        v
GitHub Actions runner
        |
        | SSH
        v
Oracle VM
        |
        +-- git pull --ff-only
        +-- ensure Node.js 22
        +-- npm ci (backend)
        +-- prisma generate
        +-- npm run build (backend)
        +-- pm2 restart ryvl-backend
        +-- npm ci (frontend)
        +-- npm run build (frontend)
        +-- copy Angular build to /var/www/ryvl
        +-- validate/reload Caddy
```

The workflow intentionally does not modify the VM's `.env` file.

Because `.env` is ignored by Git, it survives normal `git pull` deployments.

---

## 17. Create a dedicated GitHub Actions SSH key

A dedicated key is recommended instead of reusing the personal OCI SSH key.

One setup method is to generate it on the VM:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh

ssh-keygen -t ed25519 \
  -C "github-actions-ryvl" \
  -f ~/.ssh/github-actions-ryvl \
  -N ""
```

Authorize the public key:

```bash
cat ~/.ssh/github-actions-ryvl.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Display the private key once:

```bash
cat ~/.ssh/github-actions-ryvl
```

Copy the entire value, including:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

into the GitHub Actions secret described below.

After confirming GitHub Actions can connect successfully, the copy of the private deployment key on the VM can be removed:

```bash
rm ~/.ssh/github-actions-ryvl
```

Keep the `.pub` file if desired; the authorized copy already exists in `authorized_keys`.

---

## 18. GitHub Actions repository secrets

In GitHub:

```text
Repository
-> Settings
-> Secrets and variables
-> Actions
-> Repository secrets
```

Create:

### ORACLE_HOST

```text
<ORACLE_PUBLIC_IP>
```

### ORACLE_USER

```text
ubuntu
```

### ORACLE_SSH_KEY

The complete dedicated private key:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

Never commit the private key into the repository.

---

## 19. Deploying future changes

After the initial setup, normal deployment is simply:

```text
edit code
-> commit
-> push to main
-> GitHub Actions deploys automatically
```

There is normally no need to SSH into the VM for ordinary frontend/backend code changes.

### Manual fallback

If GitHub Actions is unavailable:

```bash
cd ~/ryvl-bot-v2
git fetch origin main
git checkout main
git pull --ff-only origin main

cd ryvl-discord-bot/server
npm ci
npx prisma generate
npm run build
pm2 restart ryvl-backend --update-env
pm2 save

cd ../web
npm ci
npm run build

sudo mkdir -p /var/www/ryvl
sudo rm -rf /var/www/ryvl/*

if [ -f dist/web/browser/index.html ]; then
  sudo cp -a dist/web/browser/. /var/www/ryvl/
else
  sudo cp -a dist/web/. /var/www/ryvl/
fi

sudo chown -R caddy:caddy /var/www/ryvl
sudo cp ../Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## 20. Verifying the deployment

### Backend

```bash
pm2 status
pm2 logs ryvl-backend --lines 100
```

### Caddy

```bash
sudo systemctl status caddy --no-pager
```

### Listening ports

```bash
sudo ss -lntp | grep -E ':80|:3000'
```

Expected:

- Caddy on `:80`
- Node/NestJS on `:3000`

### Test Caddy locally

```bash
curl -I http://127.0.0.1
```

Expected response includes:

```text
HTTP/1.1 200 OK
Server: Caddy
```

### Test from another machine

```bash
curl -I http://<ORACLE_PUBLIC_IP>
```

Then open:

```text
http://<ORACLE_PUBLIC_IP>
```

---

## 21. HTTP versus HTTPS

With the current raw-IP Caddy configuration:

```caddyfile
:80
```

the application is HTTP-only.

A browser will therefore display a "Not secure" warning. That is expected.

Opening:

```text
https://<ORACLE_PUBLIC_IP>
```

will not work just because port `443` is open. A TLS listener/certificate must also be configured.

### Recommended production HTTPS setup

Use a domain such as:

```text
ryvl.example.com
```

Create a DNS A record pointing to the Oracle public IP.

Then change the Caddyfile site address from:

```text
:80
```

to:

```text
ryvl.example.com
```

Caddy can then obtain and renew the public TLS certificate automatically.

Also update:

```env
FRONTEND_URL=https://ryvl.example.com
DISCORD_OAUTH_REDIRECT_URI=https://ryvl.example.com/api/auth/discord/callback
```

and update the Discord Developer Portal redirect URI to the same HTTPS callback.

---

## 22. Common troubleshooting

### Browser times out even though OCI port 80 is open

Check Ubuntu iptables:

```bash
sudo iptables -L INPUT -n --line-numbers
```

If `REJECT` appears above the port-80 allow rule, move/add the allow rule above it.

This was the cause of the initial timeout on this VM.

### GitHub Actions reports "missing server host"

The GitHub repository secrets are missing or empty.

Verify:

- `ORACLE_HOST`
- `ORACLE_USER`
- `ORACLE_SSH_KEY`

### Frontend build fails with Node.js 20

Angular 22 requires a newer Node.js version.

Install Node 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

The current GitHub Actions workflow performs this check automatically.

### PM2 says the backend is errored

Inspect:

```bash
pm2 logs ryvl-backend --lines 100
```

A common first-start issue is a missing/invalid environment value.

For example, `JWT_SECRET` must be at least 32 characters.

### Prisma refuses to add required columns

If existing rows are present, Prisma cannot add a required column without values for those rows.

Do not use `--force-reset` on production data.

Use a proper migration/backfill strategy or intentionally reset only a disposable database.

### Frontend still calls an old Render URL

Production frontend API requests should use the browser's current origin.

The current frontend implementation does this automatically, so a fresh frontend build/deployment is required after changing that code.

---

## 23. Security notes

- Never commit `.env`
- Never commit Discord tokens or client secrets
- Never commit SSH private keys
- Keep the database port private unless external access is explicitly required
- Keep backend port `3000` private
- Use HTTPS with a domain for the final production setup
- Prefer dedicated deployment SSH keys
- Review Prisma schema changes before applying them to production data
- Keep Ubuntu, Node.js and application dependencies patched


---

## 24. Server-side SVG/PNG text rendering on Oracle Ubuntu

The lineup generator uses `sharp` to rasterize SVG into PNG. SVG text rendering on Linux depends on the system font stack (fontconfig/Pango/librsvg).

Minimal Ubuntu cloud images may not have a usable fontconfig configuration or common fonts installed. A typical symptom is:

```text
Fontconfig error: Cannot load default config file: File not found
```

and the generated image can contain the pitch/shapes but no text.

Install the required font packages:

```bash
sudo apt-get update
sudo apt-get install -y fontconfig fontconfig-config fonts-dejavu-core fonts-liberation2
sudo fc-cache -f
```

Verify that a font is resolvable:

```bash
fc-match "Liberation Sans"
```

The production lineup SVG explicitly prefers `Liberation Sans` and falls back to `DejaVu Sans`, both of which are available on Ubuntu.

The GitHub Actions deployment performs this font check/install automatically, so future deployments to a fresh Oracle VM should not require manual font setup.

### Discord "Unknown interaction" on a cloud VM

Discord interactions must be acknowledged quickly. A cloud deployment can expose latency that is not noticeable locally, especially when the command performs a remote database lookup before replying.

The lineup command is implemented so that:

- modal commands call `showModal()` before database/network work
- non-modal commands call `deferReply()` before database/network work
- long image rendering happens only after an interaction has already been acknowledged

This avoids errors such as:

```text
DiscordAPIError[10062]: Unknown interaction
```

The bot also uses `MessageFlags.Ephemeral` instead of the deprecated `ephemeral: true` response option for the lineup flow.


---

## 25. EA Python bridge runtime on Ubuntu

The EA Pro Clubs integration executes:

```text
server/src/ea/scripts/ea_bridge.py
```

from the NestJS backend.

Ubuntu 24.04 may not provide a `python` executable, only `python3`. The bridge also requires the third-party Python package `curl_cffi`.

The production application therefore uses:

```text
server/.venv/bin/python
```

with dependencies defined in:

```text
server/requirements-ea.txt
```

The GitHub Actions deployment automatically:

```bash
sudo apt-get install -y python3 python3-venv
python3 -m venv .venv
.venv/bin/pip install -r requirements-ea.txt
```

The NestJS EA service prefers `.venv/bin/python` and falls back to `python3`.

This avoids a common Oracle/Ubuntu production-only failure where EA commands work locally on Windows but fail on the VM with:

```text
spawn python ENOENT
```

or:

```text
ModuleNotFoundError: No module named 'curl_cffi'
```

To test the bridge manually:

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
.venv/bin/python src/ea/scripts/ea_bridge.py search common-gen5 "RYVL Esports"
```
