# 3주차-A 수업 운영 핵심 구현 계획 (배정·퀴즈·답안·AI 채점·원장 검수·재도전)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원장이 학생 계정을 만들고 게시된 세트를 배정하면, 학생이 차시별 퀴즈(즉시 채점)와 서논술 답안을 제출하고, AI가 채점 초안을 만들며, 원장이 검수·확정해 공개하고, 학생이 재도전할 수 있는 흐름을 끝까지 만든다.

**Architecture:** Supabase 표 4개(`assignments` 확장, `quiz_responses`, `answers`, `gradings` 재설계)와 RLS·트리거로 규칙(제출 후 불변, AI 초안 불변, 원장은 확정본만)을 DB에서 강제한다. 순수 계산(정오 판정·종합 점수·차시 규칙·채점 프롬프트)은 `lib/classroom/*`에 두고 vitest로 시험한다. 채점 호출은 문항 제작소와 같은 `callStructured`(역할 `grade`, `claude-sonnet-5`, fixture 폴백)를 API 라우트에서 실행한다. 화면은 서버 컴포넌트 + 작은 클라이언트 컴포넌트 + 서버 액션 패턴(2B와 동일).

**Tech Stack:** Next.js 16.3 App Router(Promise params, `'use server'` 액션, `useActionState`, `proxy.ts`), React 19, Tailwind 4, Supabase(RLS·RPC·트리거), zod 4, `@anthropic-ai/sdk`(`lib/ai/claude.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-week3-classroom-design.md` (§3 장부, §4 원장 화면, §5 학생 화면, §6.1·6.3 채점). §4.6 사진 읽기, §7 교재, §8 공유 자료 생성은 **3B 계획**(별도)에서 다룬다.

## Global Constraints

- 문구는 `content/site.ts`(새 `app.classroom` 아래)에서만. tsx에 한글 리터럴 금지(도메인 값 `SUBJECTS`/`LEVELS`, 배지 키 상/중/하는 예외).
- 권한은 RLS로 강제. 서버 액션·API는 `getSessionProfile`/`getSessionProfileOrNull`로 역할을 다시 확인(원장은 `academyId`가 자기 원인지, 학생은 `userId`가 배정의 학생인지).
- 답안: `submitted_at`이 찍히면 `body`·`item_no`·`attempt`·`submitted_at` 변경 금지(트리거). 50자 미만은 제출 자체를 거부(서버에서, `submitted_at` 안 찍음).
- 채점: `ai_*`·`model`·`input_tokens`·`output_tokens` 열은 원장이 바꿀 수 없다(트리거). 원장은 `final_*`·`teacher_comment`·`adjust_note`·`status`(drafted↔confirmed)·`confirmed_by/at`·`updated_at`·`regrade_requested`만. 학생은 `student_gradings` 뷰(확정본 열만)로만 채점을 읽는다.
- 종합 점수·등급은 저장하지 않고 화면에서 계산(`lib/classroom/scoring.ts`).
- 채점 모델 `claude-sonnet-5`(`MODELS.grade`, 이미 있음). 요청당 AI 호출 1회. fixture 키 `grading-<서술형|논술형>`; mock이면 배지 표시.
- 세트 내용은 항상 `item_set_versions` 스냅샷(`assignments.item_set_version`)에서 읽는다. `item_sets` 현재 열을 읽지 않는다.
- `.env.local`·키 출력 금지. `git add` 명시 경로. 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 마이그레이션은 파일만(적용은 대표님 터미널 `supabase db push`).
- 기존 `submissions` 표와 그 정책은 삭제한다(데이터 없음). `gradings`는 drop 후 재생성.

---

## 파일 구조

```
supabase/migrations/20260922000009_classroom.sql   표·트리거·RLS·뷰·RPC (Task 1)
lib/classroom/types.ts            공용 타입 (Task 2)
lib/classroom/quiz.ts             단답 정규화·정오 판정 (Task 2)
lib/classroom/scoring.ts          종합 점수·등급 (Task 2)
lib/classroom/lessons.ts          차시↔문항 배치, 열린 차시 판정 (Task 2)
lib/classroom/grading-schema.ts   채점 초안 zod (Task 6)
lib/classroom/grading-prompt.ts   채점 프롬프트 조립(순수) (Task 6)
lib/classroom/grade.ts            runGrading — DB 읽기 → callStructured → 저장 (Task 6)
lib/classroom/snapshot.ts         배정의 스냅샷 로더 (Task 4)
lib/students/new-student.ts       학생 입력 검증·아이디 규칙(순수) (Task 3)
data/studio-fixtures/grading-서술형.json, grading-논술형.json (Task 6)
app/teacher/students/{page.tsx,actions.ts,NewStudentForm.tsx,ResetPasswordButton.tsx} (Task 3)
app/teacher/assignments/new/{page.tsx,actions.ts,AssignForm.tsx} (Task 4)
app/teacher/assignments/{page.tsx} (Task 4)
app/teacher/assignments/[setId]/{page.tsx,actions.ts,OpenLessonsControl.tsx,QuizMatrix.tsx,ReviewCard.tsx} (Task 4·7)
app/teacher/items/[setId]/page.tsx (수정: 배정하기 버튼) (Task 4)
app/teacher/page.tsx (수정: 대시보드 숫자) (Task 9)
app/student/page.tsx (수정: 배정 카드) (Task 5)
app/student/assignments/[id]/{page.tsx,actions.ts,LessonTabs.tsx,QuizForm.tsx,AnswerEditor.tsx,ResultView.tsx,RetryButton.tsx} (Task 5·8)
app/api/classroom/gradings/[id]/run/route.ts   채점 실행 (Task 6)
content/site.ts (app.classroom 추가, nav.teacher 수정) (각 Task)
tests/classroom-quiz.test.ts, classroom-scoring.test.ts, classroom-lessons.test.ts, new-student.test.ts,
tests/grading-schema.test.ts, grading-prompt.test.ts, grading-run.test.ts
docs/STATUS.md, README.md (Task 9)
```

---

### Task 1: 마이그레이션 0009 — 수업 운영 표·트리거·RLS·뷰·RPC

**Files:**
- Create: `supabase/migrations/20260922000009_classroom.sql`

**Interfaces:**
- Produces: 표 `assignments(open_lessons int)`, `quiz_responses`, `answers`, `gradings`(새 열), 뷰 `student_gradings`, RPC `next_student_seq(p_academy_id uuid) returns int`, enum `answer_source`, `classroom_grading_status`. 뒤 Task 전부가 이 이름을 그대로 쓴다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 3주차-A: 수업 운영 (스펙 docs/superpowers/specs/2026-09-21-week3-classroom-design.md §3)
-- submissions/gradings 는 1주차 뼈대만 있고 데이터가 없다 → 새 구조로 교체한다.

-- 0) 정리
drop policy if exists admin_all_submissions on submissions;
drop policy if exists teacher_rw_submissions on submissions;
drop policy if exists student_rw_submissions on submissions;
drop policy if exists admin_all_gradings on gradings;
drop policy if exists teacher_read_gradings on gradings;
drop policy if exists teacher_update_gradings on gradings;
drop policy if exists student_read_gradings on gradings;
drop table if exists gradings;
drop table if exists submissions;

create type answer_source as enum ('student', 'photo', 'teacher');
create type classroom_grading_status as enum ('pending', 'drafted', 'confirmed', 'failed', 'rejected');

-- 1) 배정: 열린 차시 + 중복 배정 방지
alter table assignments add column if not exists open_lessons int not null default 1 check (open_lessons between 1 and 8);
create unique index if not exists assignments_student_set_unique on assignments(student_id, item_set_id);

-- 2) 퀴즈 응답
create table quiz_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  lesson_no int not null check (lesson_no between 1 and 8),
  quiz_no int not null check (quiz_no between 1 and 3),
  response text not null,
  correct boolean not null,
  source answer_source not null default 'student',
  answered_at timestamptz not null default now(),
  overridden_by uuid references profiles(id),
  overridden_at timestamptz,
  unique (assignment_id, lesson_no, quiz_no)
);
create index on quiz_responses(assignment_id);

-- 3) 답안 (문항 하나·회차 하나 = 한 줄)
create table answers (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  item_no int not null check (item_no between 1 and 4),
  attempt int not null default 1 check (attempt between 1 and 2),
  body text not null default '',
  source answer_source not null default 'student',
  photo_path text,
  entered_by uuid not null references profiles(id),
  saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (assignment_id, item_no, attempt)
);
create index on answers(assignment_id);

-- 제출 뒤 불변 (스펙 §3.3)
create or replace function public.answers_guard() returns trigger
language plpgsql as $$
begin
  if old.submitted_at is not null then
    if new.body is distinct from old.body
       or new.item_no is distinct from old.item_no
       or new.attempt is distinct from old.attempt
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'answer is immutable after submission' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger answers_guard before update on answers for each row execute function public.answers_guard();

-- 4) 채점: AI 초안 + 원장 확정본 (스펙 §3.4)
create table gradings (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null unique references answers(id) on delete cascade,
  academy_id uuid not null references academies(id),
  status classroom_grading_status not null default 'pending',
  -- AI 초안
  ai_criteria jsonb,
  ai_score int,
  ai_strengths jsonb,
  ai_improvements jsonb,
  model text,
  input_tokens int,
  output_tokens int,
  error text,
  -- 원장 확정본
  final_criteria jsonb,
  final_score int,
  final_strengths jsonb,
  final_improvements jsonb,
  teacher_comment text,
  adjust_note text,
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  updated_at timestamptz,
  regrade_requested boolean not null default false,
  created_at timestamptz not null default now()
);
create index on gradings(academy_id, status);

-- 원장은 확정본 열만 (스펙 §3.4). service role(current_user_role() is null)과 admin은 제한 없음.
create or replace function public.gradings_guard() returns trigger
language plpgsql as $$
begin
  if current_user_role() = 'teacher' then
    if new.ai_criteria is distinct from old.ai_criteria
       or new.ai_score is distinct from old.ai_score
       or new.ai_strengths is distinct from old.ai_strengths
       or new.ai_improvements is distinct from old.ai_improvements
       or new.model is distinct from old.model
       or new.input_tokens is distinct from old.input_tokens
       or new.output_tokens is distinct from old.output_tokens
       or new.error is distinct from old.error
       or new.answer_id is distinct from old.answer_id
       or new.academy_id is distinct from old.academy_id then
      raise exception 'teacher may only change the final columns' using errcode = 'P0001';
    end if;
    if new.status not in ('drafted', 'confirmed') then
      raise exception 'teacher may only set status drafted or confirmed' using errcode = 'P0001';
    end if;
  end if;
  -- 확정된 줄은 AI 다시 채점 불가(확정을 먼저 풀어야 함)
  if old.status = 'confirmed' and new.status = 'pending' then
    raise exception 'confirmed grading cannot be regraded' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger gradings_guard before update on gradings for each row execute function public.gradings_guard();

-- 5) 학생용 뷰: 확정본 열만, 자기 것만 (security definer 뷰이므로 자체 필터 필수)
create view student_gradings as
  select g.id, g.answer_id, g.status, g.final_criteria, g.final_score, g.final_strengths, g.final_improvements,
         g.teacher_comment, g.confirmed_at, g.updated_at
  from gradings g
  join answers a on a.id = g.answer_id
  join assignments s on s.id = a.assignment_id
  where g.status = 'confirmed' and s.student_id = auth.uid();
grant select on student_gradings to authenticated;

-- 6) RLS
alter table quiz_responses enable row level security;
alter table answers enable row level security;
alter table gradings enable row level security;

create policy admin_all_quiz on quiz_responses for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_answers on answers for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy admin_all_gradings on gradings for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy teacher_rw_quiz on quiz_responses for all
  using (current_user_role() = 'teacher' and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id()))
  with check (current_user_role() = 'teacher' and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id()));
create policy teacher_rw_answers on answers for all
  using (current_user_role() = 'teacher' and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id()))
  with check (current_user_role() = 'teacher' and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id()));
create policy teacher_read_gradings on gradings for select using (current_user_role() = 'teacher' and academy_id = current_academy_id());
create policy teacher_update_gradings on gradings for update
  using (current_user_role() = 'teacher' and academy_id = current_academy_id())
  with check (current_user_role() = 'teacher' and academy_id = current_academy_id());

-- 학생: 자기 배정의 열린 차시만 퀴즈 응답, 자기 답안은 제출 전까지
create policy student_read_quiz on quiz_responses for select
  using (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()));
create policy student_insert_quiz on quiz_responses for insert
  with check (source = 'student' and exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid() and a.closed = false and lesson_no <= a.open_lessons));
create policy student_read_answers on answers for select
  using (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()));
create policy student_insert_answers on answers for insert
  with check (source = 'student' and entered_by = auth.uid() and exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid() and a.closed = false));
create policy student_update_answers on answers for update
  using (submitted_at is null and exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid() and a.closed = false))
  with check (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()));
-- 학생은 gradings 기본 표에 정책이 없다(=아무 것도 못 봄). 뷰 student_gradings 로만 읽는다.

-- 7) 학생 번호 발급 (원별 1부터, 동시 생성에도 안전)
create or replace function public.next_student_seq(p_academy_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not (current_user_role() = 'admin' or (current_user_role() = 'teacher' and current_academy_id() = p_academy_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_academy_id::text));
  select coalesce(max(seq), 0) + 1 into v from students where academy_id = p_academy_id;
  return v;
end $$;
grant execute on function public.next_student_seq(uuid) to authenticated;
```

- [ ] **Step 2: 정적 점검**

Run: `grep -c "create policy" supabase/migrations/20260922000009_classroom.sql` → Expected: `13`
Run: `grep -n "student.*gradings" supabase/migrations/20260922000009_classroom.sql` → Expected: 뷰 정의와 주석 외에 학생용 gradings 정책이 **없음**을 확인.

- [ ] **Step 3: STATUS.md에 적용 대기 표시**

`docs/STATUS.md`의 "대표님이 아직 하실 일" 목록에 한 줄 추가:
`- 마이그레이션 0009(수업 운영 표) 적용: 프로젝트 폴더 터미널에서 \`supabase db push\``

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922000009_classroom.sql docs/STATUS.md
git commit -m "feat: 수업 운영 표·트리거·RLS·학생 뷰·번호 발급 RPC (0009)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 순수 규칙 — 퀴즈 판정, 종합 점수·등급, 차시 배치

**Files:**
- Create: `lib/classroom/types.ts`, `lib/classroom/quiz.ts`, `lib/classroom/scoring.ts`, `lib/classroom/lessons.ts`
- Test: `tests/classroom-quiz.test.ts`, `tests/classroom-scoring.test.ts`, `tests/classroom-lessons.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `AnswerSource`, `GradingStatus`, `Criterion`, `GradingDraft`, `GradingRow`, `AnswerRow`, `AssignmentRow`, `QuizResponseRow`
  - `quiz.ts`: `normalizeShort(s: string): string`, `judgeQuiz(item: { type: 'choice'|'short'; answer: string; choices: string[]|null }, response: string): boolean`
  - `scoring.ts`: `gradeFor(boundaries, total): { grade: number; band: '상'|'중'|'하' } | null`, `overallFor(items: { points: number }[], finalScores: (number|null)[]): { total: number; max: number; complete: boolean }`
  - `lessons.ts`: `assessmentItemNoForLesson(snapshot, lessonNo): number | null`, `lessonNoForItem(snapshot, itemNo): number`, `isLessonOpen(openLessons: number, lessonNo: number): boolean`, `ASSESSMENT_LABELS`

- [ ] **Step 1: 타입 파일**

```ts
// lib/classroom/types.ts
import type { Snapshot } from '@/lib/studio/publish'

export type AnswerSource = 'student' | 'photo' | 'teacher'
export type GradingStatus = 'pending' | 'drafted' | 'confirmed' | 'failed' | 'rejected'

/** 채점 요소 하나. 서술형은 1개(단일 채점표), 논술형은 4개. */
export type Criterion = { name: string; points: number; max: number; evidence: string; note: string }
export type GradingDraft = { criteria: Criterion[]; score: number; strengths: string[]; improvements: string[] }

export type AssignmentRow = {
  id: string; item_set_id: string; item_set_version: number; academy_id: string; student_id: string
  due_at: string | null; allow_retry: boolean; open_lessons: number; closed: boolean; created_at: string
}
export type QuizResponseRow = { assignment_id: string; lesson_no: number; quiz_no: number; response: string; correct: boolean; source: AnswerSource }
export type AnswerRow = {
  id: string; assignment_id: string; item_no: number; attempt: number; body: string; source: AnswerSource
  photo_path: string | null; saved_at: string; submitted_at: string | null
}
export type GradingRow = {
  id: string; answer_id: string; status: GradingStatus
  ai_criteria: Criterion[] | null; ai_score: number | null; ai_strengths: string[] | null; ai_improvements: string[] | null
  model: string | null; error: string | null
  final_criteria: Criterion[] | null; final_score: number | null; final_strengths: string[] | null; final_improvements: string[] | null
  teacher_comment: string | null; adjust_note: string | null; confirmed_at: string | null; updated_at: string | null; regrade_requested: boolean
}
export type AssessmentItem = NonNullable<Snapshot['assessment']>['items'][number]
```

- [ ] **Step 2: 퀴즈 판정 실패 테스트**

```ts
// tests/classroom-quiz.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeShort, judgeQuiz } from '@/lib/classroom/quiz'

describe('normalizeShort', () => {
  it('removes spaces, lowercases, trims punctuation at the ends', () => {
    expect(normalizeShort('  상대 도수 ')).toBe('상대도수')
    expect(normalizeShort('Histogram.')).toBe('histogram')
    expect(normalizeShort('4 (개)')).toBe('4(개)')
  })
})

describe('judgeQuiz', () => {
  const choice = { type: 'choice' as const, answer: '③', choices: ['①', '②', '③', '④'] }
  const short = { type: 'short' as const, answer: '상대도수', choices: null }
  it('choice: exact marker match only', () => {
    expect(judgeQuiz(choice, '③')).toBe(true)
    expect(judgeQuiz(choice, '3')).toBe(false)
    expect(judgeQuiz(choice, ' ③ ')).toBe(true)
  })
  it('short: normalized comparison', () => {
    expect(judgeQuiz(short, '상대 도수')).toBe(true)
    expect(judgeQuiz(short, '도수')).toBe(false)
    expect(judgeQuiz(short, '')).toBe(false)
  })
  it('short: accepts any of "A / B" alternatives in the answer key', () => {
    expect(judgeQuiz({ type: 'short', answer: '히스토그램 / 도수분포다각형', choices: null }, '도수분포다각형')).toBe(true)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/classroom-quiz.test.ts` → Expected: FAIL (module not found)

- [ ] **Step 4: 구현**

```ts
// lib/classroom/quiz.ts
/** 단답형 비교용 정규화: 앞뒤 공백·구두점 제거, 안쪽 공백 제거, 소문자. */
export function normalizeShort(s: string): string {
  return s.trim().replace(/[.。,!?]+$/g, '').replace(/\s+/g, '').toLowerCase()
}

export type QuizKey = { type: 'choice' | 'short'; answer: string; choices: string[] | null }

/** 선택형은 표시 기호(①…) 완전 일치, 단답형은 정규화 후 일치. 정답 키가 "A / B"면 둘 중 하나. */
export function judgeQuiz(item: QuizKey, response: string): boolean {
  const r = response.trim()
  if (!r) return false
  if (item.type === 'choice') return r === item.answer.trim()
  const accepted = item.answer.split('/').map(normalizeShort).filter(Boolean)
  return accepted.includes(normalizeShort(r))
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/classroom-quiz.test.ts` → Expected: PASS (4 tests)

- [ ] **Step 6: 종합 점수·등급 실패 테스트**

```ts
// tests/classroom-scoring.test.ts
import { describe, it, expect } from 'vitest'
import { gradeFor, overallFor } from '@/lib/classroom/scoring'

const boundaries = [
  { grade: 1, min: 21, max: 22, band: '상' as const }, { grade: 2, min: 18, max: 20, band: '상' as const },
  { grade: 3, min: 15, max: 17, band: '중' as const }, { grade: 4, min: 11, max: 14, band: '중' as const },
  { grade: 5, min: 8, max: 10, band: '중' as const }, { grade: 6, min: 5, max: 7, band: '하' as const },
  { grade: 7, min: 0, max: 4, band: '하' as const },
]
const items = [{ points: 3 }, { points: 3 }, { points: 16 }]

describe('gradeFor', () => {
  it('maps a total to the boundary row', () => {
    expect(gradeFor(boundaries, 17)).toEqual({ grade: 3, band: '중' })
    expect(gradeFor(boundaries, 0)).toEqual({ grade: 7, band: '하' })
    expect(gradeFor(boundaries, 22)).toEqual({ grade: 1, band: '상' })
  })
  it('returns null outside the table', () => {
    expect(gradeFor(boundaries, 23)).toBeNull()
    expect(gradeFor(boundaries, -1)).toBeNull()
  })
})

describe('overallFor', () => {
  it('sums confirmed scores and reports completeness', () => {
    expect(overallFor(items, [2, 3, 12])).toEqual({ total: 17, max: 22, complete: true })
    expect(overallFor(items, [2, null, 12])).toEqual({ total: 14, max: 22, complete: false })
  })
})
```

- [ ] **Step 7: 구현**

```ts
// lib/classroom/scoring.ts
export type Boundary = { grade: number; min: number; max: number; band: '상' | '중' | '하' }

export function gradeFor(boundaries: Boundary[], total: number): { grade: number; band: Boundary['band'] } | null {
  const b = boundaries.find((x) => total >= x.min && total <= x.max)
  return b ? { grade: b.grade, band: b.band } : null
}

/** 확정 점수의 합. 아직 확정되지 않은 문항(null)이 있으면 complete=false. */
export function overallFor(items: { points: number }[], finalScores: (number | null)[]) {
  const max = items.reduce((s, i) => s + i.points, 0)
  const total = finalScores.reduce<number>((s, x) => s + (x ?? 0), 0)
  return { total, max, complete: finalScores.length === items.length && finalScores.every((x) => x !== null) }
}
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run tests/classroom-scoring.test.ts` → Expected: PASS (3 tests)

- [ ] **Step 9: 차시 배치 실패 테스트**

```ts
// tests/classroom-lessons.test.ts
import { describe, it, expect } from 'vitest'
import { assessmentItemNoForLesson, lessonNoForItem, isLessonOpen, ASSESSMENT_LABELS } from '@/lib/classroom/lessons'

// 최소 스냅샷: lessons 의 assessment 라벨과 assessment.items 의 순서로 문항 번호(1-based)를 정한다
const snapshot = {
  lessons: [
    { no: 1, assessment: null }, { no: 2, assessment: null }, { no: 3, assessment: '서술형1' },
    { no: 4, assessment: '서술형2' }, { no: 5, assessment: '논술형' },
  ],
  assessment: { items: [{ kind: '서술형', lesson_no: 3 }, { kind: '서술형', lesson_no: 4 }, { kind: '논술형', lesson_no: 5 }] },
} as never

describe('lesson ↔ item mapping', () => {
  it('finds the item number placed in a lesson', () => {
    expect(assessmentItemNoForLesson(snapshot, 3)).toBe(1)
    expect(assessmentItemNoForLesson(snapshot, 5)).toBe(3)
    expect(assessmentItemNoForLesson(snapshot, 1)).toBeNull()
  })
  it('finds the lesson of an item', () => {
    expect(lessonNoForItem(snapshot, 2)).toBe(4)
  })
  it('labels follow the lesson schema', () => {
    expect(ASSESSMENT_LABELS).toEqual(['서술형1', '서술형2', '논술형'])
  })
})

describe('isLessonOpen', () => {
  it('opens lessons up to open_lessons', () => {
    expect(isLessonOpen(3, 3)).toBe(true)
    expect(isLessonOpen(3, 4)).toBe(false)
  })
})
```

- [ ] **Step 10: 구현**

```ts
// lib/classroom/lessons.ts
import type { Snapshot } from '@/lib/studio/publish'

/** 3단계 차시 스키마의 assessment 라벨. 순서 = 5단계 items 순서 = 문항 번호(1-based). */
export const ASSESSMENT_LABELS = ['서술형1', '서술형2', '논술형'] as const

/** 이 차시에 배치된 평가 문항 번호(1-based). 없으면 null. items[i].lesson_no 를 우선 쓰고, 없으면 차시 라벨로 맞춘다. */
export function assessmentItemNoForLesson(snapshot: Snapshot, lessonNo: number): number | null {
  const items = snapshot.assessment?.items ?? []
  const byLesson = items.findIndex((i) => i.lesson_no === lessonNo)
  if (byLesson >= 0) return byLesson + 1
  const lesson = snapshot.lessons.find((l) => l.no === lessonNo)
  if (!lesson?.assessment) return null
  const idx = ASSESSMENT_LABELS.indexOf(lesson.assessment)
  return idx >= 0 && idx < items.length ? idx + 1 : null
}

export function lessonNoForItem(snapshot: Snapshot, itemNo: number): number {
  const item = snapshot.assessment?.items[itemNo - 1]
  if (item?.lesson_no) return item.lesson_no
  const label = ASSESSMENT_LABELS[itemNo - 1]
  return snapshot.lessons.find((l) => l.assessment === label)?.no ?? snapshot.lessons.length
}

export function isLessonOpen(openLessons: number, lessonNo: number): boolean {
  return lessonNo >= 1 && lessonNo <= openLessons
}
```

- [ ] **Step 11: 전체 통과 확인**

Run: `npx vitest run tests/classroom-quiz.test.ts tests/classroom-scoring.test.ts tests/classroom-lessons.test.ts` → Expected: PASS (10 tests)

- [ ] **Step 12: Commit**

```bash
git add lib/classroom/types.ts lib/classroom/quiz.ts lib/classroom/scoring.ts lib/classroom/lessons.ts tests/classroom-quiz.test.ts tests/classroom-scoring.test.ts tests/classroom-lessons.test.ts
git commit -m "feat: 수업 운영 순수 규칙 — 퀴즈 판정·종합 등급·차시 배치

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 원장 학생 관리 — 등록(아이디·초기 비밀번호 발급)·비밀번호 초기화

**Files:**
- Create: `lib/students/new-student.ts`, `app/teacher/students/page.tsx`, `app/teacher/students/actions.ts`, `app/teacher/students/NewStudentForm.tsx`, `app/teacher/students/ResetPasswordButton.tsx`
- Modify: `content/site.ts` (`app.classroom.students` 추가)
- Test: `tests/new-student.test.ts`

**Interfaces:**
- Consumes: `next_student_seq` RPC (Task 1), `generatePassword` (`lib/auth/passwords.ts`), `toLoginEmail` (`lib/auth/login-id.ts`), `createAdminClient` (`lib/supabase/admin.ts`)
- Produces: `parseNewStudent(formData): { ok: true; data: { name; level; grade } } | { ok: false; error: string }`, `buildLoginId(academyCode: string, seq: number): string` (`dgss-007` 형식), 서버 액션 `createStudent`, `resetStudentPassword(profileId)`

- [ ] **Step 1: 문구 추가** — `content/site.ts`의 `app` 객체 안, `teacherItems` 다음에:

```ts
  classroom: {
    students: {
      title: '학생 관리',
      columns: { name: '이름', grade: '학년', loginId: '아이디', assignments: '배정', actions: '동작' },
      empty: '아직 등록된 학생이 없습니다. 오른쪽에서 첫 학생을 추가하세요.',
      form: {
        heading: '학생 추가',
        nameLabel: '이름',
        levelLabel: '학교급',
        gradeLabel: '학년',
        submit: '추가',
        submitting: '만드는 중…',
      },
      issued: {
        heading: '계정이 만들어졌습니다',
        body: '아래 아이디와 초기 비밀번호는 지금 한 번만 보입니다. 인쇄하거나 복사해 학생에게 전해 주세요.',
        loginId: '아이디',
        password: '초기 비밀번호',
        copy: '복사',
        copied: '복사했습니다',
        close: '닫기',
      },
      reset: { button: '비밀번호 초기화', confirm: '새 비밀번호를 만들까요? 학생은 이전 비밀번호로 로그인할 수 없게 됩니다.', done: '새 비밀번호' },
      errors: {
        nameMissing: '이름을 입력하세요.',
        levelInvalid: '학교급을 고르세요.',
        gradeInvalid: '학년은 1~6 사이 숫자여야 합니다.',
        createFailed: '계정을 만들지 못했습니다. 잠시 후 다시 시도하세요.',
        forbidden: '권한이 없습니다.',
      },
    },
  },
```

- [ ] **Step 2: 실패 테스트**

```ts
// tests/new-student.test.ts
import { describe, it, expect } from 'vitest'
import { parseNewStudent, buildLoginId } from '@/lib/students/new-student'

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseNewStudent', () => {
  it('accepts a valid form', () => {
    expect(parseNewStudent(fd({ name: ' 김민준 ', level: '중', grade: '1' }))).toEqual({ ok: true, data: { name: '김민준', level: '중', grade: 1 } })
  })
  it('rejects missing name, bad level, bad grade with copy keys', () => {
    expect(parseNewStudent(fd({ name: '', level: '중', grade: '1' }))).toEqual({ ok: false, error: 'nameMissing' })
    expect(parseNewStudent(fd({ name: 'a', level: '대', grade: '1' }))).toEqual({ ok: false, error: 'levelInvalid' })
    expect(parseNewStudent(fd({ name: 'a', level: '초', grade: '7' }))).toEqual({ ok: false, error: 'gradeInvalid' })
  })
})

describe('buildLoginId', () => {
  it('formats code-NNN', () => {
    expect(buildLoginId('dgss', 7)).toBe('dgss-007')
    expect(buildLoginId('dgss', 1234)).toBe('dgss-1234')
  })
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/new-student.test.ts` → FAIL

- [ ] **Step 4: 구현**

```ts
// lib/students/new-student.ts
import { LEVELS } from '@/lib/studio/schemas'

export type NewStudent = { name: string; level: (typeof LEVELS)[number]; grade: number }
export type ParseResult = { ok: true; data: NewStudent } | { ok: false; error: 'nameMissing' | 'levelInvalid' | 'gradeInvalid' }

/** 폼 → 검증. error 는 app.classroom.students.errors 의 키. */
export function parseNewStudent(formData: FormData): ParseResult {
  const name = String(formData.get('name') ?? '').trim()
  const level = String(formData.get('level') ?? '')
  const grade = Number.parseInt(String(formData.get('grade') ?? ''), 10)
  if (!name) return { ok: false, error: 'nameMissing' }
  if (!(LEVELS as readonly string[]).includes(level)) return { ok: false, error: 'levelInvalid' }
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return { ok: false, error: 'gradeInvalid' }
  return { ok: true, data: { name, level: level as NewStudent['level'], grade } }
}

/** 아이디 = 원 코드 + '-' + 번호(세 자리 채움). 로그인 이메일은 toLoginEmail(아이디). */
export function buildLoginId(academyCode: string, seq: number): string {
  return `${academyCode}-${String(seq).padStart(3, '0')}`
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/new-student.test.ts` → PASS (3 tests)

- [ ] **Step 6: 서버 액션**

```ts
// app/teacher/students/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { generatePassword } from '@/lib/auth/passwords'
import { toLoginEmail } from '@/lib/auth/login-id'
import { parseNewStudent, buildLoginId } from '@/lib/students/new-student'
import { app } from '@/content/site'

const errors = app.classroom.students.errors

async function assertTeacher() {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  return { ...s, academyId: s.academyId }
}

export type IssuedState = { error?: string; issued?: { name: string; loginId: string; password: string } } | undefined

export async function createStudent(_prev: IssuedState, formData: FormData): Promise<IssuedState> {
  const s = await assertTeacher()
  const r = parseNewStudent(formData)
  if (!r.ok) return { error: errors[r.error] }

  const supabase = await createClient()
  const { data: academy } = await supabase.from('academies').select('code').eq('id', s.academyId).single()
  if (!academy) return { error: errors.forbidden }

  // 번호는 RPC(advisory lock)로 받는다. unique(academy_id, seq) 가 마지막 안전장치.
  const { data: seq, error: seqErr } = await supabase.rpc('next_student_seq', { p_academy_id: s.academyId })
  if (seqErr || typeof seq !== 'number') return { error: errors.createFailed }

  const loginId = buildLoginId(academy.code, seq)
  const password = generatePassword(8)
  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toLoginEmail(loginId),
    password,
    email_confirm: true,
    app_metadata: { role: 'student', academy_id: s.academyId, login_id: loginId },
    user_metadata: { name: r.data.name },
  })
  if (error || !created.user) return { error: errors.createFailed }

  const { error: insErr } = await admin.from('students').insert({
    profile_id: created.user.id, academy_id: s.academyId, level: r.data.level, grade: r.data.grade, seq,
  })
  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id) // 반쪽 계정을 남기지 않는다
    return { error: errors.createFailed }
  }
  revalidatePath('/teacher/students')
  return { issued: { name: r.data.name, loginId, password } }
}

export async function resetStudentPassword(profileId: string): Promise<{ password?: string; error?: string }> {
  const s = await assertTeacher()
  const supabase = await createClient()
  // RLS: 원장은 자기 원 students 만 보이므로 여기서 걸러진다
  const { data: st } = await supabase.from('students').select('profile_id').eq('profile_id', profileId).eq('academy_id', s.academyId).maybeSingle()
  if (!st) return { error: errors.forbidden }
  const password = generatePassword(8)
  const { error } = await createAdminClient().auth.admin.updateUserById(profileId, { password })
  if (error) return { error: errors.createFailed }
  return { password }
}
```

- [ ] **Step 7: 폼(클라이언트)**

```tsx
// app/teacher/students/NewStudentForm.tsx
'use client'
import { useActionState, useState } from 'react'
import { createStudent, type IssuedState } from './actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LEVELS } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.classroom.students

export function NewStudentForm() {
  const [state, action, pending] = useActionState<IssuedState, FormData>(createStudent, undefined)
  const [copied, setCopied] = useState(false)

  async function copyText() {
    if (!state?.issued) return
    await navigator.clipboard.writeText(`${copy.issued.loginId}: ${state.issued.loginId}\n${copy.issued.password}: ${state.issued.password}`)
    setCopied(true)
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.form.heading}</h2>
      {state?.issued ? (
        <div className="mt-3 rounded-xl bg-lemon-100 p-4">
          <p className="font-semibold">{copy.issued.heading}</p>
          <p className="mt-1 text-sm text-ink-700">{copy.issued.body}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm">
            <dt>{copy.issued.loginId}</dt><dd>{state.issued.loginId}</dd>
            <dt>{copy.issued.password}</dt><dd>{state.issued.password}</dd>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" onClick={copyText}>{copied ? copy.issued.copied : copy.issued.copy}</Button>
            <Button type="button" variant="ghost" onClick={() => window.print()}>{app.classroom.print}</Button>
          </div>
        </div>
      ) : null}
      <form action={action} className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">{copy.form.nameLabel}
          <input name="name" required className="rounded-xl border border-ink-300 px-3 py-2 font-normal" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">{copy.form.levelLabel}
            <select name="level" defaultValue="중" className="rounded-xl border border-ink-300 px-3 py-2 font-normal">
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{copy.form.gradeLabel}
            <input name="grade" type="number" min={1} max={6} defaultValue={1} className="rounded-xl border border-ink-300 px-3 py-2 font-normal" />
          </label>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div><Button type="submit" disabled={pending}>{pending ? copy.form.submitting : copy.form.submit}</Button></div>
      </form>
    </Card>
  )
}
```

`app.classroom.print: '인쇄'` 를 `content/site.ts`의 `classroom` 바로 아래(`students` 옆)에 추가한다.

```tsx
// app/teacher/students/ResetPasswordButton.tsx
'use client'
import { useState, useTransition } from 'react'
import { resetStudentPassword } from './actions'
import { app } from '@/content/site'

const copy = app.classroom.students.reset

export function ResetPasswordButton({ profileId }: { profileId: string }) {
  const [result, setResult] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function onClick() {
    if (!window.confirm(copy.confirm)) return
    start(async () => { const r = await resetStudentPassword(profileId); setResult(r.password ?? r.error ?? null) })
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={onClick} disabled={pending} className="text-xs text-ink-500 underline">{copy.button}</button>
      {result && <span className="rounded bg-lemon-100 px-2 py-0.5 font-mono text-xs">{copy.done}: {result}</span>}
    </span>
  )
}
```

- [ ] **Step 8: 페이지**

```tsx
// app/teacher/students/page.tsx
import { createClient } from '@/lib/supabase/server'
import { NewStudentForm } from './NewStudentForm'
import { ResetPasswordButton } from './ResetPasswordButton'
import { app } from '@/content/site'

const copy = app.classroom.students

type Row = { profile_id: string; level: string; grade: number; seq: number; profiles: { name: string; login_id: string | null } | null }

export default async function TeacherStudentsPage() {
  const supabase = await createClient()
  const [{ data: students }, { data: assignments }] = await Promise.all([
    supabase.from('students').select('profile_id, level, grade, seq, profiles(name, login_id)').eq('enrolled', true).order('seq'),
    supabase.from('assignments').select('student_id'),
  ])
  const counts: Record<string, number> = {}
  for (const a of assignments ?? []) counts[a.student_id] = (counts[a.student_id] ?? 0) + 1
  const rows = (students ?? []) as unknown as Row[]

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-100/60 text-left"><tr>
              <th className="p-3">{copy.columns.name}</th><th className="p-3">{copy.columns.grade}</th>
              <th className="p-3">{copy.columns.loginId}</th><th className="p-3">{copy.columns.assignments}</th><th className="p-3">{copy.columns.actions}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profile_id} className="border-t border-ink-100">
                  <td className="p-3 font-semibold">{r.profiles?.name}</td>
                  <td className="p-3">{app.studio.theme.meta(r.level, r.grade)}</td>
                  <td className="p-3 font-mono text-xs">{r.profiles?.login_id}</td>
                  <td className="p-3">{counts[r.profile_id] ?? 0}</td>
                  <td className="p-3"><ResetPasswordButton profileId={r.profile_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-8 text-center text-ink-500">{copy.empty}</p>}
        </div>
        <NewStudentForm />
      </div>
    </>
  )
}
```

- [ ] **Step 9: 타입·문구 스캔·전체 시험**

Run: `npx tsc --noEmit` → 오류 없음. Run: `grep -nP '[가-힣]' app/teacher/students/*.tsx` → 주석 외 없음. Run: `npx vitest run` → 전부 통과.

- [ ] **Step 10: Commit**

```bash
git add lib/students/new-student.ts app/teacher/students content/site.ts tests/new-student.test.ts
git commit -m "feat: 원장 학생 관리 — 등록(아이디·초기 비밀번호)·비밀번호 초기화

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 배정 — 만들기, 현황 목록, 차시 열기

**Files:**
- Create: `lib/classroom/snapshot.ts`, `app/teacher/assignments/new/{page.tsx,actions.ts,AssignForm.tsx}`, `app/teacher/assignments/page.tsx`, `app/teacher/assignments/[setId]/{page.tsx,actions.ts,OpenLessonsControl.tsx}`
- Modify: `app/teacher/items/[setId]/page.tsx` (배정하기 버튼), `content/site.ts` (`app.classroom.assign`, `nav.teacher` 결과 보기 → 배정 현황)

**Interfaces:**
- Consumes: `assignments.open_lessons`(Task 1), `Snapshot`(`lib/studio/publish.ts`)
- Produces: `loadAssignmentSnapshot(supabase, itemSetId, version): Promise<Snapshot | null>`, 액션 `createAssignments(setId, formData)`, `setOpenLessons(setId, openLessons, studentIds?: string[])`. `[setId]/page.tsx`는 Task 7이 `ReviewCard`·`QuizMatrix`를 끼워 넣을 자리(`{/* Task 7 */}`)를 남긴다.

- [ ] **Step 1: 문구 추가** (`app.classroom` 안)

```ts
    assign: {
      button: '배정하기',
      newTitle: '배정하기',
      students: '학생 선택',
      selectAll: '전체 선택',
      alreadyAssigned: '이미 배정됨',
      gradeMismatch: (grade: number) => `세트 학년(${grade}학년)과 다릅니다`,
      dueLabel: '마감일',
      retryLabel: '재도전 허용',
      openLabel: '처음 열 차시 수',
      submit: '배정',
      submitting: '배정 중…',
      listTitle: '배정 현황',
      listEmpty: '아직 배정한 세트가 없습니다. 문항 찾기에서 세트를 열고 [배정하기]를 누르세요.',
      card: {
        students: (n: number) => `학생 ${n}명`,
        open: (n: number) => `${n}차시까지 열림`,
        pending: (n: number) => `검수 대기 ${n}건`,
        due: (d: string) => `마감 ${d}`,
        openButton: '열기',
      },
      detail: {
        backToList: '← 배정 현황으로',
        openLessons: '차시 열기',
        openTo: (n: number) => `${n}차시까지 열기`,
        applyAll: '반 전체에 적용',
        saved: '저장했습니다',
      },
      errors: {
        noStudents: '학생을 한 명 이상 고르세요.',
        setNotFound: '게시된 세트를 찾을 수 없습니다.',
        saveFailed: '저장하지 못했습니다. 다시 시도하세요.',
        invalidLessons: '차시 수가 올바르지 않습니다.',
      },
    },
```

`app.nav.teacher`의 `{ href: '/teacher/results', label: '결과 보기' }`를 `{ href: '/teacher/assignments', label: '배정 현황' }`으로 바꾼다.

- [ ] **Step 2: 스냅샷 로더**

```ts
// lib/classroom/snapshot.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from '@/lib/studio/publish'

/** 배정이 묶인 판의 스냅샷. RLS: item_set_versions 는 게시된 세트만 authenticated 에게 열려 있다. */
export async function loadAssignmentSnapshot(supabase: SupabaseClient, itemSetId: string, version: number): Promise<Snapshot | null> {
  const { data } = await supabase.from('item_set_versions').select('snapshot').eq('item_set_id', itemSetId).eq('version', version).maybeSingle()
  return (data?.snapshot as Snapshot | undefined) ?? null
}

/** 게시된 최신 판 번호. 배정 생성 때 쓴다. */
export async function latestPublishedVersion(supabase: SupabaseClient, itemSetId: string): Promise<number | null> {
  const { data } = await supabase.from('item_set_versions').select('version').eq('item_set_id', itemSetId).order('version', { ascending: false }).limit(1).maybeSingle()
  return data?.version ?? null
}
```

- [ ] **Step 3: 배정 액션**

```ts
// app/teacher/assignments/new/actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { latestPublishedVersion } from '@/lib/classroom/snapshot'
import { app } from '@/content/site'

const errors = app.classroom.assign.errors

export type AssignState = { error?: string } | undefined

export async function createAssignments(setId: string, _prev: AssignState, formData: FormData): Promise<AssignState> {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  const studentIds = formData.getAll('student').map(String).filter(Boolean)
  if (studentIds.length === 0) return { error: errors.noStudents }
  const openLessons = Number.parseInt(String(formData.get('open_lessons') ?? '1'), 10)
  if (!Number.isInteger(openLessons) || openLessons < 1 || openLessons > 8) return { error: errors.invalidLessons }
  const dueRaw = String(formData.get('due_at') ?? '')
  const dueAt = dueRaw ? new Date(`${dueRaw}T23:59:59+09:00`).toISOString() : null
  const allowRetry = formData.get('allow_retry') === 'on'

  const supabase = await createClient()
  const version = await latestPublishedVersion(supabase, setId)
  if (version === null) return { error: errors.setNotFound }

  // RLS(teacher_rw_assignments)가 academy_id 를 검사한다. 학생이 이 원 소속인지도 확인한다.
  const { data: own } = await supabase.from('students').select('profile_id').in('profile_id', studentIds).eq('academy_id', s.academyId)
  const ownIds = new Set((own ?? []).map((r) => r.profile_id))
  const rows = studentIds.filter((id) => ownIds.has(id)).map((studentId) => ({
    item_set_id: setId, item_set_version: version, academy_id: s.academyId, student_id: studentId,
    assigned_by: s.userId, due_at: dueAt, allow_retry: allowRetry, open_lessons: openLessons,
  }))
  if (rows.length === 0) return { error: errors.noStudents }
  // 이미 배정된 학생은 unique index 로 막힌다 → upsert ignoreDuplicates 로 조용히 건너뛴다
  const { error } = await supabase.from('assignments').upsert(rows, { onConflict: 'student_id,item_set_id', ignoreDuplicates: true })
  if (error) return { error: errors.saveFailed }
  redirect(`/teacher/assignments/${setId}`)
}
```

- [ ] **Step 4: 배정 폼과 페이지**

```tsx
// app/teacher/assignments/new/AssignForm.tsx
'use client'
import { useActionState } from 'react'
import { createAssignments, type AssignState } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'

const copy = app.classroom.assign
export type StudentOption = { id: string; name: string; grade: number; assigned: boolean }

export function AssignForm({ setId, setGrade, students, maxLessons }: { setId: string; setGrade: number; students: StudentOption[]; maxLessons: number }) {
  const bound = createAssignments.bind(null, setId)
  const [state, action, pending] = useActionState<AssignState, FormData>(bound, undefined)
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="rounded-2xl bg-white p-4">
        <legend className="px-1 text-sm font-semibold">{copy.students}</legend>
        <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" onChange={(e) => {
          document.querySelectorAll<HTMLInputElement>('input[name=student]:not(:disabled)').forEach((el) => { el.checked = e.target.checked })
        }} />{copy.selectAll}</label>
        <ul className="grid gap-1 sm:grid-cols-2">
          {students.map((st) => (
            <li key={st.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="student" value={st.id} disabled={st.assigned} />
              <span className={st.assigned ? 'text-ink-500' : ''}>{st.name}</span>
              {st.assigned && <Badge tone="gray">{copy.alreadyAssigned}</Badge>}
              {!st.assigned && st.grade !== setGrade && <Badge tone="lemon">{copy.gradeMismatch(setGrade)}</Badge>}
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{copy.dueLabel}<input type="date" name="due_at" className="rounded-xl border border-ink-300 px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">{copy.openLabel}
          <input type="number" name="open_lessons" min={1} max={maxLessons} defaultValue={1} className="rounded-xl border border-ink-300 px-3 py-2 font-normal" /></label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input type="checkbox" name="allow_retry" defaultChecked />{copy.retryLabel}</label>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div><Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button></div>
    </form>
  )
}
```

```tsx
// app/teacher/assignments/new/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { latestPublishedVersion, loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { AssignForm, type StudentOption } from './AssignForm'
import { app } from '@/content/site'

const copy = app.classroom.assign

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { set: setId } = await searchParams
  if (!setId) notFound()
  const s = await getSessionProfile()
  const supabase = await createClient()
  const version = await latestPublishedVersion(supabase, setId)
  if (version === null) notFound()
  const snapshot = await loadAssignmentSnapshot(supabase, setId, version)
  if (!snapshot) notFound()

  const [{ data: students }, { data: assigned }] = await Promise.all([
    supabase.from('students').select('profile_id, grade, profiles(name)').eq('academy_id', s.academyId!).eq('enrolled', true).order('seq'),
    supabase.from('assignments').select('student_id').eq('item_set_id', setId),
  ])
  const assignedIds = new Set((assigned ?? []).map((a) => a.student_id))
  const options: StudentOption[] = (students ?? []).map((st) => ({
    id: st.profile_id, grade: st.grade, assigned: assignedIds.has(st.profile_id),
    name: (st.profiles as unknown as { name: string } | null)?.name ?? '',
  }))

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.newTitle}</h1>
      <p className="mt-1 text-ink-500">{snapshot.cover.title} · {snapshot.cover.subject} · {app.teacherItems.card.versionLabel(version)}</p>
      <div className="mt-6"><AssignForm setId={setId} setGrade={snapshot.cover.grade} students={options} maxLessons={snapshot.lessons.length} /></div>
    </>
  )
}
```

- [ ] **Step 5: 문항 미리보기에 배정하기 버튼** — `app/teacher/items/[setId]/page.tsx`의 `<Link …backToList>` 아래에:

```tsx
      <div className="mt-3"><Button href={`/teacher/assignments/new?set=${setId}`}>{app.classroom.assign.button}</Button></div>
```
(`import { Button } from '@/components/ui/Button'` 추가)

- [ ] **Step 6: 배정 현황 목록**

```tsx
// app/teacher/assignments/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.assign

type Row = { item_set_id: string; item_set_version: number; open_lessons: number; due_at: string | null; item_sets: { subject: string; themes: { title: string } | null } | null }

export default async function TeacherAssignmentsPage() {
  const supabase = await createClient()
  const [{ data: rows }, { data: pending }] = await Promise.all([
    supabase.from('assignments').select('item_set_id, item_set_version, open_lessons, due_at, item_sets(subject, themes(title))').order('created_at', { ascending: false }),
    supabase.from('gradings').select('answer_id, answers(assignment_id, assignments(item_set_id))').eq('status', 'drafted'),
  ])
  const pendingBySet: Record<string, number> = {}
  for (const g of pending ?? []) {
    const setId = (g.answers as unknown as { assignments: { item_set_id: string } | null } | null)?.assignments?.item_set_id
    if (setId) pendingBySet[setId] = (pendingBySet[setId] ?? 0) + 1
  }
  const groups = new Map<string, { row: Row; count: number; minOpen: number }>()
  for (const r of (rows ?? []) as unknown as Row[]) {
    const g = groups.get(r.item_set_id)
    if (g) { g.count += 1; g.minOpen = Math.min(g.minOpen, r.open_lessons) } else groups.set(r.item_set_id, { row: r, count: 1, minOpen: r.open_lessons })
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.values()].map(({ row, count, minOpen }) => (
          <Card key={row.item_set_id}>
            <p className="font-bold">{row.item_sets?.themes?.title}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge tone="gray">{row.item_sets?.subject}</Badge>
              <Badge tone="gray">{app.teacherItems.card.versionLabel(row.item_set_version)}</Badge>
              {pendingBySet[row.item_set_id] ? <Badge tone="lemon">{copy.card.pending(pendingBySet[row.item_set_id])}</Badge> : null}
            </div>
            <p className="mt-2 text-sm text-ink-500">{copy.card.students(count)} · {copy.card.open(minOpen)}{row.due_at ? ` · ${copy.card.due(row.due_at.slice(0, 10))}` : ''}</p>
            <div className="mt-3"><Button href={`/teacher/assignments/${row.item_set_id}`} variant="ghost">{copy.card.openButton}</Button></div>
          </Card>
        ))}
      </div>
      {groups.size === 0 && <p className="mt-8 text-center text-ink-500">{copy.listEmpty} <Link href="/teacher/items" className="underline">{app.teacherItems.title}</Link></p>}
    </>
  )
}
```

- [ ] **Step 7: 세트별 상세 — 차시 열기 액션과 컨트롤**

```ts
// app/teacher/assignments/[setId]/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'

const errors = app.classroom.assign.errors
export type ActionResult = { ok: true } | { ok: false; error: string }

async function assertTeacher() {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  return { ...s, academyId: s.academyId }
}

/** 반 전체(studentIds 생략) 또는 지정 학생의 열린 차시 수를 바꾼다. RLS 가 academy 를 검사한다. */
export async function setOpenLessons(setId: string, openLessons: number, studentIds?: string[]): Promise<ActionResult> {
  await assertTeacher()
  if (!Number.isInteger(openLessons) || openLessons < 1 || openLessons > 8) return { ok: false, error: errors.invalidLessons }
  const supabase = await createClient()
  let q = supabase.from('assignments').update({ open_lessons: openLessons }).eq('item_set_id', setId)
  if (studentIds?.length) q = q.in('student_id', studentIds)
  const { error } = await q
  if (error) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/teacher/assignments/${setId}`)
  return { ok: true }
}
```

```tsx
// app/teacher/assignments/[setId]/OpenLessonsControl.tsx
'use client'
import { useState, useTransition } from 'react'
import { setOpenLessons } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.assign.detail

export function OpenLessonsControl({ setId, current, maxLessons }: { setId: string; current: number; maxLessons: number }) {
  const [value, setValue] = useState(current)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4">
      <span className="text-sm font-semibold">{copy.openLessons}</span>
      <select value={value} onChange={(e) => setValue(Number(e.target.value))} className="rounded-xl border border-ink-300 px-3 py-2 text-sm">
        {Array.from({ length: maxLessons }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{copy.openTo(n)}</option>)}
      </select>
      <Button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await setOpenLessons(setId, value); setMsg(r.ok ? copy.saved : r.error)
      })}>{copy.applyAll}</Button>
      {msg && <span className="text-sm text-ink-500">{msg}</span>}
    </div>
  )
}
```

```tsx
// app/teacher/assignments/[setId]/page.tsx  (Task 7 이 QuizMatrix·ReviewCard 를 끼워 넣는다)
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { OpenLessonsControl } from './OpenLessonsControl'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'
import type { AssignmentRow } from '@/lib/classroom/types'

const copy = app.classroom.assign

type Row = AssignmentRow & { profiles: { name: string } | null }

export default async function AssignmentSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('*, profiles!assignments_student_id_fkey(name)').eq('item_set_id', setId).order('created_at')
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) notFound()
  const snapshot = await loadAssignmentSnapshot(supabase, setId, rows[0].item_set_version)
  if (!snapshot) notFound()
  const minOpen = Math.min(...rows.map((r) => r.open_lessons))

  return (
    <>
      <Link href="/teacher/assignments" className="text-sm text-mint-700 underline">{copy.detail.backToList}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
        <Badge tone="gray">{snapshot.cover.subject}</Badge>
        <Badge tone="gray">{app.teacherItems.card.versionLabel(snapshot.cover.version)}</Badge>
      </div>
      <div className="mt-4"><OpenLessonsControl setId={setId} current={minOpen} maxLessons={snapshot.lessons.length} /></div>
      {/* Task 7: <QuizMatrix …/> 와 학생별 <ReviewCard …/> */}
    </>
  )
}
```

`profiles!assignments_student_id_fkey(name)`: `assignments.student_id → students(profile_id)`이므로 PostgREST 가 `profiles`로 곧장 조인하지 못하면 `students!inner(profile_id, profiles(name))`로 바꾼다. 구현자는 Supabase 대시보드 없이 확인할 수 없으므로 두 형태 중 타입이 통과하는 쪽을 쓰고, 보고서에 어느 쪽을 썼는지 적는다.

- [ ] **Step 8: 타입·문구·시험** — `npx tsc --noEmit`, 한글 스캔, `npx vitest run` 통과.

- [ ] **Step 9: Commit**

```bash
git add lib/classroom/snapshot.ts app/teacher/assignments "app/teacher/items/[setId]/page.tsx" content/site.ts
git commit -m "feat: 배정 만들기·현황·차시 열기

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 학생 화면 — 과제 목록, 차시 탭, 퀴즈 제출, 답안 임시저장·제출

**Files:**
- Create: `app/student/assignments/[id]/{page.tsx,actions.ts,LessonTabs.tsx,QuizForm.tsx,AnswerEditor.tsx}`
- Modify: `app/student/page.tsx`, `content/site.ts` (`app.classroom.student`)

**Interfaces:**
- Consumes: `judgeQuiz`, `assessmentItemNoForLesson`, `isLessonOpen`(Task 2), `loadAssignmentSnapshot`(Task 4)
- Produces: 액션 `submitQuiz(assignmentId, lessonNo, responses: string[])`, `saveDraft(assignmentId, itemNo, attempt, body)`, `submitAnswer(assignmentId, itemNo, attempt)` → `{ ok: true; gradingId: string } | { ok: false; error }`. Task 6 의 라우트를 `submitAnswer` 성공 뒤 클라이언트가 `fetch('/api/classroom/gradings/<id>/run', { method: 'POST' })` 로 부른다(Task 6 에서 라우트 생성; 이 Task 에서는 호출만 넣고 404 여도 화면은 "확인 중" 상태로 남는다).

- [ ] **Step 1: 문구 추가** (`app.classroom` 안)

```ts
    student: {
      listTitle: '내 과제',
      empty: '아직 배정된 과제가 없어요.',
      card: {
        due: (d: string) => `마감 ${d}`,
        progress: (open: number, quizDone: number, quizTotal: number, answerDone: number, answerTotal: number) =>
          `${open}차시까지 열림 · 퀴즈 ${quizDone}/${quizTotal} · 답안 ${answerDone}/${answerTotal}`,
        todo: '할 일 있음', reviewing: '선생님 확인 중', done: '결과 나옴', open: '열기',
      },
      lessonTab: (n: number) => `${n}차시`,
      locked: '아직 열리지 않았어요',
      keyQuestion: '이 시간의 질문',
      materials: '자료',
      quiz: {
        heading: '마무리 퀴즈',
        submit: '제출',
        submitted: (correct: number, total: number) => `${total}문항 중 ${correct}개 정답`,
        answerLabel: '정답', explanationLabel: '해설', yourAnswer: '내 답',
        shortPlaceholder: '답을 쓰세요',
      },
      answer: {
        heading: (label: string, points: number) => `${label} (${points}점)`,
        conditions: '조건',
        chars: (n: number) => `${n}자`,
        saving: '저장 중…', saved: '임시저장됨',
        submit: '제출', confirm: '제출하면 고칠 수 없어요. 제출할까요?',
        submitted: '제출했어요. 선생님이 확인 중이에요.',
        tooShort: '조금 더 써 보세요. 조건을 다시 읽어 보세요. (50자 이상)',
        placeholder: '여기에 답안을 쓰세요',
      },
      errors: { notOpen: '아직 열리지 않은 차시예요.', alreadySubmitted: '이미 제출했어요.', saveFailed: '저장하지 못했어요. 다시 시도해 주세요.' },
    },
```

- [ ] **Step 2: 학생 액션**

```ts
// app/student/assignments/[id]/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { judgeQuiz } from '@/lib/classroom/quiz'
import { isLessonOpen } from '@/lib/classroom/lessons'
import { app } from '@/content/site'

const errors = app.classroom.student.errors
const MIN_ANSWER_CHARS = 50

async function loadOwnAssignment(assignmentId: string) {
  const s = await getSessionProfile()
  if (s.role !== 'student') throw new Error('forbidden')
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('*').eq('id', assignmentId).eq('student_id', s.userId).maybeSingle()
  if (!a) throw new Error('forbidden')
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  if (!snapshot) throw new Error('snapshot missing')
  return { s, supabase, a, snapshot }
}

export type QuizResult = { ok: true; results: { correct: boolean; answer: string; explanation: string }[] } | { ok: false; error: string }

export async function submitQuiz(assignmentId: string, lessonNo: number, responses: string[]): Promise<QuizResult> {
  const { supabase, a, snapshot } = await loadOwnAssignment(assignmentId)
  if (!isLessonOpen(a.open_lessons, lessonNo) || a.closed) return { ok: false, error: errors.notOpen }
  const lesson = snapshot.lessons.find((l) => l.no === lessonNo)
  if (!lesson || lesson.quiz.length === 0) return { ok: false, error: errors.notOpen }
  const { count } = await supabase.from('quiz_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', assignmentId).eq('lesson_no', lessonNo)
  if ((count ?? 0) > 0) return { ok: false, error: errors.alreadySubmitted }

  const rows = lesson.quiz.map((q, i) => ({
    assignment_id: assignmentId, lesson_no: lessonNo, quiz_no: i + 1,
    response: responses[i] ?? '', correct: judgeQuiz(q, responses[i] ?? ''), source: 'student' as const,
  }))
  const { error } = await supabase.from('quiz_responses').insert(rows)
  if (error) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/student/assignments/${assignmentId}`)
  return { ok: true, results: rows.map((r, i) => ({ correct: r.correct, answer: lesson.quiz[i].answer, explanation: lesson.quiz[i].explanation })) }
}

export async function saveDraft(assignmentId: string, itemNo: number, attempt: number, body: string): Promise<{ ok: boolean }> {
  const { s, supabase, a } = await loadOwnAssignment(assignmentId)
  if (a.closed) return { ok: false }
  const { error } = await supabase.from('answers').upsert(
    { assignment_id: assignmentId, item_no: itemNo, attempt, body, source: 'student', entered_by: s.userId, saved_at: new Date().toISOString() },
    { onConflict: 'assignment_id,item_no,attempt' },
  )
  return { ok: !error }
}

export type SubmitResult = { ok: true; gradingId: string } | { ok: false; error: string }

/** 50자 미만은 submitted_at 을 찍지 않고 돌려보낸다(스펙 §5.2). 성공하면 gradings(pending) 줄을 만들고 id 를 돌려준다. */
export async function submitAnswer(assignmentId: string, itemNo: number, attempt: number): Promise<SubmitResult> {
  const { supabase, a } = await loadOwnAssignment(assignmentId)
  const { data: ans } = await supabase.from('answers').select('id, body, submitted_at').eq('assignment_id', assignmentId).eq('item_no', itemNo).eq('attempt', attempt).maybeSingle()
  if (!ans) return { ok: false, error: errors.saveFailed }
  if (ans.submitted_at) return { ok: false, error: errors.alreadySubmitted }
  if (ans.body.trim().length < MIN_ANSWER_CHARS) return { ok: false, error: app.classroom.student.answer.tooShort }
  const { error } = await supabase.from('answers').update({ submitted_at: new Date().toISOString() }).eq('id', ans.id)
  if (error) return { ok: false, error: errors.saveFailed }
  // gradings 는 학생 정책이 없으므로 service role 로 만든다
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data: g, error: gErr } = await createAdminClient().from('gradings').insert({ answer_id: ans.id, academy_id: a.academy_id, status: 'pending' }).select('id').single()
  if (gErr || !g) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/student/assignments/${assignmentId}`)
  return { ok: true, gradingId: g.id }
}
```

- [ ] **Step 3: 퀴즈 폼(클라이언트)**

```tsx
// app/student/assignments/[id]/QuizForm.tsx
'use client'
import { useState, useTransition } from 'react'
import { submitQuiz, type QuizResult } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.quiz
type Quiz = { q: string; type: 'choice' | 'short'; choices: string[] | null; answer: string; explanation: string }
type Done = { response: string; correct: boolean }

export function QuizForm({ assignmentId, lessonNo, quiz, done }: { assignmentId: string; lessonNo: number; quiz: Quiz[]; done: Done[] | null }) {
  const [responses, setResponses] = useState<string[]>(quiz.map(() => ''))
  const [result, setResult] = useState<QuizResult | null>(null)
  const [pending, start] = useTransition()
  const submitted = done ?? (result?.ok ? result.results.map((r, i) => ({ response: responses[i], correct: r.correct })) : null)

  return (
    <section className="rounded-2xl bg-white p-5">
      <h3 className="text-lg font-bold">{copy.heading}</h3>
      <ol className="mt-3 space-y-4">
        {quiz.map((q, i) => (
          <li key={i}>
            <p className="font-semibold">{i + 1}. {q.q}</p>
            {submitted ? (
              <div className={`mt-2 rounded-xl p-3 ${submitted[i].correct ? 'bg-mint-100' : 'bg-red-50'}`}>
                <p>{copy.yourAnswer}: {submitted[i].response || '—'}</p>
                <p>{copy.answerLabel}: {q.answer}</p>
                <p className="text-sm text-ink-700">{copy.explanationLabel}: {q.explanation}</p>
              </div>
            ) : q.type === 'choice' ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(q.choices ?? []).map((c) => (
                  <button key={c} type="button" onClick={() => setResponses((r) => r.map((x, j) => (j === i ? c : x)))}
                    className={`rounded-xl border px-4 py-3 text-left ${responses[i] === c ? 'border-mint-500 bg-mint-50' : 'border-ink-100'}`}>{c}</button>
                ))}
              </div>
            ) : (
              <input value={responses[i]} onChange={(e) => setResponses((r) => r.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={copy.shortPlaceholder} className="mt-2 w-full rounded-xl border border-ink-300 px-4 py-3" />
            )}
          </li>
        ))}
      </ol>
      {submitted ? (
        <p className="mt-4 font-semibold">{copy.submitted(submitted.filter((d) => d.correct).length, quiz.length)}</p>
      ) : (
        <div className="mt-4">
          <Button type="button" disabled={pending || responses.some((r) => !r.trim())} onClick={() => start(async () => setResult(await submitQuiz(assignmentId, lessonNo, responses)))}>{copy.submit}</Button>
          {result && !result.ok && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: 답안 편집기(클라이언트, 자동 임시저장)**

```tsx
// app/student/assignments/[id]/AnswerEditor.tsx
'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { saveDraft, submitAnswer } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.answer
const AUTOSAVE_MS = 30000

export function AnswerEditor({ assignmentId, itemNo, attempt, initialBody, submitted, label, points, conditions }: {
  assignmentId: string; itemNo: number; attempt: number; initialBody: string; submitted: boolean
  label: string; points: number; conditions: { length: string; required: string[]; format: string }
}) {
  const [body, setBody] = useState(initialBody)
  const [status, setStatus] = useState<string | null>(null)
  const [isSubmitted, setSubmitted] = useState(submitted)
  const [pending, start] = useTransition()
  const dirty = useRef(false)

  async function persist() {
    if (!dirty.current || isSubmitted) return
    setStatus(copy.saving)
    const r = await saveDraft(assignmentId, itemNo, attempt, body)
    dirty.current = !r.ok
    setStatus(r.ok ? copy.saved : app.classroom.student.errors.saveFailed)
  }
  useEffect(() => { const t = setInterval(persist, AUTOSAVE_MS); return () => clearInterval(t) })

  function onSubmit() {
    if (!window.confirm(copy.confirm)) return
    start(async () => {
      await persist()
      const r = await submitAnswer(assignmentId, itemNo, attempt)
      if (!r.ok) { setStatus(r.error); return }
      setSubmitted(true); setStatus(copy.submitted)
      // 채점 실행(Task 6 라우트). 실패해도 화면은 "확인 중" — 원장이 [다시 채점] 할 수 있다.
      fetch(`/api/classroom/gradings/${r.gradingId}/run`, { method: 'POST' }).catch(() => {})
    })
  }

  return (
    <section className="rounded-2xl bg-white p-5">
      <h3 className="text-lg font-bold">{copy.heading(label, points)}</h3>
      <div className="mt-2 rounded-xl bg-ink-100/60 p-3 text-sm">
        <p className="font-semibold">{copy.conditions}</p>
        <ul className="list-disc pl-5"><li>{conditions.length}</li>{conditions.required.map((c, i) => <li key={i}>{c}</li>)}<li>{conditions.format}</li></ul>
      </div>
      <textarea value={body} readOnly={isSubmitted} placeholder={copy.placeholder} rows={10}
        onChange={(e) => { setBody(e.target.value); dirty.current = true }} onBlur={persist}
        className="mt-3 w-full rounded-xl border border-ink-300 p-4 text-lg leading-relaxed read-only:bg-ink-100/40" />
      <div className="mt-2 flex items-center justify-between text-sm text-ink-500">
        <span>{copy.chars(body.length)}</span><span>{status}</span>
      </div>
      {!isSubmitted && <div className="mt-3"><Button type="button" disabled={pending} onClick={onSubmit}>{copy.submit}</Button></div>}
    </section>
  )
}
```

- [ ] **Step 5: 차시 탭과 과제 페이지**

```tsx
// app/student/assignments/[id]/LessonTabs.tsx
'use client'
import { useState, type ReactNode } from 'react'
import { app } from '@/content/site'

const copy = app.classroom.student

export function LessonTabs({ lessons, openLessons, initial, render }: { lessons: number[]; openLessons: number; initial: number; render: (no: number) => ReactNode }) {
  const [active, setActive] = useState(initial)
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {lessons.map((n) => {
          const open = n <= openLessons
          return (
            <button key={n} type="button" disabled={!open} onClick={() => setActive(n)} title={open ? undefined : copy.locked}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${active === n ? 'bg-ink-900 text-white' : open ? 'bg-ink-100 text-ink-700' : 'bg-ink-100/50 text-ink-500'}`}>
              {copy.lessonTab(n)}{open ? '' : ' 🔒'}
            </button>
          )
        })}
      </div>
      <div className="mt-4">{render(active)}</div>
    </div>
  )
}
```

```tsx
// app/student/assignments/[id]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { assessmentItemNoForLesson, ASSESSMENT_LABELS } from '@/lib/classroom/lessons'
import { LessonTabs } from './LessonTabs'
import { QuizForm } from './QuizForm'
import { AnswerEditor } from './AnswerEditor'
import { app } from '@/content/site'
import type { AnswerRow, AssignmentRow, QuizResponseRow } from '@/lib/classroom/types'

const copy = app.classroom.student

export default async function StudentAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await getSessionProfile()
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('*').eq('id', id).eq('student_id', s.userId).maybeSingle()
  if (!a) notFound()
  const assignment = a as AssignmentRow
  const snapshot = await loadAssignmentSnapshot(supabase, assignment.item_set_id, assignment.item_set_version)
  if (!snapshot) notFound()
  const [{ data: quiz }, { data: answers }] = await Promise.all([
    supabase.from('quiz_responses').select('*').eq('assignment_id', id),
    supabase.from('answers').select('*').eq('assignment_id', id),
  ])
  const quizRows = (quiz ?? []) as QuizResponseRow[]
  const answerRows = (answers ?? []) as AnswerRow[]
  const lessonNos = snapshot.lessons.map((l) => l.no)

  return (
    <>
      <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
      <p className="text-ink-500">{snapshot.cover.subject} · {snapshot.key_question}</p>
      <div className="mt-6">
        <LessonTabs lessons={lessonNos} openLessons={assignment.open_lessons} initial={Math.min(assignment.open_lessons, lessonNos.length)} render={(no) => {
          const lesson = snapshot.lessons.find((l) => l.no === no)!
          const done = quizRows.filter((q) => q.lesson_no === no).sort((x, y) => x.quiz_no - y.quiz_no)
          const itemNo = assessmentItemNoForLesson(snapshot, no)
          const item = itemNo ? snapshot.assessment?.items[itemNo - 1] : null
          const ans1 = itemNo ? answerRows.find((r) => r.item_no === itemNo && r.attempt === 1) : null
          return (
            <div className="space-y-5">
              <section className="rounded-2xl bg-white p-5">
                <p className="text-sm font-semibold text-ink-500">{copy.keyQuestion}</p>
                <p className="mt-1 text-xl font-bold">{lesson.key_question}</p>
                <p className="mt-2">{lesson.goal}</p>
              </section>
              {lesson.quiz.length > 0 && (
                <QuizForm assignmentId={id} lessonNo={no} quiz={lesson.quiz} done={done.length ? done.map((d) => ({ response: d.response, correct: d.correct })) : null} />
              )}
              {item && itemNo && (
                <AnswerEditor assignmentId={id} itemNo={itemNo} attempt={1} initialBody={ans1?.body ?? ''} submitted={!!ans1?.submitted_at}
                  label={ASSESSMENT_LABELS[itemNo - 1]} points={item.points} conditions={item.conditions} />
              )}
              {/* Task 8: <ResultView …/> 와 <RetryButton …/> */}
            </div>
          )
        }} />
      </div>
    </>
  )
}
```

- [ ] **Step 6: 학생 과제 목록** (`app/student/page.tsx` 교체)

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student

type Row = { id: string; open_lessons: number; due_at: string | null; item_set_id: string; item_set_version: number; item_sets: { subject: string; themes: { title: string } | null } | null }

export default async function StudentHome() {
  const s = await getSessionProfile()
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('id, open_lessons, due_at, item_set_id, item_set_version, item_sets(subject, themes(title))').eq('student_id', s.userId).order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as Row[]
  const ids = rows.map((r) => r.id)
  const [{ data: quiz }, { data: answers }, { data: results }] = await Promise.all([
    supabase.from('quiz_responses').select('assignment_id, lesson_no').in('assignment_id', ids),
    supabase.from('answers').select('assignment_id, submitted_at').in('assignment_id', ids),
    supabase.from('student_gradings').select('answer_id, status'),
  ])
  const quizDone = (aid: string) => new Set((quiz ?? []).filter((q) => q.assignment_id === aid).map((q) => q.lesson_no)).size
  const answerDone = (aid: string) => (answers ?? []).filter((x) => x.assignment_id === aid && x.submitted_at).length
  const confirmedCount = (results ?? []).length

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const submitted = answerDone(r.id)
          const badge = confirmedCount > 0 ? copy.card.done : submitted > 0 ? copy.card.reviewing : copy.card.todo
          return (
            <Card key={r.id}>
              <p className="text-lg font-bold">{r.item_sets?.themes?.title}</p>
              <div className="mt-1 flex gap-1"><Badge tone="gray">{r.item_sets?.subject}</Badge><Badge tone="lemon">{badge}</Badge></div>
              <p className="mt-2 text-sm text-ink-500">{copy.card.progress(r.open_lessons, quizDone(r.id), r.open_lessons, submitted, 3)}{r.due_at ? ` · ${copy.card.due(r.due_at.slice(0, 10))}` : ''}</p>
              <div className="mt-3"><Button href={`/student/assignments/${r.id}`}>{copy.card.open}</Button></div>
            </Card>
          )
        })}
      </div>
      {rows.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}
    </>
  )
}
```

- [ ] **Step 7: 타입·문구·시험** — `npx tsc --noEmit`, `grep -nP '[가-힣]' app/student -r --include=*.tsx`(주석·🔒 외 없음), `npx vitest run`.

- [ ] **Step 8: Commit**

```bash
git add app/student content/site.ts
git commit -m "feat: 학생 화면 — 과제 목록·차시 탭·퀴즈 제출·답안 임시저장·제출

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: AI 채점 — 스키마·프롬프트·실행기·라우트·fixture

**Files:**
- Create: `lib/classroom/grading-schema.ts`, `lib/classroom/grading-prompt.ts`, `lib/classroom/grade.ts`, `app/api/classroom/gradings/[id]/run/route.ts`, `data/studio-fixtures/grading-서술형.json`, `data/studio-fixtures/grading-논술형.json`
- Modify: `lib/ai/claude.ts` (`CallInput.role`에 `'grade'` 허용 — `MODELS.grade`는 이미 있음)
- Test: `tests/grading-schema.test.ts`, `tests/grading-prompt.test.ts`, `tests/grading-run.test.ts`

**Interfaces:**
- Consumes: `callStructured`, `isMock`(`lib/ai/claude.ts`), `Snapshot`, `GradingDraft`(Task 2)
- Produces: `GradingDraftSchema`(zod), `buildGradingPrompt({ snapshot, itemNo, studentGrade, answer }): { system: string[]; user: string; fixtureKey: string }`, `runGrading({ gradingId, db }): Promise<GradingRow['status']>` — `db`는 service-role 클라이언트. 라우트 `POST /api/classroom/gradings/[id]/run` → `{ status }`.

- [ ] **Step 1: `lib/ai/claude.ts` 역할 확장** — `role: 'generate' | 'review'`를 `role: keyof typeof MODELS`로 바꾼다(두 곳: `CallInput`, `LogEntry` 사용처는 그대로).

- [ ] **Step 2: 스키마 실패 테스트**

```ts
// tests/grading-schema.test.ts
import { describe, it, expect } from 'vitest'
import { GradingDraftSchema } from '@/lib/classroom/grading-schema'

const good = {
  criteria: [{ name: '수치 인용의 정확성', points: 2, max: 3, evidence: '올해 플라스틱컵이 405개로', note: '작년 비교 없음' }],
  score: 2,
  strengths: ['자료 B에서 올해 수치를 정확히 골라 썼습니다.'],
  improvements: ['작년 290개에서 올해 405개로 115개 늘었다처럼 두 해를 함께 쓰면 3점 기준을 채웁니다.'],
}

describe('GradingDraftSchema', () => {
  it('accepts a well-formed draft', () => { expect(GradingDraftSchema.safeParse(good).success).toBe(true) })
  it('rejects score that is not the sum of criteria points', () => {
    expect(GradingDraftSchema.safeParse({ ...good, score: 3 }).success).toBe(false)
  })
  it('rejects points over max and empty evidence', () => {
    expect(GradingDraftSchema.safeParse({ ...good, criteria: [{ ...good.criteria[0], points: 4 }], score: 4 }).success).toBe(false)
    expect(GradingDraftSchema.safeParse({ ...good, criteria: [{ ...good.criteria[0], evidence: '' }] }).success).toBe(false)
  })
  it('requires 1~3 strengths and improvements', () => {
    expect(GradingDraftSchema.safeParse({ ...good, strengths: [] }).success).toBe(false)
  })
})
```

- [ ] **Step 3: 스키마 구현**

```ts
// lib/classroom/grading-schema.ts
import { z } from 'zod'

export const CriterionSchema = z.object({
  name: z.string().min(1),
  points: z.number().int().min(0),
  max: z.number().int().min(1),
  evidence: z.string().min(1),   // 답안에서 인용한 근거 문장
  note: z.string(),
}).refine((c) => c.points <= c.max, { message: 'points > max' })

export const GradingDraftSchema = z.object({
  criteria: z.array(CriterionSchema).min(1).max(4),
  score: z.number().int().min(0),
  strengths: z.array(z.string().min(5)).min(1).max(3),
  improvements: z.array(z.string().min(5)).min(1).max(3),
}).refine((d) => d.score === d.criteria.reduce((s, c) => s + c.points, 0), { message: 'score must equal the sum of criteria points' })

export type GradingDraftOut = z.infer<typeof GradingDraftSchema>
```

- [ ] **Step 4: 프롬프트 실패 테스트**

```ts
// tests/grading-prompt.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildGradingPrompt, GRADING_RULES } from '@/lib/classroom/grading-prompt'
import type { Snapshot } from '@/lib/studio/publish'

// 수학 fixture 로 스냅샷을 조립한다(5단계 평가 = stage5-generate.json)
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '',
  learning_goals: [], key_question: '', lessons: [], materials: [], assessment, teacher_guide: null, generated_with: { models: [] } } as unknown as Snapshot

describe('buildGradingPrompt', () => {
  it('puts the fixed rules first (cacheable) and the item/rubric/answer in user', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: '올해 플라스틱컵이 405개로 가장 많이 늘었다.' })
    expect(p.system[0]).toBe(GRADING_RULES)
    expect(p.user).toContain(assessment.items[0].stem)
    expect(p.user).toContain('올해 플라스틱컵이 405개로')
    expect(p.user).toContain('1학년')
    expect(p.fixtureKey).toBe('grading-서술형')
  })
  it('uses the extended rubric and 논술형 fixture for item 3', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 3, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.fixtureKey).toBe('grading-논술형')
    expect(p.user).toContain(assessment.items[2].rubric.criteria[0].name)
  })
  it('includes exemplars with their scores', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.user).toContain(String(assessment.exemplars[0].total))
  })
})
```

- [ ] **Step 5: 프롬프트 구현**

```ts
// lib/classroom/grading-prompt.ts
import type { Snapshot } from '@/lib/studio/publish'

/** 고정 규칙(첫 system 블록 = 캐시 대상). 스펙 §6.1 채점 원칙. */
export const GRADING_RULES = [
  '당신은 다빈치스쿨 서논술형 채점자다. 주어진 채점표(루브릭)만 기준으로 학생 답안을 채점한다.',
  '요소마다 점수를 매기고, 그 점수의 근거가 되는 문장을 학생 답안에서 그대로 인용한다(evidence). 답안에 근거가 없으면 "해당 내용 없음"이라고 쓴다.',
  'score 는 요소 점수의 합이어야 한다. 요소 점수는 max 를 넘을 수 없다.',
  '잘한 점(strengths) 1~3개, 보완할 점(improvements) 1~3개. 보완할 점은 현재 점수보다 한 단계 위 기준을 보고 "다음 점수로 가려면 무엇을 더 쓰면 되는지"로 쓴다.',
  '학생에게 말하듯 존댓말로 쓰고, 학생 학년 수준의 어휘를 쓴다. 채점표에 없는 기준을 만들어 내지 않는다.',
  '예시 답안(상·중·하)과 그 점수는 기준의 눈금이다. 학생 답안이 예시와 비슷하면 비슷한 점수를 준다.',
].join('\n')

export type GradingPromptInput = { snapshot: Snapshot; itemNo: number; studentGrade: number; answer: string }

export function buildGradingPrompt({ snapshot, itemNo, studentGrade, answer }: GradingPromptInput) {
  const a = snapshot.assessment
  if (!a) throw new Error('snapshot has no assessment')
  const item = a.items[itemNo - 1]
  if (!item) throw new Error(`item ${itemNo} not found`)
  const rubric = 'criteria' in item.rubric
    ? item.rubric.criteria.map((c) => `- ${c.name}: 4=${c.bands['4']} / 3=${c.bands['3']} / 2=${c.bands['2']} / 1=${c.bands['1']} / 0=${c.bands['0']}`).join('\n')
    : item.rubric.levels.map((l) => `- ${l.points}점: ${l.expectation}${l.example ? ` (예: ${l.example})` : ''}`).join('\n')
  const criteriaHint = 'criteria' in item.rubric
    ? `요소 4개(${item.rubric.criteria.map((c) => c.name).join(', ')}) 각 0~4점, max=4`
    : `요소 1개(이름: "${item.kind} 채점표"), max=${item.points}`
  const exemplars = a.exemplars.map((e) => `[${e.level}] 총점 ${e.total} (${e.grade}등급)\n${e.text}`).join('\n\n')
  const user = [
    `학생 학년: ${snapshot.cover.level} ${studentGrade}학년 · 과목: ${snapshot.cover.subject}`,
    `문항(${item.kind}, ${item.points}점):\n${item.stem}`,
    `조건: 분량 ${item.conditions.length} / 필수 ${item.conditions.required.join(', ')} / 형식 ${item.conditions.format}`,
    `채점표:\n${rubric}`,
    `요소 구성: ${criteriaHint}`,
    `예시 답안(세트 전체 기준):\n${exemplars}`,
    `학생 답안:\n${answer}`,
  ].join('\n\n')
  return { system: [GRADING_RULES], user, fixtureKey: `grading-${item.kind}` }
}
```

- [ ] **Step 6: fixture 두 벌**

`data/studio-fixtures/grading-서술형.json`
```json
{
  "criteria": [{ "name": "서술형 채점표", "points": 2, "max": 3, "evidence": "올해 플라스틱컵이 405개로 가장 많이 늘었다", "note": "수치는 정확하나 작년과의 비교가 없음" }],
  "score": 2,
  "strengths": ["자료 B에서 올해 수치를 정확히 골라 썼어요.", "'가장 많이 늘었다'처럼 비교 표현을 근거 문장에 넣었어요."],
  "improvements": ["3점 기준은 '작년 대비 변화'까지 쓰는 것이에요. '작년 290개에서 올해 405개로 115개 늘었다'처럼 두 해를 함께 쓰면 돼요."]
}
```

`data/studio-fixtures/grading-논술형.json`
```json
{
  "criteria": [
    { "name": "자료 활용", "points": 3, "max": 4, "evidence": "자료 B를 보면 플라스틱컵이 290개에서 405개로 늘었다", "note": "수치 근거 2개 중 1개만 정확히 인용" },
    { "name": "근거의 타당성", "points": 3, "max": 4, "evidence": "상대도수로 보면 플라스틱컵만 0.24에서 0.30으로 늘었다", "note": "상대도수 비교를 근거로 씀" },
    { "name": "제안의 구체성", "points": 2, "max": 4, "evidence": "플라스틱컵을 줄이자", "note": "무엇을 얼마나 어떻게 줄일지가 빠짐" },
    { "name": "글의 구성", "points": 3, "max": 4, "evidence": "먼저 자료를 보면 … 따라서 …", "note": "문제-근거-제안 순서는 갖췄으나 예상 반론이 없음" }
  ],
  "score": 11,
  "strengths": ["작년과 올해 수치를 비교해 '플라스틱컵이 문제'라는 결론을 근거 있게 냈어요.", "상대도수를 써서 규모가 다른 두 해를 공정하게 비교했어요."],
  "improvements": ["제안을 '내년 축제에서 플라스틱컵 사용을 절반(약 200개)으로 줄이기 위해 다회용컵 대여 부스를 운영하자'처럼 무엇을·얼마나·어떻게로 구체화하면 제안의 구체성이 3점 이상이 돼요.", "예상 반론 한 가지('다회용컵은 씻기 번거롭다')와 그에 대한 답을 넣으면 글의 구성이 4점 기준에 가까워져요."]
}
```

- [ ] **Step 7: 실행기**

```ts
// lib/classroom/grade.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { callStructured } from '@/lib/ai/claude'
import { GradingDraftSchema } from './grading-schema'
import { buildGradingPrompt } from './grading-prompt'
import type { Snapshot } from '@/lib/studio/publish'
import type { GradingStatus } from './types'

/**
 * 채점 초안 한 건을 만든다. db 는 service-role 클라이언트(학생·원장 정책과 무관하게 gradings 를 쓴다).
 * 상태: pending → drafted | failed. 이미 drafted/confirmed 면 아무 것도 하지 않고 현재 상태를 돌려준다.
 */
export async function runGrading({ gradingId, db }: { gradingId: string; db: SupabaseClient }): Promise<GradingStatus> {
  const { data: g } = await db.from('gradings').select('id, status, answer_id').eq('id', gradingId).maybeSingle()
  if (!g) throw new Error('grading not found')
  if (g.status !== 'pending' && g.status !== 'failed') return g.status as GradingStatus

  const { data: ans } = await db.from('answers').select('body, item_no, assignment_id, assignments(item_set_id, item_set_version, student_id)').eq('id', g.answer_id).single()
  const asg = (ans?.assignments as unknown as { item_set_id: string; item_set_version: number; student_id: string } | null)
  if (!ans || !asg) throw new Error('answer not found')
  const [{ data: ver }, { data: st }] = await Promise.all([
    db.from('item_set_versions').select('snapshot').eq('item_set_id', asg.item_set_id).eq('version', asg.item_set_version).single(),
    db.from('students').select('grade').eq('profile_id', asg.student_id).single(),
  ])
  if (!ver) throw new Error('snapshot not found')
  const snapshot = ver.snapshot as Snapshot
  const p = buildGradingPrompt({ snapshot, itemNo: ans.item_no, studentGrade: st?.grade ?? snapshot.cover.grade, answer: ans.body })

  await db.from('gradings').update({ status: 'pending', error: null }).eq('id', gradingId)
  try {
    const r = await callStructured({ stage: 9, role: 'grade', schema: GradingDraftSchema, system: p.system, user: p.user, effort: 'medium', fixtureKey: p.fixtureKey })
    const item = snapshot.assessment!.items[ans.item_no - 1]
    const score = Math.min(r.data.score, item.points)
    await db.from('gradings').update({
      status: 'drafted', ai_criteria: r.data.criteria, ai_score: score, ai_strengths: r.data.strengths, ai_improvements: r.data.improvements,
      model: r.model, input_tokens: r.usage.input, output_tokens: r.usage.output,
    }).eq('id', gradingId)
    return 'drafted'
  } catch (e) {
    await db.from('gradings').update({ status: 'failed', error: (e as Error).message }).eq('id', gradingId)
    return 'failed'
  }
}
```

- [ ] **Step 8: 실행기 시험(mock, 가짜 DB)**

```ts
// tests/grading-run.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { runGrading } from '@/lib/classroom/grade'

// 최소 가짜 Supabase: from(table).select().eq()… 체인이 미리 넣어 둔 행을 돌려주고 update 를 기록한다
function fakeDb(rows: Record<string, unknown[]>) {
  const updates: { table: string; patch: Record<string, unknown> }[] = []
  function chain(table: string, mode: 'select' | 'update', patch?: Record<string, unknown>) {
    const self: Record<string, unknown> = {}
    const finish = () => (mode === 'update' ? (updates.push({ table, patch: patch! }), Promise.resolve({ data: null, error: null })) : Promise.resolve({ data: rows[table]?.[0] ?? null, error: null }))
    for (const m of ['select', 'eq', 'order', 'limit']) self[m] = () => self
    self.maybeSingle = finish; self.single = finish
    self.then = (res: (v: unknown) => void) => finish().then(res)
    return self
  }
  return { updates, from: (table: string) => ({ select: () => chain(table, 'select'), update: (patch: Record<string, unknown>) => chain(table, 'update', patch) }) }
}

const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [], materials: [], standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', assessment, teacher_guide: null, generated_with: { models: [] } }

describe('runGrading (mock)', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1' })
  afterEach(() => { process.env.AI_MOCK = prev })

  it('moves pending → drafted with the fixture draft and model mock', async () => {
    const db = fakeDb({
      gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }],
      answers: [{ body: 'x'.repeat(60), item_no: 1, assignment_id: 's1', assignments: { item_set_id: 'set', item_set_version: 1, student_id: 'stu' } }],
      item_set_versions: [{ snapshot }],
      students: [{ grade: 1 }],
    })
    const status = await runGrading({ gradingId: 'g1', db: db as never })
    expect(status).toBe('drafted')
    const last = db.updates.at(-1)!.patch
    expect(last.status).toBe('drafted'); expect(last.model).toBe('mock'); expect(last.ai_score).toBe(2)
  })
  it('does nothing when already drafted', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'drafted', answer_id: 'a1' }] })
    expect(await runGrading({ gradingId: 'g1', db: db as never })).toBe('drafted')
    expect(db.updates).toHaveLength(0)
  })
})
```

- [ ] **Step 9: 라우트**

```ts
// app/api/classroom/gradings/[id]/run/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runGrading } from '@/lib/classroom/grade'

export const maxDuration = 300

/** 호출 자격: 그 답안의 학생 본인, 그 원의 원장, 본사. 자격 확인은 사용자 클라이언트(RLS)로, 실행은 service role 로. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = await createClient()
  let allowed = s.role === 'admin'
  if (s.role === 'teacher') {
    const { data } = await supabase.from('gradings').select('id').eq('id', id).maybeSingle()
    allowed = !!data
  } else if (s.role === 'student') {
    const { data } = await createAdminClient().from('gradings').select('answers(assignments(student_id))').eq('id', id).maybeSingle()
    allowed = (data?.answers as unknown as { assignments: { student_id: string } } | null)?.assignments?.student_id === s.userId
  }
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const status = await runGrading({ gradingId: id, db: createAdminClient() })
    return NextResponse.json({ status })
  } catch (e) {
    console.error('[grading run]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
```

- [ ] **Step 10: 시험** — `npx vitest run tests/grading-schema.test.ts tests/grading-prompt.test.ts tests/grading-run.test.ts` PASS; `npx tsc --noEmit`; `npx vitest run` 전체.

- [ ] **Step 11: Commit**

```bash
git add lib/ai/claude.ts lib/classroom/grading-schema.ts lib/classroom/grading-prompt.ts lib/classroom/grade.ts app/api/classroom "data/studio-fixtures/grading-서술형.json" "data/studio-fixtures/grading-논술형.json" tests/grading-schema.test.ts tests/grading-prompt.test.ts tests/grading-run.test.ts
git commit -m "feat: AI 채점 초안 — 스키마·프롬프트·실행기·라우트·fixture

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 원장 검수 — 퀴즈 현황표, 답안·AI 초안 검수 카드, 확정·공개·다시 채점

**Files:**
- Create: `app/teacher/assignments/[setId]/QuizMatrix.tsx`, `app/teacher/assignments/[setId]/ReviewCard.tsx`
- Modify: `app/teacher/assignments/[setId]/actions.ts`(액션 추가), `app/teacher/assignments/[setId]/page.tsx`(데이터 로드·삽입), `content/site.ts` (`app.classroom.review`)

**Interfaces:**
- Consumes: `GradingRow`, `AnswerRow`, `QuizResponseRow`(Task 2), `overallFor`·`gradeFor`(Task 2), 라우트 `/api/classroom/gradings/[id]/run`(Task 6)
- Produces: 액션 `confirmGrading(gradingId, input: { criteria: Criterion[]; strengths: string[]; improvements: string[]; comment: string; adjustNote: string } | null)` (null = 그대로 확정), `reopenGrading(gradingId)` (confirmed → drafted), `requestRegrade(gradingId)`, `overrideQuiz(assignmentId, lessonNo, quizNo, correct)`.

- [ ] **Step 1: 문구 추가** (`app.classroom` 안)

```ts
    review: {
      quizHeading: '퀴즈 현황',
      quizRate: (pct: number) => `정답률 ${pct}%`,
      overrideCorrect: '정답 처리', overrideWrong: '오답 처리', noResponse: '—',
      answersHeading: '답안·검수',
      status: { none: '미제출', pending: '채점 중', drafted: '검수 대기', confirmed: '공개됨', failed: '실패', rejected: '다시 쓰기 요청', retry: '재도전 중' },
      attempt: (n: number) => `${n}회차`,
      studentAnswer: '학생 답안',
      aiDraft: 'AI 초안', finalLabel: '확정본',
      mock: '가짜 응답',
      criteria: '요소별 점수', evidence: '근거', score: '문항 점수',
      strengths: '잘한 점', improvements: '보완할 점', addLine: '문장 추가', remove: '지우기',
      comment: '원장 코멘트', adjustNote: '조정 이유(선택)',
      confirmAsIs: '그대로 확정', confirmEdited: '수정하여 확정', regrade: 'AI 다시 채점', requestRegrade: '재채점 요청(본사)', reopen: '다시 고치기',
      confirmedAt: (who: string, at: string) => `공개됨 · ${who} · ${at}`,
      overall: (total: number, max: number, grade: number, band: string) => `종합 ${total}/${max}점 · ${grade}등급 · ${band}`,
      overallPending: '세 문항이 모두 확정되면 종합 점수가 나옵니다.',
      compare: (a1: number, a2: number) => `1회차 ${a1}점 → 2회차 ${a2}점`,
      errors: { saveFailed: '저장하지 못했습니다.', notDrafted: '검수 대기 상태가 아닙니다.', badScore: '점수가 범위를 벗어났습니다.' },
    },
```

- [ ] **Step 2: 액션 추가** (`[setId]/actions.ts` 끝에)

```ts
import type { Criterion } from '@/lib/classroom/types'
const rev = app.classroom.review.errors

export type ConfirmInput = { criteria: Criterion[]; strengths: string[]; improvements: string[]; comment: string; adjustNote: string } | null

/** null 이면 AI 초안을 그대로 확정본으로 복사한다. 트리거가 ai_* 변경을 막으므로 final_* 만 쓴다. */
export async function confirmGrading(gradingId: string, input: ConfirmInput): Promise<ActionResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { data: g } = await supabase.from('gradings').select('id, status, ai_criteria, ai_score, ai_strengths, ai_improvements').eq('id', gradingId).maybeSingle()
  if (!g) return { ok: false, error: rev.saveFailed }
  if (g.status !== 'drafted' && g.status !== 'confirmed') return { ok: false, error: rev.notDrafted }
  const criteria = (input?.criteria ?? (g.ai_criteria as Criterion[] | null) ?? []) as Criterion[]
  if (criteria.some((c) => !Number.isInteger(c.points) || c.points < 0 || c.points > c.max)) return { ok: false, error: rev.badScore }
  const score = criteria.reduce((sum, c) => sum + c.points, 0)
  const now = new Date().toISOString()
  const { error } = await supabase.from('gradings').update({
    status: 'confirmed', final_criteria: criteria, final_score: score,
    final_strengths: input?.strengths ?? g.ai_strengths, final_improvements: input?.improvements ?? g.ai_improvements,
    teacher_comment: input?.comment ?? null, adjust_note: input?.adjustNote || null,
    confirmed_by: s.userId, confirmed_at: g.status === 'confirmed' ? undefined : now, updated_at: now,
  }).eq('id', gradingId)
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}

export async function reopenGrading(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('gradings').update({ status: 'drafted', updated_at: new Date().toISOString() }).eq('id', gradingId).eq('status', 'confirmed')
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}

export async function requestRegrade(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('gradings').update({ regrade_requested: true, updated_at: new Date().toISOString() }).eq('id', gradingId)
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}

/** AI 다시 채점: 확정 전(drafted/failed)만. service role 로 ai_* 를 비우고 pending 으로 되돌린 뒤 실행기를 부른다. */
export async function regradeAi(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { data: g } = await supabase.from('gradings').select('id, status').eq('id', gradingId).maybeSingle()
  if (!g || (g.status !== 'drafted' && g.status !== 'failed')) return { ok: false, error: rev.notDrafted }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { runGrading } = await import('@/lib/classroom/grade')
  const admin = createAdminClient()
  await admin.from('gradings').update({ status: 'pending', ai_criteria: null, ai_score: null, ai_strengths: null, ai_improvements: null, model: null, input_tokens: null, output_tokens: null, error: null }).eq('id', gradingId)
  await runGrading({ gradingId, db: admin })
  revalidatePath('/teacher/assignments'); return { ok: true }
}

export async function overrideQuiz(assignmentId: string, lessonNo: number, quizNo: number, correct: boolean): Promise<ActionResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('quiz_responses').update({ correct, overridden_by: s.userId, overridden_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId).eq('lesson_no', lessonNo).eq('quiz_no', quizNo)
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}
```

- [ ] **Step 3: 퀴즈 현황표(클라이언트)**

```tsx
// app/teacher/assignments/[setId]/QuizMatrix.tsx
'use client'
import { useState, useTransition } from 'react'
import { overrideQuiz } from './actions'
import { app } from '@/content/site'
import type { QuizResponseRow } from '@/lib/classroom/types'

const copy = app.classroom.review
type Student = { assignmentId: string; name: string }

export function QuizMatrix({ lessons, students, responses }: { lessons: { no: number; quizCount: number; types: ('choice' | 'short')[] }[]; students: Student[]; responses: QuizResponseRow[] }) {
  const [lesson, setLesson] = useState(lessons[0]?.no ?? 1)
  const [pending, start] = useTransition()
  const cur = lessons.find((l) => l.no === lesson)
  const cell = (aid: string, q: number) => responses.find((r) => r.assignment_id === aid && r.lesson_no === lesson && r.quiz_no === q)
  const rate = (q: number) => { const xs = students.map((s) => cell(s.assignmentId, q)).filter(Boolean) as QuizResponseRow[]; return xs.length ? Math.round((xs.filter((x) => x.correct).length / xs.length) * 100) : 0 }

  return (
    <section className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{copy.quizHeading}</h2>
        {lessons.map((l) => <button key={l.no} type="button" onClick={() => setLesson(l.no)} className={`rounded-full px-3 py-1 text-sm ${lesson === l.no ? 'bg-ink-900 text-white' : 'bg-ink-100'}`}>{app.classroom.student.lessonTab(l.no)}</button>)}
      </div>
      {cur && cur.quizCount > 0 ? (
        <table className="mt-3 w-full text-sm">
          <thead><tr><th className="p-2 text-left" />{Array.from({ length: cur.quizCount }, (_, i) => <th key={i} className="p-2">{i + 1}<div className="text-xs font-normal text-ink-500">{copy.quizRate(rate(i + 1))}</div></th>)}</tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.assignmentId} className="border-t border-ink-100">
                <td className="p-2 font-semibold">{s.name}</td>
                {Array.from({ length: cur.quizCount }, (_, i) => {
                  const r = cell(s.assignmentId, i + 1)
                  const canFlip = r && cur.types[i] === 'short'
                  return (
                    <td key={i} className="p-2 text-center">
                      {r ? (
                        <button type="button" disabled={!canFlip || pending} title={r.response}
                          onClick={() => canFlip && start(async () => { await overrideQuiz(s.assignmentId, lesson, i + 1, !r.correct) })}
                          className={`h-8 w-8 rounded-full ${r.correct ? 'bg-mint-500' : 'bg-red-400'} ${canFlip ? 'cursor-pointer' : 'cursor-default'}`} aria-label={r.correct ? copy.overrideWrong : copy.overrideCorrect} />
                      ) : <span className="text-ink-500">{copy.noResponse}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: 검수 카드(클라이언트)**

```tsx
// app/teacher/assignments/[setId]/ReviewCard.tsx
'use client'
import { useState, useTransition } from 'react'
import { confirmGrading, reopenGrading, requestRegrade, regradeAi } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import type { AnswerRow, Criterion, GradingRow } from '@/lib/classroom/types'

const copy = app.classroom.review

export type ReviewItem = { itemNo: number; label: string; points: number; answer: AnswerRow | null; grading: GradingRow | null; prev?: { score: number | null } }

function statusOf(it: ReviewItem): keyof typeof copy.status {
  if (!it.answer?.submitted_at) return 'none'
  if (it.answer.attempt === 2 && !it.grading?.confirmed_at) return 'retry'
  return (it.grading?.status ?? 'pending') as keyof typeof copy.status
}
const TONE: Record<keyof typeof copy.status, 'gray' | 'lemon' | 'mint' | 'lavender'> = { none: 'gray', pending: 'lavender', drafted: 'lemon', confirmed: 'mint', failed: 'gray', rejected: 'gray', retry: 'lavender' }

export function ReviewCard({ item }: { item: ReviewItem }) {
  const g = item.grading
  const st = statusOf(item)
  const base = g?.final_criteria ?? g?.ai_criteria ?? []
  const [criteria, setCriteria] = useState<Criterion[]>(base)
  const [strengths, setStrengths] = useState<string[]>(g?.final_strengths ?? g?.ai_strengths ?? [])
  const [improvements, setImprovements] = useState<string[]>(g?.final_improvements ?? g?.ai_improvements ?? [])
  const [comment, setComment] = useState(g?.teacher_comment ?? '')
  const [adjustNote, setAdjustNote] = useState(g?.adjust_note ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(st === 'drafted')
  const [pending, start] = useTransition()
  const edited = JSON.stringify({ criteria, strengths, improvements, comment }) !== JSON.stringify({ criteria: base, strengths: g?.ai_strengths ?? [], improvements: g?.ai_improvements ?? [], comment: '' })
  const score = criteria.reduce((s, c) => s + c.points, 0)

  const list = (label: string, xs: string[], set: (v: string[]) => void) => (
    <div>
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      {xs.map((x, i) => (
        <div key={i} className="mt-1 flex gap-2">
          <textarea value={x} rows={2} onChange={(e) => set(xs.map((y, j) => (j === i ? e.target.value : y)))} className="w-full rounded-xl border border-ink-300 p-2 text-sm" />
          <button type="button" onClick={() => set(xs.filter((_, j) => j !== i))} className="text-xs text-ink-500 underline">{copy.remove}</button>
        </div>
      ))}
      <button type="button" onClick={() => set([...xs, ''])} className="mt-1 text-xs text-mint-700 underline">{copy.addLine}</button>
    </div>
  )

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <span className="font-bold">{item.label}</span>
        <Badge tone={TONE[st]}>{copy.status[st]}</Badge>
        {item.answer && <Badge tone="gray">{copy.attempt(item.answer.attempt)}</Badge>}
        {g?.model === 'mock' && <Badge tone="lemon">{copy.mock}</Badge>}
        {g?.status === 'confirmed' && <span className="text-sm text-ink-500">{g.final_score}/{item.points}</span>}
        {item.prev && g?.final_score != null && item.prev.score != null && <span className="text-sm text-ink-500">{copy.compare(item.prev.score, g.final_score)}</span>}
      </button>
      {open && item.answer && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink-500">{copy.studentAnswer}</p>
            <p className="mt-1 whitespace-pre-wrap rounded-xl bg-ink-100/50 p-3 text-sm">{item.answer.body}</p>
          </div>
          {g && (g.status === 'drafted' || g.status === 'confirmed') ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink-500">{g.status === 'confirmed' ? copy.finalLabel : copy.aiDraft}</p>
              <div>
                <p className="text-sm font-semibold text-ink-500">{copy.criteria}</p>
                {criteria.map((c, i) => (
                  <div key={i} className="mt-1 rounded-xl border border-ink-100 p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <input type="number" min={0} max={c.max} value={c.points} disabled={g.status === 'confirmed'}
                        onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} className="w-16 rounded border border-ink-300 px-2 py-1" />
                      <span className="text-ink-500">/ {c.max}</span>
                    </div>
                    <p className="mt-1 text-ink-700"><span className="text-ink-500">{copy.evidence}:</span> “{c.evidence}”</p>
                    {c.note && <p className="text-xs text-ink-500">{c.note}</p>}
                  </div>
                ))}
                <p className="mt-1 text-sm font-semibold">{copy.score}: {score}/{item.points}</p>
              </div>
              {g.status === 'confirmed' ? (
                <>
                  <p className="text-sm">{copy.strengths}: {strengths.join(' / ')}</p>
                  <p className="text-sm">{copy.improvements}: {improvements.join(' / ')}</p>
                  {comment && <p className="text-sm">{copy.comment}: {comment}</p>}
                  <p className="text-xs text-ink-500">{copy.confirmedAt('', g.confirmed_at?.slice(0, 16).replace('T', ' ') ?? '')}</p>
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await reopenGrading(g.id); setMsg(r.ok ? null : r.error) })}>{copy.reopen}</Button>
                </>
              ) : (
                <>
                  {list(copy.strengths, strengths, setStrengths)}
                  {list(copy.improvements, improvements, setImprovements)}
                  <label className="grid gap-1 text-sm font-semibold text-ink-500">{copy.comment}<textarea value={comment} rows={2} onChange={(e) => setComment(e.target.value)} className="rounded-xl border border-ink-300 p-2 text-sm font-normal" /></label>
                  {score !== (g.ai_score ?? score) && (
                    <label className="grid gap-1 text-sm font-semibold text-ink-500">{copy.adjustNote}<input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="rounded-xl border border-ink-300 p-2 text-sm font-normal" /></label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={pending} onClick={() => start(async () => {
                      const r = await confirmGrading(g.id, edited ? { criteria, strengths, improvements, comment, adjustNote } : null); setMsg(r.ok ? null : r.error)
                    })}>{edited ? copy.confirmEdited : copy.confirmAsIs}</Button>
                    <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await regradeAi(g.id); setMsg(r.ok ? null : r.error) })}>{copy.regrade}</Button>
                    <Button type="button" variant="ghost" disabled={pending || g.regrade_requested} onClick={() => start(async () => { const r = await requestRegrade(g.id); setMsg(r.ok ? null : r.error) })}>{copy.requestRegrade}</Button>
                  </div>
                </>
              )}
              {msg && <p className="text-sm text-red-600">{msg}</p>}
            </div>
          ) : g?.status === 'failed' ? (
            <div><p className="text-sm text-red-600">{g.error}</p><Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { await regradeAi(g.id) })}>{copy.regrade}</Button></div>
          ) : (
            <p className="text-sm text-ink-500">{copy.status.pending}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 상세 페이지에 데이터 로드·삽입** — `[setId]/page.tsx`의 `{/* Task 7 */}` 자리를 아래로 바꾸고 상단 로드에 추가:

```tsx
  // 추가 로드 (rows 다음)
  const aids = rows.map((r) => r.id)
  const [{ data: quiz }, { data: answers }, { data: gradings }] = await Promise.all([
    supabase.from('quiz_responses').select('*').in('assignment_id', aids),
    supabase.from('answers').select('*').in('assignment_id', aids).order('attempt'),
    supabase.from('gradings').select('*').in('answer_id', (await supabase.from('answers').select('id').in('assignment_id', aids)).data?.map((a) => a.id) ?? []),
  ])
  const quizRows = (quiz ?? []) as QuizResponseRow[]
  const answerRows = (answers ?? []) as AnswerRow[]
  const gradingRows = (gradings ?? []) as GradingRow[]
  const items = snapshot.assessment?.items ?? []
  const lessonsMeta = snapshot.lessons.map((l) => ({ no: l.no, quizCount: l.quiz.length, types: l.quiz.map((q) => q.type) }))
  const students = rows.map((r) => ({ assignmentId: r.id, name: r.profiles?.name ?? '' }))
```

```tsx
      {/* 삽입 */}
      <div className="mt-6"><QuizMatrix lessons={lessonsMeta} students={students} responses={quizRows} /></div>
      <h2 className="mt-8 text-lg font-bold">{app.classroom.review.answersHeading}</h2>
      <div className="mt-3 space-y-6">
        {rows.map((r) => {
          const own = answerRows.filter((a) => a.assignment_id === r.id)
          const gradingOf = (a: AnswerRow | null) => (a ? gradingRows.find((g) => g.answer_id === a.id) ?? null : null)
          const latest = (itemNo: number) => own.filter((a) => a.item_no === itemNo).sort((x, y) => y.attempt - x.attempt)[0] ?? null
          const finals = items.map((_, i) => { const g = gradingOf(own.find((a) => a.item_no === i + 1 && a.attempt === 1) ?? null); return g?.status === 'confirmed' ? g.final_score : null })
          const overall = overallFor(items, finals)
          const grade = overall.complete && snapshot.assessment ? gradeFor(snapshot.assessment.grade_boundaries, overall.total) : null
          return (
            <section key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{r.profiles?.name}</h3>
                <span className="text-sm text-ink-500">{grade ? app.classroom.review.overall(overall.total, overall.max, grade.grade, grade.band) : app.classroom.review.overallPending}</span>
              </div>
              <div className="mt-2 grid gap-3 lg:grid-cols-3">
                {items.map((it, i) => {
                  const a = latest(i + 1)
                  const first = own.find((x) => x.item_no === i + 1 && x.attempt === 1) ?? null
                  const prev = a?.attempt === 2 ? { score: gradingOf(first)?.final_score ?? null } : undefined
                  return <ReviewCard key={i} item={{ itemNo: i + 1, label: ASSESSMENT_LABELS[i], points: it.points, answer: a, grading: gradingOf(a), prev }} />
                })}
              </div>
            </section>
          )
        })}
      </div>
```
(import 추가: `QuizMatrix`, `ReviewCard`, `overallFor`, `gradeFor`, `ASSESSMENT_LABELS`, 타입 `AnswerRow`, `GradingRow`, `QuizResponseRow`)

- [ ] **Step 6: 타입·문구·시험** — `npx tsc --noEmit`, 한글 스캔(app/teacher), `npx vitest run`.

- [ ] **Step 7: Commit**

```bash
git add app/teacher/assignments content/site.ts
git commit -m "feat: 원장 검수 — 퀴즈 현황표·AI 초안 검수·확정 공개·다시 채점

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 학생 결과 화면과 재도전

**Files:**
- Create: `app/student/assignments/[id]/ResultView.tsx`, `app/student/assignments/[id]/RetryButton.tsx`
- Modify: `app/student/assignments/[id]/page.tsx`(결과·재도전 삽입, `student_gradings` 로드), `app/student/assignments/[id]/actions.ts`(`startRetry`), `content/site.ts` (`app.classroom.student.result`)

**Interfaces:**
- Consumes: 뷰 `student_gradings`(Task 1), `overallFor`·`gradeFor`(Task 2), `AnswerEditor`(Task 5)
- Produces: 액션 `startRetry(assignmentId, itemNo)` → 2회차 `answers` 줄(빈 본문) 생성.

- [ ] **Step 1: 문구 추가** (`app.classroom.student` 안)

```ts
      result: {
        heading: (label: string) => `${label} 결과`,
        score: (s: number, max: number) => `${s}/${max}점`,
        criteria: '요소별 점수', evidence: '근거 문장',
        strengths: '잘한 점', improvements: '보완할 점', comment: '선생님 한마디',
        overall: (total: number, max: number, grade: number, band: string) => `종합 ${total}/${max}점 · ${grade}등급 · ${band}`,
        retry: '다시 써 보기',
        retryHint: '피드백을 보고 같은 문항에 한 번 더 답을 쓸 수 있어요. 첫 번째 답과 점수는 그대로 남아요.',
        attempt: (n: number) => `${n}회차`,
        firstAttempt: '1회차 답안과 피드백 보기',
      },
```

- [ ] **Step 2: 재도전 액션** (`actions.ts` 끝에)

```ts
/** 1회차가 확정(공개)됐고 배정이 재도전 허용이면 2회차 줄을 만든다. */
export async function startRetry(assignmentId: string, itemNo: number): Promise<{ ok: boolean; error?: string }> {
  const { s, supabase, a } = await loadOwnAssignment(assignmentId)
  if (!a.allow_retry || a.closed) return { ok: false, error: errors.notOpen }
  const { data: first } = await supabase.from('answers').select('id').eq('assignment_id', assignmentId).eq('item_no', itemNo).eq('attempt', 1).maybeSingle()
  if (!first) return { ok: false, error: errors.saveFailed }
  const { data: g } = await supabase.from('student_gradings').select('id').eq('answer_id', first.id).maybeSingle()
  if (!g) return { ok: false, error: errors.notOpen }
  const { error } = await supabase.from('answers').upsert(
    { assignment_id: assignmentId, item_no: itemNo, attempt: 2, body: '', source: 'student', entered_by: s.userId },
    { onConflict: 'assignment_id,item_no,attempt', ignoreDuplicates: true },
  )
  if (error) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/student/assignments/${assignmentId}`)
  return { ok: true }
}
```

- [ ] **Step 3: 결과 보기·재도전 버튼**

```tsx
// app/student/assignments/[id]/ResultView.tsx
import { app } from '@/content/site'
import type { Criterion } from '@/lib/classroom/types'

const copy = app.classroom.student.result
export type StudentGrading = { answer_id: string; final_criteria: Criterion[] | null; final_score: number | null; final_strengths: string[] | null; final_improvements: string[] | null; teacher_comment: string | null }

export function ResultView({ label, points, attempt, grading }: { label: string; points: number; attempt: number; grading: StudentGrading }) {
  return (
    <section className="rounded-2xl bg-mint-50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">{copy.heading(label)}</h3>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold">{copy.attempt(attempt)} · {copy.score(grading.final_score ?? 0, points)}</span>
      </div>
      {(grading.final_criteria?.length ?? 0) > 1 && (
        <ul className="mt-3 space-y-1">
          {grading.final_criteria!.map((c, i) => <li key={i}><span className="font-semibold">{c.name}</span> {c.points}/{c.max} — <span className="text-ink-700">{copy.evidence}: “{c.evidence}”</span></li>)}
        </ul>
      )}
      <p className="mt-3 font-semibold">{copy.strengths}</p>
      <ul className="list-disc pl-6">{(grading.final_strengths ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
      <p className="mt-3 font-semibold">{copy.improvements}</p>
      <ul className="list-disc pl-6">{(grading.final_improvements ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
      {grading.teacher_comment && <p className="mt-3 rounded-xl bg-white p-3"><span className="font-semibold">{copy.comment}:</span> {grading.teacher_comment}</p>}
    </section>
  )
}
```

```tsx
// app/student/assignments/[id]/RetryButton.tsx
'use client'
import { useTransition } from 'react'
import { startRetry } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.result

export function RetryButton({ assignmentId, itemNo }: { assignmentId: string; itemNo: number }) {
  const [pending, start] = useTransition()
  return (
    <div className="rounded-2xl bg-white p-5">
      <p className="text-sm text-ink-700">{copy.retryHint}</p>
      <div className="mt-3"><Button type="button" disabled={pending} onClick={() => start(async () => { await startRetry(assignmentId, itemNo) })}>{copy.retry}</Button></div>
    </div>
  )
}
```

- [ ] **Step 4: 페이지에 결과·재도전 삽입** — `page.tsx`에서 `student_gradings`를 함께 로드하고, 차시 렌더 안 `{/* Task 8 */}` 자리를 아래로 바꾼다. 또 맨 위 제목 아래에 종합 점수를 표시한다.

```tsx
  // 로드 추가
  const { data: sg } = await supabase.from('student_gradings').select('*')
  const results = (sg ?? []) as StudentGrading[]
  const resultOf = (a: AnswerRow | null | undefined) => (a ? results.find((g) => g.answer_id === a.id) ?? null : null)
  const items = snapshot.assessment?.items ?? []
  const finals = items.map((_, i) => resultOf(answerRows.find((r) => r.item_no === i + 1 && r.attempt === 1))?.final_score ?? null)
  const overall = overallFor(items, finals)
  const grade = overall.complete && snapshot.assessment ? gradeFor(snapshot.assessment.grade_boundaries, overall.total) : null
```

```tsx
  {/* 제목 아래 */}
  {grade && <p className="mt-2 inline-block rounded-full bg-lemon-100 px-4 py-1 font-bold">{copy.result.overall(overall.total, overall.max, grade.grade, grade.band)}</p>}
```

```tsx
  {/* 차시 안, AnswerEditor(1회차) 아래 */}
  {item && itemNo && (() => {
    const r1 = resultOf(ans1)
    const ans2 = answerRows.find((r) => r.item_no === itemNo && r.attempt === 2) ?? null
    const r2 = resultOf(ans2)
    return (
      <>
        {r1 && <ResultView label={ASSESSMENT_LABELS[itemNo - 1]} points={item.points} attempt={1} grading={r1} />}
        {r1 && assignment.allow_retry && !ans2 && <RetryButton assignmentId={id} itemNo={itemNo} />}
        {ans2 && (
          <AnswerEditor assignmentId={id} itemNo={itemNo} attempt={2} initialBody={ans2.body} submitted={!!ans2.submitted_at}
            label={`${ASSESSMENT_LABELS[itemNo - 1]} · ${copy.result.attempt(2)}`} points={item.points} conditions={item.conditions} />
        )}
        {r2 && <ResultView label={ASSESSMENT_LABELS[itemNo - 1]} points={item.points} attempt={2} grading={r2} />}
      </>
    )
  })()}
```
(import 추가: `ResultView`, `StudentGrading`, `RetryButton`, `overallFor`, `gradeFor`)

- [ ] **Step 5: 타입·문구·시험** — `npx tsc --noEmit`, 한글 스캔(app/student), `npx vitest run`.

- [ ] **Step 6: Commit**

```bash
git add app/student content/site.ts
git commit -m "feat: 학생 결과 화면(확정본만)·종합 등급·재도전

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 원장 대시보드 숫자, 문서, 마무리 점검

**Files:**
- Modify: `app/teacher/page.tsx`, `content/site.ts` (`app.dashboard.teacher` 확장), `docs/STATUS.md`, `README.md`

**Interfaces:**
- Consumes: 모든 이전 Task.

- [ ] **Step 1: 문구** — `app.dashboard.teacher`를 다음으로 교체:

```ts
    teacher: {
      title: '원장님 홈',
      body: '학생 현황과 최근 결과가 여기에 표시됩니다.',
      stats: { pending: (n: number) => `검수 대기 ${n}건`, assignments: (n: number) => `진행 중 배정 ${n}개`, students: (n: number) => `학생 ${n}명` },
      links: { review: '검수하러 가기', assign: '문항 찾기', students: '학생 관리' },
    },
```

- [ ] **Step 2: 대시보드**

```tsx
// app/teacher/page.tsx
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.dashboard.teacher

export default async function TeacherHome() {
  const supabase = await createClient()
  const [{ count: pending }, { count: assignments }, { count: students }] = await Promise.all([
    supabase.from('gradings').select('id', { count: 'exact', head: true }).eq('status', 'drafted'),
    supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('closed', false),
    supabase.from('students').select('profile_id', { count: 'exact', head: true }).eq('enrolled', true),
  ])
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card className={pending ? 'ring-2 ring-lemon-300' : ''}><p className="text-xl font-bold">{copy.stats.pending(pending ?? 0)}</p><div className="mt-2"><Button href="/teacher/assignments" variant="ghost">{copy.links.review}</Button></div></Card>
        <Card><p className="text-xl font-bold">{copy.stats.assignments(assignments ?? 0)}</p><div className="mt-2"><Button href="/teacher/items" variant="ghost">{copy.links.assign}</Button></div></Card>
        <Card><p className="text-xl font-bold">{copy.stats.students(students ?? 0)}</p><div className="mt-2"><Button href="/teacher/students" variant="ghost">{copy.links.students}</Button></div></Card>
      </div>
    </>
  )
}
```

- [ ] **Step 3: 문서** — `docs/STATUS.md`에 "3주차-A 완료" 절 추가: 새 화면·라우트 목록, 시연 절차(원장: 학생 추가 → 배정 → 학생: 퀴즈·답안 제출 → 원장: 검수·확정 → 학생: 결과·재도전), 대표님 할 일(0009 `supabase db push`, `git push`), 알려진 한계(사진·교재·공유 자료 생성은 3B, 비용 상한·관리자 재채점 처리는 발표 뒤, 학생 계정 삭제 없음). `README.md`에 같은 시연 절차 요약 추가. `tests/site-content.test.ts`가 문구 구조를 검사한다면 새 키를 통과하는지 확인.

- [ ] **Step 4: 전체 점검** — `npx vitest run`(전부 통과, 개수 보고), `npx tsc --noEmit`, `grep -rnP '[가-힣]' app/teacher app/student app/api/classroom --include=*.ts --include=*.tsx`(주석·🔒 외 없음).

- [ ] **Step 5: Commit**

```bash
git add app/teacher/page.tsx content/site.ts docs/STATUS.md README.md
git commit -m "feat: 원장 대시보드 숫자 + 3주차-A 문서

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 실행 뒤 대표님 확인 절차 (계획 밖, STATUS.md에 기록)

1. `supabase db push`로 0009 적용, `git push`.
2. 원장 계정으로: 학생 2명 추가(초기 비밀번호 메모) → 문항 찾기 → 수학 세트 [배정하기] → "3차시까지 열기".
3. 학생 계정으로: 1차시 퀴즈 제출(즉시 결과) → 3차시 서술형 1 답안 60자 이상 제출 → "확인 중".
4. 원장 계정으로: 배정 현황 → 검수 대기 카드 → 점수 그대로/수정 → 확정.
5. 학생 계정으로: 결과 확인 → [다시 써 보기] → 2회차 제출 → 원장 확정 → 1·2회차 비교.
6. 실제 키로 채점 품질 확인: 세트의 예시 답안(상·중·하)을 그대로 붙여 제출해 예상 등급대로 나오는지.
