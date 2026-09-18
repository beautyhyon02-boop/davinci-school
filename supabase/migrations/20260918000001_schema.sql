create extension if not exists "pgcrypto";

create type user_role as enum ('admin','teacher','student');
create type school_level as enum ('초','중','고');
create type subject as enum ('국어','영어','수학','과학','사회','한국사');
create type item_status as enum ('draft','review','published','retired');
create type grading_status as enum ('pending','done','failed');
create type inquiry_status as enum ('new','contacted','done');

create table academies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{3,12}$'),
  name text not null,
  region text,
  director_phone text,
  active boolean not null default true,
  student_capacity int not null default 100,
  monthly_grading_limit int not null default 300,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  academy_id uuid references academies(id),
  name text not null,
  login_id text unique,
  created_at timestamptz not null default now(),
  check ((role = 'admin' and academy_id is null) or (role <> 'admin' and academy_id is not null))
);
create index on profiles(academy_id);

create table students (
  profile_id uuid primary key references profiles(id) on delete cascade,
  academy_id uuid not null references academies(id),
  level school_level not null,
  grade int not null check (grade between 1 and 6),
  enrolled boolean not null default true,
  seq int not null,
  unique (academy_id, seq)
);

create table standards (
  id uuid primary key default gen_random_uuid(),
  level school_level not null,
  subject subject not null,
  grade_band text not null,
  domain text not null,
  code text not null unique,
  text text not null
);
create index on standards(level, subject);

create table themes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro text,
  level school_level not null,
  grade int not null,
  status item_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table item_sets (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references themes(id) on delete cascade,
  subject subject not null,
  level school_level not null,
  grade int not null,
  status item_status not null default 'draft',
  version int not null default 1,
  reconstruction jsonb,
  key_question text,
  lesson_plan jsonb,
  teacher_guide text,
  item jsonb,
  rubric jsonb,
  exemplars jsonb,
  generation_log jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on item_sets(theme_id);
create index on item_sets(status, level, subject);

create table item_set_standards (
  item_set_id uuid references item_sets(id) on delete cascade,
  standard_id uuid references standards(id),
  primary key (item_set_id, standard_id)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  item_set_id uuid not null references item_sets(id),
  item_set_version int not null,
  academy_id uuid not null references academies(id),
  student_id uuid not null references students(profile_id),
  assigned_by uuid not null references profiles(id),
  due_at timestamptz,
  allow_retry boolean not null default true,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on assignments(student_id);
create index on assignments(academy_id);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  attempt int not null default 1,
  body text not null default '',
  entered_by uuid not null references profiles(id),
  saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (assignment_id, attempt)
);

create table gradings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  academy_id uuid not null references academies(id),
  status grading_status not null default 'pending',
  overall text,
  criteria jsonb,
  strengths jsonb,
  improvements jsonb,
  model text,
  input_tokens int,
  output_tokens int,
  error text,
  teacher_comment text,
  regrade_requested boolean not null default false,
  created_at timestamptz not null default now(),
  graded_at timestamptz
);
create index on gradings(academy_id, created_at);

create table franchise_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  region text not null,
  message text,
  status inquiry_status not null default 'new',
  created_at timestamptz not null default now()
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all','teacher')),
  published_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  description text,
  audience text not null default 'teacher',
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create table site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table student_count_snapshots (
  academy_id uuid references academies(id),
  month date not null,
  enrolled_count int not null,
  primary key (academy_id, month)
);
