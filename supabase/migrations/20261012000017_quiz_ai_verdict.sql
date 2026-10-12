-- 퀴즈 AI 뜻 판정(대표 2026-10-12): 단답형 퀴즈가 글자 비교로 틀렸을 때 작은 모델이 "맞음/부분/틀림"을 판정한 결과와 이유 한 줄.
-- 파일만 만든다 — 적용(supabase db push)은 대표님. 다시 실행해도 안전하다("있으면 건너뜀").
-- 0017 전에 코드가 배포돼도 깨지지 않는다: 열이 없으면 학생 제출이 판정 열을 빼고 다시 넣는다(app/student/assignments/[id]/actions.ts).
-- 정책은 바꾸지 않는다 — 학생은 읽기만(student_read_quiz), 원장은 자기 학원(teacher_rw_quiz), 관리자 전체(admin_all_quiz) 그대로.
alter table quiz_responses add column if not exists ai_verdict text check (ai_verdict in ('맞음', '부분', '틀림'));
alter table quiz_responses add column if not exists ai_reason text;
-- 무엇으로 맞았는지(독립 검토 2026-10-12: 핵심어로 맞은 칸도 원장이 알아보게): literal(글자 비교) / keyword(핵심어) / ai(AI 판정). 틀린 줄·원장이 넣은 줄·옛 줄은 null.
alter table quiz_responses add column if not exists match_kind text check (match_kind in ('literal', 'keyword', 'ai'));
comment on column quiz_responses.ai_verdict is 'AI 뜻 판정(맞음/부분/틀림). 글자 비교로 맞았거나 AI를 부르지 않은 줄은 null. 원장이 O/X 를 바꿔도 남는다(overridden_by 가 우선).';
comment on column quiz_responses.ai_reason is 'AI 판정 이유 한 줄(원장 화면 칸 제목에 보인다).';
comment on column quiz_responses.match_kind is '맞은 근거: literal(글자 비교) / keyword(핵심어 L-22) / ai(AI 뜻 판정). 틀렸거나 원장이 넣은 줄은 null.';
