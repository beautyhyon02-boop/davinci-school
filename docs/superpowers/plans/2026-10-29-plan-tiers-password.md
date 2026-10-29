# 가맹 상품 두 단계 + 비밀번호 바꾸기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가맹 상품을 다빈치올(`davinci`)·다빈치 베이직(`davinci_basic`) 둘로 바꾸고, 베이직 원장에게 서논술 화면·동작을 잠그며, 원장·본사가 자기 비밀번호를 바꿀 수 있게 한다.

**Architecture:** 상품 판정은 `lib/academies/plan.ts`(`canUseRed`·`canUseEssay`) 한 곳. 서논술 잠금은 `lib/auth/essay-access.ts`(경로 목록·메뉴 거르기·서버 단언·페이지 도우미)로 모으고, 원장 레이아웃·페이지·서버 동작·API 가 그것을 부른다. 공개 「서논술형」 페이지는 `ProgramPage` 의 `cta` 로 단추를 바꾼다. 비밀번호는 `/account/password`(역할별 AppShell 로 감싼 별도 레이아웃) + 서버 동작(현재 비밀번호 재확인 → `auth.updateUser`).

**Tech Stack:** Next.js 16 App Router(서버/클라이언트 컴포넌트, `useActionState`, `redirect`), Supabase Auth(`signInWithPassword`, `updateUser`), zod 없이 순수 검증, Vitest(`renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-29-plan-tiers-password-design.md` (구속력 있는 설계 — 과제 글과 어긋나면 스펙이 우선)

## Global Constraints

- 화면 문구는 전부 `content/site.ts`(컴포넌트·페이지에 한글 리터럴 없음; 코드 주석의 한글은 됨).
- 마이그레이션은 **파일만**(`supabase/migrations/20261029000022_plan_tiers.sql`), 다시 실행해도 안전. 적용·`supabase db push`·`git push` 는 대표.
- `PLANS = ['davinci', 'davinci_basic']`, `DEFAULT_PLAN = 'davinci_basic'`; `'essay_only'` 는 어디에도 남기지 않는다(DB 의 옛 값은 0022 가 바꾼다).
- 서논술 잠금은 화면·서버 동작·API 에서만(RLS 는 바꾸지 않는다). 학생 화면은 바꾸지 않는다.
- 비밀번호: 학생 제외, 8자 이상, 현재 비밀번호 재확인 뒤 `updateUser`. 비밀번호 값은 로그·오류 문구·보고서 어디에도 적지 않는다.
- 커밋: `git add <정확한 파일들>` 뒤 `git commit`; `git add -A` 금지; 작업 폴더의 `package.json`/`package-lock.json` 미커밋 수정(다른 작업의 `docx` 의존성)은 건드리지도 담지도 않는다. 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Next.js 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 안내를 읽는다.
- `.env.local` 은 읽지도 출력하지도 않는다. DB 에 연결하지 않는다.
- 시험: `npx vitest run <파일>`; 형 검사 `npx tsc --noEmit -p .`; 마지막 과제에서 `npm test` 전체(현재 기준 전부 통과해야 한다 — red-download 2건은 Task 1 이 고친다).

---

### Task 1: 상품 값·판정 + 마이그레이션 0022 + RED 쪽 정리

**Files:**
- Modify: `lib/academies/plan.ts`, `content/site.ts`(`app.adminAcademies.plan.*`, `errors.planMigration`; `pages.redReports.planGate` 삭제), `components/site/RedGate.tsx`, `app/(public)/programs/inquiry/page.tsx`, `app/admin/academies/actions.ts`(`createAcademy` 23514 안내), `app/admin/academies/page.tsx`(요약·칩 둘), `app/admin/academies/[id]/page.tsx`·`[id]/PlanForm.tsx`·`new/AcademyForm.tsx`(선택지는 `PLANS` 를 돌므로 자동 — `'essay_only'` 기본값 글자만 지움)
- Create: `supabase/migrations/20261029000022_plan_tiers.sql`
- Test: `tests/academy-plan.test.ts`(고침), `tests/plan-tiers-migration.test.ts`(새), `tests/red-download.test.ts`(fixture 에 `plan: 'davinci'`), `tests/red-library.test.ts`·`tests/site-content.test.ts`(planGate 참조 제거)

**Interfaces:**
- Produces: `PLANS`, `type Plan = 'davinci' | 'davinci_basic'`, `DEFAULT_PLAN`, `isPlan`, `canUseRed(role, plan)`, **`canUseEssay(role: string | null | undefined, plan: Plan | null | undefined): boolean`**.

- [ ] **Step 1: 시험 먼저** — `tests/academy-plan.test.ts` 를 새 값에 맞게 고친다(아래 전부 실패해야 함):
```ts
it('PLANS 는 다빈치올·다빈치 베이직 둘, 기본은 베이직', () => {
  expect(PLANS).toEqual(['davinci', 'davinci_basic']); expect(DEFAULT_PLAN).toBe('davinci_basic')
  expect(isPlan('essay_only')).toBe(false)
})
it('RED 는 관리자, 또는 두 상품 원장 모두', () => {
  expect(canUseRed('teacher', 'davinci')).toBe(true); expect(canUseRed('teacher', 'davinci_basic')).toBe(true)
  expect(canUseRed('teacher', null)).toBe(false); expect(canUseRed('student', 'davinci')).toBe(false)
})
it('서논술은 관리자, 또는 다빈치올 원장만', () => {
  expect(canUseEssay('admin', null)).toBe(true); expect(canUseEssay('teacher', 'davinci')).toBe(true)
  expect(canUseEssay('teacher', 'davinci_basic')).toBe(false); expect(canUseEssay('teacher', null)).toBe(false); expect(canUseEssay(null, null)).toBe(false)
})
```
`parseAcademy 의 plan` 절: 비어 있으면 `davinci_basic`, `'essay_only'` 는 거절(`ok: false`).
`tests/plan-tiers-migration.test.ts`: 파일 글자에 `update academies set plan = 'davinci' where plan = 'essay_only'`, `check (plan in ('davinci', 'davinci_basic'))`, `set default 'davinci_basic'`, `current_academy_plan() in ('davinci', 'davinci_basic')`, `create policy|drop policy` 는 `resources` 에만.
- [ ] **Step 2: 실행해 실패 확인** `npx vitest run tests/academy-plan.test.ts tests/plan-tiers-migration.test.ts`
- [ ] **Step 3: 구현** — `plan.ts`:
```ts
export const PLANS = ['davinci', 'davinci_basic'] as const
export type Plan = (typeof PLANS)[number]
export const DEFAULT_PLAN: Plan = 'davinci_basic'
export function isPlan(v: unknown): v is Plan { return typeof v === 'string' && (PLANS as readonly string[]).includes(v) }
/** RED 자료실: 관리자, 또는 두 상품 원장 모두. */
export function canUseRed(role, plan) { if (role === 'admin') return true; return role === 'teacher' && isPlan(plan) }
/** 서논술 수업(원장 화면·서버 동작·API): 관리자, 또는 다빈치올 원장만. */
export function canUseEssay(role, plan) { if (role === 'admin') return true; return role === 'teacher' && plan === 'davinci' }
```
(형 표기는 기존 `canUseRed` 와 같이.) 마이그레이션은 스펙 §1.2 의 SQL 그대로 + 머리 주석. 문구: `plan.names = { davinci: '다빈치올', davinci_basic: '다빈치 베이직' }`, `help = { davinci: 'RED 자료실과 서논술 수업 모두 열립니다.', davinci_basic: 'RED 자료실만 열립니다. 서논술 수업은 닫혀 있습니다.' }`, `summary: (all, basic) => \`다빈치올 ${all}곳 · 다빈치 베이직 ${basic}곳\``, `confirm: … 'RED 자료실·서논술 수업이 바로 열리거나 닫힙니다. 계속할까요?'`, `errors.planMigration: '가맹 상품 칸이 아직 준비되지 않았습니다. 마이그레이션 0022 를 적용하면 열립니다.'`. `Record<'davinci' | 'essay_only', string>` 형 표기는 `Record<Plan, string>` 꼴로(`import type { Plan }` 가 순환이면 `Record<'davinci' | 'davinci_basic', string>`). `createAcademy`: insert 오류 `error.code === '23514'` 면 `copy.errors.planMigration`. 목록 페이지: `nDavinci`/`나머지` → `summary(nAll, nBasic)`, 칩 둘. RedGate: `essay_only` 갈래·`stats` prop 제거, `role: 'student' | null`; inquiry 페이지: `essayOnly`·`red_published_stats` 호출·`RedStat` 제거. `tests/red-download.test.ts` 두 원장 fixture 에 `plan: 'davinci'`.
- [ ] **Step 4: 통과 확인** `npx vitest run tests/academy-plan.test.ts tests/plan-tiers-migration.test.ts tests/red-download.test.ts tests/red-library.test.ts tests/site-content.test.ts tests/academy-validate.test.ts tests/academy-validate-map.test.ts` + `npx tsc --noEmit -p .`. `grep -rn essay_only app lib components content tests` 가 0건.
- [ ] **Step 5: 커밋** `feat(academies): 가맹 상품을 다빈치올·다빈치 베이직 둘로 — canUseEssay, 마이그레이션 0022(옛 값 → 올, 기본 베이직, RED 정책 두 상품), RED 소개 갈래 제거(대표 2026-10-29)`

---

### Task 2: 서논술 잠금 — 판정 모듈·원장 메뉴·잠금 페이지·페이지 리다이렉트·서버 동작·API

**Files:**
- Create: `lib/auth/essay-access.ts`, `app/teacher/locked/page.tsx`
- Modify: `app/teacher/layout.tsx`, `app/teacher/page.tsx`, `app/teacher/{students,items,assignments,reports}/**/page.tsx`(각 파일 맨 앞 한 줄), `app/teacher/{students,assignments/new,assignments/[setId],reports/[themeId]/[studentId]}/actions.ts`(각 export 첫 줄), `app/api/classroom/gradings/[id]/run/route.ts`, `content/site.ts`(`app.essayLock`, `app.dashboard.teacher.basicNote`·`basicRedLink`)
- Test: `tests/essay-access.test.ts`

**Interfaces:**
- Consumes: `canUseEssay`(Task 1), `SessionProfile`(`lib/auth/session.ts`), `app.nav.teacher`.
- Produces: `ESSAY_PATHS`, `isEssayPath(pathname: string): boolean`, `teacherNavFor(plan: Plan | null): { href: string; label: string }[]`, `assertEssayAccess(s: Pick<SessionProfile,'role'|'plan'>): void`(던짐 `Error('essay_plan_required')`), `requireEssayPage(): Promise<SessionProfile>`(서버 전용: 세션을 읽고 `canUseEssay` 아니면 `redirect('/teacher/locked')`).

- [ ] **Step 1: 시험** `tests/essay-access.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isEssayPath, teacherNavFor, assertEssayAccess, ESSAY_PATHS } from '@/lib/auth/essay-access'
import { app } from '@/content/site'
describe('서논술 잠금', () => {
  it('서논술 경로 넷', () => {
    expect(ESSAY_PATHS).toEqual(['/teacher/students', '/teacher/items', '/teacher/assignments', '/teacher/reports'])
    expect(isEssayPath('/teacher/items/abc')).toBe(true); expect(isEssayPath('/teacher')).toBe(false); expect(isEssayPath('/teacher/inquiry')).toBe(false)
  })
  it('베이직 메뉴는 홈·탐구보고서만, 올은 전부', () => {
    expect(teacherNavFor('davinci_basic').map(n => n.href)).toEqual(['/teacher', '/teacher/inquiry'])
    expect(teacherNavFor('davinci')).toEqual(app.nav.teacher)
    expect(teacherNavFor(null).map(n => n.href)).toEqual(['/teacher', '/teacher/inquiry'])
  })
  it('assertEssayAccess 는 올·관리자만 통과', () => {
    expect(() => assertEssayAccess({ role: 'teacher', plan: 'davinci' })).not.toThrow()
    expect(() => assertEssayAccess({ role: 'admin', plan: null })).not.toThrow()
    expect(() => assertEssayAccess({ role: 'teacher', plan: 'davinci_basic' })).toThrow('essay_plan_required')
  })
})
```
(`requireEssayPage` 는 `redirect` 를 부르므로 단위 시험하지 않는다 — `vi.mock('next/navigation')` 으로 베이직이면 `redirect('/teacher/locked')` 가 불리는지 한 건 추가해도 좋다.)
- [ ] **Step 2: 실패 확인** → **Step 3: 구현** (`lib/auth/essay-access.ts` 는 `import 'server-only'` 를 쓰지 않는다 — 순수 함수 셋은 클라이언트에서도 쓸 수 있게; `requireEssayPage` 만 `next/navigation`·`getSessionProfile` 을 import 한다. 시험이 `redirect` import 로 깨지면 `requireEssayPage` 를 `lib/auth/essay-access.server.ts` 로 나눈다.) 잠금 페이지 문구 `app.essayLock = { title: '서논술 수업은 다빈치올 가맹에 포함됩니다', body: '지금 로그인한 원은 다빈치 베이직 가맹입니다. 서논술 수업을 열려면 본사에 문의해 주세요.', home: '홈으로' }`. 홈 `basicNote: '서논술 수업은 다빈치올 가맹에 포함됩니다. 본사에 문의해 주세요.'`, `basicRedLink: 'RED 자료실 열기'`(→ `/programs/inquiry`). 서논술 page 파일마다 `const s = await requireEssayPage()` 를 맨 앞에(이미 `getSessionProfile` 을 부르는 파일은 그 호출을 대신한다). 서버 동작마다 `assertEssayAccess(s)`(세션을 이미 읽는 곳은 그 값으로, 아니면 `getSessionProfile()` 뒤). API: `s.role === 'teacher' && !canUseEssay(s.role, s.plan)` → 403 `{ error: 'plan_required', plan: 'davinci' }`.
- [ ] **Step 4: 통과 확인** `npx vitest run tests/essay-access.test.ts tests/site-content.test.ts` + tsc. `grep -rL "requireEssayPage" app/teacher/{students,items,assignments,reports} --include=page.tsx` 가 0건.
- [ ] **Step 5: 커밋** `feat(teacher): 다빈치 베이직 원장에게 서논술 잠금 — 메뉴 숨김·잠금 페이지·페이지 리다이렉트·서버 동작·채점 API 403(대표 2026-10-29)`

---

### Task 3: 홈페이지 「서논술형」 페이지 — 상품별 단추

**Files:**
- Modify: `components/site/ProgramPage.tsx`(`cta?: ReactNode` — 있으면 기본 [가맹 문의] 단추 대신), `app/(public)/programs/essay/page.tsx`(세션 읽기 → cta 결정; `export const dynamic = 'force-dynamic'`), `content/site.ts`(`pages.program.essayCta`)
- Create: `components/site/EssayCta.tsx`(순수: `{ role: 'admin' | 'teacher' | 'student' | null, plan: Plan | null }` → 단추/상자)
- Test: `tests/essay-program-page.test.ts`

**Interfaces:** Consumes `canUseEssay`, `getSessionProfileOrNull`. Produces `EssayCta`.

- [ ] **Step 1: 시험** — `renderToStaticMarkup(<EssayCta role=… plan=…/>)`: 비로그인/학생 → `pages.program.cta` 링크 `/franchise`; teacher+davinci → `essayCta.open` 링크 `/teacher/items`; teacher+davinci_basic → `essayCta.locked.heading`·`body`·`button`(→ `/franchise`), `/teacher/items` 링크 없음; admin → `essayCta.admin` 링크 `/admin/items`. `ProgramPage` 에 `cta` 를 주면 `pages.program.cta` 글자가 없다.
- [ ] **Step 2 → 3: 구현** 문구 `essayCta = { open: '원장 화면에서 서논술 열기', admin: '문항 제작소 열기', locked: { heading: '서논술 수업은 다빈치올 가맹에 포함됩니다', body: '지금 로그인한 원은 다빈치 베이직 가맹입니다. 본사에 문의해 주세요.', button: '본사 문의' } }`.
- [ ] **Step 4: 통과 확인** + tsc. **Step 5: 커밋** `feat(site): 「서논술형」 페이지 — 다빈치올 원장은 원장 화면으로, 베이직은 안내+본사 문의, 본사는 제작소`

---

### Task 4: 비밀번호 바꾸기

**Files:**
- Create: `lib/auth/password-change.ts`(순수 `validateNewPassword`), `app/account/layout.tsx`, `app/account/password/page.tsx`, `app/account/password/PasswordForm.tsx`, `app/account/password/actions.ts`
- Modify: `components/app/AppShell.tsx`(학생 아닌 역할에 「비밀번호 바꾸기」 링크, 이름 아래), `content/site.ts`(`auth.password.*`, `app.passwordLink`)
- Test: `tests/password-change.test.ts`

**Interfaces:** Produces `validateNewPassword(current: string, next: string, confirm: string): { ok: true } | { ok: false; error: string }`(문구 키 값), 서버 동작 `changePassword(prev, formData)`.

- [ ] **Step 1: 시험** `validateNewPassword`: 모두 비었음 → `errors.missing`; 새 8자 미만 → `errors.tooShort`; 확인 불일치 → `errors.mismatch`; 현재와 같음 → `errors.same`; 정상 → `{ ok: true }`. 문구 `auth.password = { title: '비밀번호 바꾸기', labels: { current: '현재 비밀번호', next: '새 비밀번호 (8자 이상)', confirm: '새 비밀번호 확인' }, submit: '바꾸기', submitting: '바꾸는 중…', done: '바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.', errors: { missing: '세 칸을 모두 입력하세요.', tooShort: '새 비밀번호는 8자 이상이어야 합니다.', mismatch: '새 비밀번호 확인이 다릅니다.', same: '현재 비밀번호와 같습니다.', currentWrong: '현재 비밀번호가 맞지 않습니다.', studentNotAllowed: '학생 비밀번호는 원장님이 정합니다.', failed: '바꾸지 못했습니다. 잠시 뒤 다시 시도하세요.' } }`, `app.passwordLink: '비밀번호 바꾸기'`.
- [ ] **Step 2 → 3: 구현** `actions.ts`: `'use server'`; `getSessionProfile()`; 학생이면 `{ error: studentNotAllowed }`; `validateNewPassword`; `supabase.auth.getUser()` 로 이메일; `signInWithPassword({ email, password: current })` 실패 → `currentWrong`; `updateUser({ password: next })` 실패 → `failed`(오류 문장을 그대로 보여 주지 않는다 — 비밀번호가 섞일 수 있음); 성공 `{ done: true }`. `app/account/layout.tsx`: `getSessionProfile()` → `AppShell role={s.role} name={s.name} nav={s.role==='teacher' ? teacherNavFor(s.plan) : app.nav[s.role]}`; 학생이면 `redirect('/student')`. 폼은 `PlanForm` 꼴(`useActionState`), `type="password"` 셋, `autoComplete` current-password/new-password. AppShell: `role !== 'student' && <Link href="/account/password" className="text-sm text-ink-500 hover:text-ink-900">{app.passwordLink}</Link>` 를 이름 `<p>` 와 로그아웃 단추 사이에.
- [ ] **Step 4: 통과 확인** + tsc. **Step 5: 커밋** `feat(auth): 원장·본사 비밀번호 바꾸기 — /account/password, 현재 비밀번호 재확인 뒤 updateUser, 8자 이상(대표 2026-10-29)`

---

### Task 5: 문서 + 전체 시험

**Files:** `docs/STATUS.md`(갱신 줄 + 「대표님이 결정한 것」 첫 줄), `docs/runbooks/2026-09-29-five-subjects.md`(A절 `### 1-7.` 0022 → `git push` → 기존 원 상품 확인; 원장 계정 발급 순서에 "상품을 고른다(기본 베이직)"; constraint 이름이 다르면 SQL Editor 에서 확인), `README.md`(운영 체크리스트에 비밀번호 바꾸기 한 줄, 있으면)
- [ ] `npm test`(전부 통과 — red-download 포함) + `npx tsc --noEmit -p .`. 커밋 `docs: 가맹 상품 두 단계·서논술 잠금·비밀번호 바꾸기 — STATUS·순서서 1-7`.

## 자기 점검
- 스펙 §1 → T1, §2 → T2, §2.3 → T3, §3 → T4, §4 → T1·T5, §5 → 각 과제. 이름 일치: `canUseEssay`(T1) ↔ T2·T3·T4(layout 의 `teacherNavFor`); `teacherNavFor`(T2) ↔ T4 레이아웃; `Plan` 형 ↔ T3 `EssayCta`.
