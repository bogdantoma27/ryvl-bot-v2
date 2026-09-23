# Oracle Cloud VM deployment — RYVL

**Canonical website:** https://ryvl.top  
**Admin:** https://ryvl.top/admin/dashboard  
**API:** https://ryvl.top/api/health

This guide covers the initial installation and the current HTTPS deployment. Do not rerun first-install commands over a working environment without reading their warnings.

## Architecture and authoritative branch

```text
Spaceship DNS: ryvl.top / www.ryvl.top
                  |
           Oracle Ubuntu VM
                  |
       Caddy 80 -> HTTPS redirect
       Caddy 443 -> ryvl.top (trusted TLS)
                  |
                  +-- /api/* -> 127.0.0.1:3000 -> NestJS / Discord / PostgreSQL
                  +-- other paths -> /var/www/ryvl -> Angular release directory
```

`www` and HTTP are redirected to https://ryvl.top with their URI preserved. Caddy manages both certificates and renewal. There is no separate public API subdomain or public port 3000.

**Deploy `main`.** The old `update/vpg-automation-public-ux` branch is development history. Its full application directory and README/deployment documentation were incorporated into main release `0fbdb979`. A different branch commit count after that squash-style release does not mean the features are missing. Never deploy the old preparation workflow to production.

## 1. Initial Oracle instance

The working installation uses Canonical Ubuntu 24.04, ARM64 Ampere `VM.Standard.A1.Flex`, 2 OCPUs and 12 GB RAM, on-demand capacity. AD-3 had available capacity after AD-2 returned an out-of-capacity error. Try another availability domain and avoid a pinned fault domain when capacity is unavailable; a dedicated host is not needed for this application.

The initial configuration enabled the instance-metadata authorization header and restoration after infrastructure maintenance, left migration choice to Oracle, used default boot-volume size/performance and in-transit encryption, and did not enable confidential computing or a customer-managed encryption key. Recheck OCI pricing/limits before changing instance resources.

## 2. VCN, subnet, public address and route

The working network is `vcn-main` with `subnet-public`, subnet CIDR `10.0.0.0/24`, and an automatically assigned private address. IPv6 is not required.

A public subnet must permit public IPv4 assignment. After creation, the instance Networking page exposes its VNIC/private IP and public-IP assignment controls. Assign a public IPv4 if none exists; the current address is `130.61.228.100`. An existing ephemeral address should not be unassigned casually. If the address changes later, update DNS and the deployment SSH secret together.

The subnet needs an available Internet Gateway and a route:

```text
Destination 0.0.0.0/0 -> Internet Gateway
```

The instance's **Connect public subnet to internet** quick action can create the necessary network resources. Verify the actual subnet's assigned route table/security lists, not just resources with similar names.

## 3. OCI security rules and Ubuntu firewall

Both layers must allow traffic. The OCI subnet security list or VNIC network security group needs stateful TCP ingress on **22, 80 and 443**. Source port range is All. HTTP/HTTPS source is `0.0.0.0/0`; SSH should be restricted where feasible, while accounting for changing GitHub-hosted runner addresses. Keep key-based SSH authentication. Outbound access must allow DNS, HTTPS and the configured database/Discord services.

Do not add public port-3000 or database rules merely to make the website work.

On Ubuntu, inspect order and interfaces:

```bash
sudo iptables -L INPUT -n -v --line-numbers
```

During the original setup, REJECT was line 5. Rules inserted at line 6 were unreachable. The working fix inserted HTTP/HTTPS **before that REJECT**:

```bash
# Use these positions only when inspection still shows REJECT at line 5.
sudo iptables -I INPUT 5 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
sudo netfilter-persistent save
```

Do not repeatedly insert duplicate rules or flush the firewall. Reinspect the current position rather than assuming line 5 forever. Keep existing Oracle-specific rules. HTTPS needs an actual TLS listener in addition to open port 443.

## 4. SSH and Windows key permissions

From Windows PowerShell:

```powershell
ssh -i "C:\path\to\oracle-private-key.key" ubuntu@130.61.228.100
```

When Windows OpenSSH rejects an overly accessible private key:

```powershell
icacls "C:\path\to\oracle-private-key.key" /inheritance:r
icacls "C:\path\to\oracle-private-key.key" /grant:r "$($env:USERNAME):(R)"
icacls "C:\path\to\oracle-private-key.key"
```

Remove any specifically reported unintended user/group ACE with `icacls /remove`. Never post the private key in chat, logs or Git. Removing inherited permissions alone may leave explicit unwanted entries.

## 5. Install Node.js, Git and PM2

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates git gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
sudo npm install -g pm2
```

Use a current Node 22 release, at least 22.22.3 for this Angular toolchain. Node 20 caused the initial frontend build failure. PM2 must run as `ubuntu`, not as a second root-owned daemon.

## 6. Clone the correct directory

```bash
cd ~
git clone https://github.com/bogdantoma27/ryvl-bot-v2.git
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
npm ci
```

The frontend is `~/ryvl-bot-v2/ryvl-discord-bot/web`. Running npm from `/home/ubuntu` or omitting the outer `ryvl-bot-v2` directory causes missing-package/path errors.

## 7. Environment and Discord application

For a NEW installation only:

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
cp -n .env.example .env
chmod 600 .env
nano .env
```

Fill real values in **server/.env**, never in the tracked template:

| Variable | Source/value |
|---|---|
| DATABASE_URL | Actual production PostgreSQL connection string, including provider-required TLS settings |
| DISCORD_TOKEN | Discord Developer Portal → application → Bot |
| DISCORD_CLIENT_ID | Discord application/OAuth2 Client ID |
| DISCORD_CLIENT_SECRET | Discord OAuth2 Client Secret |
| JWT_SECRET | Unique random secret, generated with `openssl rand -hex 32`; at least 32 characters |
| FRONTEND_URL | `https://ryvl.top` |
| DISCORD_OAUTH_REDIRECT_URI | `https://ryvl.top/api/auth/discord/callback` |
| PORT | `3000` |

The exact HTTPS callback must also be saved in Discord Developer Portal → OAuth2 → Redirects. Once domain login is verified, remove the old production IP callback; retain localhost only for intentional development.

Do not change working database/Discord credentials or rotate JWT_SECRET during the domain migration. Local development can use an actual localhost frontend origin and registered localhost callback. The outer `ryvl-discord-bot/.env.example` is for local Compose, not native PM2 production.

## 8. PostgreSQL and Prisma

Use the configured production database. A localhost sample works only if PostgreSQL really runs locally. This guide does not silently install or replace a production database.

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
npx prisma generate
# Only for a NEW/disposable database, after checking DATABASE_URL:
npx prisma db push
npm run build
```

If required columns cannot be added to existing rows, review and backfill a migration. **Do not use --force-reset on valuable data.** The current notification feature has the reviewed additive script:

```bash
npx prisma db execute --schema prisma/schema.prisma --file prisma/deploy/vpg-notifications.sql
```

It creates new tables/indexes transactionally and can be repeated. Other schema changes still require review. Schedule backups for the actual PostgreSQL service independently of application deployment.

## 9. Font rendering and EA Python bridge

```bash
sudo apt-get install -y fontconfig fontconfig-config fonts-dejavu-core fonts-liberation2 python3 python3-venv
sudo fc-cache -f
fc-match 'Liberation Sans'
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-ea.txt
```

Sharp's SVG text rendering requires fonts/fontconfig on the minimal Linux image. The lineup renderer prefers Liberation Sans/DejaVu. Missing configuration previously caused pitch graphics without text.

The EA service uses `.venv/bin/python`, falling back to `python3`; `curl_cffi` is declared in `requirements-ea.txt`. This avoids `spawn python ENOENT` and missing-Python-package failures. An optional live integration check is:

```bash
.venv/bin/python src/ea/scripts/ea_bridge.py search common-gen5 'RYVL Esports'
```

External EA/VPG API availability is independent of whether the local runtime is installed.

## 10. PM2 first start and reboot persistence

```bash
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
npm run build
pm2 start dist/main.js --name ryvl-backend
pm2 logs ryvl-backend --lines 100
```

Press Ctrl+C to leave streaming logs without stopping the app. Then:

```bash
pm2 startup
# Run the EXACT sudo command printed above; this installs the ubuntu startup unit.
pm2 save
```

`pm2 startup && pm2 save` alone is insufficient when the generated sudo command has not been executed. The backend should be online and respond locally:

```bash
curl --fail http://127.0.0.1:3000/api/health
```

Environment validation errors, such as a short JWT_SECRET, must be resolved before deployment. Old PM2 log entries remain after a fix; inspect timestamps/new output rather than assuming every historical error is current.

## 11. Spaceship DNS for ryvl.top

Keep these nameservers:

```text
launch1.spaceship.net
launch2.spaceship.net
```

In Spaceship Advanced DNS for `ryvl.top`, save:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `130.61.228.100` | 30 minutes or chosen TTL |
| CNAME | `www` | `ryvl.top` | 30 minutes or chosen TTL |

Enter only `www` in the Host field because the UI appends the domain. Do not enter a scheme or port in DNS values. Replace conflicting parking/web records only; keep email/verification records. Do not add IPv6 AAAA records without working IPv6.

From Windows:

```powershell
nslookup -type=A ryvl.top. 8.8.8.8
nslookup -type=A www.ryvl.top. 8.8.8.8
nslookup -type=A ryvl.top. launch1.spaceship.net
```

Both names must ultimately resolve to the VM. If Google and Spaceship resolve correctly but the ISP does not, investigate resolver caching. `ipconfig /flushdns` clears Windows' cache, not the ISP's cache. Chrome Secure DNS can use Google during troubleshooting. NXDOMAIN occurs before a browser reaches the VM; it is not a port-443 diagnosis.

## 12. Install Caddy and enable the domain

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

`ryvl-discord-bot/Caddyfile` is authoritative. It serves `ryvl.top` over HTTPS, redirects `www` and HTTP, proxies `/api` and `/api/*` without stripping the prefix, and serves the Angular SPA from `/var/www/ryvl`. The index and release metadata are revalidated rather than pinned in cache. Referrer-Policy is set to no-referrer because the current OAuth flow returns a token in the URL.

Do not replace the loopback upstream with ryvl.top. Do not install Certbot alongside this configuration. Caddy needs a persistent writable data directory, publicly reachable 80/443 and correct DNS. If a CAA record is configured, it must permit the certificate authority in use. Keep Caddy's certificate storage private.

The deployment validates configuration before reload and waits for trusted certificates for BOTH domains before changing public environment URLs. On TLS preflight failure, it restores the previous Caddyfile and leaves those environment URLs unchanged. Do not use curl -k or disable certificate validation to hide failures.

## 13. GitHub Actions SSH credentials

Use a dedicated deployment key rather than your personal OCI key. One setup method on the VM:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C github-actions-ryvl -f ~/.ssh/github-actions-ryvl -N ''
cat ~/.ssh/github-actions-ryvl.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Copy the complete private key, including BEGIN/END lines, directly into the GitHub repository secret—not into chat or source. After verifying Actions can connect, remove the private-key copy from the VM; the authorized public key must remain.

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| ORACLE_HOST | VM IP `130.61.228.100`, not an HTTPS URL |
| ORACLE_USER | `ubuntu` |
| ORACLE_SSH_KEY | Complete dedicated private deployment key |

The SSH host remains an IP so website DNS/proxy changes cannot break deployments. This does not expose an IP-based website to visitors.

## 14. Automatic deployment and domain cutover

`.github/workflows/deploy-oracle.yml` deploys main and supports Run workflow. It first runs the reusable CI suite, then uses the exact validated SHA. A newer main revision causes an older run to stop rather than deploy untested code. Runs are serialized and a VM-side lock prevents overlapping checkouts.

The remote workflow calls `ryvl-discord-bot/deploy/oracle.sh`. It:

1. Ensures Node 22, required fonts and the EA virtual environment.
2. Builds/tests the backend and builds Angular before restarting production.
3. Validates the Caddyfile and applies only the existing additive notification SQL.
4. Stages a frontend release, writes release.json and switches /var/www/ryvl to that release. The initial physical directory is retained as a legacy backup.
5. Loads the domain Caddyfile and waits for both trusted TLS certificates.
6. Updates only FRONTEND_URL and DISCORD_OAUTH_REDIRECT_URI in server/.env; an already-present obsolete WEB_BASE_URL is aligned as well. Other settings are preserved.
7. Explicitly refreshes the same public values in PM2, restarts and saves the process after the health check.
8. Verifies local HTTPS/API and then, from the GitHub runner, public DNS/TLS, redirects, pages, OAuth, CORS and the exact release revision.

Environment backups are private files under `~/.local/state/ryvl-deploy/env-backups`. They contain secrets: do not upload or print them. Caddy backups are in `~/.local/state/ryvl-deploy`. The URL updater is idempotent and creates no extra backup when no values change.

The current ConfigModule keeps process environment values ahead of .env; therefore PM2 must have the public values explicitly refreshed, not merely have its .env edited. Application secrets are never copied into workflow logs.

No domain migration resets the database or changes the Discord/JWT credentials. Update the Discord Portal callback before the cutover. Once HTTPS works, sign in again on the domain, because browser token storage is origin-specific.

## 15. Manual deployment fallback

Use the same reviewed script instead of a different copy/paste process:

```bash
cd ~/ryvl-bot-v2
exec 9>~/.ryvl-deploy.lock
flock -w 1200 9
git fetch origin main
git checkout main
# This discards tracked local edits. Commit work on your development PC, not the VM.
git reset --hard origin/main
bash ryvl-discord-bot/deploy/oracle.sh
```

The initial PM2 process and Caddy package must already exist. The .env must contain real credentials and be owned by ubuntu. Never use git clean -x on the production checkout. Release directories are intentionally retained for rollback; monitor disk usage and prune only obsolete releases after identifying the active target.

## 16. Verification and troubleshooting

From Windows after deployment:

```powershell
curl.exe -I https://ryvl.top
curl.exe -I https://www.ryvl.top
curl.exe -I http://ryvl.top
curl.exe https://ryvl.top/api/health
curl.exe https://ryvl.top/release.json
```

Expected: apex HTTPS 200; www/HTTP 308 to the apex; health JSON status ok; revision equal to deployed main. HTTPS to a bare IP is not the canonical site and is not promised to have a matching certificate. HTTP IP bookmarks redirect to the domain.

On the VM:

```bash
pm2 status ryvl-backend
pm2 logs ryvl-backend --lines 100 --nostream
sudo systemctl status caddy --no-pager
sudo ss -lntp | grep -E ':(80|443|3000)\b'
sudo iptables -L INPUT -n -v --line-numbers
curl --fail http://127.0.0.1:3000/api/health
curl --fail --resolve ryvl.top:443:127.0.0.1 https://ryvl.top/api/health
```

Local loopback HTTP bypasses Caddy and is intentionally retained. A 301/308 alone is not proof the application is healthy. Inspect Caddy's service logs for ACME errors if certificates do not become ready; verify DNS including AAAA/CAA and both firewall layers before changing configuration again.

Missing server host in Actions means the repository secrets are missing/empty. A failed health check after npm build is not solved by blindly resetting Prisma. CORS is a browser policy, not authorization: the application still requires authenticated/authorized endpoints.

## 17. VPG notifications and existing Discord links

Channels remain in Admin → Settings; schedules, intervals and repair controls are in Admin → RYVL Performance → VPG automatic posting. Sunday standings are 10:00 Europe/Bucharest; daily fixtures default to 10:00; results default to two minutes. General and RYVL destinations are independent. The historical baseline prevents old-result floods, failures remain retryable and empty fixture days remain silent. See README for full feed behaviour.

New club buttons use FRONTEND_URL. Existing Discord messages keep their old stored URLs: use **Repair old club links** after migration. This asks for confirmation, edits at most 200 recent recorded bot-owned messages, and does not delete or replay history.

## 18. Ongoing security and maintenance

Keep Ubuntu, Node, Caddy and dependencies patched; inspect dependency audits rather than assuming a green build is a security audit. Keep SSH private keys, real .env files, database dumps and certificate storage out of Git. Maintain database backups and monitor release-directory disk use. Restrict public backend/database ports. The legal pages need operator review of identity/contact details and retention practices. HTTPS protects transport; it does not by itself remedy all application-authentication risks.

References: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Caddy redirects](https://caddyserver.com/docs/caddyfile/directives/redir), [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2), [GitHub Actions](https://docs.github.com/en/actions).
