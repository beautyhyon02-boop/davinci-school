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
