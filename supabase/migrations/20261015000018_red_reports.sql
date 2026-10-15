-- RED 보고서(대표 2026-10-15): 생성기가 매일 만드는 교사용 완성보고서 + 학생용 작성양식(docx)을 홈페이지 탐구보고서 페이지에서
-- 가맹 원장만 내려받게 한다. 구분 BASIC(초등)/ADVANCED(중고등). 파일은 비공개 bucket 'resources', 줄은 기존 resources 표에 열을 더한다.
-- 파일만 만든다 — 적용(supabase db push)은 대표님. 다시 실행해도 안전하다("있으면 건너뜀").
-- 정책: 관리자 전체(admin_all_resources, 그대로). 원장 읽기는 숨기지 않은 줄만으로 좁힌다(독립 검토 2026-10-15 — 숨긴 줄의 파일 이름이 PostgREST 로 보이지 않게). 학생 정책은 없다(안 보임).

alter table resources add column if not exists category text check (category in ('BASIC', 'ADVANCED'));
alter table resources add column if not exists kind text check (kind in ('teacher', 'student'));
alter table resources add column if not exists series text not null default '';
alter table resources add column if not exists subject text not null default '';
alter table resources add column if not exists title text not null default '';
alter table resources add column if not exists report_date date;
alter table resources add column if not exists hidden boolean not null default false;
alter table resources add column if not exists size_bytes integer;
create unique index if not exists resources_filename_uniq on resources(filename) where category is not null;   -- RED 줄에만(옛 줄과 부딪히지 않게)
create index if not exists resources_red_idx on resources(category, report_date desc);

drop policy if exists teacher_read_resources on resources;
create policy teacher_read_resources on resources for select using (current_user_role() = 'teacher' and not hidden);

comment on column resources.category is 'RED 보고서 구분: BASIC(초등) / ADVANCED(중고등). 파일 이름 끝 (초등)/(중고등)에서 읽는다(lib/red/reports.ts parseRedFilename).';
comment on column resources.kind is 'teacher = 교사용 완성보고서, student = 학생용 작성양식. 같은 구분·시리즈·과목·제목이면 한 세트.';
comment on column resources.hidden is '원장 목록에서 숨김(지우지 않고). 본사 관리 화면에서 바꾼다.';

-- 비공개 저장소: 공개 URL 없음. 내려받기는 서버가 역할(원장·관리자)을 확인한 뒤 service role 로 짧은 서명 URL 을 만든다(app/(public)/programs/inquiry/actions.ts).
insert into storage.buckets (id, name, public) values ('resources', 'resources', false)
  on conflict (id) do nothing;
-- storage.objects 정책은 두지 않는다 — 올리기·내려받기 모두 service role(서버)만. 브라우저에서 직접 bucket 에 닿지 못한다.
