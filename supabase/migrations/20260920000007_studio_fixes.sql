-- 0006에서 item_sets.teacher_guide를 jsonb로 추가하려 했으나 0001에서 이미 text로 선언되어 있어
-- "add column if not exists"가 no-op이 되는 문제 수정. 현재 전 레코드에서 null이므로 안전하게 타입 변경.
alter table item_sets
  alter column teacher_guide type jsonb using nullif(teacher_guide, '')::jsonb;

-- stage_status jsonb 갱신을 read-modify-write가 아닌 원자적 병합으로 수행하기 위한 함수.
create or replace function public.set_stage_status(p_item_set_id uuid, p_key text, p_value jsonb) returns void
language sql security definer set search_path = public as $$
  update item_sets
  set stage_status = coalesce(stage_status, '{}'::jsonb) || jsonb_build_object(p_key, p_value),
      updated_at = now()
  where id = p_item_set_id and current_user_role() = 'admin'
$$;
