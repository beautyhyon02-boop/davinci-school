-- 교과융합 탐구보고서 (설계 docs/superpowers/specs/2026-09-30-inquiry-report-design.md §4~§8)
-- 파일만 만든다 — 적용(supabase db push)은 대표님, 코드 push 보다 먼저. 다시 실행해도 안전하다("있으면 건너뜀", 정책은 지우고 다시 만든다).
-- 기존 표·트리거·정책은 하나도 바꾸지 않는다. 0016 전에 코드가 배포돼도 화면은 깨지지 않는다(표를 못 읽으면 안내 한 줄만 — lib/inquiry/data.ts).

-- 1) 과제(본사가 만든다): 주제(질문형 제목 + 부제) + 탐구 문제 3개 + 자료(논문·기사·도서, 확인함 표시) + 칸 길잡이 덮어쓰기 + 지도 팁.
--    jsonb 열의 모양은 lib/inquiry/schema.ts InquiryTask 가 정한다. 대주제 연결은 선택(Q-10).
create table if not exists inquiry_tasks (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid references themes(id) on delete set null,
  title text not null default '',
  subtitle text not null default '',
  subjects jsonb not null default '[]'::jsonb,        -- 융합 과목 이름 배열(제작소 과목 다섯 중 2개 이상), 예: ["사회","국어"]
  level school_level not null default '중',           -- 초 | 중 (Q-1: 중학생까지)
  questions jsonb not null default '[]'::jsonb,       -- [{ key: '가'|'나'|'다', text, lens }] 정확히 3개
  sources jsonb not null default '[]'::jsonb,         -- [{ id, kind, title, authors, year, date, container, detail, url, note, easy_summary, excerpts, for_questions, verified }]
  section_guides jsonb not null default '{}'::jsonb,  -- { [칸 열쇠]: { question, length } } — 비우면 content/site.ts 기본 문구
  teacher_tips jsonb not null default '[]'::jsonb,    -- 지도할 때 짚을 점(한 줄에 하나)
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists inquiry_tasks_status_idx on inquiry_tasks(status);

-- 2) 배정(원장이 한다): 과제 × 학생 한 줄. outline = 목차(탐구 방법 생략/설문/실험/자료 분석, 희망 진로 칸 여부 — 설계 §5).
create table if not exists inquiry_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references inquiry_tasks(id) on delete cascade,
  academy_id uuid not null references academies(id) on delete cascade,
  student_id uuid not null references students(profile_id) on delete cascade,
  outline jsonb not null default '{"method":"none","career":true}'::jsonb,
  status text not null default 'assigned' check (status in ('assigned', 'submitted', 'reopened')),
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, student_id)
);
create index if not exists inquiry_assignments_academy_idx on inquiry_assignments(academy_id, task_id);
create index if not exists inquiry_assignments_student_idx on inquiry_assignments(student_id);

-- 3) 보고서(학생이 쓴다): 배정 하나 = 보고서 하나. sections = { [칸 열쇠]: 글 }, questions = 학생이 고칠 수 있는 탐구 문제 사본(3개),
--    used_source_ids = 「읽었어요」 체크한 자료 id(참고문헌은 이것으로 자동 작성), career_field = 희망 진로.
create table if not exists inquiry_reports (
  assignment_id uuid primary key references inquiry_assignments(id) on delete cascade,
  academy_id uuid not null references academies(id) on delete cascade,
  sections jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  used_source_ids jsonb not null default '[]'::jsonb,
  career_field text not null default '',
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists inquiry_reports_academy_idx on inquiry_reports(academy_id);

-- 4) RLS (설계 §8): 본사 전체 · 원장은 게시된 과제 읽기 + 자기 원의 배정·보고서 · 학생은 자기 배정·보고서만, 제출 전까지 쓰기.
alter table inquiry_tasks enable row level security;
alter table inquiry_assignments enable row level security;
alter table inquiry_reports enable row level security;

-- 과제
drop policy if exists admin_all_inquiry_tasks on inquiry_tasks;
create policy admin_all_inquiry_tasks on inquiry_tasks for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- 원장: 게시된 과제. 게시를 취소한 과제라도 자기 원에 이미 배정한 것은 계속 읽는다(현황·보고서 보기가 끊기지 않게).
drop policy if exists teacher_read_inquiry_tasks on inquiry_tasks;
create policy teacher_read_inquiry_tasks on inquiry_tasks for select
  using (
    current_user_role() = 'teacher'
    and (status = 'published' or exists (select 1 from inquiry_assignments ia where ia.task_id = inquiry_tasks.id and ia.academy_id = current_academy_id()))
  );

-- 학생: 자기에게 배정된 게시 과제만.
drop policy if exists student_read_inquiry_tasks on inquiry_tasks;
create policy student_read_inquiry_tasks on inquiry_tasks for select
  using (
    current_user_role() = 'student' and status = 'published'
    and exists (select 1 from inquiry_assignments ia where ia.task_id = inquiry_tasks.id and ia.student_id = auth.uid())
  );

-- 배정
drop policy if exists admin_all_inquiry_assignments on inquiry_assignments;
create policy admin_all_inquiry_assignments on inquiry_assignments for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- academy_id 가 자기 원이고 학생도 자기 원 학생이어야 한다(0014 teacher_rw_unit_reports 와 같은 모양).
drop policy if exists teacher_rw_inquiry_assignments on inquiry_assignments;
create policy teacher_rw_inquiry_assignments on inquiry_assignments for all
  using (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from students s where s.profile_id = student_id and s.academy_id = current_academy_id())
  )
  with check (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from students s where s.profile_id = student_id and s.academy_id = current_academy_id())
  );

drop policy if exists student_read_inquiry_assignments on inquiry_assignments;
create policy student_read_inquiry_assignments on inquiry_assignments for select
  using (current_user_role() = 'student' and student_id = auth.uid());

-- 보고서
drop policy if exists admin_all_inquiry_reports on inquiry_reports;
create policy admin_all_inquiry_reports on inquiry_reports for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- 원장: 자기 원의 배정에 붙은 보고서(읽기·다시 쓰게 하기 = submitted_at 비우기).
drop policy if exists teacher_rw_inquiry_reports on inquiry_reports;
create policy teacher_rw_inquiry_reports on inquiry_reports for all
  using (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from inquiry_assignments ia where ia.id = assignment_id and ia.academy_id = current_academy_id())
  )
  with check (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from inquiry_assignments ia where ia.id = assignment_id and ia.academy_id = current_academy_id())
  );

-- 학생: 자기 배정의 보고서를 읽고, 제출 전까지 만들고 고친다. 제출(submitted_at 찍기)도 update 라 with check 는 제출 뒤 값도 허용한다 —
-- 이미 제출된 줄은 using 이 걸러 더 못 고친다. academy_id 는 배정의 원과 같아야 한다.
drop policy if exists student_read_inquiry_reports on inquiry_reports;
create policy student_read_inquiry_reports on inquiry_reports for select
  using (
    current_user_role() = 'student'
    and exists (select 1 from inquiry_assignments ia where ia.id = assignment_id and ia.student_id = auth.uid())
  );

drop policy if exists student_insert_inquiry_reports on inquiry_reports;
create policy student_insert_inquiry_reports on inquiry_reports for insert
  with check (
    current_user_role() = 'student' and submitted_at is null
    and exists (select 1 from inquiry_assignments ia where ia.id = assignment_id and ia.student_id = auth.uid() and ia.academy_id = inquiry_reports.academy_id)
  );

drop policy if exists student_update_inquiry_reports on inquiry_reports;
create policy student_update_inquiry_reports on inquiry_reports for update
  using (
    current_user_role() = 'student' and submitted_at is null
    and exists (select 1 from inquiry_assignments ia where ia.id = assignment_id and ia.student_id = auth.uid())
  )
  with check (
    current_user_role() = 'student'
    and exists (select 1 from inquiry_assignments ia where ia.id = assignment_id and ia.student_id = auth.uid() and ia.academy_id = inquiry_reports.academy_id)
  );
-- 정책 수: 과제 3(관리자 전체·원장 읽기·학생 읽기) + 배정 3(관리자·원장·학생 읽기) + 보고서 5(관리자·원장·학생 읽기·넣기·고치기) = 11.
