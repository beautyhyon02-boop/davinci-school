# 문항 제작소 v2 설계 — 공식 자료를 뼈대로, 학원 맥락으로 넘어서기

작성 2026-09-25 · 대체 대상: `2026-09-20-item-studio-design.md`(v1) §1·§2·§4 · 함께 읽을 것: `2026-09-21-week3-classroom-design.md`(수업 운영), `2026-09-24-reference-corpus-design.md`(지식 베이스 착상)
근거 문서: `docs/research/corpus/wp1-levels-principles.md`(성취수준 원리), `wp4-essay-principles.md`(서·논술형 원칙), `wp7-lesson-design.md`(재구성·차시 서식), `wp8-feedback-record.md`(기록·안내장), `wp11-workbook-math.md`(문제집 난이도), `wp13-2025-essay-guide.md`(2025 길라잡이), `docs/research/2026-09-23-seoul-math-essay-items.md`(서울·평가원 수학), 예시 은행 README 6종(`data/reference/exemplars/*/README.md`, `2025/README-사과.md`), 성취수준 데이터(`data/reference/levels/README.md`).
인용 표기: `(wp4 §6)`처럼 연구 문서의 절을 적고, 그 절이 인용한 원문 쪽은 `(wp4 §6; 고가이드북-과학 p.21)`처럼 병기한다. 원문 쪽 번호는 연구 문서가 확인한 값이며 이 문서에서 다시 검증하지 않았다.

이 문서는 두 독자를 위해 썼다. 대표님은 §0·§3·§5·§6·§7을 읽으면 되고, 구현하는 사람은 전부(특히 §2·§4·부록 A)를 기준으로 삼는다.

---

## 0. 한 장 요약

### 0.1 v1 → v2, 단계별로 무엇이 바뀌나

| 단계 | v1(지금) | v2(바뀌는 것) | 근거 |
|---|---|---|---|
| 0 소개 | 소개문 + 과목별 아이디어 + 공유 자료 A~D(JSON 붙여넣기) | 그대로. 공유 자료는 3B 계획대로 [생성]→[검토]→[확정]. **AI가 만들거나 모은 자료에는 "원장 확인 필요" 표식**을 남긴다 | 2025 문항집은 AI 산출 자료를 검증 없이 썼는데 우리는 검증 절차를 되살린다 (wp13 §5-11) |
| 1 성취기준 | 소단원의 성취기준 2~6개 선택, 원문 확인 체크 | 그대로 + 고른 성취기준마다 **성취수준 A~E 문장을 자동으로 붙여 보여 준다**(`data/reference/levels`) | 성취수준 = 표시 + 수행특성 문장 세트 (wp1 §1; 총론 p.78) |
| 2 재구성·목표·핵심질문 | 통합 문장 1개 + 학습 목표 3~4 + 핵심질문 후보 | **재구조화 표**(성취기준마다 통합/재조정/유지 + 원문 병기) + 통합 문장 1개(유지) + 학습 목표를 **지식·이해/과정·기능/가치·태도 세 축**으로 표시 + C수준(도달점) 문장 병기 + 핵심질문 후보 | 재구조화 3유형·원문 병기 (wp7 §1; 수학재구성 p.11·13), C가 도달점 (wp1 §7-3) |
| 3 차시 설계 | 차시별 성취기준·핵심질문·목표·흐름(문장 3개)·자료·퀴즈 3·평가 배치·병합 | **평가 계획표 + 차시 지도안 + 활동지**. 60분 배분(10/40/10), 전개 소단계에 분 표시, **발문 Q 2~4개 + 예상 답 + 막힐 때 힌트**, 준비물, 지도상 유의점, 활동지(기본/표준/도전 과제 + 자기평가), 퀴즈 3(교수 차시마다), 서·논술형은 마지막 교수 차시 뒤 단원 평가 차시(2026-09-26) | 대구 본시지도안(분 단위·핵심질문·유의점)이 최적 모델 (wp7 §0-2, §3(d); 대구수업평가설계 p.9), 발문+예상답은 공식 관행 (wp7 §0-3; 수학재구성 p.92-95) |
| 4 자료 | 가상 자료(자작만), 표·글·그래프 | 그대로 + **출처 종류 확장**(자작 / 공개 자료 인용·출처 표기) + 자료 크기 관행(표 5~10행, 원자료 20~25개, 그래프 1~2개) 검토 + 원자료만(답을 미리 담지 않음) 검사 유지 | 자료 규모 관행 (WP5-수학 README 관찰4; wp11 §6-1), 자료 의존성 원칙 (wp4 §5) |
| 5 평가 문항 | 문두·조건(분량/필수/형식)·채점표(서술형 단계표 / 논술형 4×5)·등급표·논술형 예시답안 상중하·피드백 틀 | **문항 카드**(2025 서식): 평가 요소(~하기) · 상황 · 사용 자료 · 문두(전제문+발문+[배점]) · **조건(행동동사 단위 + 부분배점)** · **채점표(요소 × 척도 × 수행특성, 1점 단위, 조건↔요소 대응)** · 총체적 상/중/하(논술형) · **예시답안(척도 단계마다)** · 채점 시 유의점 · 최소 능력 · A~E 예상 점수 구간 · 답안 방식(화면/종이) · 참고한 공개 자료 | 2025 문항 카드 7블록 (wp13 §1), 조건-배점 병기 (서울 §2, §6-3), 척도별 예시답안 (서울 §3, §6-5), 채점 유의점 (wp13 §5-6) |
| 6 교사용 지침서 | 세트 준비물·일정·용어·차시별 메모 | 차시별 발문·유의점·퀴즈 해설은 **3단계 지도안으로 흡수**. 남는 것: 세트 총괄(준비물·일정·목적), 용어, **병합 안내**(어느 활동을 빼는지), **검수 요령**(흔한 오답·유의점·재도전 안내) | 지침서와 지도안의 중복 제거 (wp13 §5-1: 문항+수업 설계를 한 산출물로) |
| **7 차시별 피드백 안내장(신설)** | 없음 | 세트 게시 시 **안내장 틀**(차시별 학습 요약·다음 차시·가정 학습·퀴즈 오답 코멘트·요소별 문구 은행)을 만들고, 수업 뒤 학생별 안내장은 확정 채점·퀴즈·재도전 데이터로 채운다. 학부모·학생 공동 수신, 하단에 "학생부가 아님" 고지 | 세특 도출 4단계·4색 모델·문장 패턴 (wp8 §0, §1(b), §3), 학원 맥락 확장 (wp8 §7) |
| 게시·패키지·교재 | PackageView·스냅샷·(3B) 인쇄 | 패키지에 재구성표·평가계획·지도안 카드·문항 카드·안내장 틀·참고 자료 출처가 추가. 학생 화면은 `answer_mode`로 화면/종이를 가른다 | §2.9 |

### 0.2 공식 자료를 넘어서는 지점 (한 줄씩, 상세는 §5)

1. **60분 차시 시간 배분과 병합 규칙** — 공식 자료는 45/50/90분뿐 (wp7 §9-1).
2. **비전공 원장 대본** — 발문·예상 답·막힐 때 힌트·오답 되짚기까지 지도안에 넣는다 (wp7 §9-2).
3. **STEAM 5과목 공유 대주제·공유 자료** — 교과 간 동시 설계 선례가 거의 없다 (wp7 §9-3; wp4 §11-1).
4. **성취수준 ↔ 채점 척도 ↔ 7등급 대응을 명시적 설정값으로** — KICE는 "1:1 대응 안 해도 된다"까지만 말한다 (wp1 §8-6).
5. **가치·태도를 "글에 드러난 행동·관점 진술"로 채점** — 내면화 5단계 위계화는 연구진도 회의적 (wp1 §8-1).
6. **척도 단계마다 예시답안** — 2025는 문항당 1개로 간소화했지만 우리는 2020-21 방식을 유지·강화 (wp13 §5-7).
7. **차시별 안내장(학부모 공동 수신·재도전 향상 서술·학원 고지)** — 세특은 학기 단위·교사→학생 단일 수신 (wp8 §7).
8. **AI 산출물 검증 게이트와 채점 근거 인용** — 2025 문항집은 검증 절차가 빠져 있고, 채점 자동화는 별도 문서에만 있다 (wp13 §5-11·13; wp4 §9).

---

## 1. 지식 베이스와 생성의 연결

지식 베이스는 다섯 가지다: 성취기준(DB, 있음), 성취수준(`data/reference/levels/*.json`, 966개 성취기준), 예시 은행(`data/reference/exemplars/**`, 473건 + 2025 사·과 58건), 규칙(`lib/studio/prompts/rules*`), 서식(`data/reference/templates/*.json`). 세트를 만들 때마다 수만 쪽을 다시 읽지 않고 이 다섯만 본다(`2026-09-24-reference-corpus-design.md` §1).

### 1.1 성취수준 — 어느 단계에서 어떤 문장을 어떻게 쓰나

성취수준 데이터의 모양(`levels/README.md`): 성취기준마다 `levels: {A..E}`(중) 또는 `{A..C}`(초), 병합 칸은 `merged_levels`, 영역 단위 세 축 문장은 `domain_levels[].levels[A..E][지식·이해|과정·기능|가치·태도]`. 성취기준 단위에는 세 축 구분이 없다(`dimensions: null`) — 세 축 문장이 필요하면 **영역별 표에서 가져온다**.

| 단계 | 쓰는 문장 | 어떻게 쓰나 | 근거 |
|---|---|---|---|
| 1 성취기준 | 성취기준별 A~E 전부 | 화면에 접이식으로 보여 주기만 한다(관리자·원장 참고). 병합 칸은 "A·B 동일"로 표시 | 성취수준은 표시+문장 세트 (wp1 §1) |
| 2 재구성 | **C 문장**(중) / **B 문장**(초) | 각 성취기준의 도달점 문장으로 프롬프트에 주입하고 출력의 `level_anchor`에 **서버가** 복사한다(AI가 짓지 않음). 재구조화 문장은 C 문장보다 좁아지거나 다른 활동을 가리키면 검토 반려 | 중간 수준을 성취기준 원문에 가장 가까운 도달점으로 고정 (wp1 §7-3; 국어 p.91·95·102) |
| 2 학습 목표 | 영역별 세 축 문장(C) | 학습 목표 3~5개에 `axis`를 붙이고, 세 축이 최소 1개씩 있어야 한다(가치·태도는 1개, 성취기준에 없으면 영역별 표에서). 서술어는 과목마다 하나로 통일(과학 "~할 수 있다") | 세 축 서술 전략 (wp1 §2·§3), 가치·태도는 강제 채우지 않되 있다/없다로 떨어뜨리지 않음 (wp1 §7-8), 서술어 통일 (wp1 §7-20) |
| 3 차시 목표 | 해당 차시 성취기준의 C~D 문장 | 차시 `goal`은 C 문장의 어휘로, 첫 차시는 D~E 어휘(간단한 자료, 주어진 절차)를 허용. `caution_notes`에 D~E 학생 지원 한 줄 | 조건절은 최하위에서만 (wp1 §7-7), 최소 성취수준 보장 지도 계획 (wp7 §2; 대구 UbD 흐름) |
| 3 활동지 상·중·하 | D~E / C / A~B 문장 | 활동지 과제에 `tier: 기본(D~E)·표준(C)·도전(A~B)` 태그. 첫 주는 한 장에 세 과제(기본 1·표준 1~2·도전 1), 세 장으로 분화는 발표 뒤 | "해당 수준 학생 2/3가 맞히는 문항"이 수준 문항의 정의, 같은 성취기준에 A/B용·E용 문항을 따로 만든 예 (wp1 §5; 총론 p.167, 국어 pp.168-171) |
| 5 채점표 척도 | A~E 동사·범위 표현 | 척도 최상단은 A~B의 동사(설명·평가·합리적 해석), 중간은 C(주어진 자료를 …), 최하단은 D~E(부분적으로·간단한). **부사만 바꿔 단계를 가르면 반려** | 진술 전략 4가지 (wp1 §2), 부사·형용사만으로 구분 금지 (wp1 §7-6; 총론 p.103, 과학 p.75) |
| 5 A~E 예상 점수 구간 | 성취기준별 A~E | 문항 카드의 `level_map`: 수준마다 예상 점수 구간 + 응답 특성 한 줄 | 방법사례 신판이 A~E별 예상 점수 구간·응답 특성을 병기 (wp4 §2, §6; 방법사례-국어 p.17) |
| 5 등급표 | KICE 성취율(A 90/B 80/C 70/D 60/E 40) | 7등급표(대표님 확정)에 `level_ref` 참조열을 병기한다. 22점 기준 컷: A≥20, B≥18, C≥16, D≥14, E≥9 → 7=A, 6=B(20점은 A), 5=C(15점은 D), 4=D~E, 3=E, 2·1=E 미만 | 성취율표 (wp1 §2; 총론 p.80), 학교급·기관마다 단계 수가 달라 대응표를 문서화해야 함 (wp13 §5-14), 22점·7등급은 사내 규칙 (서울 §2) |
| 5 최소 능력 | E 문장 | 중학교는 E 문장을 `min_competency`에 서버가 복사(권장), 고등은 필수·별도 생성 | 고교학점제 40% 컷 (wp13 §5-2; 길라잡이 p.37), 고등 E의 정책적 무게 (wp1 §6) |
| 7 안내장 | 상/중/하 문장 패턴 | 밴드별 정도부사·완성동사 규칙으로 문장 생성(§2.8). 성취수준 문장 자체를 학부모에게 그대로 보내지는 않는다(공문체) | 상=정도부사+완성동사, 중=한정어, 하="~하는 데 어려움" (wp8 §0-2, §3(b)) |

성취수준 문장을 프롬프트에 넣을 때 지키는 것(wp1 §7-1·2·4·5): 다섯 문장은 **같은 과제의 도달 정도 차이**이지 다른 활동이 아니다; A 문장은 성취기준 원문 + 수식어 0개가 아니어야 한다; E 문장에 학습량을 더 얹지 않는다.

### 1.2 예시 은행 — 선택 규칙과 출처 표기

레코드 모양(6과목 공통): `id, subject, school_level, grade, unit, standard_codes[], kind(서술형|논술형|수행|서·논술형), points, context, materials[{type,summary}], stem, conditions[], answer_format, rubric{type, criteria[{name, levels[{points, desc}]}], notes}, exemplar_answers[{level,text}], feedback, cognitive[], source{file, pages}`. 2025 레코드는 여기에 `strand, evaluation_elements[], lesson_plan[], requires_drawing, rubric.min_competency, ai_use`가 더 있다(2025/과학.json 확인). **2025 국어·수학·영어 파일은 아직 없다**(`2025/`에는 과학·도덕·사회·역사만) — 그 세 과목은 `_pagemap-2025.json`(국어 23·수학 21·영어 22 항목의 제목·학년·영역·코드·쪽)과 wp13 §1·§3의 서식 설명으로 대신하고, 파일이 들어오면 로더가 자동으로 포함한다.

규모(README 합산): 국어 81, 사회 77, 역사 15(+2025 역사 9), 수학 69, 영어 47, 과학 126(+2025 과학 28), 2025 도덕 9(우리 과목 아님, 참고만). 역사 폴더에는 README가 없고 사회 README가 설명한다.

**선택 규칙(`lib/reference/exemplars.ts`, 순수 함수, 결정적):**

1. 후보 = 같은 `subject`(한국사·세계사 → 역사 폴더, 사회·과학은 2025 파일 포함) ∧ 같은 `school_level`.
2. 점수 = 성취기준 코드 정확 일치 +4 · 코드 접두(영역, 예 `[9수04`) 일치 +3 · `unit` 문자열 일치 +2 · 학년 일치 +2 · 같은 `kind`(서술형↔서술형, 논술형↔논술형·서·논술형) +3 · `rubric.criteria` 비어 있지 않음 +1 · `exemplar_answers` 있음 +1 · 2025 출처 +1 · `requires_drawing`이면서 우리 문항이 화면 입력이면 −2.
3. 상위 3~5개(서술형 생성에 3, 논술형에 2 이상 포함되도록 kind별로 나눠 뽑음). 후보가 3개 미만이면 학교급 제한을 풀고(중→고), 그래도 부족하면 kind 제한을 푼다. 순위 동률은 `id` 사전순.
4. 프롬프트에는 압축 카드로 넣는다(레코드당 900자 안팎): 문두·조건·채점표 요소명과 배점·유의점(`notes`)·예시답안 1개(300자로 자름)·출처. 자료 본문(`context`)은 요약 한 줄만.
5. 출력의 `references[]`에 참고한 `id`와 `source.file p.쪽`을 남기고, 패키지·교재 끝에 "참고한 공개 자료" 목록으로 표기한다(공공누리 출처 표기 의무 — `2026-09-24-reference-corpus-design.md` §5). 예시 문장을 그대로 옮기지 않는다는 지시를 프롬프트에 둔다(패턴 참고).

파일 우선, DB는 발표 뒤(§4.4). 로더는 서버 시작 시 JSON을 한 번 읽어 메모리 색인(과목·학교급·코드 접두)으로 둔다.

### 1.3 규칙 — 병합·중복 제거 방법과 파일 배치

출처별 규칙 수: WP4 프롬프트 18 + 설계·운영 5, WP13 15, WP1 20(프롬프트용 12 + 설계·스키마용 8), WP11 11, 서울 8, WP8 12, WP7 서식 지침(§8), WP5 README 관찰 5×6, 2025 관찰 10. 합치면 100개가 넘고 서로 겹친다.

병합 절차(부록 A가 결과):
1. **성격으로 나눈다**: (가) 프롬프트 문장으로 넣을 것, (나) 스키마·검토 코드로 강제할 것, (다) 운영 절차. WP1이 이미 이 분류를 해 두었다(`PROGRESS.md`: 12개 프롬프트, 8개 설계·스키마).
2. **주제 키로 묶는다**(예: 3요소 구성 / 자료가 답을 대신하지 않음 / 조건=채점표 / 척도 간격 / 무응답·시도 구분 / 예시답안 수준별 / 잘한 점 먼저). 같은 키의 문장은 하나로 합치고 출처 태그를 모두 단다.
3. **충돌은 이렇게 푼다**: 대표님 확정 사항 > 2025(최신 서식) > 2020-21 원칙 > 관찰. 예: 예시답안 개수는 2025(1개)가 아니라 2020-21(단계별)을 택하되 이유를 적는다(wp13 §5-7); 성취수준 단계 수는 학교급 상수(초 3, 중·고 5)로 두고 경기도 초등 4단계는 채택하지 않는다(wp13 §2).
4. **파일 배치**: `lib/studio/prompts/rules/common.ts`(C-), `rules/lesson.ts`(L-), `rules/subjects/{국어,수학,사회,역사,과학,영어}.ts`(S-), `rules/grading.ts`(G-, `lib/classroom/grading-prompt.ts`의 `GRADING_RULES`를 대체), `rules/notice.ts`(N-). 기존 `rules.ts`의 `RULES` 문자열은 `common + lesson + subjects[과목]`을 이어 붙이는 함수 `rulesFor(subject)`로 바뀐다(캐시 브레이크포인트는 그대로 첫 system 블록).
5. 각 규칙에 ID와 출처 태그를 코드 주석으로 남기고, 부록 A와 1:1로 맞춘다(`tests/rules.test.ts`가 ID 집합 일치를 검사).

### 1.4 서식

| 서식 | 파일 | 쓰는 단계 | 근거 |
|---|---|---|---|
| 성취기준 재구조화 표 | (스키마로만, §2.3) | 2 | wp7 §3(a); 수학재구성 p.87 |
| 평가 계획표(학생평가 운영 계획 축약) | `templates/lesson-design.json` `UnitPlan.assessment_plan` | 3 | wp7 §3(b); 수학재구성 p.167 |
| 차시 지도안(본시 수업지도안 + 교수·학습 계획) | `templates/lesson-design.json` `Lesson` | 3 | wp7 §3(d); 대구수업평가설계 p.9, 수학재구성 p.89-95 |
| 활동지 | (스키마로만, §2.4) | 3 | wp7 §3(e); 수학재구성 p.172-174 |
| 문항 카드(7블록) | (스키마로만, §2.6) | 5 | wp13 §1; 국어문항 p.28·30·31 |
| 채점기준표(요소×척도×수행특성 + 유의점) | 문항 카드 안 | 5 | wp4 §6; wp13 §1 |
| 안내장 | `templates/notice.json` | 7 | wp8 §5 |

---

## 2. 단계별 설계(v2)

공통: 각 단계는 v1과 같이 독립 호출(생성 → 검토 → 확정), 확정 출력만 다음 단계 `prior`로 넘어간다(`lib/studio/stages.ts`). 검토는 두 겹이다 — **순수 TS 검사**(모델 호출 없음, 스키마 `superRefine` + `lib/studio/checks/*.ts`)가 먼저 거르고, 통과한 것만 **검토 AI**가 본다. 아래 "검토 규칙"에서 [TS]와 [AI]로 구분한다.

### 2.0 0단계 — 대주제 소개·공유 자료

- 입력·출력: v1 그대로(`ThemeIntro`). 공유 자료 생성은 3B 계획(`runThemeMaterials`).
- 추가: `Material.source`가 `'자작'` 리터럴에서 `{ kind: '자작' | '공개', attribution: string | null, ai_assisted: boolean }`로 바뀐다(§2.5). 공개 자료·AI 보조 자료는 확정 화면에 "원장 확인 필요" 배지가 붙는다.
- 검토 규칙: [TS] 표 합계·비율 일관성(3B 그대로). [AI] 학년 어휘, 자료가 결론을 담지 않는지.
- 근거: AI 산출 자료 검증 절차 부활 (wp13 §5-11), 자료 출처·저작권 표기는 house 규칙 (wp4 §5; 공통양식 p.5-6).

### 2.1 1단계 — 성취기준

- 입력: 과목·소단원 → 성취기준 2~6개(v1).
- 출력: `StandardsRecommendation` v1 그대로. 화면은 고른 코드마다 `getLevels(code)`로 A~E를 접이식 표시.
- 검토 규칙: [AI] 학년 적합성(v1). [TS] `getLevels`가 `null`이면 경고(도덕 등 DB 밖 과목, `coverage.md`).
- 근거: 성취수준 용도 ③④(수업 설계·평가도구 제작 근거) (wp1 §1; 총론 p.141).

### 2.2 2단계 — 재구성·학습 목표·핵심질문

입력: 성취기준 원문(절대 변형 금지) + 각 코드의 C 문장(초는 B) + 영역별 세 축 C 문장 + 대주제.

출력 JSON:

```ts
export const ReconstructedStandard = z.object({
  code: z.string(),                              // 원문 코드 그대로
  original_text: z.string(),                     // 원문(서버가 DB에서 복사, AI 출력과 불일치면 반려)
  reconstruction_type: z.enum(['통합', '재조정', '유지']),
  merged_with: z.array(z.string()).default([]),  // 통합이면 함께 묶인 코드
  reconstructed_text: z.string().min(10),        // "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다"
  reason: z.array(z.enum(['학원 60분 최적화', '4~6차시 압축', '비전공 원장 진행 용이'])).min(1),
  learning_elements: z.array(z.string()).min(1).max(6),
})
export const Reconstruction = z.object({
  standards: z.array(ReconstructedStandard).min(2).max(6),
  reconstruction: z.string().min(10),            // 세트 통합 문장 1개(기존 필드 유지)
  learning_goals: z.array(z.object({
    text: z.string().min(5),                     // "~할 수 있다" / 가치·태도는 "~을 가진다" 허용
    axis: z.enum(['지식·이해', '과정·기능', '가치·태도']),
  })).min(3).max(5),
  level_anchor: z.array(z.object({ code: z.string(), level: z.enum(['B', 'C']), statement: z.string() })), // 서버가 채움
  key_question_candidates: z.array(z.string().min(5)).min(2).max(3),
})
```

검토 규칙:
- [TS] `checkReconstructionFidelity`를 `reconstruction`뿐 아니라 **모든 `reconstructed_text`**에 돌린다(v1 검사기 재사용). `original_text`가 DB 원문과 다르면 반려. `type=유지`면 `reconstructed_text === original_text`. 통합이면 묶인 원 성취기준의 `learning_elements`가 하나도 사라지지 않았는지(내용요소 삭제 금지) — 각 원문의 명사 어휘가 통합 문장에 남아 있는지 접두 일치로 검사.
- [TS] `learning_goals`에 세 축이 각 1개 이상. 서술어가 한 과목 안에서 섞이면(`~할 수 있다`/`~한다`) 경고.
- [AI] 재구조화 문장이 C 문장보다 좁거나 다른 활동인지, 핵심질문이 사실 확인형인지(v1 REVIEW_FOCUS 유지), 재구성에 맥락(축제·일회용품)이 섞였는지.

근거: 재구조화 정의·3유형·내용요소 삭제 금지·원문 병기 (wp7 §1; 수학재구성 p.11·13·87), 재구성 문장 공식과 자가진단 4문항 (wp4 §2; 저자미팅마지막 p.27, 저자미팅0515 p.28), C를 도달점으로 (wp1 §7-3), 세 축 (wp1 §3).

### 2.3 3단계 — 평가 계획 + 차시 지도안 + 활동지

> **세트 구조 결정(대표님 2026-09-26)**: 세트 = 단원 = 교수 차시 1~5개. 매 교수 차시 끝 = 이해 점검 퀴즈 3문항(마지막 교수 차시 포함). 세트 끝 = 서술형 1문항 + 논술형 1문항(정확히 2문항)을 **마지막 교수 차시 뒤 별도 단원 평가 차시**(lessons 의 마지막, `kind: 'assessment'`, 60분 = 평가 안내 5 · 서술형 작성 15 · 논술형 작성 35 · 정리 5, 퀴즈·활동지·발문 없음)에서 함께 본다. 두 문항 모두 분석적 + 총체적 루브릭. 배점 가정 서술형 6 + 논술형 16 = 22(대표님이 바꿀 수 있음 — `lib/studio/assessment-structure.ts` 한 곳). 이 절과 §2.5의 이전 문장(서술형 2 + 논술형 1, 논술형 차시 퀴즈 0)은 아래처럼 바뀌었다. 옛 구조로 게시된 판은 고쳐 쓰지 않고 그대로 읽는다(§4.3).

입력: 2단계 확정 출력 + 각 차시 성취기준의 C·D·E 문장 + 예시 은행에서 뽑은 **수행형·형성평가 레코드 2개**(활동 아이디어용, 문항 아님) + 공유 자료 ID.

출력 JSON(`templates/lesson-design.json`을 zod로 옮긴 것 + 활동지):

```ts
export const UnitPlan = z.object({
  set_title: z.string(),
  set_key_question: z.string(),                          // 2단계에서 고른 것을 복사
  lesson_map: z.array(z.object({ lesson_no: z.number().int(), standards: z.array(z.string()).min(1).max(2), topic: z.string() })).min(4).max(6),
  assessment_plan: z.object({
    formative: z.string(),                               // "교수 차시마다 퀴즈 3문항"
    summative_placement: z.array(z.object({ lesson_no: z.number().int(), kind: z.enum(['서술형', '논술형']) })).length(2),   // 두 건 모두 단원 평가 차시 번호
    rubric_note: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }), // 종합 도달 모습(참고), A~B/C/D~E 어휘
  }),
})
export const ScriptQuestion = z.object({ prompt: z.string().min(5), expected_answer: z.string().min(2), if_stuck: z.string().min(2) })
export const WorksheetTask = z.object({
  no: z.number().int(), prompt: z.string().min(5),
  tier: z.enum(['기본', '표준', '도전']), level_ref: z.enum(['D~E', 'C', 'A~B']),
  answer_space: z.enum(['short', 'lines', 'table', 'draw']), expected: z.string().min(2),
})
export const Worksheet = z.object({
  tasks: z.array(WorksheetTask).max(5),                  // 교수 차시: 2~5개, 기본 1 · 표준 1~2 · 도전 1 이상(superRefine) — 평가 차시는 비움
  self_check: z.array(z.string()).max(3),                // 교수 차시: 1~3 "미흡/보통/만족" 척도 문장
})
export const Lesson = z.object({
  no: z.number().int().min(1).max(8),
  kind: z.enum(['teaching', 'assessment']).default('teaching'),   // assessment = 마지막 교수 차시 뒤 단원 평가 차시(2026-09-26)
  standards: z.array(z.string()).min(1).max(2),
  topic: z.string().min(2),
  key_question: z.string().min(5),
  goal: z.string().min(5),
  time_budget: z.object({ intro_min: z.number().int(), main_min: z.number().int(), wrapup_min: z.number().int() }), // 합 60
  flow: z.object({
    intro: z.array(z.string()).min(1),
    main: z.array(z.object({ step_label: z.string(), minutes: z.number().int().min(5), activities: z.array(z.string()).min(1) })).min(2).max(4),
    wrapup: z.array(z.string()).min(1),
  }),
  teacher_script: z.object({ questions: z.array(ScriptQuestion).max(4) }),   // 교수 차시 2~4(superRefine), 평가 차시 0~4
  materials_used: z.array(z.string().regex(/^[A-Z]$/)).default([]),   // 자료 ID(기존 `materials`의 "자료 A" 파싱을 대체)
  materials_needed: z.array(z.string()).default([]),                  // 준비물(활동지 출력물, 자, 색연필 …)
  caution_notes: z.array(z.string()).min(1).max(4),
  worksheet: Worksheet,
  formative_check: z.object({ quiz: z.array(QuizItem).max(3) }),
  assessment: z.array(z.enum(['서술형', '논술형'])).max(2).default([]),   // 교수 차시 [], 단원 평가 차시 ['서술형', '논술형']
  mergeable_with: z.number().int().nullable(),
  merge_note: z.string().nullable(),                     // 병합 시 빼도 되는 활동(있으면)
  images: z.array(z.string().url()).default([]),
}).superRefine(/* 교수 차시 quiz 3·발문 2~4·활동지 tier 3종, 단원 평가 차시 quiz 0·assessment 비지 않음 · time_budget 합 60 · main.minutes 합 = main_min */)
export const LessonDesign = z.object({ unit_plan: UnitPlan, lessons: z.array(Lesson).min(4).max(6) })   // 교수 차시 3~5 + 단원 평가 차시 1
```

검토 규칙:
- [TS] 모든 성취기준이 어느 차시엔가 배정(v1 coverage). `summative_placement`와 `lessons[].assessment`가 일치. 단원 평가 차시(`kind: 'assessment'`)가 정확히 1개이고 마지막 번호이며 `['서술형', '논술형']`을 담고, 교수 차시에는 서·논술형이 없고, 교수 차시는 3~5개(`sessionPlacementIssues`). 평가 차시 전개에 서술형 작성 소단계와 논술형 작성(35분 이상) 소단계. `mergeable_with`는 인접 번호이고 단원 평가 차시는 병합하지 않음. 퀴즈 정답이 `choices` 안에 있음(선택형). 활동지 `tier` 세 종류가 모두 있음. `materials_used`가 4단계 자료 ID 범위(A~F) 안.
- [AI] 퀴즈가 차시 핵심질문을 점검하는지·정답 검증(v1), 교수 차시의 수업·퀴즈가 단원 평가 문항의 답을 미리 말하지 않는지(C-03), 발문이 "무엇을 왜 묻는지" 원장이 읽고 진행할 만큼 구체적인지, `if_stuck`이 정답을 그대로 말해 주지 않는지, `caution_notes`에 흔한 오개념 1개 이상.

근거: 대구 본시지도안(분 단위·핵심질문 3-터치·유의점) (wp7 §3(d), §5; 대구수업평가설계 p.9·17), 발문 Q1~Q3+예상 답안 관행 (wp7 §5; 수학재구성 p.92-95), 형성평가 선행 → 서술형 → 논술형 배치 (wp7 §6; 수학재구성 p.168-169, 사회재구성 p.148-149), 활동지 공통 요소(반·번호·이름, 핵심질문 재게시, 자기평가) (wp7 §3(e); 수학재구성 p.172-174, 대구 p.34), 60분·병합 시 120분 재편성·퀴즈 3문항은 우리 확장 (wp7 §8, §9-1·4), "수업 = 수행평가 준비" (wp7 §2; 대구 p.8).

### 2.4 4단계 — 자료

입력: 3단계 `materials_used` 합집합, 공유 자료 A~D(재생성 금지, ID 이어 붙이기 — v1 `sharedMaterialLettering` 유지), 과목별 자료 규칙(S-).

출력 JSON:

```ts
export const Material = z.object({
  id: z.string().regex(/^[A-Z]$/),
  title: z.string(),
  kind: z.enum(['table', 'text', 'chart', 'image']),                 // image = 삽화·사진·지도(첨부 슬롯)
  body: z.string().nullable(),
  table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }).nullable(),
  source: z.object({
    kind: z.enum(['자작', '공개']),                                     // 공개 = 교육청·통계청·기사 등 출처 표기 후 그대로 사용
    attribution: z.string().nullable(),                               // 공개면 필수: "통계청(2024), 인구총조사"
    ai_assisted: z.boolean().default(false),                          // AI가 만들거나 모은 자료 → 원장 확인 배지
  }),
  role: z.enum(['raw', 'context']),                                   // raw = 학생이 계산·정리할 원자료, context = 배경 설명
  images: z.array(z.string().url()).default([]),
})
```

검토 규칙:
- [TS] 수치 자료 합계·비율(v1). **크기 관행**: 표 행 5~25(도수분포·상대도수 원자료는 20~25개, 줄기와 잎은 11~20개), 열 ≤ 6, 표 1개가 12행을 넘으면 경고(화면은 반으로 나눠 그림, `PackageView` `SPLIT_ROWS_OVER`). `kind=chart`는 `detectChart`가 그릴 수 있는 표에서만. `source.kind='공개'`인데 `attribution`이 없으면 반려.
- [AI] 자료가 문항이 요구할 결과(정리된 도수분포표·계산된 상대도수·결론 문장)를 미리 담지 않았는지(v1 `other`), 찬반·비교 자료의 균형, 학년 어휘, 자료 간 관계(보완·대비)가 문항 사고 유형과 맞는지.

[종이 답안] 연동: 자료 자체는 답안 방식을 정하지 않는다. 5단계 `answer_mode='paper'` 문항이 참조하는 자료는 교재 인쇄 시 그 문항 쪽에 다시 실린다(3B `booklet.ts`).

근거: 자료 의존성 원칙·편향 금지·적정 난이도 (wp4 §5; 성취문항까지 p.2-3, 중가이드북-국어 p.22), 자료 규모 "한 화면" (WP5-수학 README 관찰4), 원자료 크기·계급 6~7개 (wp11 §6-1), 실제 자료 선호는 사회·과학 (WP5-사회 README 관찰1; 2025 README-사과 관찰3), 공개 자료 출처 표기 (대표님 확정; `2026-09-24-reference-corpus-design.md` §5).

### 2.5 5단계 — 문항 카드

입력: 2·3·4단계 확정 출력 + 각 성취기준 A~E 문장 + 예시 은행 3~5개(§1.2) + 과목 규칙 + 길라잡이 반응 지시어 21개 목록(부록 A의 C-17에 동사 목록 포함).

출력 JSON:

```ts
export const Condition = z.object({
  no: z.number().int().min(1),
  text: z.string().min(5),                       // "자료 B의 수치를 근거로 들 것. (1점)" 문장 그대로(학생이 봄) — 지침만, 풀이 힌트 금지(C-32)
  verb: z.string().min(1),                       // 동사 원형: 들다·인용하다·밝히다·쓰다 …
  points: z.number().int().min(0).nullable(),    // 부분배점(모든 조건에 배점을 붙이지 않아도 됨)
  category: z.enum(['내용', '형식']),
})
export const Conditions = z.object({
  items: z.array(Condition).min(0).max(4),      // C-32(대표 2026-09-26): 서술형 0개, 논술형 2~4개(종류별 개수는 [TS]-10)
  length: z.string().min(2),                     // 셀 수 있는 분량(v1 유지): 글자 수·문장 수·표 행 수·영어는 단어 수
  format: z.string().min(2),                     // 표/문장/문단, 종결어미, 단위 (v1 유지, "[종이 답안]" 접두는 폐지)
  answer_mode: z.enum(['screen', 'paper']),      // 표·그래프·수식 작성 = paper(사진 읽기), 글 = screen
  overflow_rule: z.string().nullable(),          // "두 가지 이상 쓰면 앞의 것만 채점"
})
export const ScaleStep = z.object({ points: z.number().int().min(0), descriptor: z.string().min(5), example: z.string().nullable() })
export const Criterion = z.object({
  name: z.string().min(2),
  axis: z.enum(['지식·이해', '과정·기능', '가치·태도']),
  condition_nos: z.array(z.number().int()),          // 이 요소가 채점하는 조건 번호(조건↔채점표 대응); 서술형 요소·조건을 가리키지 않는 요소는 빈 배열
  max: z.number().int().min(1).max(4),
  scale: z.array(ScaleStep).min(2),              // 0..max 모든 정수가 정확히 한 번씩(superRefine)
})
export const Rubric = z.object({
  criteria: z.array(Criterion).min(1).max(4),
  holistic: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }).nullable(),   // 새 세트는 두 문항 모두 필수(C-15, 2026-09-26) — null 은 옛 판 서술형만
  notes: z.array(z.string().min(5)).min(1).max(4),                                       // 채점 시 유의점
})
export const ExemplarAnswer = z.object({
  level: z.enum(['상', '중', '하']).nullable(),  // 논술형만 상/중/하
  points: z.number().int(),                      // 이 답안이 받는 총점
  scores: z.array(z.number().int()),             // 요소별 점수(criteria 순서)
  text: z.string().min(20),
  rationale: z.string().min(10),                 // 채점자 의견: 왜 이 점수인지, 어느 조건을 충족·미충족했는지
})
export const LevelExpectation = z.object({ level: z.enum(['A', 'B', 'C', 'D', 'E']), min: z.number().int(), max: z.number().int(), trait: z.string().min(5) })
export const AssessmentItem = z.object({
  kind: z.enum(['서술형', '논술형']),
  lesson_no: z.number().int(),
  points: z.number().int().positive(),           // 서술형 6, 논술형 16(2026-09-26 가정; 옛 판 서술형 3)
  evaluation_elements: z.array(z.string().min(3)).min(1).max(3),   // "~하기" 명사형
  situation: z.object({ role: z.string(), audience: z.string(), purpose: z.string(), product: z.string() }).nullable(), // 논술형 필수(GRASPS 축약)
  materials_used: z.array(z.string().regex(/^[A-Z]$/)).min(1),
  stem: z.string().min(10),                      // 전제문(자료 한 줄 요약) + 발문 + "[N점]"
  conditions: Conditions,
  rubric: Rubric,
  exemplar_answers: z.array(ExemplarAnswer).min(2),                  // 서술형: 0점 제외 총점 단계마다 1개(6점이면 6·5·4·3·2·1), 논술형: 상/중/하 3개
  level_map: z.array(LevelExpectation).length(5),                    // A~E 예상 점수 구간 + 응답 특성
  min_competency: z.string().nullable(),                             // E 수준 최소 수행(중: 서버가 E 문장 복사, 고: 생성 필수)
  references: z.array(z.object({ id: z.string(), source: z.string() })).default([]),
})
export const Assessment = z.object({
  items: z.array(AssessmentItem).length(2),                          // 서술형 1 → 논술형 1(2026-09-26), 둘 다 lesson_no = 단원 평가 차시
  grade_boundaries: z.array(z.object({
    grade: z.number().int().min(1).max(7), min: z.number().int(), max: z.number().int(),
    band: z.enum(['상', '중', '하']), level_ref: z.enum(['A', 'B', 'C', 'D', 'E', 'E 미만']),
  })).length(7),
  feedback_templates: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
}).superRefine(/* 아래 [TS] 검사 */)
```

v1과의 대응: `AssessmentItem.kind/lesson_no/stem/points`는 그대로. `conditions.length/format`은 그대로 두고 `required[]`가 `items[]`(구조화)로 바뀐다. `ShortRubric`/`ExtendedRubric` 유니온은 하나의 `Rubric`으로 합쳐진다 — 서술형은 요소 2~3개(최댓값 합 6, 2026-09-26 이전 판은 1~3개·합 3), 논술형은 요소 정확히 4개 × 최댓값 4(대표님 확정 4요소×0~4 유지). 세트 단위 `Assessment.exemplars`는 문항 단위 `exemplar_answers`로 옮긴다(서술형이 논술형 예시로 채점되던 v1의 어긋남 해소 — `grading-prompt.ts`가 세트 예시를 모든 문항에 넣고 있었다).

[TS] 검사(`lib/studio/checks/assessment.ts`, 순수 함수, 전부 테스트):
1. 문항 2개 = 서술형 1(6점, 요소 2~3개) → 논술형 1(16점), 합 22(2026-09-26; `structureIssues`). 두 문항 모두 `holistic` 필수. 등급표 7행이 0~22를 빈틈·겹침 없이 덮고 1등급 max = 22. `level_ref`는 §1.1 대응표와 일치.
2. 요소 `max` 합 = 문항 배점. 각 요소의 `scale.points`는 0..max 정수 집합과 정확히 일치(간격 균등·중간값 누락 금지). 0점 descriptor에 "무응답"과 "시도했으나"가 모두 언급.
3. 조건의 `points` 합 ≤ 문항 배점; 모든 조건 번호가 어느 요소의 `condition_nos`에 한 번 이상 등장(조건은 반드시 채점표에 반영, 조건을 가리키지 않는 요소는 빈 배열 허용). 조건이 4개 이상이면 `category`가 두 종류 이상.
4. 서술형 `exemplar_answers`의 `points` 집합 ⊇ {1..points}(6점이면 1~6); 논술형은 상/중/하 각 1개. 논술형 예시의 `assumed_short_points`(0~6)는 그 예시가 전제하는 서술형 문항 점수. 모든 예시의 `scores` 길이 = 요소 수, 합 = `points`, 각 값 ≤ 해당 `max`. **논술형 상/중/하 총점이 등급표에서 각각 상·중·하 밴드에 떨어져야 한다.**
5. `level_map` 구간이 A→E로 단조 감소하고 0..points를 덮는다.
6. 세트에서 `answer_mode='paper'`는 최대 1개(대표님 결정 + 관행). 논술형은 `screen`.
7. `stem`이 "[N점]"으로 끝나고 N = `points`. 논술형에 `situation` 필수, 두 문항 모두 `holistic` 필수(C-15).
8. `materials_used`가 4단계 ID 안에 있고, 참조 자료가 `role='raw'`를 최소 1개 포함.
9. 척도 descriptor 인접 단계가 **부사만 다른지** 휴리스틱(동사 원형·목적어 명사구가 같고 부사만 다르면 경고) — 완전 자동은 아니므로 경고만.
10. **조건 = 지침(C-32, 대표 2026-09-26)**: 서술형 `conditions.items`는 빈 배열, 논술형은 2~4개(4개 초과는 종류와 무관하게 걸림). 조건 문장에 숫자 사이 연산 기호(÷ × / = + −), 계산 동사·공식·소수 자리 지시(계산해·구해·나누어·곱해·더해·빼서·공식·소수 ○째 자리), 단계 순서어(먼저·다음에·그다음·마지막으로 + 동사; "가장 먼저"는 제외), 소수, 참조 자료(표 칸·열 이름·본문)에 있는 두 자리 이상 수치가 있으면 `other`. 근거·문장·단어·글자 수와 배점("2개 이상", "200자", "(2점)")은 허용(`lib/studio/checks.ts` `conditionHints`).

[AI] 검토 초점: 채점표로 예시답안을 실제로 채점해 적힌 점수가 나오는지(v1 유지, 이제 문항마다), 서술형에 조건이 없고 논술형 조건이 지침만 담는지(풀이 과정·공식·수치·순서가 있으면 other, C-32 — v1의 "학생 혼자 답안을 쓸 만큼 구체적인지"를 대체), 자료가 답을 대신하지 않는지, 발문 사고 순서 = 조건 순서, 성취기준 이탈, 학년 수준, 척도 descriptor가 관찰 가능한 표현인지, 논술형 4요소 중 최소 1개가 가치·태도 축이면 "정당화 가능성" 기준으로 쓰였는지, 예시 은행 문장을 그대로 베끼지 않았는지.

실패 시 v1처럼 최대 3회 반복. 3회 뒤에도 [TS] 검사가 실패하면 관리자가 직접 고친다(`edit-rules.ts`에 v2 필드 편집 규칙 추가).

근거: 문항 카드 7블록 (wp13 §1; 국어문항 p.28·30·31), 평가 요소 "~하기"·반응 지시어를 과정·기능에서 (wp13 §1, §5-8; 길라잡이 p.20), 조건 불릿마다 배점 (서울 §2, §6-3; 자료집 p.13·21), 1점 단위 조건-점수 대응·배점 크기에 따른 루브릭 밀도 (서울 §3, §6-4·6), 척도 단계별 예시답안 (서울 §3, §6-5; 자료집 p.14-18·22-24), 채점기준 3요소·관찰 가능 표현·척도 간격·무응답/시도 구분 (wp4 §6·§10-13·15·16), 분석적+총체적 병행 (wp4 §10-14; 성취문항까지 p.3, 공통양식 p.8), 채점 시 유의점의 관용 원칙 (wp13 §5-6; WP5-국어 README 관찰5; WP5-사회 README 관찰4), A~E 예상 점수 구간 (wp4 §2; 방법사례-국어 p.17), 최소 능력의 수행 특성 (wp13 §5-2; 길라잡이 p.37), GRASPS 축약 5요소 (wp4 §3; 대구수업평가 p.7·31, 공통양식 p.6), 종이 답안 최대 1개 (서울 §6-2; WP5-수학 README 관찰1), 그래프 3분해 (wp4 §10-10; 중가이드북-과학 p.22), 척도-수준 1:1 불필요 (wp1 §7-11; 총론 p.172).

### 2.6 6단계 — 교사용 지침서

지도안에 흡수되는 것: 차시별 도입 발문·전개 순서·정리(→ `flow`·`teacher_script`), 준비물(→ `materials_needed`), 비전공 주의점(→ `caution_notes`), 퀴즈 해설(→ `QuizItem.explanation`, v1부터 있음).

남는 것(출력 JSON):

```ts
export const TeacherGuide = z.object({
  general: z.object({ materials: z.array(z.string()), schedule_note: z.string(), purpose: z.string() }),   // v1 유지
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })).min(3),                     // v1 유지
  merge_guide: z.array(z.object({ lessons: z.tuple([z.number().int(), z.number().int()]), skip_activities: z.array(z.string()).min(1), time_budget_120: z.object({ intro_min: z.number().int(), main_min: z.number().int(), wrapup_min: z.number().int() }) })).default([]),
  grading_guide: z.object({
    common_errors: z.array(z.object({ item_no: z.number().int().min(1), error: z.string(), how_to_read: z.string() })).min(3),  // 문항별 흔한 오답과 검수 시 볼 곳(item_no ≤ 5단계 문항 수는 [TS])
    review_tips: z.array(z.string()).min(2).max(5),      // AI 초안 검수 요령(근거 인용 확인, 유의점 적용, 조정 이유 남기기)
    retry_guidance: z.string().min(10),                 // 재도전을 언제·어떻게 열어 줄지
  }),
  per_lesson: z.array(z.object({ no: z.number().int(), notes: z.array(z.string()).max(3) })).min(4),   // 지도안에 없는 것만(없으면 빈 배열)
})
```

검토: [TS] `merge_guide.lessons`가 3단계 `mergeable_with` 쌍과 일치, `time_budget_120` 합 120, `per_lesson` 수 = 차시 수. [AI] 비전공자가 따라 할 수 있는 구체성(v1), `common_errors`가 채점표 요소와 연결되는지.

근거: 문항+수업 설계를 하나로 (wp13 §5-1), 압축한 차시를 피드백·정리에 재투자 (wp7 §4; 과학재구성 p.116), AI 초안 검수 흐름·채점자 신뢰도 QA (wp4 §9, §10 운영4·5; 경기AI p.25), 재도전은 부분 향상도 성공으로 (wp13 §2; 학습평가이해 p.37-38).

### 2.7 7단계 — 차시별 피드백 안내장(신설)

두 시점으로 나뉜다. **제작소(게시 전)**: 학생 데이터와 무관한 틀을 차시마다 만든다. **수업 운영(확정 뒤)**: 학생별 안내장을 데이터로 채운다(`templates/notice.json`의 `Notice`). 3~4일 범위는 전자와 후자의 **초안 생성**까지, 발송·열람 UI는 발표 뒤.

제작소 출력 JSON:

```ts
export const NoticePlan = z.object({
  per_lesson: z.array(z.object({
    lesson_no: z.number().int(),
    topic_summary: z.string().max(60),                    // "~활동에서 ~을 배웠습니다"
    preview: z.string().max(50),                          // "다음 시간에는 ~을 배워요" (마지막 차시는 세트 마무리 문장)
    home_study_suggestion: z.string().max(60),            // 혼자 실행 가능한 구체 행동 1개, 청유형
    quiz_notes: z.array(z.object({ quiz_no: z.number().int(), wrong_note: z.string().max(40) })),   // 퀴즈 수와 같음(교수 차시 3, 단원 평가 차시 0)
    criteria_phrases: z.array(z.object({
      criterion_name: z.string(),                         // 5단계 rubric.criteria[].name과 동일
      good: z.array(z.string().max(60)).min(2),           // 잘한 점 후보(정도부사+완성동사)
      improve: z.array(z.string().max(60)).min(2),        // 보완 후보(부분 긍정 + 역접 + 완곡 + 다음 행동)
    })).nullable(),                                       // 단원 평가 차시만(두 문항의 요소 전부), 교수 차시는 null
  })).min(4).max(6),
  footer_disclaimer: z.literal('본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.'),
})
```

수업 운영 시 학생별 `Notice`(notice.json 그대로; 필드 출처는 `data / ai_draft / director` 셋): `lesson_context`는 data(핵심질문·목표 복사) + `topic_summary`(틀에서 복사), `participation.quiz`는 data, 틀린 문항 `note`는 `quiz_notes`에서 복사, `essay_results`는 **확정 채점만**(단원 평가 차시는 서술형·논술형 두 결과, 미확정 문항은 빠진다), `criteria_feedback.good_point/improve_point`는 AI가 `criteria_phrases`와 확정 채점의 `evidence`로 한 문장씩 초안, `retry`는 data + `improvement_comment` AI 초안, `next_lesson`은 틀에서 복사, `director_comment`·`director_message`는 원장 자유 서술(비면 섹션 생략).

검토 규칙(`lib/classroom/notice-lint.ts`, 순수 함수):
- [TS] 금지어: `못한다/못했다/실패/모른다`(부정 서술어), `등수/석차/상위 n%/평균보다`(비교), 다른 학생 이름(원생 목록 대조), `매우 우수/보통/미흡`이 단독 문장으로 끝남. `improve_point`가 있으면 같은 요소의 `good_point`가 비어 있지 않아야 함. `home_study_suggestion`에 동사가 있어야 함(청유형 종결 `~봅시다/~하세요`). 미확정 채점을 넣으면 반려(서버가 `confirmed_at`을 확인).
- [AI] 문장이 활동명으로 시작하는지, 근거 없는 인성 평가가 없는지, 학부모가 읽어도 어색하지 않은지.

근거: 세특 도출 4단계 파이프라인의 축소판 (wp8 §0-1, §2), 4색 모델 대응(파랑=확정 점수, 초록=근거, 빨강=요소별 코멘트, 검정=원장 한마디) (wp8 §1(b), §5; 도움자료 p.3), 상/중/하 문장 규칙 (wp8 §3(b)), 잘한 점 먼저·구체 행동 (wp8 §3(c), §4; 사회과연수자료집 p.77-82), 12개 추론 규칙 (wp8 §6), 학부모 공동 수신·학원 고지·재도전 서술은 우리 확장 (wp8 §7-1~3), 목표참조/자기참조 피드백(저성취는 자기참조) (wp13 §1, §5-10; 길라잡이 p.29), 가정통지 관행 (wp13 §2; 학습평가이해 p.42).

### 2.8 검토 AI 프롬프트 구조(공통)

v1처럼 `RULES`(과목별 `rulesFor(subject)`)를 첫 system 블록(캐시)으로, 검토자 지시를 둘째 블록으로 둔다. 검토 출력 `Review.issues[].kind`에 `'level'`(성취수준 어휘 위반), `'source'`(출처·인용 문제), `'notice'`(안내장 문장 규칙)를 추가한다.

### 2.9 게시·패키지·교재에 미치는 영향

- **스냅샷(`lib/studio/publish.ts` `Snapshot`)**: `unit_plan`, `reconstruction_detail`(2단계 표), `notice_plan`, `references`(문항 카드가 참고한 공개 자료 합집합)가 추가된다. 배정된 과제는 판(스냅샷)에 고정되므로 기존 v1 판은 그대로 두고 읽을 때 `upgradeSnapshotV1()`(§4.3)으로 v2 모양으로 올린다.
- **PackageView(관리자·원장)**: 카드 순서 = 표지 → 소개 → 성취기준(+A~E 접이식) → 재구조화 표 → 학습 목표(세 축 배지) → 핵심질문 → 평가 계획표 → 차시 카드(시간·흐름 소단계·발문 대본·준비물·유의점·활동지·퀴즈) → 단원 평가 차시 카드(평가 안내·작성 시간·두 문항, 2026-09-26) → 자료(출처 배지) → 문항 카드 2장(옛 판 3장; 평가 요소·상황·문두·조건 표·채점표·유의점·예시답안·A~E 구간·최소 능력) → 등급표(`level_ref` 열) → 피드백 틀 → 안내장 틀 → 참고한 공개 자료 → 생성 모델. 원장 화면(`mode='teacher'`)은 정답·예시답안을 접어 둔다(v1 `showAnswers`).
- **학생 화면**: `lesson.formative_check.quiz`, `lesson.materials_used`(정규식 파싱 제거), 문항은 `stem` + `conditions.items[].text`·`length`·`format`만 노출. `answer_mode='paper'`면 입력 칸 대신 "종이에 풀어 선생님께 내세요"(3B 계획과 동일, 접두 대신 필드로 판정).
- **교재 인쇄(3B `lib/print/booklet.ts`, 아직 없음)**: 처음부터 v2 모양으로 만든다. 학생용 = 표지·소개·핵심질문·자료(출처)·차시마다 활동지 쪽 + 퀴즈 답 칸·문항지(조건 표 포함, 종이 답안 문항은 자료 재수록). 교사용 = 재구조화 표·평가 계획·차시 지도안(대본 포함)·문항 카드 전체·등급표·안내장 틀·용어. 안내장 자체는 A5 1장 양식(발표 뒤).
- **채점(`lib/classroom/grading-prompt.ts`)**: 문항의 `rubric.criteria`(max 가변)·`rubric.notes`·`exemplar_answers`·`level_map`·`conditions.items`를 넣는다. `ai_criteria[]`의 `max`는 요소 `max`를 따른다(서술형은 1~3). 규칙 블록은 `rules/grading.ts`(G-).

---

## 3. 과목별 차이표

WP5 README 관찰과 wp4 §8·wp7 §7·wp1 §4에서 뽑았다. "규모"는 예시 은행 레코드 수.

| 과목 | 전형적 문항 형태 | 자료 유형 | 답안 방식 | 루브릭 특유 요소 | 규모 | 주의점 |
|---|---|---|---|---|---|---|
| 국어 | 두 자료 (가)(나) 비교·관점 파악(서술), 서론-본론-결론 갖춘 주장·건의문(논술). 복수 자료 통합형이 절반 (WP5-국어 관찰1) | 글 2~4편(설명문·칼럼·시·기사·인터뷰), 카드뉴스·광고 이미지. 서술형 200~400자, 논술형 300~1,500자 지문 (관찰1). 중1은 "한 화면" 상한(C-19) 적용 | 화면 | 자료 반영·근거 타당성·글 구조·분량·맞춤법(오류 2개 이하 관용) (wp4 §8); 조건 2~4개, 내용/형식 구분 (관찰2); 분석적 59건·혼합 16건 (관찰4) | 81 (2025 국어 파일 미착, 23항목 페이지맵) | 발문이 단답형으로 축소되거나 자료가 답을 대신 줌; "느낀 점"만 요구 (wp4 §8); 비교 기준은 세트 기획에서 먼저 확정 (wp4 §10 운영1) |
| 수학 | 표·그래프 읽고 계산·비교·판단 서술(서술), 두 자료 종합해 목표 수치 정하고 근거 대기(논술), 오류 찾기형(고등) (WP5-수학 관찰5; wp4 §8) | 표 5~10행, 그래프 1~2개, 실생활 맥락에 소규모 정제 수치 (관찰4); 원자료 20~25개·계급 6~7 (wp11 §6-1) | 표·그래프 작성 문항 1개만 종이, 나머지 화면 (관찰1; 서울 §6-1·2) | 조건-점수 1점 단위·행동동사 (관찰2; 서울 §6-3·4); 계산 정확성과 논리 분리; 저배점 단일표, 고배점 이중 루브릭 (관찰3) | 69 (2025 수학 파일 미착, 21항목) | 그리기 요구 최소화(13%) (관찰1); 「자료의 정리와 해석」 공식 문항이 없어 인접 단원·문제집 패턴으로 대체 (서울 §4-0; wp11 §4); 중1에 '정당화' 표현 금지 (wp1 §4) |
| 사회 | 통계·지도·기사 해석 + 원인·영향 서술(서술), 입장 선택 논증(케이블카·의무투표 등)(논술) (wp4 §8) | 실제 자료 선호: 통계표·지도·기사·판결문·인터뷰, "제도 설명 + 실제 사례 2~3개" (WP5-사회 관찰1; 2025 관찰3) | 화면(지도 표시 문항은 종이, 세트당 1개) | 조건 3~5개가 배점과 1:1 (관찰2); 요소 개수 비례 배점 (관찰3); 입장이 아니라 근거·자료 연계 채점 (관찰5); 대안 표현 인정 유의점 (관찰4) | 77 + 2025 사회 12 | 사실 나열 자료만 주면 암기 확인 문항이 됨; 체크리스트형 채점을 척도형으로 (wp4 §8); 역할 몰입 → 성찰 2단계 (관찰5) |
| 역사(한국사·세계사) | 1차 사료 발췌 해석, 다중 관점 비교, 역사적 의미 평가·제안 (wp4 §8; 2025 관찰2) | 사료(삼국사기·비문·조약문) 2개 이상 상반된 행위자 관점, 지도 | 화면 | 사료 인용 정확성("(가)에서 인용할 것" 조건), 다중 관점, "자료를 그대로 옮기지 말 것" (wp4 §10-11·12; 2025 관찰2); 동교과 협의 → 우리는 검수 유의점으로 (2025 관찰4) | 15 + 2025 역사 9 | 한쪽 관점 사료만 주면 단일 해석 유도; 사료 없이 암기 서사 재현 (wp4 §8); 인지 동사 위계(추론·분석 > 체계적 설명 > 제시 > 사례 > 있었음) (wp1 §3) |
| 과학 | 실험 자료·그래프 해석 + 현상 설명(서술), 그래프·모식도 작성 후 서술(2단계), 사회적 쟁점 찬반+근거(논술) (WP5-과학 관찰1·5) | 표(물리량)·그래프·도식(회로·구조·모형)이 1차 자료 (관찰1); 2025는 학술 논문 인용도 (2025 관찰3) | 그래프·모식도 작성 문항 1개만 종이 | 변인(독립·종속·통제) 구분을 채점 요소로 (관찰2); 필수 용어 조건 (관찰3); 계산·논리 분리, 그래프 축/수치/형태 3분해 (wp4 §8·§10-10); 찬반 모두 + 근거·출처 (관찰5) | 126 + 2025 과학 28 | 자료가 문항과 무관하게 길어짐; 오개념 진단 목적이 채점에 없음 (wp4 §8); '~할 수 있다' 통일, 탐구활동 연계, 교수법 표현 금지 (wp1 §4) |
| 영어 | 읽기 지문·표·인포그래픽 → 요약·설명·비교·의견 쓰기(통합형) (WP5-영어 관찰1) | 지문(영어), 표·그래프, 이메일·SNS 상황 | 화면 | 분량은 단어 수 구간 + 구간별 점수 (관찰2); 내용/구성/언어사용(+과제완성) (관찰3); 오류 개수 구간 정량 (관찰3); 지시문·조건·채점표는 한국어, 답안은 영어 (관찰4); 오답 예시 + 진단 피드백 (관찰5) | 47 (2025 영어 파일 미착, 22항목) | 조건에 정답 어휘 노출, 성취기준 무관 문법 조건, 제시 어휘 과다로 "재배열 놀이"화 (wp4 §8, §10 운영2); 중1 어휘 범위(1,500단어) (wp1 §4) |

---

## 4. 스키마 변경과 마이그레이션

### 4.1 깨지는 변경(breaking) 목록

| # | 대상 | v1 | v2 | 영향 코드 |
|---|---|---|---|---|
| B1 | `Lesson.flow` | `{intro: string, main: string, wrapup: string}` | `{intro: string[], main: {step_label, minutes, activities[]}[], wrapup: string[]}` | `components/studio/PackageView.tsx` L174-178 (wp7 §11-1), 3B `booklet.ts` |
| B2 | `Lesson.materials` | `string[]`("자료 A", "색연필" 혼재) | `materials_used: string[]`(ID) + `materials_needed: string[]`(준비물) | `PackageView.tsx` L178-179, `lib/classroom/lessons.ts` `materialIdsForLesson`(정규식 파싱 → 필드 직접 사용), `app/student/assignments/[id]/page.tsx` L58 (wp7 §11-2) |
| B3 | `Lesson.quiz` | 최상위 | `formative_check.quiz` | `PackageView.tsx` L189, 학생 page L61·64, `Lesson` superRefine (wp7 §11-3), `tests/classroom-lessons.test.ts` |
| B4 | `Lesson` 추가 필드 | — | `topic, time_budget, teacher_script, caution_notes, worksheet, merge_note` (필수) | 3단계 프롬프트·fixture·PackageView |
| B5 | 3단계 출력 | `{lessons}` | `{unit_plan, lessons}` | `STAGE_SCHEMAS[3]`, `repo.ts`(새 열 `unit_plan`), `publish.ts` `buildSnapshot`, `wizard-stages.ts`·`StageWizard.tsx`(편집 폼) |
| B6 | 2단계 출력 | `reconstruction: string, learning_goals: string[], key_question_candidates` | `standards[]`(재구조화 표) + `reconstruction`(유지) + `learning_goals: {text, axis}[]` + `level_anchor[]` | `fidelity.ts`(모든 `reconstructed_text`), `repo.ts`(`learning_goals` 값 모양, 새 열 `reconstruction_detail`), `PackageView.tsx` L406-411 |
| B7 | `Material.source` | `z.literal('자작')` | `{kind, attribution, ai_assisted}`; `kind`에 `'image'`; `role` | `PackageView.tsx` `MaterialsSection`(출처 배지), `charts.ts` `detectChart`(kind 확인), 3B 공유 자료 생성·편집 폼 |
| B8 | `AssessmentItem.conditions.required` | `string[]` | `items: Condition[]` + `answer_mode` + `overflow_rule`; `format`의 "[종이 답안]" 접두 폐지 | `PackageView.tsx` L289-293, 학생 `AnswerEditor`(조건 표시), 3B `[종이 답안]` 판정(`answer_mode`로), `lib/classroom/grading-prompt.ts` L36 |
| B9 | `AssessmentItem.rubric` | `ShortRubric \| ExtendedRubric` | `Rubric{criteria[{name, axis, condition_nos, max, scale[]}], holistic, notes}` | `PackageView.tsx` `RubricView`, `grading-prompt.ts` L28-35, `lib/classroom` 채점 스키마(`ai_criteria[].max` 가변), `app/teacher/assignments/[setId]` 검수 폼(요소 수·최댓값 가변), 학생 `ResultView`, `tests/grading-*.test.ts`, `data/studio-fixtures/grading-*.json` |
| B10 | `Assessment.exemplars`(세트) | 상/중/하 3개 | 삭제 → `AssessmentItem.exemplar_answers` | `grading-prompt.ts` L37, `PackageView.tsx` `AssessmentSection` 예시답안 카드, fixture |
| B11 | `AssessmentItem` 추가 | — | `evaluation_elements, situation, materials_used, level_map, min_competency, references` | 5단계 프롬프트·PackageView·booklet |
| B12 | `grade_boundaries[]` | `{grade,min,max,band}` | + `level_ref` | `lib/classroom/scoring.ts` `Boundary` 타입(추가 필드 무시 가능), PackageView 등급표 |
| B13 | `TeacherGuide` | `general, glossary, per_lesson(notes ≥1)` | + `merge_guide, grading_guide`; `per_lesson.notes` 0~3 | PackageView `TeacherGuideSection`, 6단계 프롬프트 |
| B14 | 단계 수 | 0~6 | 0~7(`NoticePlan`) | `STAGE_SCHEMAS`, `Stage` 타입, `MAX_ATTEMPTS`, `wizard-stages.ts`, `next-action.ts`, `edit-rules.ts`, `StageWizard.tsx`, `repo.ts`(새 열 `notice_plan`), `publish.ts`, API 라우트 stage 범위 검사 |
| B15 | `Review.issues[].kind` | 6종 | + `level, source, notice` | `stages.ts` 로그, 마법사 이슈 표시 |
| B16 | `RULES` 상수 | 문자열 1개 | `rulesFor(subject)` | `prompts/stages.ts` `buildPrompt/buildReviewPrompt`, `tests/prompts.test.ts` |

비파괴(additive): `Snapshot.unit_plan/reconstruction_detail/notice_plan/references`, `Material.kind='image'`.

### 4.2 DB

마이그레이션 `20260925000011_studio_v2.sql`(3~4일 범위):
- `item_sets`에 `unit_plan jsonb`, `reconstruction_detail jsonb`, `notice_plan jsonb` 추가. `learning_goals`는 jsonb라 값 모양만 바뀐다(문자열 배열 → 객체 배열; 읽을 때 `upgrade`가 문자열이면 `{text, axis: '과정·기능'}`으로 감싼다).
- `item_set_versions.snapshot`은 그대로(모양은 읽을 때 올림).

발표 뒤:
- `standard_levels(code text, school_level text, scheme text, level text, statement text, merged_with text[], domain text, unit text, source_file text, pages int[], primary key (code, level))`와 `domain_levels(subject, school_level, domain, level, axis, statement, pages)`. 적재는 `scripts/import-levels.ts`가 `data/reference/levels/*.json`을 그대로 펼친다(966 성취기준 × 3~5 수준 ≈ 4,200행; `merged_levels`는 `merged_with`로). DB 대조는 `coverage.md`가 이미 코드 집합 일치를 확인했으므로 적재 후 행 수만 검사.
- `exemplars` 표(레코드 JSON을 jsonb로, 색인 열 `subject, school_level, grade, kind, code_prefix[]`)와 `references` 표(세트 판 ↔ 예시 id).
- 학생별 안내장 발송·열람 로그(`sent` 상태, `sent_at`, `viewed_at` — 학부모 확인 대체, wp13 §2). 표 자체는 0011에 이미 있다(아래).

**반영(2026-09-25, 0011)**: 학생별 안내장 표는 발표 전 범위로 당겨 `lesson_notices`로 만들었다(1주차 `notices`는 홈페이지 공지사항 표라 이름을 달리함). 열: `id, assignment_id, academy_id, lesson_no(1~8), body jsonb, status(draft|confirmed), drafted_by, drafted_at, confirmed_at, updated_at`, `unique(assignment_id, lesson_no)`. RLS: 관리자 전체, 원장 자기 원 배정만 읽기·쓰기, 학생 없음. `sent` 상태·`sent_at`·`viewed_at`(발송·열람)은 발표 뒤.

### 4.3 기존 데이터 처리

- **재생성이 원칙**: 스테이징에 있는 세트는 시연용 1~2개(수학·과학)뿐이다. 게시 전 초안은 2단계부터 다시 만든다.
- **이미 게시·배정된 판**은 건드리지 않고 `lib/studio/compat.ts`의 `upgradeSnapshotV1(snapshot)`(순수 함수, 테스트)로 읽을 때 올린다: `flow` 문자열 → `[문자열]`·`main` → `[{step_label:'전개', minutes:40, activities:[main]}]`, `materials` → `materials_used`(v1 정규식으로 ID 추출) + `materials_needed`(나머지), `quiz` → `formative_check.quiz`, `time_budget` 기본값, `teacher_script.questions=[]`·`worksheet.tasks=[]`(올린 판은 `superRefine`을 건너뛰도록 `_upgraded: true` 표식), `conditions.required[]` → `items[{no, text, verb:'', points:null, category:'내용'}]`, `format` 접두 `[종이 답안]` → `answer_mode='paper'`, `ShortRubric.levels` → `criteria[{name:'서술형 채점표', axis:'과정·기능', condition_nos:[전부], max:points, scale:levels}]`, `ExtendedRubric.criteria` → `max:4, scale: bands 0..4`, 세트 `exemplars` → 논술형 문항의 `exemplar_answers`, 서술형은 `rubric.levels[].example`에서 만든 1개, `source:'자작'` → `{kind:'자작', attribution:null, ai_assisted:false}`.
- 채점 행(`gradings.ai_criteria`)은 요소 이름으로 맞추므로 변환 불필요.
- **세트 구조 변경(2026-09-26, 서술형 1 + 논술형 1 · 단원 평가 차시)과 옛 판**: 옛 구조(서술형 3점 × 2 + 논술형 16점, 교수 차시 안에 서술형·마지막 차시에 논술형)로 게시된 판은 **문항을 합치거나 버리거나 배점을 바꾸지 않고 그대로** 읽는다. 학생 답안(`answers.item_no` 1~3)·확정 채점(3점 만점)·열린 차시(`open_lessons`)가 그 판의 문항 번호와 차시에 이미 묶여 있기 때문이다 — 문항 하나를 빼면 3번 답안이 가리킬 문항이 없어지고, 평가 차시를 덧붙여 문항을 옮기면 배정 때 열어 둔 차시 수로는 문항이 잠긴다. 읽을 때 compat 이 하는 일은 모양 맞추기뿐이다: 차시 라벨 `'서술형1'·'서술형2'` → `['서술형']`, `null` → `[]`, 논술형을 보던 마지막 차시 → `kind: 'assessment'`, 서술형 `holistic`은 없는 채로 둔다. 옛 판은 `PublishedAssessment`·`PublishedLessonDesign`(게시 판 읽기 스키마)을 통과하고, 새 5단계 생성·검토(`Assessment`·`LessonDesign`)는 지금 구조만 받는다. 옛 초안(게시 전)은 재생성이 원칙이다([TS] 검사가 문항 구조·평가 차시를 잡는다).

### 4.4 성취수준·예시 은행 접근

- 3~4일: 파일 기반. `lib/reference/levels.ts`(`getLevels(code)`, `getDomainLevels(subject, school, domain)`; 과목→파일 대응: 한국사·세계사 → `역사-중.json`, 초등은 `-초.json`), `lib/reference/exemplars.ts`(§1.2). 서버에서만 읽는다(수 MB, 클라이언트 번들 금지). 프롬프트 조립은 `prompts/stages.ts`의 `header(ctx)` 뒤에 `levelsBlock(ctx)`·`exemplarsBlock(ctx, stage)`를 붙인다.
- 발표 뒤: §4.2 표로 옮기고 로더의 구현만 바꾼다(인터페이스 유지).

### 4.5 fixture·mock 모드

- `data/studio-fixtures/stage2~7-{generate,review}.json`(수학)과 `-과학.json`을 v2 모양으로 다시 쓴다. `stage7-*`는 신설. `grading-서술형.json/grading-논술형.json`은 요소 가변 `max`로.
- 국·영·사 fixture는 만들지 않는다 — 실제 키가 Vercel에 있으므로 5과목은 실제 생성으로 만든다. 로컬 mock은 수학·과학만(README에 명시, `tests/mock-fixtures.test.ts`가 v2 스키마와 재구성 검사를 돈다).
- `tests/studio-schemas.test.ts`·`publish.test.ts`·`classroom-lessons.test.ts`·`grading-prompt.test.ts`·`prompts.test.ts`·`stages.test.ts`를 v2로 갱신하고 `compat.test.ts`·`checks-assessment.test.ts`·`exemplars-select.test.ts`·`levels.test.ts`·`notice-lint.test.ts`·`rules.test.ts`를 새로 둔다.

---

## 5. "넘어서는 지점" 상세

| # | 지점 | 공식 자료가 하는 것 | 우리에게 부족한 이유 | v2가 하는 것 | 리스크·대응 |
|---|---|---|---|---|---|
| 1 | 60분 차시·병합 | 45/50분(학교), 90분 블록 1건(대구 p.33); 재구성 자료집은 차시 수만 압축(11→7 등) (wp7 §4) | 60분 학원 차시의 도입/전개/정리 근거가 없다 (wp7 §9-1) | 10/40/10 기본, 전개는 소단계 2~4개에 분 표시, 병합 시 120분을 10/90/20으로 재편성하고 `merge_note`로 뺄 활동 지정 (wp7 §8) | 실제 수업에서 시간이 남거나 모자람 → 원장 검토 후 `time_budget` 편집 허용, 발표 뒤 실측 수집 |
| 2 | 비전공 원장 대본 | Q1~Q3 + [예상 답안](수학재구성 p.92-95), "Q. ~할까?"(자유학기제-과학기록 p.4); 전공 교사 전제 (wp7 §0-3, §9-2) | 무엇을 왜 묻는지, 오답 시 되짚기가 없다; 절차도 전문가용 (wp4 §11-3) | `teacher_script.questions[{prompt, expected_answer, if_stuck}]`, `caution_notes`에 오개념, 6단계 `grading_guide` | 대본이 길어져 원장이 안 읽음 → 발문 2~4개 상한, 카드 UI에서 접기 |
| 3 | STEAM 공유 대주제·자료 | 교과 간 통합 사례 2건(주기율표↔AI, Monet+영어) (wp4 §11-1); 재구성 자료집은 과목별 독립 (wp7 §9-3) | 5과목이 같은 소재·자료를 쓰는 동시 설계 선례가 없고, 융합 세트의 수준 합성 규칙도 없다 (wp1 §8-3) | 공유 자료 A~D + 과목별 세트, **등급은 과목별로만 산출**(대주제 종합 등급 없음 — 최솟값·가중평균 규칙을 만들지 않는다); 공유 자료 검토에 "5과목이 각자 원자료로 쓸 수 있는가" 항목 | 한 과목에 맞춘 자료가 다른 과목엔 빈약 → 4단계에서 과목별 세트 자료(E~)로 보완 |
| 4 | 성취수준↔척도↔등급 대응 | "5단계여도 3점 척도 가능"까지만 (wp1 §7-11; 총론 p.172); 방법사례 신판은 A~E 예상 점수 구간 병기 (wp4 §2) | 어떤 등급 경계를 척도 경계와 합칠지 알고리즘이 없고(wp1 §8-6), 초 3·경기 초 4·중고 5·우리 7등급이 다르다 (wp13 §5-14) | 문항마다 `level_map`(A~E 구간+응답 특성), 등급표에 `level_ref` 참조열(§1.1), 학교급별 단계 수 상수 | 참조열이 혼란을 줄 수 있음 → 원장 화면엔 접어 두고 관리자 화면·교재 교사용에만 |
| 5 | 가치·태도 채점 | 내면화 5단계 위계화에 연구진 우려(도덕 p.73); 3단계 축소·전 등급 강제 안 함으로 봉합 (wp1 §8-1, §7-8) | 우리는 단발 채점·AI 초안이라 장기 관찰 전제가 안 맞는다 | 논술형 4요소 중 하나를 가치·태도 축으로 둘 수 있되 채점은 "글에 드러난 관점·실천 진술의 정당화 가능성"(wp1 §7-13; 총론 p.175), 입장 자체에 점수 없음 (WP5-사회 관찰5) | 태도 요소가 형식적이 됨 → 검토 AI가 descriptor에 관찰 가능한 진술 지표가 있는지 확인 |
| 6 | 척도별 예시답안 | 2025는 문항당 1개, 척도 서술문이 역할 대신 (wp13 §1, §5-7); 2020-21 자료집은 단계마다 예시 (서울 §3) | AI 채점의 눈금은 예시가 많을수록 안정 (`grading-prompt.ts` "예시 답안은 기준의 눈금") | 서술형 총점 단계마다 1개(0점 제외), 논술형 상/중/하 + `rationale` | 생성 토큰 증가 → 5단계만 `xhigh`, 예시 길이 상한(서술형 200자, 논술형 400자) |
| 7 | 차시별 안내장 | 세특(학기 합산 500자, 교사→나이스), 학생 피드백(2인칭) (wp8 §1, §3(c)); 가정통지·서명 회수 (wp13 §2) | 학부모 공동 수신·차시 단위·재도전 향상·학원 고지 관행이 없다 (wp8 §7) | §2.7 틀 + 학생별 초안 + 12개 문장 규칙 린트 + 열람 로그(발표 뒤) | 미확정 점수 유출 → 서버가 `confirmed_at` 없으면 `essay_result=null` 강제 |
| 8 | AI 산출물 검증·채점 근거 | 2025 문항집은 AI 수집 자료를 검증 없이 사용 (wp13 §1 AI-1); 채점 자동화는 경기AI 별도 문서(draft→review→confirm) (wp4 §9) | 우리 파이프라인은 AI가 자료·문항·채점을 다 만들므로 검증 게이트가 필수 | `source.ai_assisted` 배지 + 원장 확인, 채점 `evidence` 인용(3A), 노트북 답안 최소 50자·무관 답안 거르기(3A) | 복붙·외부 AI 답안 탐지는 규정이 없음 (wp4 §11-4) → 발표 뒤 |
| 9 | 난이도 실측 보정 | "해당 수준 학생 2/3 정답" 설계 원칙만, 실증치 없음 (wp1 §8-4) | 우리 문항이 실제로 그 수준인지 알 방법이 없다 | 발표 뒤: 확정 채점·퀴즈 정답률로 `level_map` 재조정 루프 | 데이터가 쌓이기 전엔 못 함 |
| 10 | OECD·다국어 | 전부 한국어·한국 소재 (wp4 §11-5; wp8 §7-4) | 수출 시 소재 중립화·문장 규칙 번역 지침이 없다 | 세 축 태그(`axis`)를 모든 목표·요소에 남기고, 안내장 문장 규칙은 예문이 아니라 패턴으로 저장 (wp8 §7-4) | 발표 뒤 |

---

## 6. 구현 범위 나누기

전제: 엔지니어 1명 + AI 코딩, 실제 키로 생성. "일"은 작업일 기준 추정이며 생성 대기 시간(과목당 5단계 3회 반복 시 10~15분)은 다른 작업과 겹친다.

### 6.1 3~4일 필수 — 5과목 세트가 새 형식으로 나오려면

| 순서 | 항목 | 내용 | 추정 |
|---|---|---|---|
| D1 | 스키마 v2 + 호환 | `schemas.ts` 2·3·4·5·6·7단계, `compat.ts` `upgradeSnapshotV1`, `checks/assessment.ts`·`checks/lesson.ts`(순수 검사), 테스트 | 0.75일 |
| D2 | 규칙 분할 | `rules/{common,lesson,grading,notice}.ts` + `subjects/*.ts`에 부록 A 이식, `rulesFor()`, ID 일치 테스트 | 0.25일 |
| D3 | 성취수준 로더·주입 | `lib/reference/levels.ts`, 1·2·3·5·7단계 프롬프트 블록, `level_anchor`·`min_competency` 서버 복사 | 0.25일 |
| D4 | 예시 은행 로더·선택 | `lib/reference/exemplars.ts`(색인·점수·압축 카드), 3·5단계 주입, `references` 수집·표시 | 0.5일 |
| D5 | 3·4단계 프롬프트·검토 | 지도안·활동지·평가계획 생성 과제문, 자료 출처·크기 검사 | 0.5일 |
| D6 | 5단계 문항 카드 | 과제문·검토 초점·[TS] 9개 검사·`edit-rules` v2 편집 | 0.75일 |
| D7 | 6·7단계 | 지침서 축소, `NoticePlan` 생성·린트(학생별 안내장 초안은 서버 함수까지, UI는 발표 뒤) | 0.25일 |
| D8 | 화면·채점 | PackageView v2 카드, 학생 화면(`formative_check`·`materials_used`·`answer_mode`), 검수 폼 요소 가변, `grading-prompt` v2, 3B booklet은 v2 모양으로 착수 | 0.5일 |
| D9 | fixture·생성 실행 | 수학·과학 fixture v2, 5과목 실제 생성 → [TS] 검사 통과까지 반복, 게시 | 0.25일(+대기) |
| | **합계** | | **4.0일** |

D1→D2·D3·D4는 병렬 가능(D2~D4는 D1의 타입만 있으면 됨). D5·D6은 D1~D4 뒤. D8은 D1 뒤 병렬. 4일이 빠듯하면 D7의 학생별 초안 함수와 D4의 `references` 표시를 먼저 뺀다(틀 생성과 선택 규칙은 남긴다).

### 6.2 발표 뒤

| 항목 | 내용 | 추정 |
|---|---|---|
| DB 적재 | `standard_levels`·`domain_levels`·`exemplars`·`references` 표 + import 스크립트, 로더 교체 | 1일 |
| 안내장 운영 | `lesson_notices` 발송·열람 열(표는 0011, §4.2), 원장 발송 UI, 학부모 열람 링크·로그, A5 인쇄 | 1.5일 |
| 활동지 3판 | 기본/표준/도전을 세 장으로 자동 분화, 원장이 학생별 배부 | 0.5일 |
| 학교급 분기 | 초등(A~C·B 도달점), 고등(최소 능력 필수·5단계·이수 40% 맥락) (wp1 §6·§7-16·17) | 1일 |
| 역사 세트 | 사료 균형·인용 조건 템플릿, 역사 예시 은행 보강(미추출 사례) | 0.5일 |
| 2025 국·수·영 | 파일 착지 시 로더 포함 확인, 국·수·영 규칙 보강 | 0.25일 |
| 동사 뱅크 | 교과×축×등급 동사 사전 파일(과학·사회·도덕·역사 표에서) (wp1 §7-14) | 0.5일 |
| 난이도 실측 루프 | 확정 채점·퀴즈 정답률로 `level_map`·퀴즈 난이도 태그 보정 (wp1 §8-4) | 1일 |
| 답안 환경 규정 | 복붙·외부 AI 탐지 힌트, 학생 AI 사용 기록 칸 (wp4 §9 학생 규정) | 0.5일 |
| 검수 QA 루틴 | AI 초안 대비 원장 조정 통계, 표본 재검토 배치 크기 규정 (wp4 §10 운영5) | 0.5일 |
| 다국어·수출 | 소재 중립화 태그, 안내장 패턴 번역 지침 | 미정 |

---

## 7. 검증 계획

### 7.1 자동 테스트(순수 함수, Vitest)

| 테스트 | 검사 내용 |
|---|---|
| `studio-schemas.test.ts` | v2 스키마 `superRefine` 전부: 퀴즈 3/0, `time_budget` 합 60, 소단계 분 합, 활동지 tier 3종, 조건↔요소 대응, 척도 0..max 연속, 요소 max 합 = 배점, 논술형 4×4·holistic·situation 필수, 종이 답안 ≤1, 등급표 0~22 연속·`level_ref`, 예시답안 단계별 존재·점수 일치·상중하 밴드 일치, `level_map` 단조 |
| `checks-assessment.test.ts` | §2.5 [TS] 9개 검사 각각 통과/실패 사례, 부사만 다른 descriptor 휴리스틱 |
| `fidelity.test.ts` | 모든 `reconstructed_text`에 원문 이탈 검사, 통합 시 학습요소 보존 |
| `levels.test.ts` | 코드 조회(중 A~E, 초 A~C), 병합 칸, 한국사·세계사 → 역사 파일, 없는 코드 null |
| `exemplars-select.test.ts` | 점수·동률·폴백 규칙이 결정적, kind 분배, 압축 카드 길이 상한, 출처 문자열 |
| `compat.test.ts` | v1 fixture 스냅샷을 올리면 v2 스키마(완화 모드) 통과, ID·준비물 분리, 접두 → `answer_mode` |
| `notice-lint.test.ts` | 12개 규칙(부정 서술어·비교·단독 평어·개선점 단독·청유형·미확정 차단) |
| `rules.test.ts` | 부록 A ID 집합 = 코드 규칙 ID 집합, `rulesFor(과목)`에 공통+차시+과목 규칙 포함 |
| `grading-prompt.test.ts` | 문항별 예시·유의점·요소 max가 프롬프트에 들어감 |
| `publish.test.ts` | 스냅샷에 `unit_plan/notice_plan/references` 포함, `references` 합집합·중복 제거 |
| `booklet.test.ts`(3B) | 활동지·문항지·안내장 틀 쪽 배치 |

### 7.2 생성 검사(검토 단계)

- 단계마다 [TS] → [AI] 순서, [TS] 실패는 모델을 부르지 않고 바로 반려(비용 절감).
- 5단계 검토 AI는 예시답안을 **실제로 채점한 점수표**를 `issues.detail`에 남긴다(불일치 시 어느 요소가 몇 점 차이인지).
- 생성 로그(`generation_log`)에 참고한 예시 `id`와 주입한 성취수준 코드를 남겨 재현 가능하게 한다.

### 7.3 5일차 대표님 검토 절차(과목당 25분, 5과목 약 2시간)

1. 패키지 화면을 열고 위에서 아래로 훑는다(관리자 모드, 정답 보임).
2. 체크리스트 12항목에 O/△/X를 적는다:
   ① 성취기준 원문이 그대로이고 재구조화 표에 원문이 병기됨 ② 학습 목표에 세 축이 다 있고 "~할 수 있다"로 끝남 ③ 핵심질문이 사실 확인형이 아님 ④ 차시 흐름을 보고 "내가 이 대본으로 60분을 진행할 수 있겠다" ⑤ 발문의 예상 답과 힌트가 자연스러움 ⑥ 활동지 기본/표준/도전이 실제로 난이도 차이가 남 ⑦ 자료가 답을 미리 담지 않음, 표 크기가 한 화면 ⑧ 문항 조건만 읽고 학생이 무엇을 쓸지 알 수 있음, 배점이 조건 옆에 있음 ⑨ 채점표 단계가 부사만 바뀐 것이 아님 ⑩ 예시답안 상/중/하를 직접 채점해 보면 적힌 점수가 나옴(논술형만, 5분) ⑪ 채점 시 유의점이 실제로 애매한 경우를 다룸 ⑫ 안내장 틀 문장이 학부모에게 보내도 될 톤.
3. X가 있는 항목은 해당 단계만 재생성(관리자가 그 단계의 확정을 풀고 생성) — 전체 재생성 금지.
4. 결과는 `docs/review/2026-09-29-owner-review.md`에 과목×12 표로 남긴다(구현 시 파일 생성).

### 7.4 "설명회용으로 충분하다"의 정의

다음 전부를 만족하면 충분하다: (a) 5과목 세트가 게시되어 원장 화면에 보인다, (b) 각 세트의 성취기준이 검증됨 표시, (c) 차시 4~6개 모두 대본·유의점·활동지·퀴즈가 있고 시간 합이 60, (d) 문항 카드 2장(서술형 1 + 논술형 1)이 [TS] 9개 검사를 통과하고 논술형 예시답안 상/중/하가 등급표에서 각 밴드에 떨어짐, (e) 자료마다 출처 종류가 표시되고 공개 자료는 출처 문구가 있음, (f) 안내장 틀이 차시마다 있고 린트를 통과, (g) 대표님 체크리스트에 X가 과목당 2개 이하, (h) 자리 채움 문장("추후 작성", "예시") 0건 — `tests/no-placeholder.test.ts`가 게시 스냅샷을 훑는다.

---

## 부록 A. 최종 규칙 목록

태그: `[WP4-n]` wp4 §10 프롬프트 규칙 n, `[WP4-운n]` 설계·운영 지침, `[WP13-n]` wp13 §5, `[WP1-n]` wp1 §7, `[WP11-n]` wp11 §6, `[서울-n]` 서울 §6, `[WP8-n]` wp8 §6, `[WP7]` wp7 §8·§9, `[WP5-과목-n]` README 관찰, `[2025-n]` README-사과 관찰, `[대표]` 대표님 확정, `[v1]` 기존 rules.ts. 성격: **P** 프롬프트 문장, **S** 스키마·검토 코드, **O** 운영 절차.

### A.1 공통(C-) — 문항·자료·채점표

| ID | 규칙 | 성격 | 출처 |
|---|---|---|---|
| C-01 | 논술형은 발문·자료·조건, 서술형은 발문·자료로 구성하고(서술형에는 조건을 두지 않는다, C-32), 조건에 담은 제약은 반드시 채점표 요소에 대응시킨다(`condition_nos`; 서술형 요소와 조건을 가리키지 않는 논술형 요소는 빈 배열) | P+S | [WP4-1][WP13-5][WP5-국-2][WP5-사-2] |
| C-02 | 발문 앞에 자료가 무엇을 담고 있는지 한 문장 전제문을 둔다("다음 자료를 읽고"만 쓰지 않는다) | P | [WP4-2] |
| C-03 | 자료는 해석·추론·판단의 단서만 주고, 결론·정답 문장이나 문항이 요구할 정리·계산 결과를 담지 않는다 | P+S | [WP4-3][v1] |
| C-04 | 찬반·비교·다중 관점을 요구하면 양쪽 자료를 균형 있게(1차 자료면 2개 이상) 제시한다 | P | [WP4-4][WP4-12] |
| C-05 | 발문의 사고 순서(이해→비교·분석→판단→서술)와 조건 순서를 일치시킨다 | P | [WP4-5] |
| C-06 | 조건이 4개 이상이면 내용/형식 같은 상위 범주로 묶어 제시한다 | P+S | [WP4-6] |
| C-07 | 성취기준과 무관한 형식·문법 조건을 넣지 않는다 | P | [WP4-7] |
| C-08 | 조건을 초과해 여러 개 쓴 답안은 "앞의 N개만 채점"을 조건에 명시한다(`overflow_rule`) | P | [WP4-8][WP13-3] |
| C-09 | 오류 찾기형은 오류 지점과 이유를 함께 쓰게 하고 채점표에서 두 요소로 나눈다 | P | [WP4-9][WP5-수-5] |
| C-10 | 학생이 그래프·모식도·표를 직접 만드는 문항은 축·수치·형태(표는 구조·값·합계)로 분해해 배점하고, 세트에 최대 1개, `answer_mode='paper'` | P+S | [WP4-10][서울-2][WP5-수-1][대표] |
| C-11 | 조건은 답안이 갖춰야 할 요건 하나당 한 줄로 쓰고(풀이 단계로 쪼개지 않는다, C-32) 필요한 조건 끝에 부분배점을 소괄호로 병기한다; 문항 배점은 문두 끝 대괄호 | P+S | [서울-3][WP5-수-2][WP5-사-2] |
| C-12 | 채점표는 요소·척도·수행특성 3요소를 갖추고, "잘함/미흡" 같은 평어 대신 관찰 가능한 표현("근거 2개 이상")으로 쓴다; 척도는 1점 단위 연속(중간값 누락 금지) | P+S | [WP4-13][WP4-15][서울-4] |
| C-13 | 최하위 척도(0점)는 무응답과 "시도했으나 부족"을 구분해 서술한다 | P+S | [WP4-16] |
| C-14 | 예시답안은 서술형은 0점을 뺀 총점 단계마다 1개(6점이면 6·5·4·3·2·1), 논술형은 상/중/하 각 1개를 요소별 점수·채점자 의견(rationale)과 함께 만들고, "유일한 정답이 아님"을 유의점에 적는다. | P+S | [서울-5][WP4-17][WP13-7][WP5-영-5] |
| C-15 | 서술형·논술형 모두 분석적 채점표(요소별 척도) + 총체적 상/중/하(holistic, 답안 전체의 모습)를 함께 둔다; 총체적 기준은 요소별 점수와 어긋나지 않게 쓴다(대표 2026-09-26). | P+S | [WP4-14][서울-6][WP5-수-3][대표] |
| C-16 | 채점 시 유의점 1~4줄: 핵심 내용이 있으면 표현·단어 차이로 감점하지 않음, 맞춤법은 의미 전달되면 관용, 반올림 허용 범위, 그림 대신 말로 설명한 경우 인정 여부 | P+S | [WP13-6][서울-8][WP5-국-5][WP5-사-4] |
| C-17 | 반응 지시어(발문 동사)는 성취기준의 과정·기능에서 고른다 — 요약·설명·비교·분류·분석·해석·추론·예측·평가·판단·비판·제안·설계·정당화·구성·서술·논술·증명·적용·탐구·표현 | P | [WP13-8] |
| C-18 | 평가 요소는 "~하기" 명사형 1~3개로 적는다 | P+S | [WP13 §1] |
| C-19 | 자료 크기는 한 화면: 표 5~10행(도수분포·상대도수 원자료 20~25개, 줄기와 잎 11~20개, 계급 6~7개), 그래프 1~2개, 그림 1~2개 | P+S | [WP5-수-4][WP11-1] |
| C-20 | 표·그래프는 완성된 형태로 주고 읽게 하는 것이 기본값이다; 그리기는 C-10의 한 문항에만 | P | [WP11-2][WP5-수-1] |
| C-21 | 실생활 맥락을 쓰되 그 안의 수치는 소규모로 정제한다; 사회·과학은 실제 자료(출처 표기)를 우선 고려한다 | P | [WP5-수-4][WP5-사-1][2025-3] |
| C-22 | 자료마다 출처 종류(자작/공개)와 공개 자료의 출처 문구를 적는다; 예시 은행 문장을 그대로 옮기지 않는다 | P+S | [WP4 §5 house][대표] |
| C-23 | AI가 만들거나 모은 자료는 `ai_assisted`로 표시하고 확정 전 원장(관리자) 확인을 거친다 | S+O | [WP13-11] |
| C-24 | 성취기준 원문은 절대 변형하지 않고, 어휘·자료·문항은 교육과정 학년 수준으로 쓴다 | P+S | [대표][v1] |
| C-25 | 수준 문장은 표시(A~E)+수행특성 세트로 다루고, 다섯 문장은 같은 과제의 도달 정도 차이여야 하며, C를 도달점으로 위·아래를 만든다; 부사·형용사만으로 단계를 가르지 않고 동사·범위·조건절로 가른다; 조건절("주어진 자료에서")은 최하위에서만; 최하위에 학습량을 더 얹지 않는다; 긍정문·간결체 | P+S | [WP1-1][WP1-2][WP1-3][WP1-5][WP1-6][WP1-7][WP1-19] |
| C-26 | 서술어는 과목 안에서 하나로 통일("~할 수 있다"), 흥미·태도류만 "~을 가진다" 허용 | P | [WP1-20] |
| C-27 | 정의적(가치·태도) 요소는 정오가 아니라 정당화 가능성으로 채점하고, 입장 자체에 점수를 주지 않는다 | P | [WP1-13][WP5-사-5][WP5-과-5] |
| C-28 | 척도 수와 성취수준 단계 수를 억지로 맞추지 않되, 문항마다 A~E 예상 점수 구간(`level_map`)을 적는다 | P+S | [WP1-11][WP4 §2] |
| C-29 | 동사는 매번 창작하지 않고 교과×축×등급 동사 뱅크(과학 5범주, 사회 탐구기능, 역사 인지 위계, Bloom 한국어판)에서 고른다 | P(발표 뒤 파일화) | [WP1-14] |
| C-30 | 문항 개발 후 8문항 자가 점검(성취기준 부합·3범주 반영·상황맥락·고차 사고·채점기준 부합·변별·명료성·채점자 불변성)을 검토 AI 초점으로 쓴다 | S | [WP13-9] |
| C-31 | 세트 평가는 서술형 1문항(6점, 채점 요소 2~3개) + 논술형 1문항(16점, 4요소 × 0~4점) = 22점이고, 두 문항 모두 분석적 + 총체적 채점표를 갖춘다(대표 2026-09-26, 배점은 본사 가정). 등급표는 7등급(21~22, 18~20, 15~17, 11~14, 8~10, 5~7, 0~4; 상=6~7, 중=3~5, 하=1~2)에 level_ref(7=A, 6=B, 5=C, 4=D, 3=E, 2·1=E 미만)를 병기한다. 논술형 예시답안 상/중/하는 채점표로 실제 채점한 점수에 전제한 서술형 점수(assumed_short_points, 0~6)를 더했을 때 그 밴드가 나와야 한다. | P+S | [대표][v1] |
| C-32 | 조건(conditions)은 지침이지 풀이 힌트가 아니다. 조건은 논술형 문항에만 2~4개 두고, 서술형에는 조건을 두지 않는다(분량·형식만 적는다). 조건에는 답안이 지켜야 할 제약만 쓴다 — 입장 정하기(찬성/반대 중 하나), 근거 개수(2개 이상), 인용할 자료(자료 B의 수치를 근거로), 형식(표/문장/문단, 종결어미), 분량(3문장 이내, 200자 내외), 초과 응답 규칙. 풀이 과정은 쓰지 않는다 — 계산식·공식("290 ÷ 1200", "합계로 나눈다"), 계산에 딸린 반올림 지시, 단계 순서("먼저 표를 만들고 다음에…"), 답이 되는 자료의 구체적 수치, 결론. 수업을 이해하지 못한 학생이 조건만 따라 답을 만들 수 있으면 안 된다. | P+S | [대표][v2-0926] |

### A.2 차시·재구성(L-)

| ID | 규칙 | 성격 | 출처 |
|---|---|---|---|
| L-01 | 재구조화는 통합/재조정/유지 3유형만, 내용요소 삭제 금지, 원문 병기 필수, 이유 태그 3종 | P+S | [WP7 §1·§8] |
| L-02 | 재구조화 문장은 "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다" 한 문장; 원문에 없는 수행·절차·특정 과제 상황을 넣지 않는다 | P+S | [WP4 §2 house][v1] |
| L-03 | 학습 목표 3~5개에 지식·이해/과정·기능/가치·태도를 각 1개 이상; C 문장을 도달점으로 | P+S | [WP1 §3][WP1-3][WP1-8] |
| L-04 | 세트 핵심질문 1개 + 차시 핵심질문(사실 확인형 금지, 기능어별 패턴), 차시 핵심질문은 도입 제시·전개 상기·정리 재확인 | P | [v1][WP7 §5] |
| L-05 | 1차시 60분 = 도입 10·전개 40·정리 10 기본, 전개는 소단계 2~4개에 분 표시(합 = 전개 시간); 병합 가능 차시는 mergeable_with에 인접 번호를 적고 merge_note에 뺄 활동을 적는다(병합 시 120분을 10/90/20으로 재편성). 단원 평가 차시는 병합하지 않는다. | P+S | [WP7 §8·§9-1] |
| L-06 | 발문 2~4개마다 예상 답과 막힐 때 힌트(정답을 그대로 말하지 않음) | P+S | [WP7 §5·§9-2] |
| L-07 | 준비물(오프라인 교구·출력물)과 지도상 유의점(오개념 1개 이상)을 차시마다 적는다 | P+S | [WP7 §3(d)] |
| L-08 | 활동지: 핵심질문 재게시, 과제 2~5개(기본 D~E·표준 C·도전 A~B), 자기평가 1~3문장 | P+S | [WP7 §3(e)][WP1 §5] |
| L-09 | 형성평가가 항상 선행한다: 교수 차시는 마지막 교수 차시까지 모두 마무리 퀴즈 정확히 3문항(선택형/단답형, 정답·해설). 서술형 1 + 논술형 1은 마지막 교수 차시 뒤 별도 단원 평가 차시(kind "assessment", 60분 = 평가 안내 5 · 서술형 작성 15 · 논술형 작성 35 · 정리 5, 퀴즈 0)에서 함께 본다(대표 2026-09-26). | P+S | [WP7 §6][대표] |
| L-10 | 퀴즈는 워밍업 어투(짧은 "구하시오", 단일 조회)에 개념 관계 문항을 섞고, 해설은 한두 줄 | P | [WP11-3][WP11-9] |
| L-11 | 압축으로 남은 시간은 새 활동이 아니라 피드백·정리·형성평가에 쓴다 | P | [WP7 §4] |
| L-12 | 문항 카드에 차시 흐름(어느 차시가 어느 문항을 준비하는지)을 함께 담는다 | S | [WP13-1] |

### A.3 과목별(S-)

| ID | 규칙 | 출처 |
|---|---|---|
| S-국-01 | 자료는 (가)(나) 복수 통합형을 기본으로 하되 중1은 각 200~400자, 총 2편 이내 | [WP5-국-1][C-19] |
| S-국-02 | 논술형 조건 2~4개(C-32)를 내용 조건/형식 조건으로 나누고 채점표도 그 구분을 따른다 | [WP5-국-2] |
| S-국-03 | 논술형은 서론-본론-결론, 근거 2~3개, 인용 출처 "(가)에서" 표기, 분량 ±50자 | [WP4 §8][WP4-11] |
| S-국-04 | 맞춤법·띄어쓰기는 오류 2개 이하 관용, 의미 전달되면 감점하지 않음 | [WP4 §8][C-16] |
| S-국-05 | 두 자료 비교 문항의 비교 기준(관점·표현 방법 등)을 문두 전제문에 먼저 밝힌다(v2: 모델이 전제문에 명시) | [WP4-운1] |
| S-국-06 | "느낀 점"만 묻는 주관적 서술 금지, 발문이 단답형으로 축소되지 않게 | [WP4 §8] |
| S-수-01 | 통계 단원에서 표를 새로 작성하게 하는 문항은 세트에 최대 1개(서술형으로만, C-10)이고, 그 밖의 문항은 정리된 표를 읽고 계산·비교·판단하게 한다. | [서울-1] |
| S-수-02 | 서술형(6점)은 채점 요소 2~3개로 나누어 요소마다 1점 단위로("무엇을 쓰면 몇 점") 쓰고 계산 정확성과 결론·이유 문장을 별도 요소로 둔다; 서술형에는 조건을 두지 않는다(C-32). | [서울-4][WP5-수-2] |
| S-수-03 | 논술형은 자료 해석→판단·제안으로 끝내고 표·그래프를 새로 만들게 하지 않으며, "판단+제안"을 별도 요소로 둔다 | [서울-7][WP11-6] |
| S-수-04 | 서술형 "이유 서술"은 핵심 채점 포인트(예: 총합이 다르다는 점을 언급)를 채점표 descriptor에 적고, 발문·조건에는 쓰지 않는다(C-32) | [WP11-5] |
| S-수-05 | 오류 찾기형(가상 학생의 틀린 풀이)은 고등 위주 템플릿, 중1은 선택 | [WP5-수-5][C-09] |
| S-수-06 | 중1 이하 수준 문장·채점표에 '정당화'를 쓰지 않는다; 안내된 절차·구체적 조작은 D/E 척도에서만 | [WP1 §4] |
| S-수-07 | 정비례·도형 단원도 작도는 최소화하고 텍스트·표 조건으로 대체 | [WP11-10] |
| S-사-01 | 자료는 제도 설명 + 실제(또는 유사) 사례 2~3개, 유형을 다양화(통계·지도·기사·인터뷰) | [WP5-사-1] |
| S-사-02 | 논술형 조건(2~4개, C-32)이 채점 요소와 대응하고, 글자 수 분량은 ±50자 | [WP5-사-2] |
| S-사-03 | 배점은 요구 항목 개수에 비례(3가지 중 2가지 → 부분점수) | [WP5-사-3] |
| S-사-04 | 쟁점 문항은 입장이 아니라 근거의 논리성·자료 활용을 채점, 입장 선택엔 최대 1점 | [WP5-사-5][C-27] |
| S-사-05 | 정치·사회 참여 단원은 역할 몰입 → 메타 성찰 2단계 구조를 짝지어 설계 | [WP5-사-5] |
| S-사-06 | "자료 내용을 그대로 옮기지 말 것"을 조건(논술형) 또는 형식(서술형)에 넣고 재진술을 채점 | [2025-2] |
| S-역-01 | 사료는 상반된 행위자 관점의 1차 사료 2개 이상, "(가)에서 인용할 것"(논술형은 조건, 서술형은 발문)과 인용 정확성 요소 | [WP4-11][WP4-12][2025-2] |
| S-역-02 | 인지 동사 위계(추론·분석 > 체계적 설명 > 제시·연결 > 사례 > 있었음)로 척도를 만든다 | [WP1 §3] |
| S-역-03 | 정답이 여러 갈래인 문항은 채점 유의점에 인정 범위를 넓게 적고 검수 요령에 "동교과 협의" 대신 유의점 재확인을 넣는다 | [2025-4] |
| S-과-01 | 1차 자료는 표·그래프·도식(회로·구조·모형)을 우선, 실험 결과 예측형은 자료 해석→서술 순서 | [WP5-과-1] |
| S-과-02 | 탐구 설계 문항은 독립·종속·통제 변인 구분을 채점 요소로 | [WP5-과-2] |
| S-과-03 | 필수 용어(예: 항체·전기음성도)는 서술형·논술형 모두 문두(전제문·발문)에 밝히고 조건에는 쓰지 않으며(C-32), 용어를 바르게 썼는지를 채점표 요소로 배점한다. | [WP5-과-3] |
| S-과-04 | 계산 정확성과 논리성을 분리 채점, 그래프는 축·수치·형태 3분해 | [WP4 §8][C-10] |
| S-과-05 | 사회적 쟁점(에너지·유전자 가위 등)은 찬반 영향을 모두 고려한 뒤 입장+근거+출처를 요구하고 찬반 각각의 모범 논거를 예시로 | [WP5-과-5] |
| S-과-06 | 수준 문장·척도 서술어는 '~할 수 있다'로 통일, '안다'류 최소화, 교수법 표현 금지, 탐구활동과 연계 | [WP1 §4] |
| S-과-07 | 자료가 문항과 무관하게 길면 요약·삭제, 오개념 진단 목적을 채점표에 반영 | [WP4 §8] |
| S-영-01 | 읽기(지문·표·인포그래픽) + 쓰기 통합형을 기본 구조로 | [WP5-영-1] |
| S-영-02 | 분량은 단어 수 구간으로(예: 40~60단어), 채점표에 구간별 점수 | [WP5-영-2][WP4 §4] |
| S-영-03 | 채점 요소는 내용/구성/언어사용(+과제 완성), 언어사용은 오류 개수 구간으로 정량화 | [WP5-영-3] |
| S-영-04 | 지시문·조건·채점표·피드백은 한국어, 답안만 영어(우리말 서술 요구 시 예외 명시) | [WP5-영-4] |
| S-영-05 | 제시 어휘는 재배열만으로 풀리지 않을 최소한, 조건에 정답 어휘(비교급 등)를 노출하지 않음(C-32), 성취기준 무관 문법 조건 금지. | [WP4-운2][WP4 §8][C-07] |
| S-영-06 | 예시답안에 만점 외 전형적 오류(관사·3인칭 단수·어순) 부분점수 예시를 포함하고 진단형 피드백을 적는다 | [WP5-영-5] |
| S-영-07 | 중1 어휘 범위(1,500단어 학년군)를 넘는 지문 어휘는 각주 처리 | [WP1 §4] |

### A.4 채점·피드백(G-)

| ID | 규칙 | 성격 | 출처 |
|---|---|---|---|
| G-01 | AI는 초안·근거만, 원장 확정(`confirmed_at`) 후 공개; AI 초안 열은 불변 | S+O | [WP4-운4][3주차 §3.4] |
| G-02 | 요소마다 점수와 학생 답안의 인용 근거(`evidence`), 없으면 "해당 내용 없음" | P+S | [3A][WP4 §9] |
| G-03 | 채점표·유의점·예시답안·A~E 구간만 기준으로 하고 새 기준을 만들지 않음; 예시와 비슷하면 비슷한 점수 | P | [3A][C-14] |
| G-04 | 관용 원칙 적용: 표현·단어 차이·맞춤법으로 감점하지 않음(유의점에 적힌 범위) | P | [C-16] |
| G-05 | 잘한 점 1~3(근거 인용) → 보완 1~3(한 단계 위 척도 기준, 실천 가능한 행동), 존댓말·학년 어휘 | P | [WP4-18][3A] |
| G-06 | 다른 학생과 비교하거나 평소 태도를 언급하지 않음(후광 배제) | P | [WP4-18][WP4-운5] |
| G-07 | 정의적 요소는 정당화 가능성으로 판정 | P | [C-27] |
| G-08 | 저성취 답안엔 자기참조(이전 대비 향상) 문구를, 고성취 답안엔 확장 질문을 우선 | P | [WP13-10][WP4 §7] |
| G-09 | 50자 미만·무관 답안은 채점하지 않고 돌려보냄; 원장 검수 배치 크기와 표본 재검토는 운영 규정 | S+O | [3A][WP4-운5] |

### A.5 안내장(N-) — wp8 §6 12개 규칙 그대로

| ID | 규칙 | 성격 |
|---|---|---|
| N-01 | 다른 학생의 이름·점수·순위 언급 금지 | S(린트) |
| N-02 | 등수·백분위·"상위 n%" 금지 | S |
| N-03 | 확정 전 AI 초안 점수·코멘트 인용 금지 | S(서버) |
| N-04 | "매우 우수/보통/미흡" 단독 평어로 문장을 끝내지 않고 근거 동반 | S+P |
| N-05 | 부정 서술어(못한다/실패/모른다) 대신 "~하는 데 어려움이 있다/~노력이 필요하다" | S+P |
| N-06 | 개선점 단독 금지 — 잘한 점 1개 이상 먼저 | S+P |
| N-07 | 평가와 무관한 개인정보 언급 금지 | P |
| N-08 | 태도 코멘트는 구체 관찰 근거 동반(원장 작성 필드) | P |
| N-09 | 재도전은 이전 점수를 "출발점"으로 서술 | P |
| N-10 | 활동명(과제명)으로 문장을 시작 | P |
| N-11 | 서·논술형 결과는 루브릭 요소명을 그대로 노출, 인상평 금지 | S+P |
| N-12 | 다음 단계 제안은 혼자 실행 가능한 구체 행동 1개 이상, 청유형 | S+P |

(출처: wp8 §6, 근거는 관찰 부재 기반 추론임을 wp8이 명시. N-03은 wp4 §9 게이트 승계.)

---

## 부록 B. 용어

| 용어 | 뜻 |
|---|---|
| 성취기준 | 교육과정이 정한 "학생이 알고 할 수 있어야 하는 것" 한 문장. 코드 예 `[9수04-02]`. 원문 변형 금지 |
| 성취수준(A~E / A~C) | 성취기준 도달 정도를 수준 기호와 수행특성 문장으로 나타낸 것(중 5수준, 초 3수준). 중간(C/B)이 도달점 |
| 영역별 성취수준 | 영역(단원) 단위로 지식·이해/과정·기능/가치·태도 세 축으로 다시 종합한 수준 문장 |
| 세 축 | 지식·이해 / 과정·기능 / 가치·태도. 2022 개정의 내용 체계 범주이자 OECD 대응 축 |
| 재구조화(재구성) | 성취기준을 평가 가능하게 다듬는 것. 통합·재조정·유지 3유형, 원문 병기 |
| 핵심질문(세트/차시) | 세트 전체를 관통하는 질문 1개와 차시마다 1개. 사실 확인형 금지 |
| 형성평가 / 총괄 | 교수 차시 끝 퀴즈(3문항) / 마지막 교수 차시 뒤 단원 평가 차시의 서술형 1(6점) + 논술형 1(16점) = 22점(2026-09-26) |
| 서술형 / 논술형 | 한~서너 문장, 정답 분명 / 한 문단 이상, 다양한 답 가능(주장+근거). 2025 경기도는 제한형/확장형으로 부름 |
| 평가 요소 | 성취기준 도달의 증거로 기대하는 핵심 내용("~하기") |
| 채점 요소·척도·수행특성 | 평가 요소를 문항에 맞게 구체화한 것 · 점수 단계 · 각 단계에서 보일 수행 서술 |
| 분석적 / 총체적 루브릭 | 요소별로 점수 / 답안 전체를 상·중·하로 판단. 서술형·논술형 모두 둘 다(2026-09-26) |
| 조건 | 답안의 내용·범위·형식을 지정하는 문장. 행동 동사 단위, 부분배점 병기, 채점표와 1:1 |
| 채점 시 유의점 | 애매한 답안 처리 기준(대안 표현 인정, 반올림, 그림 대신 말) |
| 최소 능력의 수행 특성 | 성취율 40% 근방 학생의 최소 수행 서술(고등 필수, 중은 E 문장) |
| A~E 예상 점수 구간(`level_map`) | 문항에서 각 수준 학생이 받을 점수 범위와 응답 특성 |
| 등급표(1~7)·상/중/하 | 22점을 7등급(7이 최고)으로, 학부모 표시용 상(6~7)/중(3~5)/하(1~2). `level_ref`는 KICE 성취율 참조 |
| GRASPS | 목표·역할·청중·상황·결과물·준거. 우리는 역할·청중·목적·결과물 4개로 축약 |
| 활동지 기본/표준/도전 | D~E / C / A~B 수준에 맞춘 과제 층 |
| 답안 방식(`answer_mode`) | 화면 입력(screen) / 종이 답안·사진 읽기(paper). 세트당 paper 최대 1개 |
| 예시 은행 | 공개 자료에서 뽑은 실제 문항·채점표·예시답안 레코드(473+58건). 출처 표기 후 참고 |
| 참고한 공개 자료(`references`) | 문항 카드가 참고한 예시 은행 id와 출처 목록. 패키지·교재 끝에 표기 |
| 안내장 | 차시별 학생·학부모 대상 학습 기록·피드백 문서. 세특이 아니며 하단 고지 필수 |
| 4색 모델 | 세특 문장 구성 요소: 파랑(성취수준)·초록(근거)·빨강(역량)·검정(총평) → 안내장의 확정 점수·근거·요소 코멘트·원장 한마디 |
| 목표참조 / 자기참조 피드백 | 목표 대비 현재 / 이전 수행 대비 향상. 저성취에는 자기참조 우선 |
| HITL | AI 초안 → 사람 검수·확정 → 공개. 확정 전엔 학생에게 보이지 않음 |
| 스냅샷(판) | 게시 시 세트를 통째로 보관한 것. 배정은 판에 고정. v1 판은 읽을 때 v2로 올림 |
| fixture(가짜 응답) | 키 없이 화면·테스트를 돌리기 위한 고정 JSON. v2는 수학·과학만 |
| [TS] / [AI] 검토 | 순수 코드 검사 / 검토용 모델 호출. [TS]가 먼저 |
