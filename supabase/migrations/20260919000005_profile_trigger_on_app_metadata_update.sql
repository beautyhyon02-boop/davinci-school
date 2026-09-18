-- GoTrue 의 admin createUser 는 auth.users 를 먼저 insert 한 뒤 app_metadata 를 update 로 채운다.
-- 따라서 insert 시점에는 raw_app_meta_data 에 role 이 아직 없어 0004 의 트리거가
-- 'role required in app_metadata' 로 실패했다 (Database error creating new user).
-- 해결: insert 시 role 이 없으면 조용히 건너뛰고, raw_app_meta_data 가 갱신되어 role 이
-- 생기는 순간(update) 프로필이 없으면 그때 만든다. 공개 가입은 대시보드에서 꺼져 있으므로
-- role 없는 사용자는 service role 이 만들다 만 경우뿐이고, 프로필이 없으면 RLS·getSessionProfile 이 막는다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data->>'role';
begin
  if v_role is null then
    return new;
  end if;
  if exists (select 1 from profiles where id = new.id) then
    return new;
  end if;
  insert into profiles (id, role, academy_id, name, login_id)
  values (
    new.id,
    v_role::user_role,
    nullif(new.raw_app_meta_data->>'academy_id','')::uuid,
    coalesce(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_app_meta_data->>'login_id','')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of raw_app_meta_data on auth.users
for each row execute function public.handle_new_user();
