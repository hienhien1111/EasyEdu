<div align="center">

<img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
<img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
<img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" />

# EasyEdu

**Hệ thống Quản lý Trung tâm Dạy học toàn diện**

Nền tảng full-stack xây dựng trên Next.js 16 + NestJS 11, hỗ trợ 3 portal (Admin / Giáo viên / Học sinh) với đầy đủ chức năng từ điểm danh, thanh toán QR đến tính lương tự động.

</div>

---

## Tính năng nổi bật

| Portal | Chức năng chính |
|--------|-----------------|
| **Admin** | Quản lý người dùng, lớp học, thời khóa biểu 7 phòng, thanh toán, tính lương giáo viên, vật tư, thông báo hẹn giờ, dashboard báo cáo |
| **Giáo viên** | Danh sách lớp, điểm danh (auto-chốt 24h), thời khóa biểu cá nhân, báo nghỉ & đăng ký bù |
| **Học sinh** | Lịch học, thanh toán học phí QR / Tiền mặt, đăng ký lớp mới, hồ sơ cá nhân |

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), Tailwind CSS v4, Zustand, TanStack Query |
| **Backend** | NestJS 11, Passport JWT, Swagger/OpenAPI |
| **Database** | PostgreSQL 16, Prisma 7 ORM |
| **Auth** | JWT (Access + Refresh Token), httpOnly Cookie, bcrypt, Redis blacklist |
| **Queue** | BullMQ + Redis (auto-close attendance, scheduled notifications) |
| **Forms** | React Hook Form + Zod |
| **Charts** | Recharts |

---

## Kiến trúc

```
easyedu/
├── apps/
│   ├── api/                        # NestJS Backend (port 3001)
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Database schema (20+ models)
│   │   │   ├── migrations/         # Migration history
│   │   │   └── seed.ts             # Sample data seeder
│   │   └── src/
│   │       ├── common/             # Guards, decorators, filters, interceptors
│   │       ├── database/           # PrismaModule
│   │       ├── jobs/               # BullMQ processors
│   │       └── modules/
│   │           ├── auth/           # Login, Logout, Refresh, OTP, JWT Strategy
│   │           ├── users/          # CRUD người dùng + duyệt tài khoản
│   │           ├── profiles/       # Hồ sơ cá nhân
│   │           ├── classes/        # Quản lý lớp học
│   │           ├── enrollments/    # Đăng ký lớp
│   │           ├── rooms/          # Phòng học
│   │           ├── schedules/      # Thời khóa biểu Grid
│   │           ├── attendance/     # Điểm danh
│   │           ├── invoices/       # Hóa đơn học phí
│   │           ├── payments/       # Thanh toán QR + Tiền mặt
│   │           ├── receipts/       # Biên lai
│   │           ├── salaries/       # Tính lương giáo viên
│   │           ├── notifications/  # Thông báo hẹn giờ
│   │           ├── inventory/      # Quản lý vật tư
│   │           └── dashboard/      # Báo cáo tổng hợp
│   │
│   └── web/                        # Next.js Frontend (port 3000)
│       └── src/
│           ├── app/
│           │   ├── (auth)/         # Login, Register, Forgot Password
│           │   ├── (admin)/        # Admin portal
│           │   ├── (teacher)/      # Teacher portal
│           │   ├── (student)/      # Student portal
│           │   └── profile/        # Trang hồ sơ cá nhân
│           ├── components/         # Layout, shared UI components
│           ├── lib/                # Axios client, utilities
│           ├── middleware.ts        # Route protection (server-side)
│           └── stores/             # Zustand auth store
│
├── package.json                    # pnpm workspace root + Turborepo
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Cài đặt

### Yêu cầu

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL 16
- Redis 7 (cho BullMQ jobs và token blacklist)

### 1. Clone & cài dependencies

```bash
git clone https://github.com/hienhien1111/EasyEdu.git
cd EasyEdu
pnpm install
```

### 2. Cấu hình môi trường

**Backend** — tạo `apps/api/.env`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/easyedu"

# JWT (thay bằng chuỗi ngẫu nhiên mạnh trong production)
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_REFRESH_EXPIRES_IN="30d"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""

# App
PORT=3001
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"

# Email — Resend (https://resend.com)
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@yourdomain.com"

# OTP
OTP_EXPIRY_MINUTES=10

# Payment — PayOS (https://payos.vn), để trống để dùng mock
PAYOS_CLIENT_ID=""
PAYOS_API_KEY=""
PAYOS_CHECKSUM_KEY=""
```

**Frontend** — tạo `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 3. Khởi tạo database

```bash
# Tạo database PostgreSQL
createdb easyedu

# Apply migrations
cd apps/api
npx prisma migrate dev

# Seed dữ liệu mẫu (tài khoản Admin, Giáo viên, Học sinh)
npx prisma db seed
```

### 4. Khởi động Redis

```bash
# macOS — Homebrew
brew services start redis

# Linux
sudo systemctl start redis
```

### 5. Chạy dev servers

```bash
# Terminal 1 — Backend
cd apps/api && pnpm dev

# Terminal 2 — Frontend
cd apps/web && pnpm dev
```

---

## Endpoints

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api |
| Swagger Docs | http://localhost:3001/api/docs |

---

## Scripts

```bash
# Development
pnpm dev                  # Chạy cả API và Web (Turborepo)

# Database
cd apps/api
npx prisma migrate dev    # Apply migrations
npx prisma db seed        # Seed dữ liệu mẫu
npx prisma studio         # Prisma Studio GUI
npx prisma generate       # Regenerate Prisma Client

# Build
pnpm build                # Build production (tất cả workspace)

# Lint
pnpm lint
```

---

## Use Cases

| UC | Tính năng | Portal |
|----|-----------|--------|
| UC-01 | Đăng nhập (JWT + httpOnly Cookie) | All |
| UC-02 | Đăng xuất (token revoke) | All |
| UC-03 | Quản lý tài khoản & duyệt đăng ký | Admin |
| UC-04 | Quản lý lớp học | Admin |
| UC-05 | Thời khóa biểu Grid (7 phòng × tuần) | Admin |
| UC-06 | Quản lý vật tư | Admin |
| UC-07 | Thanh toán học phí (QR VietQR + Tiền mặt) | Admin |
| UC-08 | Tra soát lỗi thanh toán | Admin |
| UC-09 | Tính lương giáo viên | Admin |
| UC-10 | Thông báo hẹn giờ (filter đối tượng) | Admin |
| UC-11 | Điểm danh + Auto-chốt sau 24h | Teacher |
| UC-12 | Giáo viên xem / quản lý lớp | Teacher |
| UC-13 | Thời khóa biểu giáo viên | Teacher |
| UC-14 | Đăng ký tài khoản (Teacher/Student) | All |
| UC-15 | Lịch học học sinh | Student |
| UC-16 | Thanh toán học phí (Student flow) | Student |
| UC-17 | Dashboard & Báo cáo tổng hợp | Admin |
| UC-18 | Quên mật khẩu (OTP 6 số qua Email) | All |
| UC-19 | Đăng ký lớp học | Student |
| UC-20 | Hồ sơ & đổi mật khẩu | All |

---

## Bảo mật (Auth)

Hệ thống auth được hardened với các biện pháp sau:

- **httpOnly Cookie** — Access token & Refresh token không đọc được bằng JavaScript (chống XSS)
- **Token Rotation** — Refresh token mới được tạo mỗi lần refresh (chống replay attack)
- **Redis Blacklist** — JTI (JWT ID) bị blacklist ngay khi logout, hiệu lực tức thì
- **Rate Limiting** — `@nestjs/throttler`: 5 req/60s cho login, 3 req/h cho forgot-password
- **OTP CSPRNG** — `crypto.randomInt()` thay vì `Math.random()`
- **Account Lockout** — Khóa 15 phút sau 5 lần đăng nhập sai liên tiếp
- **Audit Log** — Ghi lại mọi sự kiện auth (login, logout, OTP, reset password)
- **Middleware** — Server-side route guard (Next.js Edge Middleware) bảo vệ tất cả protected routes

---

## Môi trường production (checklist)

- [ ] Đặt `JWT_SECRET` và `JWT_REFRESH_SECRET` thành chuỗi ngẫu nhiên 48-byte
- [ ] Bật `secure: true` cho cookies (cần HTTPS)
- [ ] Cấu hình PayOS production keys
- [ ] Cấu hình RESEND_API_KEY với domain thật
- [ ] Deploy Redis (Upstash, Redis Cloud…)
- [ ] Cấu hình CORS `FRONTEND_URL` đúng domain production
- [ ] Enable `NODE_ENV=production`

---

## Giấy phép

[MIT](LICENSE)
