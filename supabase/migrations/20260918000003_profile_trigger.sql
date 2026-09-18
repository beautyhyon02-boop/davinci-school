create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, academy_id, name, login_id)
  values (
    new.id,
    (new.raw_user_meta_data->>'role')::user_role,
    nullif(new.raw_user_meta_data->>'academy_id','')::uuid,
    coalesce(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'login_id','')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
