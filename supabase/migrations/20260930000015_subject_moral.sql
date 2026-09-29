-- 0015: subject enum 에 '도덕' 추가 (2026-09-30)
-- 도덕·윤리 성취기준(data/standards/도덕.json, 103건)을 standards 표에 넣기 위한 분류 값이다.
-- 제작소 과목은 그대로 다섯(국어·영어·수학·과학·사회) — 도덕·윤리 성취기준은 사회 세트에서 고른다.
-- "있으면 건너뜀"이라 다시 실행해도 안전하다. enum 에 더한 값은 같은 트랜잭션 안에서 바로 쓸 수 없으므로
-- 이 파일에는 이 한 문장만 둔다(성취기준 넣기는 적용 뒤 scripts/import-standards.ts 로 따로 한다).
alter type subject add value if not exists '도덕';
