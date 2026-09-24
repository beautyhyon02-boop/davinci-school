-- 대주제 학년을 선택으로 (대표 결정 2026-09-26)
-- 2022 개정 성취기준은 학년군 단위(중학교 1~3학년군, 초등 3~4·5~6학년군)라서 대주제를 학년 하나에 묶지 않는다.
-- 대주제는 학교급(초/중)만 필수, 학년은 선택(null = 학년 지정 안 함 → "중학교(1~3학년군) 수준").
-- 세트(item_sets)는 만들 때 대주제 학년을 복사하므로(app/admin/items/[themeId]/actions.ts createItemSet) 같은 규칙을 따른다.
-- 파일만 만든다 — 적용(supabase db push)은 대표님. 다시 실행해도 안전하다(0011 과 같은 "있으면 건너뜀" 방식).
--
-- 참고: 0001 스키마(20260918000001_schema.sql)에서 themes.grade·item_sets.grade 는 "int not null" 이고 check 제약이 없다
-- (37행의 "check (grade between 1 and 6)"은 students.grade). 그래서 여기서 새 check 를 이름을 붙여 만든다 —
-- 이미 있으면 지우고 다시 만들어 여러 번 실행해도 같은 결과가 된다. 기존 행은 모두 폼 검사(1~6)를 거쳤으므로 그대로 통과한다.

-- 1) themes.grade: null 허용 + 1~6 또는 null
alter table themes alter column grade drop not null;
alter table themes drop constraint if exists themes_grade_check;
alter table themes add constraint themes_grade_check check (grade is null or grade between 1 and 6);

-- 2) item_sets.grade: 대주제 학년을 복사해 두는 열 — 같은 규칙
alter table item_sets alter column grade drop not null;
alter table item_sets drop constraint if exists item_sets_grade_check;
alter table item_sets add constraint item_sets_grade_check check (grade is null or grade between 1 and 6);

-- 게시 판(item_set_versions.snapshot)은 건드리지 않는다 — 옛 판의 cover.grade 숫자는 그대로 남고, 새 판은 cover.grade 가 null 일 수 있다.
