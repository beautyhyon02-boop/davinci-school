# 가맹 상품 두 단계(다빈치올·다빈치 베이직) + 원장 비밀번호 바꾸기 설계

- 결정일: 2026-10-29 (대표)
- 결정: 상품은 **다빈치올**(RED ○ 서논술 ○)·**다빈치 베이직**(RED ○ 서논술 ×) 둘. "서논술 전용"은 없앤다. 새 가맹원 기본값은 베이직. 베이직 원장에게는 서논술 메뉴를 숨기고 주소로 들어와도 안내 페이지로 보낸다. 원장·본사가 자기 비밀번호를 바꿀 수 있어야 한다.
- 범위 밖: 서논술 자료의 RLS 를 상품으로 거르기(화면·서버 동작·API 에서만 막는다), 학생 비밀번호 바꾸기(원장이 정하는 방식 그대로), 비밀번호 찾기 이메일.

## 1. 가맹 상품

### 1.1 값 (`lib/academies/plan.ts`)
- `PLANS = ['davinci', 'davinci_basic']`, `DEFAULT_PLAN = 'davinci_basic'`.
- `canUseRed(role, plan)`: admin 이면 true; teacher 이고 plan 이 둘 중 하나면 true.
- `canUseEssay(role, plan)`: admin 이면 true; teacher 이고 plan === 'davinci' 면 true. 그 밖(학생·비로그인·plan null)은 false.
- 이름·설명은 `content/site.ts` `app.adminAcademies.plan.names/help`: 다빈치올 "RED 자료실과 서논술 수업 모두" / 다빈치 베이직 "RED 자료실만. 서논술 수업은 닫힘".

### 1.2 마이그레이션 0022 (`20261029000022_plan_tiers.sql`, 파일만 — 적용은 대표; 0020 뒤에 실행된다)
```sql
update academies set plan = 'davinci' where plan = 'essay_only';          -- 기존 원(001 등)은 다빈치올로
alter table academies drop constraint if exists academies_plan_check;
alter table academies add constraint academies_plan_check check (plan in ('davinci', 'davinci_basic'));
alter table academies alter column plan set default 'davinci_basic';
comment on column academies.plan is '가맹 상품: davinci 다빈치올(RED·서논술) / davinci_basic 다빈치 베이직(RED 만). 본사만 바꾼다.';
drop policy if exists teacher_read_resources on resources;
create policy teacher_read_resources on resources for select
  using (current_user_role() = 'teacher' and status = 'published' and current_academy_plan() in ('davinci', 'davinci_basic'));
```
다시 실행해도 안전(update 는 0건, drop/add 는 멱등). 0022 전에 코드가 배포되면: 새 가맹원 등록이 기본값 `davinci_basic` 을 보내 check 에 걸려 실패한다 → `createAcademy` 는 그 오류(23514)를 `app.adminAcademies.errors.planMigration` ("가맹 상품 칸이 아직 준비되지 않았습니다. 마이그레이션 0022 를 적용하면 열립니다") 으로 보여 준다. 기존 원의 `essay_only` 값은 코드에서 `isPlan` 에 걸리지 않아 null 로 읽히고 → RED·서논술 모두 닫힘(0022 적용으로 풀림). 순서서에 "0022 를 먼저" 로 적는다.

### 1.3 RED 쪽 정리
- 두 상품 모두 RED 가 열리므로 `RedGate` 의 '서논술 전용' 갈래(건수 소개)와 `red_published_stats` 호출, `pages.redReports.planGate` 문구는 없앤다. RedGate 는 `role: 'student' | null` 만 받는다. DB 함수 `red_published_stats` 는 그대로 둔다(지우지 않음, 해 없음).
- `app/api/red/download/[id]` 의 `canUseRed` 검사는 그대로(함수가 베이직도 허용).
- `tests/red-download.test.ts` 의 원장 fixture 에 `plan: 'davinci'` 를 넣어 지금 실패하는 2건을 고친다(원장 세션에 plan 이 없으면 403 이 맞다).

## 2. 서논술 잠금

### 2.1 판정 한 곳
`lib/auth/essay-access.ts`: `ESSAY_PATHS = ['/teacher/students', '/teacher/items', '/teacher/assignments', '/teacher/reports']`, `isEssayPath(pathname)`, `teacherNavFor(plan)`(`app.nav.teacher` 에서 서논술 메뉴를 거른 목록 — href 가 ESSAY_PATHS 로 시작하는 항목 제거), `assertEssayAccess(session)`(서버 동작·API 용: `canUseEssay` 가 아니면 `throw new Error('essay_plan_required')`).

### 2.2 원장 화면
- `app/teacher/layout.tsx`: `nav={teacherNavFor(s.plan)}`.
- 잠금 페이지 `app/teacher/locked/page.tsx`: 제목 "서논술 수업은 다빈치올 가맹에 포함됩니다", 본문 "본사에 문의해 주세요", [홈으로] — 문구 `app.essayLock`. 서버 컴포넌트.
- 서논술 페이지들(`app/teacher/{students,items,assignments,reports}/**/page.tsx`)은 맨 앞에서 `const s = await getSessionProfile(); if (!canUseEssay(s.role, s.plan)) redirect('/teacher/locked')`. 공통 도우미 `requireEssayPage()`(`lib/auth/essay-access.ts`, 서버 전용 — `redirect` 를 부른다)로 한 줄.
- 홈(`app/teacher/page.tsx`): 베이직이면 숫자 카드 대신 `app.dashboard.teacher.basicNote` 한 줄("서논술 수업은 다빈치올 가맹에 포함됩니다 …") + RED 자료실 바로 가기(`/programs/inquiry`).
- 서버 동작(`app/teacher/{students,assignments/new,assignments/[setId],reports/...}/actions.ts`)의 각 export 맨 앞에 `assertEssayAccess(s)`; API `app/api/classroom/gradings/[id]/run` 은 원장이면 `canUseEssay` 아니면 403 `{ error: 'plan_required', plan: 'davinci' }`.
- 학생 화면은 바꾸지 않는다(베이직 원은 학생을 만들 수 없으니 자연히 없다; 이미 있던 학생은 그대로 쓴다 — 설명회 계정은 올).

### 2.3 홈페이지 「서논술형」 수업 페이지 (`app/(public)/programs/essay/page.tsx`)
로그인 여부·역할·상품에 따라 `ProgramPage` 의 단추/문구가 바뀐다(RED 페이지 방식):
- 비로그인·학생: 지금처럼 [이 수업으로 가맹 문의].
- 원장 + 다빈치올: 단추가 **[원장 화면에서 서논술 열기]**(`/teacher/items`).
- 원장 + 베이직: 안내 상자 "서논술 수업은 다빈치올 가맹에 포함됩니다. 본사에 문의해 주세요" + [본사 문의](`/franchise`).
- 본사: [원장 화면…] 대신 [문항 제작소](`/admin/items`).
`ProgramPage` 에 `cta?: ReactNode` 를 받아 기본 단추를 대신하게 한다. 문구 `pages.program.essayCta.{open, admin, locked.heading, locked.body, locked.button}`.

## 3. 비밀번호 바꾸기

- 경로 `/account/password` (원장·본사 공용, 학생은 `/student` 로 돌려보냄). 레이아웃은 역할별 AppShell 안에 두기 어려우니(경로가 `/teacher`·`/admin` 밖) `app/account/layout.tsx` 가 세션을 읽어 역할에 맞는 `AppShell` 로 감싼다.
- AppShell 왼쪽 아래 이름 밑에 링크 「비밀번호 바꾸기」(`app.passwordLink`) — 학생 역할엔 없음.
- 폼(클라이언트, `useActionState`): 현재 비밀번호 · 새 비밀번호 · 새 비밀번호 확인 → 서버 동작 `changePassword`:
  1. `getSessionProfile()` — 학생이면 거절.
  2. `lib/auth/password-change.ts` `validateNewPassword(current, next, confirm)`(순수): 비었음·8자 미만·확인 불일치·현재와 같음 → 문구 키.
  3. 현재 비밀번호 확인: `supabase.auth.signInWithPassword({ email: user.email, password: current })` — 실패면 `errors.currentWrong`. (성공하면 세션이 같은 사용자로 다시 발급될 뿐이다.)
  4. `supabase.auth.updateUser({ password: next })` → 성공 문구 "바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요".
- Supabase 쪽 설정 변경 없음(비밀번호 최소 길이는 기본 6, 앱이 8 을 요구).
- 문구 `auth.password.*`.

## 4. 관리 화면 문구·순서서
- 등록 폼·「가맹 상품 바꾸기」의 선택지 둘, 확인창 문구 "…RED 자료실·서논술 수업이 바로 열리거나 닫힙니다".
- 목록 필터 칩·요약 "다빈치올 N곳 · 다빈치 베이직 N곳".
- `docs/STATUS.md` 줄, 순서서 A절 1-7 "0022 → git push → 기존 원 상품 확인", 원장 계정 발급 순서에 "상품을 고른다(기본 베이직)".

## 5. 시험
- `tests/academy-plan.test.ts`: PLANS 둘, `canUseRed`(둘 다 ○, null ×), `canUseEssay`(davinci 만), parseAcademy 기본값 `davinci_basic`, `essay_only` 는 거절.
- `tests/essay-access.test.ts`: `isEssayPath`, `teacherNavFor`(베이직 → 홈·탐구보고서만), `assertEssayAccess` 던짐.
- `tests/plan-tiers-migration.test.ts`: 0022 글자(update essay_only→davinci, check 두 값, default basic, resources 정책 두 값).
- `tests/password-change.test.ts`: `validateNewPassword` 경우들.
- `tests/essay-program-page.test.ts`: `ProgramPage` 가 `cta` 를 받으면 기본 단추를 안 그림; 잠금 상자 문구.
- `tests/red-download.test.ts` 고침, `tests/red-library.test.ts`·`site-content.test.ts` 문구 갱신.

## 6. 확인하지 못하는 것
- 호스팅 DB 에서 0022 의 constraint 이름(`academies_plan_check`)이 자동 이름과 같은지 — 다르면 SQL Editor 에서 `\d academies` 로 확인해 이름을 맞춘다(순서서에 적음).
- 실제 브라우저에서 비밀번호 바꾸기(대표가 스테이징에서 자기 계정으로).
