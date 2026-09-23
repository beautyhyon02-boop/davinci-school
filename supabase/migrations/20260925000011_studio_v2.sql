-- v2 제작소: 2·3·7단계 전용 열과 학생별 차시 안내장 (스펙 docs/superpowers/specs/2026-09-25-item-studio-v2-design.md §2.7, §4.2)
-- 파일만 만든다 — 적용(supabase db push)은 대표님.

-- 1) item_sets: 2단계 재구조화 표, 3단계 평가 계획(unit_plan), 7단계 안내장 틀
--    (lib/studio/repo.ts saveOutput·loadContext 와 app/admin/items/[themeId]/sets/[setId]/actions.ts stageColumns 가 쓴다)
alter table item_sets
  add column if not exists unit_plan jsonb,
  add column if not exists reconstruction_detail jsonb,
  add column if not exists notice_plan jsonb;

-- 2) 학생별 차시 안내장(초안 → 원장 확정 → 인쇄)
-- 이름이 notices 가 아닌 이유: 1주차 스키마(20260918000001)에 공지사항 표 notices(title, body, audience)가 이미 있다.
-- 같은 이름에 "create table if not exists" 를 쓰면 조용히 건너뛰고 아래 색인·정책이 없는 열(academy_id, status)에서 실패한다.
create table if not exists lesson_notices (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  academy_id uuid not null references academies(id) on delete cascade,
  lesson_no int not null check (lesson_no between 1 and 8),
  body jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  drafted_by uuid references profiles(id),
  drafted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (assignment_id, lesson_no)
);
create index if not exists lesson_notices_academy_status_idx on lesson_notices(academy_id, status);

-- 3) RLS: 관리자 전체, 원장은 자기 원의 배정에 딸린 안내장만 읽고 쓴다(academy_id 와 배정의 원이 모두 자기 원이어야 한다 —
--    다른 원의 assignment_id 에 자기 academy_id 를 붙여 넣는 것을 막는다). 학생 정책 없음: 안내장은 첫 주엔 원장 화면에서
--    보고 인쇄한다(대표님 잠정 결정 2026-09-25). 발송·열람은 발표 뒤.
alter table lesson_notices enable row level security;

drop policy if exists admin_all_lesson_notices on lesson_notices;
create policy admin_all_lesson_notices on lesson_notices for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

drop policy if exists teacher_rw_lesson_notices on lesson_notices;
create policy teacher_rw_lesson_notices on lesson_notices for all
  using (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id())
  )
  with check (
    current_user_role() = 'teacher' and academy_id = current_academy_id()
    and exists (select 1 from assignments a where a.id = assignment_id and a.academy_id = current_academy_id())
  );
-- 정책 수: 관리자 1 + 원장 1 = 2.
