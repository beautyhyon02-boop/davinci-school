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

-- 학생: 퀴즈 응답은 읽기만. 쓰기는 서버(submitQuiz)가 본인·열린 차시·중복을 확인하고 judgeQuiz 로 정오를 매긴 뒤
-- service role 로 넣는다(gradings 와 같은 방식) — 학생이 API 로 correct=true 를 직접 적지 못하게 쓰기 정책을 두지 않는다.
create policy student_read_quiz on quiz_responses for select
  using (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()));
-- 학생 답안: 자기 배정·닫히지 않은 배정만, 제출 전까지. 서버 규칙(submitAnswer 의 50자, startRetry 의 재도전 조건)을
-- API 로 우회하지 못하게 같은 조건을 정책에도 둔다.
create policy student_read_answers on answers for select
  using (exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid()));
-- 새 줄: 제출 시각 없이만. 1회차는 언제나, 2회차는 재도전 허용 배정이고 같은 문항 1회차가 확정(공개)된 뒤에만.
-- gradings 는 학생 정책이 없어 직접 볼 수 없으므로 확정 여부는 뷰 student_gradings(확정·본인 것만)로 확인한다.
create policy student_insert_answers on answers for insert
  with check (
    source = 'student' and entered_by = auth.uid() and submitted_at is null
    and exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid() and a.closed = false)
    and (
      attempt = 1
      or (
        attempt = 2
        and exists (select 1 from assignments a where a.id = assignment_id and a.allow_retry)
        and exists (
          select 1 from answers a1 join student_gradings g on g.answer_id = a1.id
          where a1.assignment_id = answers.assignment_id and a1.item_no = answers.item_no and a1.attempt = 1 and g.status = 'confirmed'
        )
      )
    )
  );
-- 고치기: 제출 전 줄만. 제출(submitted_at 찍기)은 본문이 앞뒤 공백을 뺀 50자 이상일 때만(스펙 §5.2, submitAnswer 의 trim 검사를 통과한 본문은 사실상 늘 통과 — 이모지처럼 JS 가 2칸으로 세는 문자가 많을 때만 예외).
create policy student_update_answers on answers for update
  using (submitted_at is null and exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid() and a.closed = false))
  with check (
    exists (select 1 from assignments a where a.id = assignment_id and a.student_id = auth.uid())
    and (submitted_at is null or length(btrim(body)) >= 50)
  );
-- 학생은 gradings 기본 표에 정책이 없다(=아무 것도 못 봄). 뷰 student_gradings 로만 읽는다.
-- 정책 수: 관리자 3 + 원장 4 + 학생 4 = 11.

-- 7) 학생 번호 발급 (원별 1부터)
-- 안전장치는 잠금만이 아니다: advisory 잠금은 이 함수(=rpc 한 번의 트랜잭션)가 끝나면 풀리므로, 번호를 받은 뒤
-- students 에 넣기까지의 틈에 다른 요청이 같은 번호를 받을 수 있다. 중복은 students 의 unique(academy_id, seq) 가
-- 최종으로 막고, 그때 앱(app/teacher/students/actions.ts)이 만든 auth 계정을 지워 반쪽 계정을 남기지 않는다(정리).
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
