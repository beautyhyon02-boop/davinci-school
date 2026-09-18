# 1주차 · 뼈대 구현 계획 (Week 1 Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다빈치스쿨 웹앱의 뼈대 — 파스텔 디자인 토큰, 공개 홈페이지, 전체 DB 스키마+RLS, 로그인·역할 분기, 가맹문의 접수, 성취기준 원문 DB 투입, 관리자의 가맹원·원장 계정 발급 — 를 Vercel 스테이징에 올린다.

**Architecture:** 단일 Next.js 16 App Router 앱. 경로로 역할 분리(`/`, `/admin`, `/teacher`, `/student`). Supabase(Auth + Postgres + RLS)가 데이터와 권한을 담당하고, `proxy.ts`가 세션 갱신과 역할별 경로 보호를 한다. 홈페이지 문구는 `content/site.ts` 한 파일에 모아 코드와 분리한다. 성취기준은 Python 스크립트로 PDF→JSON 추출 후 TS 스크립트로 DB에 넣는다.

**Tech Stack:** Next.js 16.3 (App Router, TypeScript), React 19, Tailwind CSS 4, @supabase/ssr 0.12 + @supabase/supabase-js 2.116, Vitest 5, zod 4, Resend 6, Python 3.14 + pdfplumber (추출 전용), Supabase CLI 2.104.

**Spec:** `docs/superpowers/specs/2026-09-18-davinci-school-website-design.md`

## Global Constraints

- 발표 목표일 2026-10-18. 이 계획은 1주차(9/18~24) 분량.
- 디자인: 흰 바탕, 민트 주색, 레몬 강조색(버튼·배지), 연보라 보조색. 둥근 모서리, 넉넉한 여백. 학생 화면 글자 크게.
- 권한은 화면이 아니라 **DB 행 단위 보안(RLS)** 으로 강제. 원장은 자기 원만, 학생은 자기 것만, 관리자는 전체.
- 게시된 문항은 원 구분 없이 전체 공개.
- 학생 아이디 규칙: `원코드-번호` (예 `seoul01-023`). 초기 비밀번호는 1회만 표시.
- 비밀 키는 `.env.local`(로컬)과 Vercel 환경변수에만. 저장소·채팅에 넣지 않는다.
- 과목 enum: 국어·영어·수학·과학·사회·한국사. 학교급 enum: 초·중·고.
- 이 컴퓨터에 Docker가 없다 → Supabase 로컬 실행 불가. 스키마는 **호스팅된 Supabase 프로젝트**에 `supabase db push`로 적용한다. Task 4 이후는 대표님이 만든 Supabase 프로젝트의 URL/키가 `.env.local`에 있어야 진행 가능.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 테스트: 순수 로직은 Vitest 단위 테스트. DB·인증은 스테이징에서 수동 확인 절차를 각 Task에 명시.

---

## 파일 구조

```
(repo root = C:\Users\beaut\OneDrive\바탕 화면\다빈치스쿨)
app/
  layout.tsx                 루트 레이아웃 (폰트·globals.css)
  globals.css                Tailwind 4 + 디자인 토큰
  (public)/
    layout.tsx               Header/Footer 감싼 공개 레이아웃
    page.tsx                 메인
    programs/inquiry/page.tsx
    programs/essay/page.tsx
    programs/consulting/page.tsx
    programs/lab/page.tsx
    franchise/page.tsx       가맹 안내 + 문의 폼
    franchise/actions.ts     문의 접수 server action
  login/page.tsx
  login/actions.ts
  auth/signout/route.ts
  admin/layout.tsx, page.tsx, academies/page.tsx, academies/actions.ts, inquiries/page.tsx
  teacher/layout.tsx, page.tsx
  student/layout.tsx, page.tsx
components/
  site/Header.tsx, Footer.tsx, ProgramCard.tsx, Section.tsx
  ui/Button.tsx, Card.tsx, Input.tsx, Badge.tsx
  app/AppShell.tsx           로그인 후 공통 셸 (사이드 메뉴)
content/site.ts              홈페이지 문구·사업 카드 (코드와 분리)
lib/
  supabase/server.ts, client.ts, admin.ts, proxy.ts
  auth/roles.ts              역할→홈 경로, 경로 접근 판정 (순수)
  auth/login-id.ts           아이디↔이메일 변환 (순수)
  students/ids.ts            학생 아이디 생성 (순수)
  standards/parse.ts         성취기준 JSON 검증 (zod)
proxy.ts
supabase/config.toml
supabase/migrations/20260918000001_schema.sql
supabase/migrations/20260918000002_rls.sql
supabase/migrations/20260918000003_profile_trigger.sql
scripts/
  extract-standards.py       PDF → data/standards/*.json
  import-standards.ts        JSON → standards 테이블
data/standards/중_국어.json 등
tests/
  roles.test.ts, login-id.test.ts, student-ids.test.ts, standards-parse.test.ts, extract_standards_test.py
.env.example
```

---

### Task 1: 프로젝트 생성 + 디자인 토큰 + 테스트 러너

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/globals.css`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: CSS 변수 `--color-mint-*`, `--color-lemon-*`, `--color-lavender-*`, Tailwind 유틸 `bg-mint-100`, `text-lavender-700` 등. `npm test`, `npm run dev`, `npm run build`.

- [ ] **Step 1: create-next-app 실행 (repo 루트에 직접)**

```bash
cd "C:/Users/beaut/OneDrive/바탕 화면/다빈치스쿨"
npx --yes create-next-app@16 . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-turbopack --yes
```
`.`에 생성하므로 기존 `docs/`는 그대로 남는다. 생성 후 `git status`로 `docs/`가 살아 있는지 확인.

- [ ] **Step 2: Vitest 설치**

```bash
npm i -D vitest @vitejs/plugin-react jsdom
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
```

`package.json` scripts에 추가: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: 스모크 테스트 작성·실행**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => { it('runs', () => { expect(1 + 1).toBe(2) }) })
```
Run: `npm test` → Expected: 1 passed.

- [ ] **Step 4: 디자인 토큰**

`app/globals.css` 전체 교체:
```css
@import "tailwindcss";

@theme {
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;

  --color-mint-50:  #f0fbf8;
  --color-mint-100: #d9f5ec;
  --color-mint-200: #b3ebd9;
  --color-mint-300: #7fdcc0;
  --color-mint-400: #4cc9a4;
  --color-mint-500: #2bb08a;
  --color-mint-600: #1f8f70;
  --color-mint-700: #1a725a;

  --color-lemon-50:  #fffcec;
  --color-lemon-100: #fff7c7;
  --color-lemon-200: #ffee8f;
  --color-lemon-300: #ffe25a;
  --color-lemon-400: #f9d12a;
  --color-lemon-500: #e6b800;
  --color-lemon-600: #b38f00;

  --color-lavender-50:  #f7f5fd;
  --color-lavender-100: #ece7fa;
  --color-lavender-200: #d9d0f4;
  --color-lavender-300: #bfb0eb;
  --color-lavender-400: #a08ade;
  --color-lavender-500: #8268cf;
  --color-lavender-600: #6a50b5;
  --color-lavender-700: #563f94;

  --color-ink-900: #1f2430;
  --color-ink-700: #3b4252;
  --color-ink-500: #6b7280;
  --color-ink-300: #cfd4dd;
  --color-ink-100: #f3f4f7;

  --radius-xl: 1.25rem;
  --radius-2xl: 1.75rem;
}

html { color: var(--color-ink-900); background: #fff; }
body { @apply antialiased; }
```

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '다빈치스쿨',
  description: '탐구보고서와 서논술형 수업, 전국 가맹원 네트워크 다빈치스쿨',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: `.env.example`과 `.gitignore`**

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
INQUIRY_NOTIFY_EMAIL=davincischooloffice@gmail.com
```
`.gitignore`에 `.env*.local`, `.env`가 있는지 확인(create-next-app 기본 포함).

- [ ] **Step 6: 빌드 확인 + 커밋**

Run: `npm run build` → Expected: 성공.
```bash
git add -A && git commit -m "chore: Next.js 16 프로젝트 생성, 파스텔 디자인 토큰, Vitest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 홈페이지 문구 파일 + UI 부품 + 공개 레이아웃 + 메인

**Files:**
- Create: `content/site.ts`, `components/ui/Button.tsx`, `components/ui/Card.tsx`, `components/ui/Badge.tsx`, `components/site/Header.tsx`, `components/site/Footer.tsx`, `components/site/ProgramCard.tsx`, `components/site/Section.tsx`, `app/(public)/layout.tsx`, `app/(public)/page.tsx`
- Delete: `app/page.tsx` (create-next-app 기본)
- Test: `tests/site-content.test.ts`

**Interfaces:**
- Produces: `site` 객체 (`content/site.ts`) — `site.name`, `site.tagline`, `site.intro`, `site.stats`, `site.programs[]` (`slug`, `name`, `short`, `status: 'open'|'soon'`, `accent: 'mint'|'lemon'|'lavender'`). `Button` props `{ variant?: 'primary'|'accent'|'ghost', href?: string }`.

- [ ] **Step 1: 문구 파일**

`content/site.ts`:
```ts
export type ProgramSlug = 'inquiry' | 'essay' | 'consulting' | 'lab'

export const site = {
  name: '다빈치스쿨',
  tagline: '스스로 묻고, 탐구하고, 글로 증명하는 아이들',
  intro:
    '다빈치스쿨은 5년간 40권의 탐구보고서 교재로 검증된 수업을 전국 가맹원에 공급하는 교육 본사입니다. 이제 서논술형 수업과 AI 피드백으로 아이의 생각을 글로 완성합니다.',
  stats: [
    { label: '전국 가맹원', value: '40+' },
    { label: '탐구보고서 교재', value: '40권' },
    { label: '누적 수업 기간', value: '5년' },
  ],
  programs: [
    { slug: 'inquiry', name: '탐구보고서', short: '질문에서 보고서까지, 5년 검증된 탐구 수업', status: 'open', accent: 'mint' },
    { slug: 'essay', name: '서논술형 수업', short: '성취기준 기반 문항과 AI 채점·피드백', status: 'open', accent: 'lemon' },
    { slug: 'consulting', name: '대입 컨설팅', short: '탐구 이력을 대입 전략으로', status: 'soon', accent: 'lavender' },
    { slug: 'lab', name: '다빈치랩', short: '자기주도 학습관', status: 'soon', accent: 'mint' },
  ] as const satisfies ReadonlyArray<{ slug: ProgramSlug; name: string; short: string; status: 'open' | 'soon'; accent: 'mint' | 'lemon' | 'lavender' }>,
  why: [
    { title: '교육과정에서 출발', body: '2022 개정 교육과정 성취기준 원문에서 문항을 설계합니다.' },
    { title: '글로 남는 배움', body: '탐구와 논술의 결과가 학생의 글로 축적됩니다.' },
    { title: '원장님과 함께', body: '본사가 문항·지침서·자료를 만들고, 원장님은 수업에 집중합니다.' },
  ],
  contact: { email: 'davincischooloffice@gmail.com' },
  nav: [
    { href: '/programs/inquiry', label: '탐구보고서' },
    { href: '/programs/essay', label: '서논술형' },
    { href: '/programs/consulting', label: '대입 컨설팅' },
    { href: '/programs/lab', label: '다빈치랩' },
  ],
}
```
(문구는 임시. 대표님이 3.1 내용을 주면 이 파일만 고친다.)

- [ ] **Step 2: 문구 테스트**

`tests/site-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { site } from '@/content/site'

describe('site content', () => {
  it('has exactly four programs with unique slugs', () => {
    const slugs = site.programs.map(p => p.slug)
    expect(slugs).toEqual(['inquiry', 'essay', 'consulting', 'lab'])
  })
  it('marks inquiry and essay as open', () => {
    expect(site.programs.filter(p => p.status === 'open').map(p => p.slug)).toEqual(['inquiry', 'essay'])
  })
})
```
Run: `npm test` → Expected: PASS.

- [ ] **Step 3: UI 부품**

`components/ui/Button.tsx`:
```tsx
import Link from 'next/link'
import type { ComponentProps } from 'react'

type Variant = 'primary' | 'accent' | 'ghost'
const styles: Record<Variant, string> = {
  primary: 'bg-mint-500 text-white hover:bg-mint-600',
  accent: 'bg-lemon-300 text-ink-900 hover:bg-lemon-400',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100',
}
const base = 'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50'

type Props = { variant?: Variant; href?: string } & Omit<ComponentProps<'button'>, 'ref'>

export function Button({ variant = 'primary', href, className = '', children, ...rest }: Props) {
  const cls = `${base} ${styles[variant]} ${className}`
  if (href) return <Link href={href} className={cls}>{children}</Link>
  return <button className={cls} {...rest}>{children}</button>
}
```

`components/ui/Card.tsx`:
```tsx
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)] ${className}`}>{children}</div>
}
```

`components/ui/Badge.tsx`:
```tsx
const tones = {
  mint: 'bg-mint-100 text-mint-700',
  lemon: 'bg-lemon-100 text-lemon-600',
  lavender: 'bg-lavender-100 text-lavender-700',
  gray: 'bg-ink-100 text-ink-500',
} as const
export function Badge({ tone = 'mint', children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}
```

- [ ] **Step 4: Header / Footer / Section / ProgramCard**

`components/site/Header.tsx`:
```tsx
import Link from 'next/link'
import { site } from '@/content/site'
import { Button } from '@/components/ui/Button'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-mint-700">{site.name}</Link>
        <nav className="hidden gap-6 text-sm text-ink-700 md:flex">
          {site.nav.map(n => <Link key={n.href} href={n.href} className="hover:text-mint-600">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost">로그인</Button>
          <Button href="/franchise" variant="accent">가맹문의</Button>
        </div>
      </div>
    </header>
  )
}
```

`components/site/Footer.tsx`:
```tsx
import { site } from '@/content/site'
export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-ink-100/40">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-500">
        <p className="font-semibold text-ink-700">{site.name}</p>
        <p className="mt-1">문의 {site.contact.email}</p>
        <p className="mt-4">© {new Date().getFullYear()} {site.name}</p>
      </div>
    </footer>
  )
}
```

`components/site/Section.tsx`:
```tsx
export function Section({ title, eyebrow, children, className = '' }: { title?: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mx-auto max-w-6xl px-4 py-16 ${className}`}>
      {eyebrow && <p className="mb-2 text-sm font-semibold text-lavender-600">{eyebrow}</p>}
      {title && <h2 className="mb-8 text-3xl font-extrabold tracking-tight">{title}</h2>}
      {children}
    </section>
  )
}
```

`components/site/ProgramCard.tsx`:
```tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { site } from '@/content/site'

type Program = (typeof site.programs)[number]
const bg = { mint: 'bg-mint-50', lemon: 'bg-lemon-50', lavender: 'bg-lavender-50' } as const

export function ProgramCard({ p }: { p: Program }) {
  return (
    <Link href={`/programs/${p.slug}`} className={`block rounded-2xl p-6 transition hover:-translate-y-0.5 hover:shadow-md ${bg[p.accent]}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl font-bold">{p.name}</h3>
        {p.status === 'soon' ? <Badge tone="gray">준비 중</Badge> : <Badge tone={p.accent}>운영 중</Badge>}
      </div>
      <p className="text-ink-700">{p.short}</p>
    </Link>
  )
}
```

- [ ] **Step 5: 공개 레이아웃 + 메인**

`app/(public)/layout.tsx`:
```tsx
import { Header } from '@/components/site/Header'
import { Footer } from '@/components/site/Footer'
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (<><Header /><main>{children}</main><Footer /></>)
}
```

`app/(public)/page.tsx`:
```tsx
import { site } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/site/Section'
import { ProgramCard } from '@/components/site/ProgramCard'

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-mint-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{site.tagline}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-700">{site.intro}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button href="/programs/essay">서논술형 수업 보기</Button>
            <Button href="/franchise" variant="accent">가맹문의</Button>
          </div>
          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4">
            {site.stats.map(s => (
              <div key={s.label} className="rounded-2xl bg-white/70 p-4">
                <dt className="text-sm text-ink-500">{s.label}</dt>
                <dd className="text-2xl font-extrabold text-mint-700">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Section eyebrow="PROGRAMS" title="다빈치스쿨의 네 가지 수업">
        <div className="grid gap-5 md:grid-cols-2">
          {site.programs.map(p => <ProgramCard key={p.slug} p={p} />)}
        </div>
      </Section>

      <Section eyebrow="WHY DAVINCI" title="왜 다빈치인가">
        <div className="grid gap-5 md:grid-cols-3">
          {site.why.map(w => (
            <div key={w.title} className="rounded-2xl border border-ink-100 p-6">
              <h3 className="mb-2 text-lg font-bold">{w.title}</h3>
              <p className="text-ink-700">{w.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-3xl bg-lavender-50 p-10 text-center">
          <h2 className="text-2xl font-extrabold">우리 지역에 다빈치스쿨을 열고 싶다면</h2>
          <p className="mt-2 text-ink-700">본사가 교재·문항·교사용 지침서를 준비합니다.</p>
          <Button href="/franchise" variant="accent" className="mt-6">가맹 안내 보기</Button>
        </div>
      </Section>
    </>
  )
}
```
`app/page.tsx` 삭제 (라우트 충돌 방지).

- [ ] **Step 6: 확인 + 커밋**

Run: `npm run dev` → 브라우저에서 `http://localhost:3000` — 헤더 우상단에 [로그인][가맹문의], 4개 카드, 통계 3개가 보이는지 확인. `npm run build` 성공.
```bash
git add -A && git commit -m "feat: 공개 홈페이지 메인, 문구 분리, UI 부품

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 사업 소개 4페이지 + 가맹 안내 페이지(폼 UI만)

**Files:**
- Create: `app/(public)/programs/inquiry/page.tsx`, `app/(public)/programs/essay/page.tsx`, `app/(public)/programs/consulting/page.tsx`, `app/(public)/programs/lab/page.tsx`, `app/(public)/franchise/page.tsx`, `components/site/ComingSoon.tsx`
- Modify: `content/site.ts` (programDetails 추가)

**Interfaces:**
- Produces: `site.programDetails[slug]` = `{ headline, paragraphs: string[], bullets: string[] }`. 가맹 폼 필드명: `name`, `phone`, `region`, `message` (Task 7의 server action이 이 이름을 읽는다).

- [ ] **Step 1: 상세 문구 추가**

`content/site.ts` 끝에 추가:
```ts
export const programDetails: Record<ProgramSlug, { headline: string; paragraphs: string[]; bullets: string[] }> = {
  inquiry: {
    headline: '질문에서 보고서까지, 스스로 완성하는 탐구',
    paragraphs: ['5년간 40권의 교재로 다듬어진 탐구보고서 수업입니다. 학생은 질문을 세우고, 자료를 모으고, 보고서로 정리하는 과정을 학년별로 반복합니다.'],
    bullets: ['초·중·고 학년별 교재 40권', '주제 선정 → 자료 조사 → 보고서 작성의 3단계', '원장님용 수업 지도안 제공'],
  },
  essay: {
    headline: '성취기준에서 출발하는 서논술형 수업과 AI 피드백',
    paragraphs: ['2022 개정 교육과정 성취기준 원문에서 문항을 설계합니다. 학생이 답안을 제출하면 루브릭에 따라 AI가 채점하고, 잘한 점과 보완할 점을 나누어 피드백합니다.', '한 가지 대주제를 국어·영어·수학·과학·사회가 함께 다루는 융합(STEAM) 방식으로 문항을 구성합니다.'],
    bullets: ['초·중·고 × 국·영·수·과·사·한국사', '루브릭 기반 AI 채점, 30초 안에 피드백', '교사용 지침서·차시 설계·예시답안 제공'],
  },
  consulting: { headline: '탐구 이력을 대입 전략으로', paragraphs: ['준비 중입니다.'], bullets: [] },
  lab: { headline: '자기주도 학습관 다빈치랩', paragraphs: ['준비 중입니다.'], bullets: [] },
}
```

- [ ] **Step 2: ComingSoon 부품과 4개 페이지**

`components/site/ComingSoon.tsx`:
```tsx
import { Button } from '@/components/ui/Button'
export function ComingSoon({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-32 text-center">
      <p className="text-sm font-semibold text-lavender-600">COMING SOON</p>
      <h1 className="mt-2 text-3xl font-extrabold">{name}은(는) 준비 중입니다</h1>
      <p className="mt-4 text-ink-700">곧 자세한 안내를 드리겠습니다.</p>
      <Button href="/" variant="ghost" className="mt-8">메인으로</Button>
    </div>
  )
}
```

`app/(public)/programs/essay/page.tsx` (inquiry도 slug만 바꿔 동일 구조):
```tsx
import { programDetails, site } from '@/content/site'
import { Section } from '@/components/site/Section'
import { Button } from '@/components/ui/Button'

const slug = 'essay' as const
export default function EssayPage() {
  const p = site.programs.find(x => x.slug === slug)!
  const d = programDetails[slug]
  return (
    <>
      <div className="bg-lemon-50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-sm font-semibold text-lavender-600">{p.name}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{d.headline}</h1>
        </div>
      </div>
      <Section>
        <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4 text-lg text-ink-700">{d.paragraphs.map(t => <p key={t}>{t}</p>)}</div>
          <ul className="space-y-3 rounded-2xl bg-mint-50 p-6">
            {d.bullets.map(b => <li key={b} className="flex gap-2"><span className="text-mint-600">✓</span>{b}</li>)}
          </ul>
        </div>
        <Button href="/franchise" variant="accent" className="mt-10">이 수업으로 가맹 문의</Button>
      </Section>
    </>
  )
}
```
`inquiry/page.tsx`: 위와 같되 `slug = 'inquiry'`, 상단 배경 `bg-mint-50`, 컴포넌트명 `InquiryPage`.
`consulting/page.tsx`: `export default function ConsultingPage() { return <ComingSoon name="대입 컨설팅" /> }`
`lab/page.tsx`: `export default function LabPage() { return <ComingSoon name="다빈치랩" /> }`

- [ ] **Step 3: 가맹 안내 페이지 (폼은 아직 제출 안 됨)**

`app/(public)/franchise/page.tsx`:
```tsx
import { Section } from '@/components/site/Section'
import { Button } from '@/components/ui/Button'

export default function FranchisePage() {
  return (
    <>
      <div className="bg-lavender-50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h1 className="text-4xl font-extrabold tracking-tight">다빈치스쿨 가맹 안내</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-700">본사가 교재·문항·교사용 지침서·AI 채점 시스템을 제공합니다. 원장님은 학생과 수업에 집중하세요.</p>
        </div>
      </div>
      <Section title="문의 남기기">
        <form className="grid max-w-xl gap-4">
          <label className="grid gap-1 text-sm font-semibold">이름<input name="name" required className="rounded-xl border border-ink-300 px-4 py-3 font-normal" /></label>
          <label className="grid gap-1 text-sm font-semibold">연락처<input name="phone" required className="rounded-xl border border-ink-300 px-4 py-3 font-normal" placeholder="010-0000-0000" /></label>
          <label className="grid gap-1 text-sm font-semibold">지역<input name="region" required className="rounded-xl border border-ink-300 px-4 py-3 font-normal" placeholder="예: 경기 성남" /></label>
          <label className="grid gap-1 text-sm font-semibold">문의 내용<textarea name="message" rows={5} className="rounded-xl border border-ink-300 px-4 py-3 font-normal" /></label>
          <Button type="submit" variant="accent">문의 보내기</Button>
        </form>
      </Section>
    </>
  )
}
```

- [ ] **Step 4: 확인 + 커밋**

`npm run build` 성공, `/programs/essay`, `/programs/consulting`, `/franchise` 렌더 확인.
```bash
git add -A && git commit -m "feat: 사업 소개 4페이지, 가맹 안내 페이지

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Supabase 스키마 + RLS + 프로필 트리거 (마이그레이션)

**선행 조건:** 대표님이 Supabase 프로젝트(서울 리전)를 만들고 `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 넣어 두었어야 한다. `supabase login` 후 `supabase link --project-ref <ref>`.

**Files:**
- Create: `supabase/config.toml` (`supabase init`이 생성), `supabase/migrations/20260918000001_schema.sql`, `supabase/migrations/20260918000002_rls.sql`, `supabase/migrations/20260918000003_profile_trigger.sql`

**Interfaces:**
- Produces: 테이블 `academies, profiles, students, standards, themes, item_sets, item_set_standards, assignments, submissions, gradings, franchise_inquiries, notices, resources, site_settings, student_count_snapshots`. enum `user_role('admin','teacher','student')`, `school_level('초','중','고')`, `subject('국어','영어','수학','과학','사회','한국사')`, `item_status('draft','review','published','retired')`, `grading_status('pending','done','failed')`, `inquiry_status('new','contacted','done')`. 함수 `public.current_user_role()`, `public.current_academy_id()`.
- 새 사용자는 `auth.users.raw_user_meta_data`의 `{ role, academy_id, name, login_id }`로 `profiles` 행이 자동 생성된다.

- [ ] **Step 1: supabase init + link**

```bash
supabase init
supabase link --project-ref <대표님 프로젝트 ref>
```

- [ ] **Step 2: 스키마 마이그레이션**

`supabase/migrations/20260918000001_schema.sql`:
```sql
create extension if not exists "pgcrypto";

create type user_role as enum ('admin','teacher','student');
create type school_level as enum ('초','중','고');
create type subject as enum ('국어','영어','수학','과학','사회','한국사');
create type item_status as enum ('draft','review','published','retired');
create type grading_status as enum ('pending','done','failed');
create type inquiry_status as enum ('new','contacted','done');

create table academies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{3,12}$'),
  name text not null,
  region text,
  director_phone text,
  active boolean not null default true,
  student_capacity int not null default 100,
  monthly_grading_limit int not null default 300,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  academy_id uuid references academies(id),
  name text not null,
  login_id text unique,
  created_at timestamptz not null default now(),
  check ((role = 'admin' and academy_id is null) or (role <> 'admin' and academy_id is not null))
);
create index on profiles(academy_id);

create table students (
  profile_id uuid primary key references profiles(id) on delete cascade,
  academy_id uuid not null references academies(id),
  level school_level not null,
  grade int not null check (grade between 1 and 6),
  enrolled boolean not null default true,
  seq int not null,
  unique (academy_id, seq)
);

create table standards (
  id uuid primary key default gen_random_uuid(),
  level school_level not null,
  subject subject not null,
  grade_band text not null,
  domain text not null,
  code text not null unique,
  text text not null
);
create index on standards(level, subject);

create table themes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro text,
  level school_level not null,
  grade int not null,
  status item_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table item_sets (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references themes(id) on delete cascade,
  subject subject not null,
  level school_level not null,
  grade int not null,
  status item_status not null default 'draft',
  version int not null default 1,
  reconstruction jsonb,
  key_question text,
  lesson_plan jsonb,
  teacher_guide text,
  item jsonb,
  rubric jsonb,
  exemplars jsonb,
  generation_log jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on item_sets(theme_id);
create index on item_sets(status, level, subject);

create table item_set_standards (
  item_set_id uuid references item_sets(id) on delete cascade,
  standard_id uuid references standards(id),
  primary key (item_set_id, standard_id)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  item_set_id uuid not null references item_sets(id),
  item_set_version int not null,
  academy_id uuid not null references academies(id),
  student_id uuid not null references students(profile_id),
  assigned_by uuid not null references profiles(id),
  due_at timestamptz,
  allow_retry boolean not null default true,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on assignments(student_id);
create index on assignments(academy_id);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  attempt int not null default 1,
  body text not null default '',
  entered_by uuid not null references profiles(id),
  saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (assignment_id, attempt)
);

create table gradings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  academy_id uuid not null references academies(id),
  status grading_status not null default 'pending',
  overall text,
  criteria jsonb,
  strengths jsonb,
  improvements jsonb,
  model text,
  input_tokens int,
  output_tokens int,
  error text,
  teacher_comment text,
  regrade_requested boolean not null default false,
  created_at timestamptz not null default now(),
  graded_at timestamptz
);
create index on gradings(academy_id, created_at);

create table franchise_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  region text not null,
  message text,
  status inquiry_status not null default 'new',
  created_at timestamptz not null default now()
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all','teacher')),
  published_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  description text,
  audience text not null default 'teacher',
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create table site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table student_count_snapshots (
  academy_id uuid references academies(id),
  month date not null,
  enrolled_count int not null,
  primary key (academy_id, month)
);
```

- [ ] **Step 3: RLS 마이그레이션**

`supabase/migrations/20260918000002_rls.sql`:
```sql
create or replace function public.current_user_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function public.current_academy_id() returns uuid
language sql stable security definer set search_path = public as
$$ select academy_id from profiles where id = auth.uid() $$;

alter table academies enable row level security;
alter table profiles enable row level security;
alter table students enable row level security;
alter table standards enable row level security;
alter table themes enable row level security;
alter table item_sets enable row level security;
alter table item_set_standards enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table gradings enable row level security;
alter table franchise_inquiries enable row level security;
alter table notices enable row level security;
alter table resources enable row level security;
alter table site_settings enable row level security;
alter table student_count_snapshots enable row level security;

-- 관리자: 전부
create policy admin_all_academies on academies for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_profiles on profiles for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_students on students for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_standards on standards for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_themes on themes for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_item_sets on item_sets for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_iss on item_set_standards for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_assignments on assignments for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_submissions on submissions for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_gradings on gradings for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_inquiries on franchise_inquiries for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_notices on notices for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_resources on resources for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_settings on site_settings for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_snapshots on student_count_snapshots for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- 본인 프로필 읽기
create policy self_read_profile on profiles for select using (id = auth.uid());

-- 원장: 자기 원
create policy teacher_read_academy on academies for select using (current_user_role() = 'teacher' and id = current_academy_id());
create policy teacher_read_profiles on profiles for select using (current_user_role() = 'teacher' and academy_id = current_academy_id());
create policy teacher_rw_students on students for all
  using (current_user_role() = 'teacher' and academy_id = current_academy_id())
  with check (current_user_role() = 'teacher' and academy_id = current_academy_id());
create policy teacher_rw_assignments on assignments for all
  using (current_user_role() = 'teacher' and academy_id = current_academy_id())
  with check (current_user_role() = 'teacher' and academy_id = current_academy_id());
create policy teacher_rw_submissions on submissions for all
  using (current_user_role() = 'teacher' and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id()))
  with check (current_user_role() = 'teacher' and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id()));
create policy teacher_read_gradings on gradings for select using (current_user_role() = 'teacher' and academy_id = current_academy_id());
create policy teacher_update_gradings on gradings for update
  using (current_user_role() = 'teacher' and academy_id = current_academy_id())
  with check (current_user_role() = 'teacher' and academy_id = current_academy_id());

-- 학생: 자기 것
create policy student_read_self_student on students for select using (profile_id = auth.uid());
create policy student_read_assignments on assignments for select using (student_id = auth.uid());
create policy student_rw_submissions on submissions for all
  using (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()))
  with check (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()));
create policy student_read_gradings on gradings for select
  using (exists (select 1 from submissions s join assignments a on a.id = s.assignment_id where s.id = submission_id and a.student_id = auth.uid()));

-- 게시된 문항·대주제·성취기준: 로그인한 누구나 읽기
create policy auth_read_published_themes on themes for select using (auth.uid() is not null and status = 'published');
create policy auth_read_published_item_sets on item_sets for select using (auth.uid() is not null and status = 'published');
create policy auth_read_iss on item_set_standards for select using (auth.uid() is not null);
create policy auth_read_standards on standards for select using (auth.uid() is not null);

-- 공지·자료·문구
create policy auth_read_notices on notices for select using (auth.uid() is not null and (audience = 'all' or current_user_role() = 'teacher'));
create policy teacher_read_resources on resources for select using (current_user_role() = 'teacher');
create policy anyone_read_settings on site_settings for select using (true);

-- 가맹문의: 누구나 삽입(익명 포함)
create policy anon_insert_inquiry on franchise_inquiries for insert with check (true);
```

- [ ] **Step 4: 프로필 트리거**

`supabase/migrations/20260918000003_profile_trigger.sql`:
```sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, academy_id, name, login_id)
  values (
    new.id,
    (new.raw_user_meta_data->>'role')::user_role,
    nullif(new.raw_user_meta_data->>'academy_id','')::uuid,
    coalesce(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'login_id','')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
```

- [ ] **Step 5: 적용 + 검증 + 커밋**

```bash
supabase db push
```
Expected: 3개 마이그레이션 적용 성공. Supabase 대시보드 Table Editor에서 15개 테이블 확인.
```bash
git add supabase && git commit -m "feat: 전체 DB 스키마, RLS 정책, 프로필 자동 생성 트리거

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Supabase 클라이언트 + proxy 세션·역할 보호 + 로그인/로그아웃

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/proxy.ts`, `lib/auth/roles.ts`, `lib/auth/login-id.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`, `app/auth/signout/route.ts`
- Test: `tests/roles.test.ts`, `tests/login-id.test.ts`

**Interfaces:**
- Produces: `createClient()` (server, async), `createBrowserClient()`, `createAdminClient()` (service role, 서버 전용). `homePathFor(role)`, `requiredRoleFor(pathname): Role | null`. `toLoginEmail(loginId)`, `isEmail(s)`. 로그인 폼 필드 `login_id`, `password`.

- [ ] **Step 1: 순수 로직 테스트 먼저**

`tests/roles.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { homePathFor, requiredRoleFor } from '@/lib/auth/roles'

describe('roles', () => {
  it('maps role to home path', () => {
    expect(homePathFor('admin')).toBe('/admin')
    expect(homePathFor('teacher')).toBe('/teacher')
    expect(homePathFor('student')).toBe('/student')
  })
  it('detects required role by pathname', () => {
    expect(requiredRoleFor('/admin')).toBe('admin')
    expect(requiredRoleFor('/admin/academies')).toBe('admin')
    expect(requiredRoleFor('/teacher/students')).toBe('teacher')
    expect(requiredRoleFor('/student')).toBe('student')
    expect(requiredRoleFor('/')).toBeNull()
    expect(requiredRoleFor('/programs/essay')).toBeNull()
    expect(requiredRoleFor('/administrator')).toBeNull()
  })
})
```

`tests/login-id.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toLoginEmail, isEmail } from '@/lib/auth/login-id'

describe('login id', () => {
  it('passes emails through', () => {
    expect(toLoginEmail('ceo@davinci-lab.kr')).toBe('ceo@davinci-lab.kr')
  })
  it('converts student/teacher ids to internal email', () => {
    expect(toLoginEmail('seoul01-023')).toBe('seoul01-023@id.davinci-lab.kr')
    expect(toLoginEmail('  Seoul01-023 ')).toBe('seoul01-023@id.davinci-lab.kr')
  })
  it('isEmail', () => {
    expect(isEmail('a@b.c')).toBe(true)
    expect(isEmail('seoul01-023')).toBe(false)
  })
})
```
Run: `npm test` → Expected: FAIL (모듈 없음).

- [ ] **Step 2: 순수 로직 구현**

`lib/auth/roles.ts`:
```ts
export type Role = 'admin' | 'teacher' | 'student'

export function homePathFor(role: Role): string {
  return `/${role}`
}

export function requiredRoleFor(pathname: string): Role | null {
  const m = pathname.match(/^\/(admin|teacher|student)(\/|$)/)
  return m ? (m[1] as Role) : null
}
```

`lib/auth/login-id.ts`:
```ts
export const ID_EMAIL_DOMAIN = 'id.davinci-lab.kr'

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function toLoginEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase()
  return isEmail(id) ? id : `${id}@${ID_EMAIL_DOMAIN}`
}
```
Run: `npm test` → Expected: PASS.

- [ ] **Step 3: Supabase 클라이언트 3종**

```bash
npm i @supabase/ssr @supabase/supabase-js
```

`lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* Server Component에서 호출 시 무시 (proxy가 갱신) */ }
        },
      },
    },
  )
}
```

`lib/supabase/client.ts`:
```ts
'use client'
import { createBrowserClient as create } from '@supabase/ssr'
export function createBrowserClient() {
  return create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
}
```

`lib/supabase/admin.ts` (서버 전용, RLS 우회 — 계정 발급에만 사용):
```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```
`npm i server-only`.

- [ ] **Step 4: proxy — 세션 갱신 + 역할 보호**

`lib/supabase/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { homePathFor, requiredRoleFor, type Role } from '@/lib/auth/roles'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const need = requiredRoleFor(pathname)

  if (need) {
    if (!user) {
      const url = request.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
    const role = user.user_metadata?.role as Role | undefined
    if (role !== need) {
      const url = request.nextUrl.clone(); url.pathname = role ? homePathFor(role) : '/login'; url.search = ''
      return NextResponse.redirect(url)
    }
  }
  if (pathname === '/login' && user) {
    const role = user.user_metadata?.role as Role | undefined
    if (role) { const url = request.nextUrl.clone(); url.pathname = homePathFor(role); url.search = ''; return NextResponse.redirect(url) }
  }
  return response
}
```
(역할은 `user_metadata.role`로 1차 판정 — 계정 발급 시 항상 넣는다. 데이터 접근은 어차피 RLS가 막는다.)

`proxy.ts` (repo 루트):
```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 5: 로그인 페이지·액션·로그아웃**

`app/login/actions.ts`:
```ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toLoginEmail } from '@/lib/auth/login-id'
import { homePathFor, type Role } from '@/lib/auth/roles'

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get('login_id') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!loginId || !password) return { error: '아이디와 비밀번호를 입력하세요.' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(loginId), password })
  if (error || !data.user) return { error: '아이디 또는 비밀번호가 맞지 않습니다.' }

  const role = data.user.user_metadata?.role as Role | undefined
  redirect(role ? homePathFor(role) : '/')
}
```

`app/login/page.tsx`:
```tsx
'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { login } from './actions'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)
  return (
    <div className="flex min-h-screen items-center justify-center bg-mint-50 px-4">
      <form action={action} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[0_2px_30px_rgba(31,36,48,0.08)]">
        <Link href="/" className="text-xl font-extrabold text-mint-700">다빈치스쿨</Link>
        <h1 className="mt-6 text-2xl font-bold">로그인</h1>
        <p className="mt-1 text-sm text-ink-500">원장님·학생·관리자 모두 여기서 로그인합니다.</p>
        <label className="mt-6 block text-sm font-semibold">아이디 또는 이메일
          <input name="login_id" autoComplete="username" className="mt-1 w-full rounded-xl border border-ink-300 px-4 py-3 font-normal" />
        </label>
        <label className="mt-4 block text-sm font-semibold">비밀번호
          <input name="password" type="password" autoComplete="current-password" className="mt-1 w-full rounded-xl border border-ink-300 px-4 py-3 font-normal" />
        </label>
        {state?.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
        <Button type="submit" disabled={pending} className="mt-6 w-full">{pending ? '확인 중…' : '로그인'}</Button>
      </form>
    </div>
  )
}
```

`app/auth/signout/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
```

- [ ] **Step 6: 첫 관리자 계정 생성 (1회 스크립트)**

`scripts/create-admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
const [email, password, name] = process.argv.slice(2)
if (!email || !password) { console.error('usage: npx tsx scripts/create-admin.ts <email> <password> [name]'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data, error } = await sb.auth.admin.createUser({
  email, password, email_confirm: true,
  user_metadata: { role: 'admin', name: name ?? '관리자', academy_id: '', login_id: '' },
})
if (error) { console.error(error.message); process.exit(1) }
console.log('created admin', data.user.id)
```
`npm i -D tsx dotenv-cli`. 실행: `npx dotenv -e .env.local -- npx tsx scripts/create-admin.ts <이메일> <비밀번호> 대표`. 비밀번호는 대표님이 직접 터미널에 입력한다(채팅에 쓰지 않음).

- [ ] **Step 7: 확인 + 커밋**

`npm test` PASS, `npm run build` 성공. `npm run dev` 후: `/admin` 접근 → `/login`으로 이동; 관리자 로그인 → `/admin`(404여도 됨, Task 6에서 만듦); `/teacher` 접근 → `/admin`으로 돌아감.
```bash
git add -A && git commit -m "feat: Supabase 클라이언트, proxy 세션·역할 보호, 로그인/로그아웃

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 역할별 셸과 대시보드 뼈대

**Files:**
- Create: `components/app/AppShell.tsx`, `lib/auth/session.ts`, `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/teacher/layout.tsx`, `app/teacher/page.tsx`, `app/student/layout.tsx`, `app/student/page.tsx`

**Interfaces:**
- Produces: `getSessionProfile()` → `{ userId, role, name, academyId }` (없으면 `/login`으로 redirect). `AppShell` props `{ role, name, nav: {href,label}[], children }`.

- [ ] **Step 1: 세션 프로필 헬퍼**

`lib/auth/session.ts`:
```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/auth/roles'

export type SessionProfile = { userId: string; role: Role; name: string; academyId: string | null }

export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('profiles').select('role, name, academy_id').eq('id', user.id).single()
  if (!p) redirect('/login')
  return { userId: user.id, role: p.role as Role, name: p.name, academyId: p.academy_id }
}
```

- [ ] **Step 2: AppShell**

`components/app/AppShell.tsx`:
```tsx
import Link from 'next/link'
import type { Role } from '@/lib/auth/roles'

const roleLabel: Record<Role, string> = { admin: '본사 관리자', teacher: '원장님', student: '학생' }
const roleTone: Record<Role, string> = { admin: 'bg-lavender-100 text-lavender-700', teacher: 'bg-mint-100 text-mint-700', student: 'bg-lemon-100 text-lemon-600' }

export function AppShell({ role, name, nav, children }: { role: Role; name: string; nav: { href: string; label: string }[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink-100/40">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-100 bg-white p-5 md:flex">
        <Link href="/" className="text-lg font-extrabold text-mint-700">다빈치스쿨</Link>
        <span className={`mt-2 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleTone[role]}`}>{roleLabel[role]}</span>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map(n => <Link key={n.href} href={n.href} className="rounded-xl px-3 py-2 text-sm font-medium text-ink-700 hover:bg-mint-50">{n.label}</Link>)}
        </nav>
        <form action="/auth/signout" method="post" className="mt-auto">
          <p className="mb-2 text-sm text-ink-500">{name}</p>
          <button className="text-sm text-ink-500 hover:text-ink-900">로그아웃</button>
        </form>
      </aside>
      <main className={`flex-1 p-6 md:p-10 ${role === 'student' ? 'text-lg' : ''}`}>{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: 세 레이아웃과 대시보드**

`app/admin/layout.tsx`:
```tsx
import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
const nav = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/academies', label: '가맹원 관리' },
  { href: '/admin/items', label: '문항 제작소' },
  { href: '/admin/inquiries', label: '가맹문의' },
]
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  return <AppShell role="admin" name={s.name} nav={nav}>{children}</AppShell>
}
```
`app/admin/page.tsx`:
```tsx
export default function AdminHome() {
  return (<><h1 className="text-2xl font-bold">본사 대시보드</h1><p className="mt-2 text-ink-500">가맹원·학생·채점 현황이 여기에 표시됩니다.</p></>)
}
```
`app/teacher/layout.tsx`: nav = `[{ href: '/teacher', label: '홈' }, { href: '/teacher/students', label: '학생 관리' }, { href: '/teacher/items', label: '문항 찾기' }, { href: '/teacher/results', label: '결과 보기' }]`, `role="teacher"`.
`app/teacher/page.tsx`: `<h1>원장님 홈</h1>` + 안내문.
`app/student/layout.tsx`: nav = `[{ href: '/student', label: '내 과제' }]`, `role="student"`.
`app/student/page.tsx`: `<h1>내 과제</h1>` + "아직 배정된 과제가 없어요."

- [ ] **Step 4: 확인 + 커밋**

관리자 로그인 → 사이드 메뉴와 대시보드 보임, 로그아웃 동작. `npm run build` 성공.
```bash
git add -A && git commit -m "feat: 역할별 앱 셸과 대시보드 뼈대

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 가맹문의 접수 (server action + 이메일 알림 + 관리자 접수함)

**Files:**
- Create: `app/(public)/franchise/actions.ts`, `lib/inquiries/validate.ts`, `lib/email/notify.ts`, `app/admin/inquiries/page.tsx`, `app/admin/inquiries/actions.ts`
- Modify: `app/(public)/franchise/page.tsx` (form에 action 연결, 결과 표시)
- Test: `tests/inquiry-validate.test.ts`

**Interfaces:**
- Consumes: Task 3의 폼 필드명 `name, phone, region, message`.
- Produces: `parseInquiry(formData): { ok: true, data } | { ok: false, error }`. `submitInquiry` server action. `setInquiryStatus(id, status)` server action.

- [ ] **Step 1: 검증 테스트**

`tests/inquiry-validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseInquiry } from '@/lib/inquiries/validate'

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseInquiry', () => {
  it('accepts a valid inquiry and normalizes phone', () => {
    const r = parseInquiry(fd({ name: '김원장', phone: '010 1234 5678', region: '경기 성남', message: '문의합니다' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.phone).toBe('010-1234-5678')
  })
  it('rejects missing name', () => {
    const r = parseInquiry(fd({ name: '', phone: '01012345678', region: '서울' }))
    expect(r.ok).toBe(false)
  })
  it('rejects bad phone', () => {
    const r = parseInquiry(fd({ name: '김', phone: '12', region: '서울' }))
    expect(r.ok).toBe(false)
  })
})
```
Run: `npm test` → FAIL.

- [ ] **Step 2: 검증 구현**

`npm i zod`

`lib/inquiries/validate.ts`:
```ts
import { z } from 'zod'

const schema = z.object({
  name: z.string().trim().min(1, '이름을 입력하세요.').max(50),
  phone: z.string().trim().transform(s => s.replace(/\D/g, '')).refine(d => d.length >= 10 && d.length <= 11, '연락처를 확인하세요.')
    .transform(d => d.length === 11 ? `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}` : `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`),
  region: z.string().trim().min(1, '지역을 입력하세요.').max(50),
  message: z.string().trim().max(2000).optional().default(''),
})
export type Inquiry = z.infer<typeof schema>

export function parseInquiry(formData: FormData): { ok: true; data: Inquiry } | { ok: false; error: string } {
  const r = schema.safeParse({
    name: formData.get('name') ?? '', phone: formData.get('phone') ?? '',
    region: formData.get('region') ?? '', message: formData.get('message') ?? '',
  })
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? '입력을 확인하세요.' }
  return { ok: true, data: r.data }
}
```
Run: `npm test` → PASS.

- [ ] **Step 3: 이메일 알림 (키 없으면 조용히 건너뜀)**

`npm i resend`

`lib/email/notify.ts`:
```ts
import 'server-only'
import { Resend } from 'resend'
import type { Inquiry } from '@/lib/inquiries/validate'

export async function notifyInquiry(i: Inquiry) {
  const key = process.env.RESEND_API_KEY
  const to = process.env.INQUIRY_NOTIFY_EMAIL
  if (!key || !to) return
  const resend = new Resend(key)
  await resend.emails.send({
    from: '다빈치스쿨 <noreply@davinci-lab.kr>',
    to, subject: `[가맹문의] ${i.region} ${i.name}`,
    text: `이름: ${i.name}\n연락처: ${i.phone}\n지역: ${i.region}\n\n${i.message}`,
  }).catch(() => {})
}
```
(Resend에서 davinci-lab.kr 도메인 인증 전에는 `onboarding@resend.dev`로 보내야 하므로, 인증 전에는 from을 그 주소로 둔다.)

- [ ] **Step 4: server action + 폼 연결**

`app/(public)/franchise/actions.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { parseInquiry } from '@/lib/inquiries/validate'
import { notifyInquiry } from '@/lib/email/notify'

export async function submitInquiry(_prev: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  const r = parseInquiry(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { error } = await supabase.from('franchise_inquiries').insert(r.data)
  if (error) return { error: '접수 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.' }
  await notifyInquiry(r.data)
  return { ok: true }
}
```

`app/(public)/franchise/page.tsx`의 form을 클라이언트 컴포넌트 `components/site/InquiryForm.tsx`로 분리:
```tsx
'use client'
import { useActionState } from 'react'
import { submitInquiry } from '@/app/(public)/franchise/actions'
import { Button } from '@/components/ui/Button'

const input = 'rounded-xl border border-ink-300 px-4 py-3 font-normal'
export function InquiryForm() {
  const [state, action, pending] = useActionState(submitInquiry, undefined)
  if (state?.ok) return <div className="rounded-2xl bg-mint-50 p-8 text-center"><p className="text-xl font-bold">문의가 접수되었습니다</p><p className="mt-2 text-ink-700">본사에서 1~2일 안에 연락드리겠습니다.</p></div>
  return (
    <form action={action} className="grid max-w-xl gap-4">
      <label className="grid gap-1 text-sm font-semibold">이름<input name="name" required className={input} /></label>
      <label className="grid gap-1 text-sm font-semibold">연락처<input name="phone" required className={input} placeholder="010-0000-0000" /></label>
      <label className="grid gap-1 text-sm font-semibold">지역<input name="region" required className={input} placeholder="예: 경기 성남" /></label>
      <label className="grid gap-1 text-sm font-semibold">문의 내용<textarea name="message" rows={5} className={input} /></label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" variant="accent" disabled={pending}>{pending ? '보내는 중…' : '문의 보내기'}</Button>
    </form>
  )
}
```
페이지에서는 `<InquiryForm />`로 교체.

- [ ] **Step 5: 관리자 접수함**

`app/admin/inquiries/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
export async function setInquiryStatus(id: string, status: 'new' | 'contacted' | 'done') {
  const supabase = await createClient()
  await supabase.from('franchise_inquiries').update({ status }).eq('id', id)
  revalidatePath('/admin/inquiries')
}
```

`app/admin/inquiries/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { setInquiryStatus } from './actions'

const label = { new: '신규', contacted: '연락함', done: '완료' } as const
const tone = { new: 'lemon', contacted: 'mint', done: 'gray' } as const

export default async function InquiriesPage() {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('franchise_inquiries').select('*').order('created_at', { ascending: false })
  return (
    <>
      <h1 className="text-2xl font-bold">가맹문의 접수함</h1>
      <div className="mt-6 overflow-hidden rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-100/60 text-left"><tr><th className="p-3">접수</th><th className="p-3">이름</th><th className="p-3">연락처</th><th className="p-3">지역</th><th className="p-3">내용</th><th className="p-3">상태</th></tr></thead>
          <tbody>
            {(rows ?? []).map(r => (
              <tr key={r.id} className="border-t border-ink-100 align-top">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="p-3">{r.name}</td><td className="p-3">{r.phone}</td><td className="p-3">{r.region}</td>
                <td className="p-3 max-w-md whitespace-pre-wrap">{r.message}</td>
                <td className="p-3">
                  <Badge tone={tone[r.status as keyof typeof tone]}>{label[r.status as keyof typeof label]}</Badge>
                  <div className="mt-2 flex gap-1">
                    {(['new','contacted','done'] as const).filter(s => s !== r.status).map(s => (
                      <form key={s} action={setInquiryStatus.bind(null, r.id, s)}><button className="text-xs text-ink-500 underline">{label[s]}</button></form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <p className="p-8 text-center text-ink-500">아직 접수된 문의가 없습니다.</p>}
      </div>
    </>
  )
}
```

- [ ] **Step 6: 확인 + 커밋**

`/franchise`에서 문의 제출 → "접수되었습니다" → 관리자 `/admin/inquiries`에 행이 보이고 상태 변경됨. `npm test`, `npm run build` 성공.
```bash
git add -A && git commit -m "feat: 가맹문의 접수, 이메일 알림, 관리자 접수함

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 성취기준 추출 (PDF → JSON) + DB 투입

**Files:**
- Create: `scripts/extract-standards.py`, `scripts/import-standards.ts`, `lib/standards/parse.ts`, `data/standards/README.md`, `data/standards/중_국어.json` (등 5개)
- Test: `tests/extract_standards_test.py` (pytest), `tests/standards-parse.test.ts`

**Interfaces:**
- Produces: JSON 형식 `Array<{ level: '초'|'중'|'고', subject, grade_band: string, domain: string, code: string, text: string }>`. `standardsSchema` (zod). DB `standards` 테이블에 upsert (code 기준).
- 원본: `C:\Users\beaut\OneDrive\바탕 화면\서논술형\[별책5] 국어과 교육과정.pdf`, `[별책7] 사회과`, `[별책9] 과학과`, `[별책14] 영어과`. **수학과 별책(별책8)은 폴더에 없음** → 대표님께 파일 요청. 없으면 이번 주는 국·영·과·사 4과목.

- [ ] **Step 1: 파서 단위 테스트 (Python)**

```bash
pip install pdfplumber pytest
```

`tests/extract_standards_test.py`:
```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from extract_standards import parse_standards, level_from_code

SAMPLE = """
(2) 내용 요소
[9국03-01] 다양한 주제에 대해 자신의 생각을 논리적으로 표현하는 글을 쓴다.
[9국03-02] 대상의 특성에 맞게 설명하는 방법을
활용하여 글을 쓴다.
(나) 성취기준 해설
"""

def test_parses_codes_and_joins_wrapped_lines():
    rows = parse_standards(SAMPLE, subject="국어", domain="쓰기")
    assert [r["code"] for r in rows] == ["[9국03-01]", "[9국03-02]"]
    assert rows[1]["text"] == "대상의 특성에 맞게 설명하는 방법을 활용하여 글을 쓴다."

def test_level_from_code():
    assert level_from_code("[9국03-01]") == "중"
    assert level_from_code("[6과01-02]") == "초"
    assert level_from_code("[10공국1-01-01]") == "고"
    assert level_from_code("[4국01-01]") == "초"
```
Run: `python -m pytest tests/extract_standards_test.py -q` → FAIL (모듈 없음).

- [ ] **Step 2: 추출 스크립트**

`scripts/extract_standards.py`:
```python
"""2022 개정 교육과정 별책 PDF에서 성취기준을 추출해 JSON으로 저장한다.
사용: python scripts/extract_standards.py "<pdf 경로>" <과목> <출력 json>
"""
import json, re, sys
from pathlib import Path

CODE = re.compile(r"^\[(\d{1,2})[가-힣]+[\d\-]*\d\]")
STOP = re.compile(r"^\((가|나|다|라)\)|^성취기준 해설|^성취기준 적용")

def level_from_code(code: str) -> str:
    n = int(re.match(r"\[(\d{1,2})", code).group(1))
    return "초" if n <= 6 else ("중" if n == 9 else "고")

def grade_band_from_code(code: str) -> str:
    n = int(re.match(r"\[(\d{1,2})", code).group(1))
    return {2: "1-2", 4: "3-4", 6: "5-6", 9: "1-3", 10: "1", 12: "2-3"}.get(n, str(n))

def parse_standards(text: str, subject: str, domain: str = "") -> list[dict]:
    rows, cur = [], None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = CODE.match(line)
        if m:
            if cur: rows.append(cur)
            code_end = line.index("]") + 1
            code = line[:code_end]
            cur = {"level": level_from_code(code), "subject": subject, "grade_band": grade_band_from_code(code),
                   "domain": domain, "code": code, "text": line[code_end:].strip()}
        elif cur:
            if STOP.match(line):
                rows.append(cur); cur = None
            else:
                cur["text"] = (cur["text"] + " " + line).strip()
    if cur: rows.append(cur)
    return rows

def extract_pdf(pdf_path: str, subject: str) -> list[dict]:
    import pdfplumber
    out, seen = [], set()
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            for r in parse_standards(t, subject):
                if r["code"] not in seen:
                    seen.add(r["code"]); out.append(r)
    return out

if __name__ == "__main__":
    pdf, subject, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = extract_pdf(pdf, subject)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{subject}: {len(rows)}개 성취기준 → {out}")
```
(파일명은 테스트 import에 맞춰 `extract_standards.py` — 밑줄.) Run: `python -m pytest tests/extract_standards_test.py -q` → PASS.

- [ ] **Step 3: 4개 PDF 추출 실행 + 눈으로 검수**

```bash
S="C:/Users/beaut/OneDrive/바탕 화면/서논술형"
python scripts/extract_standards.py "$S/[별책5] 국어과 교육과정.pdf" 국어 data/standards/국어.json
python scripts/extract_standards.py "$S/[별책7] 사회과 교육과정.pdf" 사회 data/standards/사회.json
python scripts/extract_standards.py "$S/[별책9] 과학과 교육과정.pdf" 과학 data/standards/과학.json
python scripts/extract_standards.py "$S/[별책14] 영어과 교육과정.pdf" 영어 data/standards/영어.json
```
각 JSON을 열어 중학교(코드 `[9…]`) 항목 10개를 원문 PDF와 대조. 줄바꿈 합침이 틀린 곳(예: 표 안 텍스트 섞임)이 있으면 `STOP` 패턴을 보강한다. `domain`은 이번 주는 비워 두고, 2주차에 영역 제목 인식을 추가한다. `data/standards/README.md`에 추출 날짜·원본 파일·알려진 문제를 적는다.

- [ ] **Step 4: JSON 검증(zod) 테스트 + import 스크립트**

`tests/standards-parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { standardsSchema } from '@/lib/standards/parse'

describe('standardsSchema', () => {
  it('accepts valid rows', () => {
    expect(standardsSchema.parse([{ level: '중', subject: '국어', grade_band: '1-3', domain: '', code: '[9국03-01]', text: '…' }])).toHaveLength(1)
  })
  it('rejects unknown subject', () => {
    expect(() => standardsSchema.parse([{ level: '중', subject: '미술', grade_band: '1-3', domain: '', code: '[9미01-01]', text: 'x' }])).toThrow()
  })
})
```

`lib/standards/parse.ts`:
```ts
import { z } from 'zod'
export const standardSchema = z.object({
  level: z.enum(['초', '중', '고']),
  subject: z.enum(['국어', '영어', '수학', '과학', '사회', '한국사']),
  grade_band: z.string(),
  domain: z.string(),
  code: z.string().regex(/^\[.+\]$/),
  text: z.string().min(5),
})
export const standardsSchema = z.array(standardSchema)
export type Standard = z.infer<typeof standardSchema>
```

`scripts/import-standards.ts`:
```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { standardsSchema } from '../lib/standards/parse'

const dir = 'data/standards'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const rows = standardsSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8')))
  const { error } = await sb.from('standards').upsert(rows, { onConflict: 'code' })
  if (error) { console.error(f, error.message); process.exit(1) }
  console.log(`${f}: ${rows.length} rows upserted`)
}
```
Run: `npm test` PASS → `npx dotenv -e .env.local -- npx tsx scripts/import-standards.ts` → 각 파일 행 수 출력. Supabase Table Editor에서 `standards` 행 수 확인.

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat: 성취기준 PDF 추출 스크립트와 DB 투입 (국·영·과·사)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 관리자 — 가맹원 등록 + 원장 계정 발급

**Files:**
- Create: `app/admin/academies/page.tsx`, `app/admin/academies/actions.ts`, `app/admin/academies/new/page.tsx`, `app/admin/academies/[id]/page.tsx`, `lib/academies/validate.ts`, `lib/auth/passwords.ts`
- Test: `tests/academy-validate.test.ts`, `tests/passwords.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (Task 5), 프로필 트리거 (Task 4).
- Produces: `createAcademy(formData)`, `createTeacherAccount(academyId, formData)` server actions. `generatePassword()` → 10자 (혼동 글자 제외). 원장 로그인 아이디 = 이메일.

- [ ] **Step 1: 테스트**

`tests/passwords.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generatePassword } from '@/lib/auth/passwords'
describe('generatePassword', () => {
  it('is 10 chars without confusable characters', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword()
      expect(p).toHaveLength(10)
      expect(p).not.toMatch(/[0O1lI]/)
    }
  })
})
```

`tests/academy-validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseAcademy } from '@/lib/academies/validate'
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }
describe('parseAcademy', () => {
  it('accepts valid academy and lowercases code', () => {
    const r = parseAcademy(fd({ code: 'Seoul01', name: '다빈치 서울점', region: '서울', director_phone: '01012345678' }))
    expect(r.ok && r.data.code).toBe('seoul01')
  })
  it('rejects code with hyphen', () => {
    expect(parseAcademy(fd({ code: 'seoul-01', name: 'x', region: '', director_phone: '' })).ok).toBe(false)
  })
})
```
Run → FAIL.

- [ ] **Step 2: 구현**

`lib/auth/passwords.ts`:
```ts
import { randomInt } from 'node:crypto'
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generatePassword(length = 10): string {
  let s = ''
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return s
}
```

`lib/academies/validate.ts`:
```ts
import { z } from 'zod'
const schema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9]{3,12}$/, '원 코드는 영문 소문자·숫자 3~12자입니다.'),
  name: z.string().trim().min(1, '원 이름을 입력하세요.'),
  region: z.string().trim().optional().default(''),
  director_phone: z.string().trim().optional().default(''),
})
export type AcademyInput = z.infer<typeof schema>
export function parseAcademy(formData: FormData): { ok: true; data: AcademyInput } | { ok: false; error: string } {
  const r = schema.safeParse(Object.fromEntries(['code', 'name', 'region', 'director_phone'].map(k => [k, formData.get(k) ?? ''])))
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0]?.message ?? '입력을 확인하세요.' }
}
```
Run → PASS.

- [ ] **Step 3: server actions**

`app/admin/academies/actions.ts`:
```ts
'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { parseAcademy } from '@/lib/academies/validate'
import { generatePassword } from '@/lib/auth/passwords'

async function assertAdmin() { const s = await getSessionProfile(); if (s.role !== 'admin') throw new Error('forbidden') }

export async function createAcademy(_prev: { error?: string } | undefined, formData: FormData) {
  await assertAdmin()
  const r = parseAcademy(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('academies').insert(r.data).select('id').single()
  if (error) return { error: error.code === '23505' ? '이미 있는 원 코드입니다.' : error.message }
  redirect(`/admin/academies/${data.id}`)
}

export async function createTeacherAccount(academyId: string, _prev: { error?: string; issued?: { email: string; password: string } } | undefined, formData: FormData) {
  await assertAdmin()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  if (!email || !name) return { error: '이메일과 이름을 입력하세요.' }
  const password = generatePassword()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: 'teacher', academy_id: academyId, name, login_id: email },
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/academies/${academyId}`)
  return { issued: { email, password } }
}
```

- [ ] **Step 4: 화면**

`app/admin/academies/page.tsx`: `academies` 목록 표(코드·이름·지역·원장 수·학생 수) + [새 가맹원] 버튼(`/admin/academies/new`). 원장 수는 `profiles`에서 `role='teacher'` count, 학생 수는 `students` count — `select('*, profiles(count), students(count)')` 로 가져온다.

`app/admin/academies/new/page.tsx`: 클라이언트 폼 (`useActionState(createAcademy)`), 필드 `code, name, region, director_phone`.

`app/admin/academies/[id]/page.tsx` (Next 16: `params`는 Promise):
```tsx
import { createClient } from '@/lib/supabase/server'
import { TeacherAccountForm } from './TeacherAccountForm'

export default async function AcademyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase.from('academies').select('*').eq('id', id).single()
  const { data: teachers } = await supabase.from('profiles').select('id, name, login_id').eq('academy_id', id).eq('role', 'teacher')
  if (!a) return <p>없는 가맹원입니다.</p>
  return (
    <>
      <h1 className="text-2xl font-bold">{a.name} <span className="text-base font-normal text-ink-500">({a.code})</span></h1>
      <p className="mt-1 text-ink-500">{a.region} · 학생 정원 {a.student_capacity} · 월 채점 상한 {a.monthly_grading_limit}건</p>
      <h2 className="mt-8 text-lg font-bold">원장 계정</h2>
      <ul className="mt-2 space-y-1">{(teachers ?? []).map(t => <li key={t.id}>{t.name} · {t.login_id}</li>)}</ul>
      <TeacherAccountForm academyId={id} />
    </>
  )
}
```

`app/admin/academies/[id]/TeacherAccountForm.tsx`:
```tsx
'use client'
import { useActionState } from 'react'
import { createTeacherAccount } from '../actions'
import { Button } from '@/components/ui/Button'

export function TeacherAccountForm({ academyId }: { academyId: string }) {
  const [state, action, pending] = useActionState(createTeacherAccount.bind(null, academyId), undefined)
  return (
    <div className="mt-4 rounded-2xl bg-white p-6">
      <h3 className="font-bold">원장 계정 발급</h3>
      {state?.issued ? (
        <div className="mt-3 rounded-xl bg-lemon-50 p-4">
          <p className="font-semibold">아래 정보를 원장님께 전달하세요. 이 화면을 벗어나면 비밀번호를 다시 볼 수 없습니다.</p>
          <p className="mt-2 font-mono">아이디: {state.issued.email}</p>
          <p className="font-mono">초기 비밀번호: {state.issued.password}</p>
        </div>
      ) : (
        <form action={action} className="mt-3 grid max-w-md gap-3">
          <input name="name" placeholder="원장님 이름" required className="rounded-xl border border-ink-300 px-4 py-2" />
          <input name="email" type="email" placeholder="원장님 이메일 (로그인 아이디)" required className="rounded-xl border border-ink-300 px-4 py-2" />
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" disabled={pending}>{pending ? '발급 중…' : '계정 발급'}</Button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 확인 + 커밋**

관리자로 가맹원 `test01` 등록 → 원장 계정 발급 → 표시된 이메일/비밀번호로 시크릿 창 로그인 → `/teacher` 도착, `/admin` 접근 시 `/teacher`로 튕김. `npm test`, `npm run build` 성공.
```bash
git add -A && git commit -m "feat: 관리자 가맹원 등록과 원장 계정 발급

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: GitHub + Vercel 스테이징 배포

**Files:**
- Create: `README.md` (실행·배포 절차), `vercel.json` (불필요하면 생략)

**선행 조건:** 대표님 GitHub·Vercel 계정.

- [ ] **Step 1: GitHub 비공개 저장소에 push**

대표님이 GitHub에서 `davinci-school` 비공개 저장소 생성 → 주소를 알려주면:
```bash
git remote add origin https://github.com/<계정>/davinci-school.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: Vercel 연결**

대표님이 Vercel → Add New Project → GitHub 저장소 선택 → Environment Variables에 `.env.example`의 5개 키 입력(값은 대표님이 직접) → Deploy. 배포 주소(`*.vercel.app`)에서 메인·로그인·가맹문의 동작 확인.

- [ ] **Step 3: Supabase 인증 URL 등록**

Supabase 대시보드 → Authentication → URL Configuration → Site URL에 Vercel 주소, Redirect URLs에 `https://<vercel주소>/**` 추가.

- [ ] **Step 4: README + 커밋**

`README.md`에: 로컬 실행(`npm i`, `.env.local` 만들기, `npm run dev`), 테스트(`npm test`), DB 마이그레이션(`supabase db push`), 성취기준 투입, 관리자 생성 스크립트, 배포(push하면 자동) 절차를 적는다.
```bash
git add -A && git commit -m "docs: README 실행·배포 절차

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

## 자체 점검 (Self-Review)

**스펙 대비 (1주차 범위):**
- 3.1 공개 페이지 — Task 2, 3 ✅ (문구는 살아 있는 절, `content/site.ts`로 분리 ✅)
- 3.2 관리자: 가맹원 관리·계정 발급 Task 9 ✅, 가맹문의 접수함 Task 7 ✅, 대시보드 수치·문항 제작소·공지·자료실·문구 편집 → 2~4주차
- 3.3/3.4 원장·학생 화면 → 3주차 (셸만 Task 6)
- 4장 데이터 구조 전체 — Task 4 ✅ (15개 테이블, RLS, 트리거)
- 성취기준 추출 — Task 8 ✅ (수학 별책 PDF 부재 → 대표님께 요청)
- 7장 기술·배포 — Task 1, 5, 10 ✅
- 디자인 시안 2~3개 — 이 계획에 없음. 대표님이 3.1 내용을 주는 시점(9/19)에 HTML 시안을 별도로 만들어 고른 뒤 `globals.css` 토큰만 바꾼다. 의도적 제외.

**플레이스홀더:** Task 3 Step 2의 inquiry 페이지("위와 같되")와 Task 6 Step 3의 teacher/student 레이아웃("nav = …")은 바로 위 코드의 값 치환이므로 허용. 그 외 TBD 없음.

**타입 일관성:** `Role` (`lib/auth/roles.ts`) ↔ `user_role` enum ↔ `user_metadata.role` 문자열 동일. `createClient` (server) vs `createBrowserClient` vs `createAdminClient` 이름 분리. 폼 필드명 `name/phone/region/message` Task 3→7 일치. `login_id/password` Task 5 내부 일치.
