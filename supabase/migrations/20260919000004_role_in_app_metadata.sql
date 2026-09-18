-- 역할 식별자를 사용자가 직접 수정할 수 있는 raw_user_meta_data 가 아니라
-- service role 만 쓸 수 있는 raw_app_meta_data 에서 읽는다. (final-review C1)
-- name 은 계속 raw_user_meta_data 에서 읽는다(민감하지 않음).
-- role 이 없는 가입(예: 공개 signUp)은 auth.users insert 자체를 실패시킨다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data->>'role' is null then
    raise exception 'role required in app_metadata';
  end if;
  insert into profiles (id, role, academy_id, name, login_id)
  values (
    new.id,
    (new.raw_app_meta_data->>'role')::user_role,
    nullif(new.raw_app_meta_data->>'academy_id','')::uuid,
    coalesce(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_app_meta_data->>'login_id','')
  );
  return new;
end $$;

-- 과제의 학생이 반드시 같은 원 소속이도록 스키마 수준에서 묶는다. (final-review I1)
alter table students
  add constraint students_profile_academy_unique unique (profile_id, academy_id);
alter table assignments
  add constraint assignments_student_academy_fk
  foreign key (student_id, academy_id) references students(profile_id, academy_id);

-- 익명 가맹문의 삽입은 status='new' 로만 허용한다. (final-review I6)
drop policy anon_insert_inquiry on franchise_inquiries;
create policy anon_insert_inquiry on franchise_inquiries for insert with check (status = 'new');
