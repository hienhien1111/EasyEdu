<div align="center">

<img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
<img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
<img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" />
<img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
<img src="https://img.shields.io/badge/AWS-EC2%20%2B%20RDS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white" />

# EasyEdu

**Hệ thống Quản lý Trung tâm Dạy học toàn diện**

Nền tảng full-stack hỗ trợ 3 portal (Admin / Giáo viên / Học sinh) với đầy đủ chức năng từ điểm danh, thanh toán QR đến tính lương tự động.

[Tính năng](#tính-năng) · [Tech Stack](#tech-stack) · [Kiến trúc](#kiến-trúc) · [Cài đặt](#cài-đặt-development) · [Production](#production-deployment)

</div>

---

## Tính năng

| Portal | Chức năng chính |
|--------|-----------------|
| **Admin** | Quản lý người dùng & duyệt tài khoản, lớp học, thời khóa biểu Grid 7 phòng, hóa đơn/thanh toán/tra soát, tính lương giáo viên, vật tư, thông báo hẹn giờ, dashboard báo cáo |
| **Giáo viên** | Danh sách lớp, điểm danh (auto-chốt 24h), thời khóa biểu cá nhân, báo nghỉ & đăng ký bù, xác nhận thu tiền mặt, lịch sử dạy |
| **Học sinh** | Lịch học, thanh toán học phí QR/Tiền mặt, tra soát thanh toán, đăng ký lớp, hồ sơ cá nhân |

### Thanh toán & Đối soát

- **PayOS QR** — tạo mã QR thanh toán, webhook tự động xác nhận
- **Tiền mặt** — học sinh xác nhận nộp → giáo viên xác nhận thu → ghi nhận
- **Tra soát** — student báo "đã trừ tiền", admin requery PayOS hoặc duyệt thủ công
- **Ledger** — sổ cái ghi nhận mọi giao dịch tài chính (IN/OUT/INTERNAL)
- **Hóa đơn** — auto-generate hàng tháng, draft → issued → partially_paid → paid

### Lương Giáo viên

- Tính tự động dựa trên buổi dạy × số học sinh có mặt × đơn giá × % chia
- Trừ tiền mặt giáo viên đã thu hộ
- Draft → chốt → thanh toán → finalized
- Hỗ trợ lịch chốt lương hàng tháng

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), Tailwind CSS v4, Zustand, TanStack Query, React Hook Form + Zod |
| **Backend** | NestJS 11, Passport JWT, Swagger/OpenAPI, class-validator |
| **Database** | PostgreSQL 16, Prisma 7 ORM (29 models, 27 enums) |
| **Auth** | JWT Access + Refresh Token, httpOnly Cookie, bcrypt, Redis blacklist, token rotation |
| **Queue** | BullMQ + Redis (auto-close attendance, scheduled notifications, payment requery) |
| **Payments** | PayOS (QR), tiền mặt, webhook verification, reconciliation ledger |
| **Infra** | Docker, AWS EC2 + RDS, Vercel, Cloudflare DNS + R2, Caddy reverse proxy |

---

## Kiến trúc

### Monorepo

```
easyedu/
├── apps/
│   ├── api/                        # NestJS Backend (port 3001)
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # 29 models, 27 enums
│   │   │   ├── migrations/         # 20+ migrations
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── common/             # Guards, decorators, filters, interceptors
│   │       ├── database/           # PrismaModule (global)
│   │       ├── jobs/               # BullMQ processors
│   │       └── modules/            # 15 feature modules
│   │           ├── auth/           # Login, Logout, Refresh, OTP, JWT Strategy
│   │           ├── users/          # CRUD + account approval
│   │           ├── profiles/       # Personal profile + teacher/student profiles
│   │           ├── classes/        # Class management
│   │           ├── enrollments/    # Enrollment CRUD + approval
│   │           ├── rooms/          # Room management
│   │           ├── schedules/      # Grid schedule + weekly overrides
│   │           ├── attendance/     # Attendance + auto-close 24h + makeup
│   │           ├── invoices/       # Invoice lifecycle + auto monthly draft
│   │           ├── payments/       # QR + Cash + Webhook + Reconciliation
│   │           ├── receipts/       # Receipt generation
│   │           ├── salaries/       # Teacher salary calculation
│   │           ├── notifications/  # Scheduled notifications via BullMQ
│   │           ├── inventory/      # Supply management
│   │           └── dashboard/      # Reports & analytics
│   │
│   └── web/                        # Next.js Frontend (port 3000)
│       └── src/
│           ├── app/
│           │   ├── (auth)/         # Login, Register, Forgot Password
│           │   ├── (admin)/        # Admin portal
│           │   ├── (teacher)/      # Teacher portal
│           │   └── (student)/      # Student portal
│           ├── components/         # Layout, shared UI
│           ├── lib/                # Axios client + auto-refresh, utilities
│           └── stores/             # Zustand auth store
│
├── ops/                            # Production operations
│   ├── docker-compose.prod.yml     # API + Redis + Caddy
│   ├── Caddyfile                   # Reverse proxy + auto-HTTPS
│   ├── DEPLOY.md                   # Deployment guide
│   └── scripts/
│       └── backup-postgres.sh      # pg_dump → Cloudflare R2
│
├── .github/workflows/
│   └── deploy.yml                  # Manual-trigger CI/CD
│
├── turbo.json
├── pnpm-workspace.yaml
└── docker-compose.yml              # Development (full stack)
```

### Production Architecture

```
                    ┌─────────────────────────────┐
                    │    https://app.easyedu.study │
  User ────────────►│    Vercel (Next.js)          │
                    └──────────┬──────────────────┘
                               │ CORS + httpOnly cookie
                    ┌──────────▼──────────────────┐
                    │    https://api.easyedu.study │
                    │    Cloudflare DNS             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │    AWS EC2                    │
                    │  ┌──────────────────────┐    │
                    │  │ Caddy (auto-HTTPS)   │    │
                    │  └──────────┬───────────┘    │
                    │  ┌──────────▼───────────┐    │
                    │  │ NestJS API :3001     │    │
                    │  └──┬──────────┬────────┘    │
                    │     │          │              │
                    │  ┌──▼───┐  ┌──▼────────┐    │
                    │  │Redis │  │AWS RDS     │    │
                    │  │:6379 │  │PostgreSQL  │    │
                    │  └──────┘  └────────────┘    │
                    └─────────────────────────────┘
```

---

## Cài đặt (Development)

### Yêu cầu

- Node.js ≥ 22
- pnpm ≥ 9
- PostgreSQL 16
- Redis 7

### 1. Clone & cài dependencies

```bash
git clone https://github.com/hienhien1111/EasyEdu.git
cd EasyEdu
pnpm install
```

### 2. Cấu hình môi trường

**Backend** — copy `apps/api/.env.example` thành `apps/api/.env` và điền giá trị:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/easyedu"
JWT_SECRET="dev-secret-change-in-production"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="dev-refresh-secret"
JWT_REFRESH_EXPIRES_IN="30d"
REDIS_HOST="localhost"
REDIS_PORT=6379
PORT=3001
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
RESEND_API_KEY=""
EMAIL_FROM="noreply@example.com"
OTP_EXPIRY_MINUTES=10
PAYOS_CLIENT_ID=""
PAYOS_API_KEY=""
PAYOS_CHECKSUM_KEY=""
```

> PayOS và Resend để trống sẽ dùng mock mode.

### 3. Khởi tạo database

```bash
createdb easyedu
cd apps/api
npx prisma migrate dev
npx prisma db seed
```

### 4. Chạy dev servers

```bash
# Terminal 1 — Backend
cd apps/api && pnpm dev

# Terminal 2 — Frontend
cd apps/web && pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api |
| Swagger Docs | http://localhost:3001/api/docs |
| Health Check | http://localhost:3001/api/health |

---

## Production Deployment

### Kiến trúc production

| Component | Service | Cost estimate |
|-----------|---------|---------------|
| Backend API | AWS EC2 `t4g.small` + Docker | ~$16/mo |
| Database | AWS RDS PostgreSQL `db.t4g.micro` | ~$15/mo |
| Frontend | Vercel | Free (Hobby) / $20/mo (Pro) |
| DNS + CDN | Cloudflare Free | $0 |
| File storage | Cloudflare R2 | $0 (free tier) |
| Reverse proxy | Caddy (on EC2) | included |

**Total: ~$35-55/month**

### Quick start

```bash
# On EC2:
git clone https://github.com/hienhien1111/EasyEdu.git /opt/easyedu
cd /opt/easyedu
cp apps/api/.env.production.example apps/api/.env.production
# Edit .env.production with real values

docker compose -f ops/docker-compose.prod.yml up -d
curl http://localhost:3001/api/health
```

### CI/CD

Manual trigger via GitHub Actions:

1. Push changes to `main`
2. Go to **Actions** → **Deploy API** → **Run workflow**
3. Workflow: build check → SSH to EC2 → pull → rebuild → health check

See [`ops/DEPLOY.md`](ops/DEPLOY.md) for full deployment guide.

---

## API Modules

| Module | Endpoints | Description |
|--------|-----------|-------------|
| `auth` | login, register, refresh, logout, forgot-password, verify-otp, reset-password, change-password | JWT + httpOnly cookie auth |
| `users` | CRUD, approve, lock/unlock | Account management |
| `profiles` | update, teacher-profile, student-profile | Personal & role-specific profiles |
| `classes` | CRUD, students list | Class management |
| `enrollments` | request, approve, remove | Student enrollment flow |
| `rooms` | CRUD | Room management (7 rooms) |
| `schedules` | grid CRUD, weekly override, cancel/makeup | 7-room schedule grid |
| `attendance` | take, save, auto-close, makeup | Attendance with 24h auto-lock |
| `invoices` | auto-draft, issue, monthly cycle | Invoice lifecycle |
| `payments` | QR initiate, webhook, cash flow, requery, reconciliation | Full payment pipeline |
| `receipts` | auto-generate on payment | Receipt management |
| `salaries` | calculate, draft, finalize, pay | Teacher salary |
| `notifications` | create, schedule, send | BullMQ scheduled notifications |
| `inventory` | CRUD | Supply tracking |
| `dashboard` | revenue, attendance stats, overview | Analytics & reports |

---

## Security

- **httpOnly Cookie** — tokens not accessible via JavaScript (XSS protection)
- **Token Rotation** — new refresh token issued on every refresh
- **Redis Blacklist** — JTI blacklisted on logout, immediate effect
- **Rate Limiting** — 5 req/60s login, 3 req/h forgot-password, 100 req/60s global
- **OTP CSPRNG** — `crypto.randomInt()` for OTP generation
- **Account Lockout** — 15-minute lockout after 5 failed login attempts
- **Helmet** — security headers middleware
- **CORS** — strict origin allowlist with credentials
- **Non-root Docker** — API runs as uid 1001
- **No exposed ports** — Redis and API behind Caddy reverse proxy

---

## Use Cases

| UC | Feature | Portal |
|----|---------|--------|
| UC-01 | Login (JWT + httpOnly Cookie) | All |
| UC-02 | Logout (token revoke + cookie clear) | All |
| UC-03 | Account management & approval | Admin |
| UC-04 | Class management | Admin |
| UC-05 | Schedule Grid (7 rooms × week) | Admin |
| UC-06 | Inventory management | Admin |
| UC-07 | Tuition payment (QR + Cash) | Admin/Student |
| UC-08 | Payment reconciliation | Admin |
| UC-09 | Teacher salary calculation | Admin |
| UC-10 | Scheduled notifications | Admin |
| UC-11 | Attendance + auto-close 24h | Teacher |
| UC-12 | Teacher class management | Teacher |
| UC-13 | Teacher personal schedule | Teacher |
| UC-14 | Registration (Teacher/Student) | All |
| UC-15 | Student schedule view | Student |
| UC-16 | Student payment flow | Student |
| UC-17 | Dashboard & reports | Admin |
| UC-18 | Forgot password (OTP via Email) | All |
| UC-19 | Class enrollment | Student |
| UC-20 | Profile & change password | All |

---

## Scripts

```bash
# Development
pnpm dev                      # Run both API and Web (Turborepo)

# Database
cd apps/api
npx prisma migrate dev        # Apply migrations (dev)
npx prisma migrate deploy     # Apply migrations (production)
npx prisma db seed            # Seed sample data
npx prisma studio             # Prisma Studio GUI

# Build
pnpm build                    # Build all workspaces
cd apps/api && pnpm build     # Build API only

# Production
docker compose -f ops/docker-compose.prod.yml up -d      # Start production
docker compose -f ops/docker-compose.prod.yml logs -f api # View logs
```

---

## License

[MIT](LICENSE)
