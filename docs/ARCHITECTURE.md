# Architecture Guide — RH Cursos System Design

**Project:** RH Cursos - Plataforma de Cursos Corporativos  
**Tech Stack:** Next.js 16 + React 19 + TypeScript + Supabase + Cloudflare Workers  
**Last Updated:** 2026-06-29

---

## 1. System Overview

RH Cursos is a **SaaS platform** for corporate training delivery with:
- **Public catalog** of courses organized by learning paths
- **User enrollment** and course progress tracking
- **Admin dashboard** for course/instructor management
- **Real-time analytics** and performance metrics
- **Serverless deployment** on Cloudflare Workers

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
│  - React 19 + TypeScript                                     │
│  - Mantine UI + Tailwind CSS                                 │
│  - Real-time subscriptions (Supabase)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│              Next.js 16 (App Router)                         │
│  - SSR/SSG Pages                                             │
│  - API Routes (auth/session)                                 │
│  - Edge Functions (rate limiting, auth)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│         Supabase (Backend as a Service)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ PostgreSQL   │  │ Auth System  │  │ Edge         │       │
│  │ Database     │  │ (JWT tokens) │  │ Functions    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  - Row Level Security (RLS)                                  │
│  - Real-time Subscriptions                                   │
│  - Webhook triggers                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▴──────────────────────────────────────┐
│        Cloudflare Workers (Production Deployment)            │
│  - Static asset delivery (CDN)                               │
│  - Next.js server runtime                                    │
│  - Request logging & analytics                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### Frontend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Framework** | Next.js | 16.2.2 | Server-side rendering, routing, optimization |
| **Runtime** | React | 19.2.7 | Component library and state management |
| **Language** | TypeScript | 5.8.3 | Type safety and developer experience |
| **UI Components** | Mantine | 9.3.1 | Design system components (New as of Epic 8) |
| **Styling** | Tailwind CSS | 3.4.17 | Utility-first CSS (legacy, being migrated) |
| **CSS-in-JS** | Emotion | 11.14.0 | Mantine dependency, runtime theming |
| **Forms** | Mantine Form | 9.3.1 | Form state management and validation |
| **Icons** | Lucide React | 0.511.0 | Consistent icon library |
| **Charts** | Recharts | 2.15.4 | Data visualization (admin dashboard) |
| **Animations** | Framer Motion | 12.38.0 | Smooth transitions and interactions |
| **Notifications** | Sonner | 2.0.7 | Toast notification system |
| **Validation** | Zod | 4.4.3 | Runtime data validation (schemas) |

### Backend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Database** | PostgreSQL | (via Supabase) | Relational data storage |
| **Auth** | Supabase Auth | Built-in | JWT-based authentication & session management |
| **Client Library** | @supabase/supabase-js | 2.106.2 | Type-safe database client |
| **SSR Support** | @supabase/ssr | 0.10.3 | Cookie-based auth for Next.js SSR |

### Infrastructure & DevOps

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Deployment** | Cloudflare Workers | - | Serverless edge computing platform |
| **Build Tool** | opennextjs-cloudflare | 1.19.11 | Next.js runtime for Cloudflare |
| **Edge Computing** | Cloudflare Workers (Edge Functions) | - | Rate limiting, auth, request processing |
| **Analytics** | Google Analytics 4 | Built-in | User behavior tracking (opt-in) |
| **Error Tracking** | Sentry | 10.62.0 | Exception monitoring (optional) |

### Development & Testing

| Tool | Version | Purpose |
|-----|---------|---------|
| **Unit Tests** | Vitest | Latest | Component & utility testing |
| **Test Utilities** | React Testing Library | 16.3.2 | React component testing |
| **E2E Tests** | Playwright | 1.60.0 | Full user flow testing |
| **Accessibility** | Axe-core | 4.11.3 | WCAG compliance auditing |
| **Linting** | ESLint | 9.39.4 | Code quality checking |
| **CSS Analysis** | Lighthouse | Built-in | Performance & best practices |
| **Build Tool** | Next.js CLI | 16.2.2 | Development server & builds |

---

## 3. Directory Structure

### Root Level

```
site-rh-cursos/
├── app/                      # Next.js App Router pages
├── src/                      # Application source code
├── supabase/                 # Database migrations & Edge Functions
├── scripts/                  # Automation & utility scripts
├── tests/                    # E2E and integration tests
├── docs/                     # Project documentation
├── public/                   # Static assets (images, fonts)
├── node_modules/             # Dependencies
├── .next/                    # Next.js build output
├── .github/                  # GitHub Actions workflows
├── package.json              # Dependencies & scripts
├── next.config.mjs           # Next.js configuration
├── tsconfig.json             # TypeScript configuration
├── eslint.config.mjs         # ESLint rules
├── tailwind.config.ts        # Tailwind CSS configuration
├── .env.example              # Environment variable template
└── README.md                 # Project overview
```

### `app/` Directory (Next.js Routes)

```
app/
├── layout.tsx                # Root layout (Mantine, GA setup)
├── page.tsx                  # Homepage
├── error.tsx                 # Error boundary (route level)
├── global-error.tsx          # Error boundary (app level)
│
├── admin/                    # Admin section (protected)
│   ├── layout.tsx            # Admin layout (sidebar + header)
│   ├── page.tsx              # Admin dashboard
│   └── [resource]/           # Dynamic admin pages (courses, users, etc)
│       └── page.tsx
│
├── cursos/                   # Public courses catalog
│   ├── page.tsx              # Courses listing
│   └── [slug]/
│       └── page.tsx          # Course detail page
│
├── api/                      # API routes (Next.js route handlers)
│   └── auth/
│       └── session/
│           └── route.ts      # Session management endpoint
│
└── [other-pages]/            # Public pages (login, about, contact, etc)
```

### `src/` Directory (Application Code)

```
src/
├── components/               # Shared UI components (design system)
│   ├── ui/                   # Primitive components (Input, Button, etc)
│   ├── admin/                # Admin-specific components
│   ├── in-company/           # In-company training components
│   └── [other-features]/
│
├── features/                 # Feature-first module organization
│   ├── public/               # Public site features
│   │   ├── home/
│   │   ├── courses/
│   │   ├── contact/
│   │   └── [other-public]/
│   │
│   ├── public-shell/         # Public layout wrapper
│   │   ├── components/       # Header, footer, navigation
│   │   └── config/
│   │
│   ├── admin/                # Admin features
│   │   ├── dashboard/
│   │   ├── resources/        # Courses, instructors, classes
│   │   ├── users/
│   │   └── [admin-modules]/
│   │
│   └── admin-shell/          # Admin layout wrapper
│       ├── components/       # Admin header, sidebar
│       └── config/
│
├── hooks/                    # Global custom React hooks
│   ├── use-courses.ts        # Course data fetching
│   ├── use-auth.ts           # Auth state & login
│   └── [other-hooks]/
│
├── lib/                      # Shared utilities & helpers
│   ├── auth.ts               # Auth utilities
│   ├── authorize.ts          # Authorization checks
│   ├── auth-session.ts       # Session management
│   ├── supabase.ts           # Supabase client setup
│   ├── rate-limit.ts         # Rate limiting logic
│   └── [other-utils]/
│
├── types/                    # Global TypeScript types
│   ├── database.ts           # Database row types
│   ├── course.ts             # Course-related types
│   └── [other-types]/
│
├── design-tokens/            # Design system tokens
│   └── tokens.ts             # Color, spacing, typography
│
├── theme/                    # Mantine theme configuration
│   └── index.ts
│
└── __tests__/                # Unit tests
    ├── lib/
    ├── components/
    └── [mirrors src structure]
```

### `supabase/` Directory (Database)

```
supabase/
├── migrations/               # Database schema migrations
│   ├── 20260605000000_initial_schema.sql
│   ├── 20260608000000_seed_admin_user.sql
│   └── [numbered migrations]
│
├── functions/                # Edge Functions (serverless backend)
│   ├── auth-session/         # Session management
│   ├── enrollments/          # Course enrollment logic
│   ├── leads/                # Lead capture
│   ├── admin-resources/      # Admin data access
│   └── _shared/              # Shared function utilities
│       ├── auth.ts
│       └── [helpers]
│
└── sql/                      # Seed data & utilities
    └── seed_rh_cursos_demo.sql
```

---

## 4. Key Architectural Patterns

### 4.1 Feature-First Architecture

Components and logic are organized by feature, not by layer (component, hook, util):

```
❌ Bad (Layer-based)
components/
  courses/
  admin/
hooks/
  useCourse.ts
  useAdmin.ts

✅ Good (Feature-based)
features/
  admin/
    courses/
      components/
      hooks/
      lib/
      types/
```

**Benefits:**
- Clear feature boundaries
- Easy to add/remove features
- Self-contained modules
- Reduced interdependencies

### 4.2 Data Flow Architecture

The app follows **unidirectional data flow**:

```
┌─────────────────────────────────────────┐
│         Component (React)               │
│  ┌─────────────────────────────────┐   │
│  │ 1. Render UI from state         │   │
│  └─────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │
                 ▼ User interaction
┌─────────────────────────────────────────┐
│      Event Handler (onClick, etc)       │
│  ┌─────────────────────────────────┐   │
│  │ 2. Dispatch action/fetch data   │   │
│  └─────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │
                 ▼ Async operation
┌─────────────────────────────────────────┐
│    Supabase Client Library              │
│  ┌─────────────────────────────────┐   │
│  │ 3. Execute query/mutation       │   │
│  └─────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │
                 ▼ Data response
┌─────────────────────────────────────────┐
│      State Update (useState)            │
│  ┌─────────────────────────────────┐   │
│  │ 4. Update component state       │   │
│  └─────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │
                 └──► Re-render (back to step 1)
```

### 4.3 Authentication Flow

```
Login Page
    │
    ▼ Submit email + password
Supabase Auth API
    │
    ▼ Returns session + JWT token
Store in httpOnly cookie (via @supabase/ssr)
    │
    ▼ On page refresh
Middleware reads cookie → Validates token
    │
    ▼ Token valid?
Yes → Attach to requests | No → Clear session
    │
    ▼ Protected routes check session
Render component | Redirect to /login
```

### 4.4 Real-Time Data Subscriptions

Courses, enrollments, and admin data are synced via Supabase real-time:

```typescript
// Example: Subscribe to course updates
const subscription = supabase
  .from('curso')
  .on('*', (payload) => {
    console.log('Course updated:', payload);
    // Update local state
  })
  .subscribe();

// Cleanup on unmount
useEffect(() => {
  return () => subscription.unsubscribe();
}, []);
```

---

## 5. Database Design

### Schema Overview

```
┌───────────────────────┐
│  auth.users           │ (Supabase Auth)
│  - id (UUID)          │
│  - email              │
│  - created_at         │
└────────────┬──────────┘
             │ 1:1
             ▼
┌───────────────────────────────┐
│  public.profiles (RLS)        │
│  - user_id (FK)               │
│  - full_name                  │
│  - role (admin/student)       │
│  - cpf / organization         │
└─────────────────┬─────────────┘
                  │ 1:N
                  ▼
        ┌─────────────────────┐
        │  public.enrolment   │
        │  - student_id (FK)  │
        │  - course_id (FK)   │
        │  - status           │
        │  - progress (%)     │
        └──────────┬──────────┘
                   │
    ┌──────────────┴──────────────┐
    │                             │
    ▼ N:1                         ▼ N:1
┌──────────────┐      ┌──────────────────┐
│ public.curso │      │ public.instrutor │
│ - id         │      │ - id             │
│ - titulo     │      │ - nome           │
│ - trilha_id  │      │ - email          │
└──────────────┘      └──────────────────┘
    │                       │
    │ N:1                   │ N:1
    ▼                       ▼
┌──────────────┐      ┌──────────────┐
│ public.trilha│      │ public.turma │
│ - id         │      │ - id         │
│ - nome       │      │ - curso_id   │
└──────────────┘      └──────────────┘
```

### Key Tables

| Table | Purpose | Ownership |
|-------|---------|-----------|
| `auth.users` | User accounts (Supabase managed) | Auth system |
| `profiles` | User metadata (role, name, etc) | Public schema, RLS protected |
| `curso` | Course catalog | Public read, admin write |
| `trilha` | Learning paths | Public read, admin write |
| `instrutor` | Instructors | Public read, admin write |
| `turma` | Course sessions/classes | Public read, admin write |
| `enrolment` | Student enrollment records | Public read, RLS on user's own records |
| `post_blog` | Blog articles | Public read, admin write |

### Row Level Security (RLS)

All tables implement RLS policies to ensure users can only access their own data:

```sql
-- Example: Students can only see their own enrollments
CREATE POLICY "students_see_own_enrollments" ON public.enrolment
  FOR SELECT
  USING (student_id = auth.uid());

-- Admins can see all enrollments
CREATE POLICY "admins_see_all_enrollments" ON public.enrolment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

---

## 6. Component Hierarchy

### Public Pages

```
<PublicLayout>
  <PublicHeader>
    <Navigation />
    <SearchBar />
  </PublicHeader>
  
  <main>
    <HomePage>
      <HeroSection />
      <CourseGrid>
        <CourseCard /> × N
      </CourseGrid>
      <CTASection />
    </HomePage>
  </main>
  
  <PublicFooter>
    <Links />
    <SocialMedia />
  </PublicFooter>
</PublicLayout>
```

### Admin Pages

```
<AdminLayout>
  <AdminHeader>
    <SearchBar />
    <UserMenu />
  </AdminHeader>
  
  <AdminSidebar>
    <Navigation />
  </AdminSidebar>
  
  <main>
    <AdminDashboard>
      <MetricsCards />
      <RecentActivityTable />
      <Charts />
    </AdminDashboard>
  </main>
</AdminLayout>
```

---

## 7. State Management Strategy

**No Redux/MobX** — we use **React hooks** + **Supabase real-time**:

```typescript
// Global app state example (AppContext)
export const AppContext = createContext<AppContextType>(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time updates
  useEffect(() => {
    const subscription = supabase
      .from('curso')
      .on('*', (payload) => {
        setCourses(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AppContext.Provider value={{ user, courses, loading }}>
      {children}
    </AppContext.Provider>
  );
}

// Usage in components
export function useCourses() {
  const { courses } = useContext(AppContext);
  return courses;
}
```

---

## 8. API Architecture

### Route Handlers (Next.js `/api`)

```
GET  /api/auth/session         → Get current user session
POST /api/auth/session         → Update session
```

### Edge Functions (Supabase)

Serverless functions for business logic:

```
POST /functions/v1/enrollments   → Enroll student in course
POST /functions/v1/leads         → Capture lead from contact form
POST /functions/v1/admin-resources → Get admin dashboard data
```

**Example Edge Function:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { courseId, studentId } = await req.json();
  
  // Validate authorization
  const user = await getUser(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Create enrollment
  const { data, error } = await supabase
    .from('enrolment')
    .insert({ course_id: courseId, student_id: studentId });

  if (error) return new Response(error.message, { status: 400 });
  return new Response(JSON.stringify(data), { status: 201 });
});
```

---

## 9. Performance Optimization

### Image Optimization

- **Next.js `Image` component:** Automatic WebP conversion, responsive sizing
- **Cloudflare CDN:** Asset caching with automatic minification
- **Build-time optimization:** `npm run analyze` to check bundle

### Code Splitting

- **Route-based:** Each page is a separate chunk
- **Dynamic imports:** `const Modal = dynamic(() => import('./Modal'))`
- **Lazy components:** `React.lazy()` for non-critical UI

### Caching Strategy

```
Browser Cache (1 week)
    ↓
Cloudflare CDN (24 hours)
    ↓
Next.js Server (10 min)
    ↓
Supabase Database
```

### Database Query Optimization

- **Indexes:** Key columns indexed (user_id, course_id, status)
- **Connection pooling:** Supabase handles automatically
- **Query result caching:** 10-minute server-side cache

---

## 10. Security Architecture

### Authentication

- **Provider:** Supabase Auth (JWT-based)
- **Storage:** HttpOnly cookies (secure, http-only, sameSite=Lax)
- **Refresh:** Automatic token refresh via `@supabase/ssr`

### Authorization

- **Role-based:** admin, student
- **Row-level:** RLS policies enforce data access
- **Function-level:** Permission checks in Edge Functions

### Data Protection

- **Encryption:** TLS 1.3 in transit
- **Secrets:** Never stored in code; use environment variables
- **Rate limiting:** 60 req/min per IP (configurable)

---

## 11. Error Handling & Monitoring

### Error Boundaries

```typescript
// Route-level error handling
export default function ErrorPage({ error, reset }) {
  return (
    <div>
      <h1>Something went wrong!</h1>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Sentry Integration (Optional)

Captures exceptions in production:
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.captureException(error);
```

### Logging

- **Development:** Console logs with source maps
- **Production:** Structured logs to Sentry/Cloudflare Workers Analytics

---

## 12. Deployment Architecture

### Build Process

```
git push
    ↓
GitHub Actions (CI/CD)
    ├── npm run lint          # Code quality
    ├── npm run typecheck     # Type safety
    ├── npm test              # Full test suite
    └── npm run build         # Production build
    ↓
opennextjs-cloudflare build  # Create worker bundle
    ↓
wrangler deploy              # Deploy to Cloudflare
    ↓
CDN distribution (global)
```

### Production Environment

- **Hosting:** Cloudflare Workers (edge computing)
- **Database:** Supabase (auto-managed PostgreSQL)
- **CDN:** Cloudflare global network
- **Scaling:** Automatic (serverless)

---

### Sales reactivation worker

The sales reactivation path is intentionally split across the existing
platform boundaries:

- Cloudflare/Next.js exposes only the protected administrative status read model.
- Supabase remains the system of record for contact permission, policy decisions,
  campaign versions, sequence claims, send attempts, suppression and notification outbox.
- External contact bases enter through a service-role-only import gate. Dry-run
  persists only hashed audit decisions; apply is idempotent, preserves existing
  PII, stores the `GESTAO_DE_PESSOAS` segment separately, records imported legal
  basis as `UNKNOWN`, and incorporates dated source history into inactivity checks.
- An EventBridge-scheduled Lambda performs bounded orchestration and calls Amazon
  SES and the allowlisted private Telegram chat.
- Locaweb remains the corporate reply inbox; the existing IMAP collector feeds
  replies back into the same append-only interaction timeline.

The stack is fail-closed at every layer: the schedule defaults to disabled, the
worker defaults to dry-run, the database defaults to disabled plus global kill
switch, and campaign content defaults to draft. Production activation is a
separate, explicitly approved operation. See
[`docs/operations/sales-reactivation-orchestrator.md`](operations/sales-reactivation-orchestrator.md).

---

## 13. Glossary & Key Terms

| Term | Definition |
|------|-----------|
| **Feature** | Self-contained module (e.g., `features/admin/courses/`) |
| **Component** | Reusable React element |
| **Hook** | Reusable stateful logic (`use*`) |
| **RLS** | Row Level Security (database access policies) |
| **Edge Function** | Serverless function running on Supabase/Cloudflare |
| **Middleware** | Function intercepting requests/responses |
| **SSR** | Server-Side Rendering (render on server) |
| **SSG** | Static Site Generation (pre-render at build time) |
| **JWT** | JSON Web Token (authentication credential) |
| **CORS** | Cross-Origin Resource Sharing (security policy) |

---

## 14. Further Reading

- **Database Schema:** [`docs/database/SCHEMA.md`](database/SCHEMA.md)
- **Security Audit:** [`docs/database/DB-AUDIT.md`](database/DB-AUDIT.md)
- **API Documentation:** [`docs/api/README.md`](api/README.md)
- **Design System:** [`docs/design-system/`](design-system/)
- **Deployment Guide:** [`docs/DEPLOYMENT.md`](DEPLOYMENT.md)

---

**Last Updated:** 2026-06-29  
**Maintained By:** @analyst (Alex) — Synkra AIOX
