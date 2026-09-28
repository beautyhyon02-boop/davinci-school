-- 세트별 공동 자료 선택 (대표 결정 2026-09-28)
-- 대주제 공유(공동) 자료 A~D 가 모든 과목 세트에 한꺼번에 들어가 영어 세트 수업에 수학 표가 섞였다.
-- 이제 공동 자료는 세트마다 "골라 쓰기"다: 관리자가 이 세트에서 쓸 공동 자료를 체크하고(기본값 = 아무것도 안 씀),
-- 체크하지 않은 공동 자료는 그 세트의 AI 생성·검토 입력에 들어가지 않고 게시 판에도 실리지 않는다.
--
-- item_sets.shared_material_ids: 이 세트가 쓰기로 고른 대주제 공동 자료 ID 배열(예: ["B", "D"]). ID 는 themes.materials[].id.
-- 저장은 서버 동작(setSharedMaterialIds·createItemSet)이 대주제 자료 ID 와 맞춰 본 뒤에만 한다.
-- 이 열 이전에 만든 세트는 [] 로 채워진다 → 다음 생성·게시부터 공동 자료를 쓰지 않는다(필요하면 세트 화면에서 다시 체크).
--
-- 파일만 만든다 — 적용(supabase db push)은 대표님, 코드 push 보다 먼저. 다시 실행해도 안전하다("있으면 건너뜀").
-- RLS 는 그대로다: 같은 item_sets 표의 열이라 기존 정책(관리자 읽기·쓰기)이 그대로 적용된다.

alter table item_sets add column if not exists shared_material_ids jsonb not null default '[]'::jsonb;

comment on column item_sets.shared_material_ids is
  '이 세트에서 쓸 대주제 공동 자료 ID 배열(themes.materials[].id, 예: ["B","D"]). 기본 [] = 공동 자료를 쓰지 않음. 대표 결정 2026-09-28.';
