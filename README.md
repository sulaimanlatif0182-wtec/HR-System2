# NimbusHR — Enterprise People Platform

A modern HR/ERP web app built with Vite + React + TypeScript + Tailwind CSS,
backed by Supabase (Postgres) and deployed on Vercel.

## Features
- Role-based login (Admin / Manager / Employee) with email/password + Google sign-in
- Dashboard with live KPI cards and charts (attendance, department split, leave)
- Employee directory (grid/table views, profile drawer, add employee)
- Attendance check-in/out + presence heatmap
- Leave request + approval workflow
- Payroll payslips + department cost breakdown
- Interactive org chart

## Tech Stack
- Vite + React 19 + TypeScript
- Tailwind CSS v4
- framer-motion (animations), recharts (charts), lucide-react (icons)
- Supabase (Postgres database + Auth)
- Vercel serverless functions (`/api`) for all backend logic

---

## 1. Prerequisites
- Node.js 18+ and npm
- A Supabase project (free tier is fine) — https://supabase.com
- A GitHub account
- A Vercel account — https://vercel.com

## 2. Set up Supabase
1. Create a new Supabase project.
2. In **Project Settings → API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (keep this private!)
3. Create the following tables in the Supabase SQL editor (or Table Editor):
   - `departments` (id, name, color, budget, created_at)
   - `employees` (id, name, email, avatar_url, role, department, title, status, phone, location, join_date, salary, created_at)
   - `attendance` (id, employee_id, date, check_in, check_out, status, created_at)
   - `leave_requests` (id, employee_id, leave_type, start_date, end_date, days, status, reason, requested_at, decided_by)
   - `payroll` (id, employee_id, period, base_salary, bonus, deductions, net_pay, status, pay_date)
4. Seed a few rows in each table so the app has content (or copy your existing data if migrating).
5. Under **Authentication → Users**, create demo users, e.g.:
   - admin@hrsystem.com / admin123
   - manager@hrsystem.com / manager123
   - employee@hrsystem.com / employee123
   (Make sure each demo user's email also exists as a row in the `employees` table so their role/profile resolves correctly.)

## 3. Configure environment variables
Copy `.env.example` to `.env` and fill in your real values:

```bash
cp .env.example .env
```

```
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-public-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret-key"
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"

# Optional — only needed for Google Sign-In
VITE_GOOGLE_CLIENT_ID=""
VITE_GOOGLE_AUTH_PROXY=""
```

**Never commit your real `.env` file** — it's already excluded via `.gitignore`.

## 4. Run locally
```bash
npm install
npm run dev
```
Visit http://localhost:5173

## 5. Deploy to your own Vercel account
1. Push this project to a new GitHub repository.
2. In Vercel: **Add New → Project → Import** your GitHub repo.
3. Framework preset: Vite (auto-detected). Build command: `npm run build`. Output dir: `dist`.
4. In **Project Settings → Environment Variables**, add the same variables from your `.env` file.
5. Click **Deploy**.
6. From then on, every `git push` to your main branch triggers an automatic redeploy.

## Project Structure
```
api/            Vercel serverless functions (backend API routes)
src/
  pages/        Route-level pages (Dashboard, Employees, Attendance, Leave, Payroll, OrgChart, Login)
  components/   Shared UI (Layout, ProtectedRoute, TiltCard, Shared states)
  contexts/     AuthContext (Supabase session/profile state)
  lib/          Supabase client + Google auth helper
public/         Static assets (favicon, etc.)
```

## Notes
- All data is read/written through the Supabase Postgres database via the API routes in `/api` — there is no mock/fake data in the frontend.
- `api/db-client.js` uses the Supabase **service role key** server-side only — never expose this key in frontend code.
