# 서·논술형 예시 은행 (Exemplar Bank) — README

이 디렉터리는 국어·사회·역사·수학·영어·과학·2025(교과통합) 서·논술형 평가 예시 문항을
`reference-corpus/`의 원문(PDF→텍스트 추출본)에서 수작업으로 전사(轉寫)한 큐레이션 데이터베이스다.
각 하위 폴더가 교과 하나에 대응하며, 폴더 안의 JSON 파일 하나가 원문 자료집 한 권(또는 시리즈)에서
추출한 문항 묶음이다.

## 1. 레코드 스키마

모든 문항 레코드는 다음 필드를 갖는다(값이 없으면 `null`, 빈 배열/문자열이 아니라 명시적으로 없음을 표시).

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 은행 전체에서 유일. `<교과 접두어>-<번호>` 형식(§4 참고) |
| `subject` | string | 교과명(국어/사회/역사/수학/영어/과학) |
| `school_level` | string | "중"/"고" |
| `grade` | number\|null | 학년(학년군만 제시된 경우 `null`) |
| `unit` | string | 단원/영역 |
| `standard_codes` | string[] | 성취기준 코드 |
| `kind` | string | 서술형/논술형/서·논술형/수행 등 |
| `points` | number\|null | 문항 총점(수행평가 등 총점이 없는 경우 `null`) |
| `time_min` | number\|null | 예상 소요 시간(분) |
| `context` / `materials` / `stem` / `conditions` / `answer_format` | - | 문항 본문 구성 요소 |
| `requires_drawing` | boolean | 학생이 직접 그림/그래프를 그려야 하는지 (일부 은행에만 존재) |
| `rubric` | object | §2 참고 |
| `has_rubric` | boolean (선택) | §3 참고 |
| `exemplar_answers` | object[] | 수준별 예시 답안 |
| `feedback` | string\|null | 수준별 피드백 |
| `cognitive` | string[] | 인지 영역(지식·이해/과정·기능/가치·태도) |
| `source` | object | §5 참고 |

### 1.1 `rubric` 객체

```json
"rubric": {
  "type": "분석적 | 총체적 | 조건-점수 | 분석-총체 혼합 | ...",
  "criteria": [
    {
      "name": "채점 기준명",
      "levels": [
        {"points": 3, "desc": "..."},
        {"points": 2, "desc": "..."},
        {"points": 0, "desc": "..."}
      ]
    }
  ],
  "notes": "채점 시 유의사항(선택)",
  "type_note": "배점 산출 방식에 대한 설명(선택, §2.1 참고)"
}
```

각 `criteria[].levels`는 **서로 배타적인 등급**(하나만 선택해 점수를 매기는 척도)을 표현하는 것이
기본 규칙이다. 즉 한 기준의 만점은 `levels`의 최댓값이며, 문항의 `points`는 원칙적으로
**모든 criteria의 만점 합**과 같아야 한다.

#### 2.1 예외: 체크리스트형(독립 합산) 기준

극소수 문항은 원문 채점기준표 자체가 "등급 중 택일"이 아니라 "각 세부 조건을 독립적으로 합산"하는
방식이다(예: `math-jaryojip-009`의 "문제 만들기 조건 4개, 각 1점"). 이런 경우 세부 조건은 각각
별도의 `criteria` 항목(대개 `points`/`0`의 2단계)으로 풀어서 표현하며, 재구성이 어려운 특수한 배점
구조(예: `kor-seoul2022-009`처럼 항목별 부분점수(0.5점 단위)가 세밀하게 얽힌 경우)는 `rubric.type_note`에
"각 요소 독립 합산" 등으로 그 방식을 설명한다. `rubric.type_note`가 있는 레코드는 `points`가
`criteria` 합계와 정확히 일치하지 않을 수 있음을 의미하며, 이는 **의도된 예외**이지 오류가 아니다.

### 1.2 `points` vs 채점기준표 배점 합계가 원문 자체에서 다른 경우

일부 원문은 발문에 인쇄된 배점(예: "(5점)")과 실제 채점기준표(예: 4점 척도)가 서로 다르다
(원문 자체의 오류·미정정). 이런 경우:

- 채점기준표(실제 채점 도구)가 더 상세하고 신뢰할 수 있으면 `points`를 채점기준표 합계로 맞추고,
  `rubric.notes` 또는 `rubric.type_note`에 원문 발문 표기와의 차이를 기록한다.
- 단일 소문항의 배점 표기 차이처럼 사소하고 원문 그대로 보존할 가치가 있는 경우
  (예: `kor-moe2020-051`), 발문 표기를 그대로 두고 차이를 `rubric.notes`에 문서화한다.

두 경우 모두 **원문의 실제 표기를 삭제하지 않고 불일치를 기록**하는 것이 원칙이다("고쳐 쓰지 말고
기록하라").

## 2. `has_rubric` 플래그

`rubric.criteria`가 빈 배열인 레코드가 2건 있다(`kor-moe2020-016`, `kor-moe2020-024`) — 원문 해당
페이지에 채점기준·예시 답안이 아예 수록되어 있지 않기 때문이다(지면 누락 또는 지필평가 재구조화
예시로 소개만 되고 채점표는 생략됨). 이 두 레코드에는 최상위 필드 `"has_rubric": false`를 추가해
"원문에 채점기준이 없음"을 명시했다.

**기본값은 `has_rubric: true`이며, 필드가 아예 없는 레코드(대다수)는 모두 `true`로 간주한다.**
즉 `has_rubric`는 예외(누락)를 표시하기 위한 필드이고, 정상적으로 채점기준이 있는 레코드에
`"has_rubric": true`를 일일이 추가할 필요는 없다.

## 3. `source` 객체와 페이지 표기 관례

```json
"source": {
  "file": "원문 PDF 파일명(reference-corpus/index.json의 file 값과 정확히 일치)",
  "pages": [...],
  "page_range": [시작페이지, 끝페이지]
}
```

- **`source.file`**: `reference-corpus/index.json`에 등록된 실제 파일명과 **완전히 동일한 문자열**이어야
  한다. 큐레이터가 임의로 덧붙인 주석(예: "(서울특별시교육청)", "(한국교육과정평가원)", "='...'과
  동일본" 등 원문 파일명에 없는 부가 설명)은 제거한다. 2026-09-24 QA에서 11개 파일명 표기가
  이 규칙을 어겨 정정되었다(§7, `QA-2026-09-24.md` 참고).
- **`source.pages`**: 두 가지 관례가 은행마다 다르게 쓰인다.
  - **`2025/` 은행**: `pages`가 항상 `[시작페이지, 끝페이지]` 2개 값의 **범위**를 의미한다(그 사이
    페이지가 모두 포함된다는 뜻이며, 중간 페이지 번호는 나열하지 않는다).
  - **그 외 모든 은행**(국어/사회/역사/수학/영어/과학의 개별 자료집 파일): `pages`가 문항 지문·채점
    기준·예시 답안이 걸쳐 있는 **모든 개별 페이지 번호를 나열한 전체 목록**이다(예: `[12,13,14,17,19]`
    처럼 중간에 다른 문항이 끼어 있으면 그 페이지는 제외되고 건너뛸 수 있다).
- **`source.page_range`**: 위 두 관례의 차이를 흡수하기 위해 2026-09-24 QA에서 **전 은행 모든
  레코드에 일괄 추가**한 필드로, 항상 `[min(pages), max(pages)]`(2025 은행은 이미 범위이므로 그대로)
  형식이다. `pages`는 원래 값 그대로 보존했고, `page_range`는 "이 문항이 원문의 몇 쪽부터 몇 쪽
  사이에 있는지"를 은행에 상관없이 동일한 방식으로 빠르게 조회하기 위한 파생 필드다.

## 4. id 접두어 (교과별)

| 교과 | 파일 | id 접두어 |
|---|---|---|
| 2025(교과통합) | `2025/*.json` | `k25-<교과명>` (예: `k25-과학`, `k25-사회`, `k25-도덕`, `k25-역사`; `k25-국어`/`k25-수학`/`k25-영어`는 2025 은행 확장분으로 추후 별도 QA 대상, §8 참고) |
| 국어 | `국어/*.json` | `kor-achv2022`, `kor-hscase`, `kor-hsguide`, `kor-moe2020`, `kor-msguide`, `kor-seoul2022` |
| 사회 | `사회/*.json` | `soc-guidehigh`, `soc-guidemid`, `soc-jungyesi`, `soc-level`, `soc-methodsoc`, `soc-moe2020`, `soc-seoulbank`, `soc-seoulpr` |
| 역사 | `역사/*.json` | `hist-level`, `hist-methodhist`, `hist-moe2020` |
| 수학 | `수학/*.json` | `math-achievement`, `math-guidebook-hs`, `math-guidebook-ms`, `math-jaryojip`, `math-saryeon`, `math-silcheon`, `math-suhaeng` |
| 영어 | `영어/*.json` | `eng-achievement`, `eng-agency`, `eng-highguide`, `eng-midguide`, `eng-midperf`, `eng-seoulpractice`, `eng-seoultool` |
| 과학 | `과학/*.json` | `sci-case`, `sci-gg`, `sci-gj`, `sci-level`, `sci-moe2020`, `sci-sp`, `sci-st`, `sci-suhaeng`, `sci-yj` |
| 경기 논술형(2025.7 장학자료) | `경기논술형/<교과>.json` | `gg25-kor`, `gg25-math`, `gg25-eng`, `gg25-soc`, `gg25-hist`, `gg25-sci` (§9 참고) |

## 5. 은행별 레코드 수 (2026-09-24 QA 기준, `2025/국어·수학·영어` 확장분 제외)

| 교과 | 레코드 수 |
|---|---|
| 과학 | 126 |
| 국어 | 81 |
| 사회 | 77 |
| 수학 | 69 |
| 역사 | 15 |
| 영어 | 47 |
| 2025(과학·도덕·사회·역사) | 58 |
| **합계** | **473** |

## 6. 검증 스크립트

`scripts/check_exemplars.py`가 다음을 검증한다.

1. 필수 필드 존재 여부(빈 값이면 안 되는 필드: `id`, `subject`, `school_level`, `kind`, `stem`,
   `rubric`, `source.file`, `source.pages`).
2. 은행 전체 `id` 유일성.
3. **배점-채점기준 합계 감사**: 숫자 `points`가 있는 모든 레코드에 대해 (a) 각 criterion 만점의 합,
   (b) criteria 전체 중 최댓값(단일 서열 척도로 볼 때의 만점) 두 가지를 계산해 **둘 중 어느 것과도
   일치하지 않으면** 결함으로 보고한다. `rubric.type_note`가 있는 레코드, `has_rubric: false`인
   레코드는 문서화된 예외로 간주해 감사에서 제외한다.

```bash
python scripts/check_exemplars.py          # 사람이 읽기 좋은 리포트
python scripts/check_exemplars.py --json   # 기계 판독용 JSON 리포트
```

exit code 0은 결함 0건을 의미한다.

## 7. 2026-09-24 QA 작업 로그

이번 QA 라운드(findings 1–8)에서 수정한 내용의 전체 목록과 근거 페이지는
[`QA-2026-09-24.md`](./QA-2026-09-24.md)에 기록되어 있다.

## 8. 참고: `2025/국어.json`, `2025/수학.json`, `2025/영어.json`

이 QA 작업 도중(2026-09-24) 위 세 파일이 별도 프로세스에 의해 새로 추가되어 은행에 합류했다
(`2025/과학·도덕·사회·역사`와 동일한 "2025 중등 교과별 논술형 평가 문항" 시리즈의 나머지 교과분).
이 QA 라운드는 작업 시작 시점에 존재하던 473개 레코드만을 대상으로 했으므로, 이 3개 파일(66개
레코드)은 이번 배점 감사·파일명 정규화·`page_range` 추가 대상에서 **의도적으로 제외**했다.
`scripts/check_exemplars.py`를 지금 실행하면 이 확장분에서 몇 건의 배점 불일치가 보고될 수 있는데,
이는 알려진 후속 작업 대상이며 이번 QA의 미해결 결함이 아니다.

## 9. `경기논술형/` — 경기 논술형 평가 장학자료(2025.7) 38건 (WP9, 2026-09-25 추가)

원문: `250725 경기 논술형평가 장학자료- 탑재용 최종.pdf` (경기도교육청 「학습 여정을 탐색하는 의미있는
경기 논술형 평가」, 213쪽, **텍스트층 없는 이미지 PDF**). 이 파일은 `reference-corpus/`에 추출본이 없으므로
전 쪽을 110dpi로 렌더링해 이미지를 직접 판독해 전사했다. 공공누리 공공저작물 — 각 레코드
`source.attribution`에 출처 문구를 둔다. 분석 문서: `docs/research/corpus/wp9-gyeonggi-essay.md`.

| 파일 | 건수 | 비고 |
|---|---|---|
| `국어.json` | 8 | 고1 4, 중1 4 |
| `수학.json` | 6 | 고1 2, 중1 4 |
| `영어.json` | 8 | 고1 4, 중1 4 (답안 영어, 지시·채점 한국어) |
| `사회.json` | 6 | 고1 통합사회 3, 중1 사회 3 |
| `역사.json` | 2 | 고1 한국사1, 중2 역사 (원문은 '사회과' 편에 수록 — `subject_note`) |
| `과학.json` | 8 | 고1 통합과학 4, 중1 과학 4 |
| **합계** | **38** | 원문 목차의 전 문항. 원문상 **전부 논술형**(서술형 0건) |

추가 필드(이 은행 전용): `title`, `competencies`, `evaluation_elements`, `assessment_mode`(지필/수행),
`design_intent`(논술형 평가 제작 의도), `lesson_link`(수업-평가 연계 주안점), `holistic`(원문에 총체적
채점표가 없어 전부 `null`), `feedback`(원문 '피드백 시 유의점'), `ai_use`. `levels[].desc`는 원문
'수행 수준(채점기준)' 문장을 그대로 옮겼다. `source.pages`는 개별 쪽 전체 목록(PDF 쪽 = 인쇄 쪽).

QA 메모:
- `scripts/check_exemplars.py`(재귀 glob이라 수정 없이 인식): 38건 스키마 오류 0, 배점 플래그 0.
  (실행 결과의 잔존 플래그 5건은 §8의 2025 국·영 확장분.)
- `gg25-soc-05`는 중1 자유학기라 원문이 점수 없이 A~E/A~C 등급으로만 채점 → `points: null`,
  `levels[].points: null` + `grade`.
- 원문 자체 불일치는 `rubric.type_note`에 기록하고 고치지 않았다: `gg25-math-04`(문두 [총 15점] vs 채점표 12점,
  points=12), `gg25-kor-03`(유의점 '각 7점씩' vs 표 7·5·3), `gg25-eng-03`(유의점 180~200 vs 조건 180~220단어).
  예시답안 원문 오기는 `exemplar_answers[].note`에 기록(`gg25-math-03` ii, `gg25-soc-03` 예시1).
- 최하 척도가 1점인 요소(무응답도 1점)가 17문항에 있다 — 원문 관행 그대로이며 우리 C-13과 다름.
- 예시답안이 긴 문항(`gg25-kor-08` 5편 중 4편, `gg25-soc-03` 3편 중 2편)은 `excerpt: true`로
  앞부분만 싣고 전문 쪽을 적었다.
- 판독 불가 쪽 없음, `incomplete` 레코드 없음.

## 10. `초등/` — 「생각을 키우는 교실 – 서·논술형 평가 문항자료」 3~6학년 29건 (WP10 추가)

원문: 서울특별시교육청 초등교육과(2026.5), 「생각을 키우는 교실 – 서·논술형 평가 문항자료」 3학년(185쪽)·4학년(353쪽)·
5학년(318쪽)·6학년(306쪽). `reference-corpus/`의 텍스트층 추출본으로 읽고, 표가 깨진 쪽만 렌더링해 확인했다.
각 레코드 `source.attribution`에 출처 문구를 둔다(공공누리 표시는 텍스트층에서 찾지 못함). 분석 문서:
`docs/research/corpus/wp10-elementary-crosscheck.md`.

| 파일 | 건수 | 교과 | id |
|---|---|---|---|
| `3학년.json` | 7 | 국어1·사회2·도덕1·수학1·과학2 | `sgk-g3-01`~`07` |
| `4학년.json` | 8 | 국어2(1건 국어·사회 통합)·사회1·도덕2·수학1·과학2 | `sgk-g4-01`~`08` |
| `5학년.json` | 7 | 국어1·사회2·수학1·과학1·실과1·영어1 | `sgk-g5-01`~`07` |
| `6학년.json` | 7 | 국어2·사회1·도덕1·수학1·과학1·영어1 | `sgk-g6-01`~`07` |
| **합계** | **29** | 원문 212문항(36·67·52·57) 중 선별 | |

이 은행의 관례:
- `school_level: "초"`, `grade`는 권의 학년. `kind`는 원문 이름 그대로 `"서·논술형"`(원문에 서술형/논술형 구분 없음).
- `points`는 원문에 총점이 없으면 `null`(29건 중 28건). 척도별 점수가 인쇄된 경우 `levels[].points`에 옮기고 합계는
  `points_note`에 적는다. 원문 채점표는 대부분 점수 없이 3수준이므로 `levels[].label`(`능숙`/`보통`/`도움필요`)과
  `levels[].points: null`을 쓴다. `sgk-g5-02`만 소문항 배점 (4점)×3이 인쇄되어 `points: 12`.
- 원문 채점표의 '피드백' 열은 요소마다 `criteria[].feedback`(문자열 배열)에 둔다. 최상위 `feedback`은 `null`.
- 추가 필드(이 은행 전용): `title`, `learning_goal`, `evaluation_elements`, `points_note`, `conditions_label`(원문 라벨:
  `[조건]`·`<꼭 써야 할 내용>`·`(힌트: …)` 등), `answer_length`(원문 분량 표기), `length_scored`(분량을 점수로 매기는지),
  `group_work`, `item_explanation`(원문 '문항 설명'), `step_items`(단계형 문항 쪽·요약·선택형 포함 여부 — 전사하지 않음),
  `elementary_features`(초등 관행 태그), `source.printed_pages`·`source.page_note`.
- `source.pages`는 **PDF 쪽** 개별 목록이다. 인쇄 쪽은 3학년 = PDF − 4, 4~6학년 = PDF − 6.
- 제3자 글(신문 기사, 출처 없는 읽기 글, 가상 기사)은 `materials[].summary`로 요약하고, 연구팀이 쓴 짧은 상황문·목록은
  `materials[].text`로 전문을 싣는다. 그림만 있는 자료는 무엇이 있는지 `summary`에 적는다.
- 원문 오기·불일치는 고치지 않고 `rubric.notes`·`type_note`·`exemplar_answers[].note`에 기록했다.

QA 메모:
- `scripts/check_exemplars.py`: 전체 606건, 스키마 오류 0. `초등/` 29건의 배점 플래그 0. 잔존 플래그 5건은 §8의 2025 국·영 확장분.
- `sgk-g3-07`은 원문 채점표 머리가 '능숙 / 보통(1) / 도움필요(0)'라 능숙 점수가 비어 있어 `type_note`로 표시했다.
- 전사하지 않은 것: 각 문항의 흐름도(차시표)와 단계형 문항 본문(쪽과 요약만 `step_items`에).
