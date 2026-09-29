-- 단원 리포트 (설계 docs/superpowers/specs/2026-09-29-unit-report-design.md §4.1, §5.4)
-- 파일만 만든다 — 적용(supabase db push)은 대표님, 코드 push 보다 먼저. 다시 실행해도 안전하다("있으면 건너뜀", 정책은 지우고 다시 만든다).
--
-- 이 파일이 바꾸지 않는 것(일부러):
--   · quiz_responses — 원장이 넣는 종이 O/X 는 기존 열로 충분하다(source 'teacher', response '' , overridden_by/at).
--     response 는 not null 이라 빈 문자열을 넣는다. 원장 쓰기 정책(teacher_rw_quiz, for all)은 0009 에 이미 있다.
--   · answers·gradings — 종이 답안 점수는 answers(source 'teacher', 제출된 줄로 새로 넣음) + gradings(status 'confirmed', model 'manual').
--     answers_guard·gradings_guard 는 update 트리거라 새 줄 넣기를 막지 않는다. gradings 에는 원장 insert 정책이 없으므로
--     서버가 "이 배정이 원장 자기 원의 것"임을 확인한 뒤 service role 로 넣는다(학생 제출 submitAnswer 와 같은 방식).
--     트리거·제약·기존 정책은 하나도 바꾸지 않았다.

-- 1) 퀴즈 최종 확인: 배정(학생) × 차시 한 줄. O/X 를 바꾸면 서버가 그 줄을 지운다(확인이 풀린다).
create table if not exists quiz_finalizations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  academy_id uuid not null references academies(id) on delete cascade,
  lesson_no int not null check (lesson_no between 1 and 8),
  finalized_by uuid references profiles(id),
  finalized_at timestamptz not null default now(),
  unique (assignment_id, lesson_no)
);
create index if not exists quiz_finalizations_academy_idx on quiz_finalizations(academy_id);

-- 2) 단원 리포트: 학생 한 명 × 대주제 하나 = 한 부(초안 → 원장 확정 → 인쇄). body 는 lib/classroom/report-schema.ts UnitReportBody.
create table if not exists unit_reports (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  student_id uuid not null references students(profile_id) on delete cascade,
  theme_id uuid not null references themes(id) on delete cascade,
  subjects jsonb not null default '[]'::jsonb,   -- 리포트에 넣은 과목 이름 배열(R-4), 예: ["수학","영어"]
  body jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  drafted_by uuid references profiles(id),
  drafted_at timestamptz not null default now(),
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, theme_id)
);
create index if not exists unit_reports_academy_theme_idx on unit_reports(academy_id, theme_id);

-- 3) RLS: 관리자 전체, 원장은 자기 원 것만 읽고 쓴다. 학생 정책 없음(설계 §6 — 학생·학부모 열람은 범위 밖, 원장 인쇄만).
alter table quiz_finalizations enable row level security;
alter table unit_reports enable row level security;

drop policy if exists admin_all_quiz_finalizations on quiz_finalizations;
create policy admin_all_quiz_finalizations on quiz_finalizations for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- academy_id 와 배정의 원이 모두 자기 원이어야 한다(0011 teacher_rw_lesson_notices 와 같은 모양 —
-- 다른 원의 assignment_id 에 자기 academy_id 를 붙여 넣는 것을 막는다). 확인 풀기 = delete 라 for all.
drop policy if exists teacher_rw_quiz_finalizations on quiz_finalizations;
create policy teacher_rw_quiz_finalizations on quiz_finalizations for all
  using (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id())
  )
  with check (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id())
  );

drop policy if exists admin_all_unit_reports on unit_reports;
create policy admin_all_unit_reports on unit_reports for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- academy_id 가 자기 원이고 학생도 자기 원 학생이어야 한다.
drop policy if exists teacher_rw_unit_reports on unit_reports;
create policy teacher_rw_unit_reports on unit_reports for all
  using (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from students s where s.profile_id = student_id and s.academy_id = current_academy_id())
  )
  with check (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from students s where s.profile_id = student_id and s.academy_id = current_academy_id())
  );
-- 정책 수: 관리자 2 + 원장 2 = 4. 학생 0.
