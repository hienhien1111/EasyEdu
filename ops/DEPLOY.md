# EasyEdu — AWS Production Deployment Guide

## Architecture Overview

```
User
 ├── https://app.easyedu.study → Vercel (Next.js frontend)
 └── https://api.easyedu.study → Cloudflare DNS → AWS EC2
                                    ├── Caddy (reverse proxy + auto-HTTPS)
                                    ├── NestJS API container
                                    └── Redis container
                                           │
                                           ├── AWS RDS PostgreSQL
                                           ├── Cloudflare R2 (file storage)
                                           ├── Resend (email)
                                           └── PayOS (payment webhook)
```

---

## Prerequisites

| Component | Requirement |
|-----------|------------|
| AWS Account | EC2 + RDS access |
| Domain | `easyedu.study` on Cloudflare DNS |
| Cloudflare | Free plan, R2 bucket created |
| Vercel | Account with GitHub repo connected |
| PayOS | Production credentials |
| Resend | Production API key + verified domain |

---

## Step-by-Step Deployment

### Phase 1: AWS Infrastructure

#### 1.1 Create RDS PostgreSQL

- Engine: PostgreSQL 16
- Instance: `db.t4g.micro` (2 vCPU, 1GB RAM)
- Storage: 20GB gp3
- Single-AZ (save cost, upgrade later if needed)
- **Enable automated backup**: 7 days retention
- **Enable deletion protection**: yes
- Security Group: allow inbound `5432` from EC2 Security Group only
- Note the **endpoint URL** after creation

#### 1.2 Create EC2 Instance

- AMI: Amazon Linux 2023 or Ubuntu 24.04 LTS
- Instance: `t4g.small` (ARM64, 2 vCPU, 2GB RAM)
- Storage: 30GB gp3
- Key pair: create or use existing
- Security Group inbound rules:

| Port | Source | Purpose |
|------|--------|---------|
| 80 | 0.0.0.0/0 | HTTP (ACME + redirect) |
| 443 | 0.0.0.0/0 | HTTPS API |
| 22 | Your IP only | SSH |

#### 1.3 Install Docker on EC2

```bash
# Ubuntu
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
# Log out and back in for group to take effect

# Verify
docker --version
docker compose version
```

#### 1.4 Configure Docker log rotation

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
EOF
sudo systemctl restart docker
```

---

### Phase 2: Deploy Backend

#### 2.1 Clone repo on EC2

```bash
sudo mkdir -p /opt/easyedu
sudo chown $USER:$USER /opt/easyedu
cd /opt/easyedu
git clone https://github.com/hienhien1111/EasyEdu.git .
```

#### 2.2 Create production env

```bash
cp apps/api/.env.production.example apps/api/.env.production
nano apps/api/.env.production
# Fill in: DATABASE_URL, JWT secrets, PayOS keys, R2 keys, Resend key
```

**Required values to fill:**

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | RDS endpoint from Step 1.1 |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `JWT_REFRESH_SECRET` | Same command, generate a different one |
| `PAYOS_*` | PayOS dashboard |
| `RESEND_API_KEY` | Resend dashboard |
| `S3_*` | Cloudflare R2 dashboard → API tokens |

#### 2.3 Start services

```bash
docker compose -f ops/docker-compose.prod.yml up -d
```

#### 2.4 Verify

```bash
# Check all containers are running
docker compose -f ops/docker-compose.prod.yml ps

# Check health
curl -s http://localhost:3001/api/health | python3 -m json.tool

# Check logs
docker compose -f ops/docker-compose.prod.yml logs -f api
```

Expected health response:
```json
{
  "status": "ok",
  "database": "ok",
  "redis": "ok",
  "uptime": 42,
  "timestamp": "2026-06-15T12:00:00.000Z"
}
```

---

### Phase 3: DNS Configuration

#### 3.1 Cloudflare DNS records

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `api` | EC2 public IP | **DNS only** (grey cloud) |
| CNAME | `app` | `cname.vercel-dns.com` | **DNS only** (grey cloud) |

> **Note:** Using "DNS only" mode so Caddy handles ACME/TLS directly.
> To switch to Cloudflare Proxied later: change to orange cloud + set SSL mode to "Full (strict)".

#### 3.2 Verify HTTPS

After DNS propagation (1-5 minutes):

```bash
curl -s https://api.easyedu.study/api/health | python3 -m json.tool
```

---

### Phase 4: Deploy Frontend (Vercel)

> This is done by the project owner via Vercel Dashboard.

1. Connect GitHub repo `hienhien1111/EasyEdu` to Vercel
2. Configure project:
   - **Root Directory**: `apps/web`
   - **Framework**: Next.js (auto-detected)
   - **Build Command**: `pnpm build` or leave default
   - **Install Command**: `pnpm install --frozen-lockfile`
3. Set environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://api.easyedu.study/api`
4. Add custom domain `app.easyedu.study` in Vercel → Project Settings → Domains
5. Deploy

---

### Phase 5: Post-Deploy Verification

Run these checks:

```bash
# 1. Health check
curl -s https://api.easyedu.study/api/health

# 2. CORS check (should return Access-Control headers)
curl -s -I -X OPTIONS https://api.easyedu.study/api/auth/login \
  -H "Origin: https://app.easyedu.study" \
  -H "Access-Control-Request-Method: POST"

# 3. Register a test user
curl -s -X POST https://api.easyedu.study/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","phone":"0901234567","password":"Test1234!","fullName":"Test User","role":"STUDENT","gender":"MALE","dateOfBirth":"2000-01-01"}'

# 4. PayOS webhook endpoint reachable
curl -s -X POST https://api.easyedu.study/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## CI/CD: Manual Deploy via GitHub Actions

### Setup (one-time)

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add these repository secrets:

| Secret | Value |
|--------|-------|
| `EC2_HOST` | EC2 public IP |
| `EC2_USER` | `ubuntu` (or your SSH user) |
| `EC2_SSH_KEY` | Contents of your SSH private key (PEM) |
| `EC2_DEPLOY_PATH` | `/opt/easyedu` |

3. Go to Settings → Environments → Create `production` environment

### Deploying

1. Go to Actions → **Deploy API** → Run workflow
2. Select branch: `main`
3. Choose environment: `production`
4. Optionally add reason: "fix: payment webhook timeout"
5. Click **Run workflow**

The workflow will:
1. ✅ Build & type-check the API
2. ✅ SSH to EC2
3. ✅ Pull latest code
4. ✅ Rebuild Docker image
5. ✅ Restart containers
6. ✅ Wait for health check
7. ✅ Clean up old images

### Workflow for iterating (bug fixes, features)

```
1. Fix code locally
2. git add + commit + push to main
3. Go to GitHub Actions → Deploy API → Run workflow
4. Monitor deployment in Actions tab
5. Verify: curl https://api.easyedu.study/api/health
```

---

## Backup

### RDS Automated Backup
- Already configured in Phase 1: 7-day automated backup
- Manual snapshots: create before large migrations

### Optional: pg_dump to R2

```bash
# Install prerequisites on EC2
sudo apt install -y postgresql-client awscli

# Configure R2 credentials
aws configure set aws_access_key_id YOUR_R2_KEY
aws configure set aws_secret_access_key YOUR_R2_SECRET
aws configure set default.region auto

# Set environment variables
export DATABASE_URL="postgresql://..."
export R2_ENDPOINT="https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"
export R2_BACKUP_BUCKET="easyedu-backups"

# Run backup
chmod +x ops/scripts/backup-postgres.sh
./ops/scripts/backup-postgres.sh

# Add to cron (daily at 02:00 UTC)
(crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/easyedu && ./ops/scripts/backup-postgres.sh >> /var/log/easyedu-backup.log 2>&1") | crontab -
```

---

## Troubleshooting

### API container won't start
```bash
docker compose -f ops/docker-compose.prod.yml logs api --tail 50
```

### Database connection error
```bash
# Test from EC2 directly
psql "$DATABASE_URL" -c "SELECT 1"
# Check RDS Security Group allows EC2
```

### Redis connection error
```bash
docker compose -f ops/docker-compose.prod.yml exec redis redis-cli ping
```

### CORS errors in browser
- Check `FRONTEND_URL` in `.env.production` matches exactly `https://app.easyedu.study`
- Check browser console for the exact origin being blocked
- Verify CORS headers: `curl -I -X OPTIONS https://api.easyedu.study/api/...`

### Cookie not being set
- Check `COOKIE_DOMAIN=.easyedu.study` in `.env.production`
- Check browser DevTools → Application → Cookies
- `sameSite: 'lax'` requires both domains to share parent domain (`.easyedu.study`)

### Rollback
```bash
ssh ubuntu@EC2_IP
cd /opt/easyedu
git log --oneline -5   # find previous good commit
git reset --hard <commit>
docker compose -f ops/docker-compose.prod.yml build api
docker compose -f ops/docker-compose.prod.yml up -d
```

---

## Security Checklist

- [ ] EC2 port 22 restricted to your IP only
- [ ] RDS not publicly accessible
- [ ] RDS inbound only from EC2 Security Group
- [ ] Redis not exposed to Internet (internal Docker network only)
- [ ] API port 3001 not exposed (Caddy reverse proxy only)
- [ ] `.env.production` not committed to git
- [ ] JWT secrets are unique 48-byte random strings
- [ ] Swagger docs disabled in production (automatic)
- [ ] PayOS webhook URL updated to production domain
