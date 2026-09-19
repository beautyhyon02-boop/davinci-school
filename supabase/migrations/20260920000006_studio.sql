alter type subject add value if not exists '세계사';

alter table standards
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references profiles(id),
  add column if not exists source_page int;

alter table item_sets
  add column if not exists learning_goals jsonb,
  add column if not exists key_question text,
  add column if not exists lessons jsonb,
  add column if not exists materials jsonb,
  add column if not exists assessment jsonb,
  add column if not exists teacher_guide jsonb,
  add column if not exists stage_status jsonb not null default '{}'::jsonb;

create table if not exists item_set_versions (
  item_set_id uuid references item_sets(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references profiles(id),
  primary key (item_set_id, version)
);

create table if not exists generation_log (
  id uuid primary key default gen_random_uuid(),
  item_set_id uuid references item_sets(id) on delete cascade,
  theme_id uuid references themes(id) on delete cascade,
  stage int not null,
  role text not null check (role in ('generate','review')),
  attempt int not null default 1,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  ok boolean not null,
  issues jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index on generation_log(item_set_id, stage);

alter table item_set_versions enable row level security;
alter table generation_log enable row level security;

create policy admin_all_item_set_versions on item_set_versions for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy auth_read_published_versions on item_set_versions for select
  using (auth.uid() is not null and exists (select 1 from item_sets s where s.id = item_set_id and s.status = 'published'));
create policy admin_all_generation_log on generation_log for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
