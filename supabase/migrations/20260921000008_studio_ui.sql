alter table themes
  add column if not exists subjects text[] not null default '{}',
  add column if not exists intro_ideas jsonb,
  add column if not exists materials jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists item_sets_theme_subject_uniq on item_sets(theme_id, subject);

insert into storage.buckets (id, name, public) values ('materials', 'materials', true)
  on conflict (id) do nothing;

create policy materials_admin_write on storage.objects for insert
  with check (bucket_id = 'materials' and current_user_role() = 'admin');
create policy materials_admin_update on storage.objects for update
  using (bucket_id = 'materials' and current_user_role() = 'admin');
create policy materials_admin_delete on storage.objects for delete
  using (bucket_id = 'materials' and current_user_role() = 'admin');
create policy materials_public_read on storage.objects for select
  using (bucket_id = 'materials');
