import { rulesFor } from './rules/index'
import { levelsBlock } from '@/lib/reference/levels'
import { exemplarsBlock, exemplarsBlockFull } from '@/lib/reference/exemplars'
import { NOTICE_DISCLAIMER, type Stage } from '@/lib/studio/schemas'
import { SET_ITEM_COUNT, SET_TOTAL, SHORT_POINTS, ESSAY_POINTS, SHORT_TOTAL, SHORT_CRITERIA, ESSAY_CRITERIA, CRITERION_MAX, TEACHING_LESSONS, ASSESSMENT_SESSION } from '@/lib/studio/assessment-structure'
import { SHORT_EXEMPLAR_STEPS, POINTS_SUM, ASSUMED_SHORT_RANGE, ITEM_NO_RANGE, SESSION_STEPS, SET_KINDS } from '@/lib/studio/structure-text'
import { gradeLabel, standardCodePrefixes } from '@/lib/studio/level-map'

export type Ctx = {
  /** grade null = 학년 지정 안 함 → 학교급 학년군 전체(대표 결정 2026-09-26, lib/studio/level-map.ts gradeLabel) */
  theme: { title: string; level: string; grade: number | null; subjects: string[] }
  subject: string
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
  /** 단원명(선택) — 예시 은행에서 같은 단원 예시를 고를 때만 쓴다. */
  unit?: string | null
}

/**
 * 학교급·학년 줄. 학년이 있으면 지금까지와 같은 "중학교 1학년 (모든 내용은 이 학년 수준)",
 * 없으면 "중학교(1~3학년군)" — 2022 개정 성취기준은 학년군 단위라 학년 하나에 묶지 않는다(대표 2026-09-26).
 */
function levelLine(ctx: Ctx): string {
  const label = gradeLabel(ctx.theme.level, ctx.theme.grade)
  return ctx.theme.grade == null
    ? `학교급·학년: ${label} — 학년을 하나로 정하지 않았다(성취기준은 학년군 단위). 모든 내용은 이 학교급 학년군 수준`
    : `학교급·학년: ${label} (모든 내용은 이 학년 수준)`
}

/** 1단계(성취기준 적합성)에 붙이는 학교급 코드 안내 — 적합성은 학교급(코드 접두)과 대주제로만 본다. */
function schoolCodeNote(ctx: Ctx): string {
  const prefixes = standardCodePrefixes(ctx.theme.level, ctx.theme.grade)
  if (prefixes.length === 0) return ''
  return `\n\n이 대주제의 학교급 성취기준 코드: ${prefixes.map((p) => `${p}…]`).join(' · ')} (${gradeLabel(ctx.theme.level, null)}) — 코드가 이 접두로 시작하면 학교급이 맞다.`
}

function header(ctx: Ctx) {
  return [
    `대주제: ${ctx.theme.title}`,
    levelLine(ctx),
    ...(ctx.theme.subjects.length > 0 ? [`참여 과목: ${ctx.theme.subjects.join(', ')}`] : []),
    ...(ctx.subject ? [`과목: ${ctx.subject}`] : []),
    // 0단계(대주제 소개)는 성취기준을 고르기 전이다 — 빈 '성취기준(원문)' 머리말을 두면 검토 AI가 원문이 없다고 반려한다
    ...(ctx.standards.length > 0 ? ['성취기준(원문, 절대 변형 금지):', ...ctx.standards.map((s) => `${s.code} ${s.text}`)] : []),
  ].join('\n')
}

// 세트 구조(대표 2026-09-26) — 숫자는 assessment-structure.ts 한 곳에서 온다
const SESSION_T = ASSESSMENT_SESSION.time_budget
const [SHORT_STEP, ESSAY_STEP] = ASSESSMENT_SESSION.steps
const SESSION_TEXT = `단원 평가 차시(kind "assessment", 마지막 번호, topic "${ASSESSMENT_SESSION.topic}"): 마지막 교수 차시 뒤에 ${SET_KINDS}을 함께 본다 — standards는 두 문항이 평가하는 성취기준 1~2개, time_budget 도입 ${SESSION_T.intro_min}·전개 ${SESSION_T.main_min}·정리 ${SESSION_T.wrapup_min}(평가 안내·답안 점검), flow.main은 [${SHORT_STEP.step_label} ${SHORT_STEP.minutes}분, ${ESSAY_STEP.step_label} ${ESSAY_STEP.minutes}분], formative_check.quiz는 빈 배열, teacher_script.questions·worksheet.tasks·worksheet.self_check는 빈 배열로 둘 수 있다, caution_notes(시간 안내·답안 방식 안내), materials_used(두 문항이 쓰는 자료 ID), assessment ["서술형", "논술형"], mergeable_with null`

const TASKS: Record<Stage, string> = {
  0: '대주제 소개문(3~4문장)과 참여 과목별로 이 대주제와 연결할 수 있는 수업 아이디어를 한 줄씩 제안하라. 아이디어는 한 줄 스케치이며 위 학교급·학년 수준(학년을 정하지 않았으면 그 학교급 학년군 전체)의 교육과정 범위 안에서만 제안한다; 자료·출처·채점은 여기서 다루지 않는다. 소개문은 결론이나 정답을 미리 말하지 않는다.',
  1: '주어진 성취기준이 이 대주제와 학교급에 적합한지 판단하고, 부적합한 것이 있으면 이유와 함께 표시하라. 학교급 적합성은 성취기준 코드로만 본다 — 코드가 이 학교급 접두(중학교 [9…], 초등학교 [4…]·[6…])로 시작하면 적합하다. 2022 개정 성취기준은 학년군 단위이므로 학년군 안에서 몇 학년에 배우는 내용인지는 따지지 않는다. 대주제 적합성은 이 대주제 상황으로 그 성취기준을 수업할 수 있는지를 본다.',
  2: '재구조화 표(standards: 성취기준마다 통합/재조정/유지, original_text는 원문 그대로, reconstructed_text는 유지를 포함해 셋 다 "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다" 틀 문장으로 쓴다(유지여도 original_text를 그대로 옮기지 않는다 — original_text만 원문 그대로이고 reconstructed_text는 항상 이 틀 문장), reason 태그, merged_with(재구조화 유형이 통합이면 함께 묶은 다른 성취기준 코드 배열, 그 외는 빈 배열), learning_elements; reconstructed_text는 original_text와 merged_with 성취기준 원문에 있는 어휘만 쓴다)와 세트 통합 문장 1개(reconstruction, 같은 틀로 세트 성취기준 원문에 있는 어휘만 쓴다), 학습 목표 3~5개(각각 axis=지식·이해/과정·기능/가치·태도, 세 축 모두 1개 이상), 세트 핵심질문 후보 2~3개를 만들어라. 재구성 문장 두 가지(성취기준마다의 reconstructed_text와 통합 문장 reconstruction)는 모두 성취기준 원문의 낱말과 문장 틀 낱말(학생은·가지고·해서·할 수 있다·것·위해·통해 같은 기능어)만 쓴다 — 위 대주제의 상황(학교 축제·일회용품처럼 대주제 제목에 나오는 낱말, 안내문·도표의 구체적인 주제)은 재구성 문장에 쓰지 않고, 학습 목표(learning_goals)·세트 핵심질문 후보와 3단계 차시에서만 쓴다. 위에 준 C 문장(도달점)보다 좁아지거나 다른 활동을 가리키지 않게 한다. level_anchor는 빈 배열로 둔다(서버가 채운다). 세트 핵심질문 후보는 핵심질문 6단계로 뽑는다(대표 연수 2기, L-04): ① 재구성 문장에서 핵심 기능어(설명·비교·추론·주장·감상·파악·적용 — 학생이 실제로 무엇을 판단·해석·추론·비교·설명·주장해야 하는지)를 찾고 ② 재구성 문장으로 학생이 무엇을 읽고 무엇을 근거로 무엇을 해야 하는지 선명하게 하고 ③ 수업이 끝난 뒤 학생에게 남아야 할 핵심 이해를 한 문장으로 잡고 ④ 그 핵심 이해를 질문형으로 바꾼다 — 핵심질문은 두 축을 한 질문에 묶는다: "무엇인가?"(이 현상은 무엇인가·두 대상은 무엇이 같고 다른가·화자나 필자의 의도는 무엇인가·이 자료의 핵심 내용은 무엇인가)와 "어떻게 알 수 있는가?"(어떤 원리로 설명할 수 있는가·어떤 기준으로 비교할 수 있는가·그렇게 판단할 수 있는 단서는 무엇인가·어떤 정보가 이를 가장 잘 보여 주는가); 기능어가 주장이면 입장 + 근거("나는 어떤 입장을 취할 것이며, 그 입장을 뒷받침하는 근거는 무엇인가"), 감상이면 인상 + 근거("어떤 점이 인상적이며, 어떤 표현이 그런 느낌을 만들었는가")로 묶는다 ⑤ 수업 전체를 끌고 갈 수 있는지 점검한다 — 자료를 바꿔도(대화문·안내문·표·그래프 등) 반복해서 쓸 수 있고, 차시 활동으로도 쓰이고, 마지막 단원 평가 문항으로 이어져야 한다(한 문제에서만 쓰고 버릴 질문이면 약하다; 대주제 상황은 질문의 맥락으로 쓰되 질문의 뼈대가 특정 자료 하나에 묶이지 않게) ⑥ 문항과 구분한다 — 핵심질문은 문항 문장이 아니다: 자료 지시("다음 자료를 읽고"·"자료 B의")와 응답 방식("쓰시오"·"서술하시오"·분량·조건)을 붙이지 않는다(그것은 5단계 문항에 붙는다).',
  3: `unit_plan(set_title, set_key_question, lesson_map(모든 차시, 단원 평가 차시 포함), assessment_plan: formative·summative_placement ${SET_ITEM_COUNT}건(서술형 → 논술형, 두 건 모두 단원 평가 차시 번호)·rubric_note 상/중/하)과 lessons를 설계하라: 교수 차시 ${TEACHING_LESSONS.min}~${TEACHING_LESSONS.max}개(보통 ${TEACHING_LESSONS.max}개) + 마지막 교수 차시 뒤 단원 평가 차시 1개. 교수 차시(kind "teaching"): 담당 성취기준 1~2개, topic, 차시 핵심질문, goal, time_budget(도입 10·전개 40·정리 10, 합 60), flow(intro 불릿, main 소단계 2~4개에 minutes 합 = 전개 시간, wrapup 불릿), teacher_script.questions 발문 2~4개(prompt·expected_answer·if_stuck), materials_used(자료 ID A~F만), materials_needed(준비물), caution_notes(오개념 1개 이상), worksheet(tasks 2~5개: 기본·표준·도전 각 1개 이상, tier·level_ref·answer_space·expected; self_check 1~3), formative_check.quiz(마지막 교수 차시 포함 모든 교수 차시에 정확히 3문항, 모두 단답형: type "short"·choices null — 학생이 낱말·수치·짧은 구를 직접 쓰는 문항이고 선택지·"다음 중 알맞은 것은" 꼴 객관식은 쓰지 않는다; answer는 그 낱말·수치·짧은 구(같은 뜻의 다른 표기는 " / "로 나눠 함께 적고 분수는 "/"로 쓰지 않는다), explanation은 한두 줄), assessment는 빈 배열, mergeable_with·merge_note. ${SESSION_TEXT}. 차시의 materials_used에는 이 과목 수업에 꼭 필요한 자료만 적는다. 대주제 공유 자료는 이 과목 활동에 필요한 것만(보통 0~2개) 고르고, 그 밖의 자료는 4단계에서 이 과목 전용으로 만들 자료 ID(공유 자료 다음 글자부터)를 미리 정해 적는다. 단원 평가 차시의 materials_used는 5단계 문항이 쓸 자료와 같아야 한다(비워 두면 5단계 뒤 자동으로 채운다).`,
  4: '차시와 문항에 필요한 가상 자료를 만들어라. 표는 열·행으로, 설명글은 본문으로. 수치는 합계와 비율이 맞아야 한다. 공유 자료가 주어지면 그 수치를 그대로 쓴다. 자료는 원자료만 담는다(role="raw") — 학생이 문항에서 만들어야 할 결과(정리된 도수분포표·계산된 상대도수·평균·결론 문장)를 body나 표에 미리 적지 않는다. 배경 설명글은 role="context". 이번 세트는 전부 자작이므로 source.kind는 "자작", attribution은 null, ai_assisted는 false. 표는 5~25행·열 6개 이하. 자료 제목에는 자작·가상·본사·공개 자료 같은 출처 표기를 쓰지 않는다(출처는 source 필드에만). 세트 자료는 문항·차시가 실제로 쓰는 2~4개만 만든다(실제 서논술 문항은 자료 2~4개를 쓴다 — 어느 문항·차시도 쓰지 않는 자료는 게시 판에서 빠진다); 공유 자료는 이 과목 문항이 인용할 것만 materials_used에 넣고 나머지는 쓰지 않는다. 자료 안의 지시·사실은 서로 모순되지 않아야 한다(예: "자기 컵을 가져오라"고 한 뒤 "그 컵을 반납하라"고 하면 안 됨 — 빌린 컵을 반납하는지, 가져온 컵은 가져가는지 분명히). 영어 자료는 지시 대상(your cup/the borrowed cup)이 분명한 어휘를 골라 쓴다. 자료를 만들기 전에 형식보다 사고를 먼저 정한다(대표 연수 2기, C-33): "어떤 형식이 좋을까?"보다 "학생이 이 자료로 무슨 사고를 해야 하지?"를 먼저 묻고, 재구성 문장·핵심질문·그 자료를 쓰는 차시의 기능어 → 학생이 붙잡을 핵심 단서 → 최종 답안의 방향을 정한 뒤 기능어에 맞는 유형을 고른다 — 추론형: 짧은 대화문·메시지·안내문·광고문·이메일·짧은 글; 주장형: 서로 다른 입장이 드러나는 짧은 자료 2개·통계 사례·찬반 상황 자료; 비교형: 두 대상 소개문·표·그래프·설명글 2개; 파악형: 연표·사료·기사·요약문·개념도·설명문; 이해·적용형: 실험 결과·생활 사례·그림·도식·조건 제시문. 주제는 학생에게 친숙하게, 글은 너무 노골적이지도(답이 그대로 드러남) 너무 모호하지도(단서가 없음) 않게 쓰고, 학생이 근거로 삼을 단서(의도·목적을 드러내는 표현·어조·반복·상황 맥락, 비교 기준, 수치)를 자료 안에 둔다.',
  5: `문항 카드 ${SET_ITEM_COUNT}장을 만들어라: 서술형 1개(${SHORT_POINTS}점, 문두 끝 "[${SHORT_POINTS}점]") → 논술형 1개(${ESSAY_POINTS}점, "[${ESSAY_POINTS}점]") 순서. 위 참고 예시의 문장·수치는 옮기지 않는다. 형식 틀(두 문항 모두 자료집 문항 한 건과 같은 모양·순서로 채운다): 성취기준 → 평가 요소(evaluation_elements, "~하기") → 문항(stem: <자료 n>을 소개하는 전제문 → 문두 바로 아래 <자료 1>·<자료 2> 상자 → 발문 → [N점]) → 조건(conditions: 서술형은 items 없이 분량·형식·답안 방식만, 논술형은 지침 2~4개) → 채점 기준표(rubric: 요소 × 척도 0점~만점, 단계마다 수행 특성 descriptor + 총체적 상/중/하) → 예시답안(exemplar_answers: 점수 단계별) → 채점 시 유의점(rubric.notes). 위 "예시 문항 전체" 2건(서술형 1·논술형 1)이 기대하는 밀도다 — 문두 길이(전제문 + 발문), 조건 문장의 말투, 척도 descriptor를 단계마다 학생이 무엇을 했고 무엇이 빠졌는지로 적는 방식, 예시답안 길이를 보고 적어도 그만큼 채운다. 형식과 밀도를 따르되 문장·수치는 옮기지 않는다; 예시의 요소 수·배점·조건 개수·조건 내용(풀이 힌트가 든 조건 등)이 이 과제의 규칙과 다르면 이 과제의 규칙을 따른다. 각 카드: lesson_no(두 문항 모두 3단계 unit_plan.assessment_plan.summative_placement의 단원 평가 차시 번호를 그대로 옮긴다), evaluation_elements("~하기" 1~3개), situation(논술형은 role·audience·purpose·product 필수, 서술형은 null; role·audience는 대주제·자료에 나오는 사람만 쓴다 — 학생회·부스를 찾는 학생·교사·학부모처럼 대주제 소개나 자료에 등장하는 사람, 대주제·자료에 없는 인물을 새로 만들지 않는다), materials_used(자료 ID를 문두가 쓰는 순서대로, 원자료 1개 이상; 공유 자료는 이 문항이 실제로 인용하는 것만 넣는다 — 세트 자료와 합쳐 2~4개), stem(<자료 n>을 소개하는 전제문 + 발문 + [N점]; 자료에서 골라 쓰게 하는 발문은 무엇을 고르는지 구체적으로 적는다 — 어느 자료에서 어떤 항목(사실·품목·수치 등)을 몇 개 고르는지, 예: "<자료 1>에서 사실 한 가지, <자료 2>에서 품목 한 가지와 그 수치"; "각각 한 가지씩 골라"처럼 무엇을 고르는지 막연한 표현 금지; 문두의 "<조건>에 맞게"는 조건(items)이 있는 논술형에만 쓴다), conditions(조건은 지침만 — 풀이 힌트 금지(C-32): 서술형은 conditions.items를 빈 배열로 두고 length·format·answer_mode만 채운다, 논술형은 items 2~4개로 답안이 지켜야 할 제약만 쓴다(입장 정하기·근거 개수·인용할 자료·형식·분량·초과 응답 규칙) — 계산식·공식, 계산에 딸린 반올림 지시, "먼저 ~하고 다음에 ~한다" 같은 풀이 순서, 답이 되는 자료 수치, 결론은 조건에 쓰지 않는다(수업을 이해하지 못한 학생이 조건만 따라 답을 만들 수 있으면 안 된다); items마다 no·text(필요한 조건만 끝에 부분배점 소괄호 병기)·verb(동사 원형)·points·category 내용/형식; length는 셀 수 있는 분량("제한 없음" 금지, 영어는 단어 수); format은 표/문장/문단·종결어미·단위; answer_mode: 표·그래프·수식 작성은 "paper"(세트당 최대 1개), 글은 "screen"; overflow_rule), rubric(criteria: 서술형은 ${SHORT_CRITERIA.min}~${SHORT_CRITERIA.max}요소로 max 합 ${SHORT_POINTS}(요소마다 max ${CRITERION_MAX} 이하), 논술형은 정확히 ${ESSAY_CRITERIA.count}요소 × max ${ESSAY_CRITERIA.max}, 요소마다 axis와 condition_nos(모든 조건이 어느 요소엔가 대응; 서술형 요소와 조건을 가리키지 않는 요소는 빈 배열), scale은 0점부터 오름차순(0, 1, …, max)으로 정수마다 descriptor(관찰 가능한 표현, 0점은 무응답/시도 구분, 인접 단계가 부사만 다르면 안 됨)·example; holistic은 두 문항 모두 상/중/하(답안 전체의 모습, 요소별 점수와 어긋나지 않게 — 하는 0점 답안까지 포함, C-15); notes 1~4줄), exemplar_answers(서술형: 0점을 뺀 총점 단계마다 1개(1~${SHORT_POINTS}점 각 1개: ${SHORT_EXEMPLAR_STEPS}), 논술형: 상/중/하 각 1개; points·scores·text·rationale; 논술형 예시답안마다 assumed_short_points(이 예시가 전제하는 서술형 문항 점수 0~${SHORT_TOTAL}; 상/중/하 밴드가 등급표와 맞도록 고른다), 서술형 예시답안은 assumed_short_points=null), level_map(A~E 예상 점수 구간 + trait), min_competency는 null(서버가 E 문장을 채움), references(참고한 예시 id·출처). 그리고 grade_boundaries 7행(총 ${SET_TOTAL}점 = 서술형 ${SHORT_POINTS} + 논술형 ${ESSAY_POINTS}, level_ref 병기)과 feedback_templates 상/중/하(1~2문장, 존댓말). 학생에게는 자료·stem·conditions만 보인다(채점표·예시답안은 보이지 않는다). 문항은 자료와 한 덩어리다(대표 연수 2기 — 실제 문항은 전제문 바로 아래 <자료1>·<자료2> 상자, 그 뒤 발문; 학생 화면·문제지도 materials_used의 자료를 문항 안에 <자료 1>, <자료 2> 상자로 문두 바로 아래 놓는다): materials_used는 문두가 자료를 쓰는 순서대로 적고(이 순서가 문항 안 번호가 된다), stem·conditions에서는 자료를 문항 안 번호 <자료 1>, <자료 2>로만 가리킨다 — 세트 자료 ID("자료 A"·"자료 F")로 가리키지 않는다; 전제문은 <자료 n>마다 무엇인지 한 마디씩 소개한다(예: "<자료 1>은 ○○을 품목별로 센 표이고, <자료 2>는 ○○에 대한 안내문이다."). 차시·활동지·지침서는 지금처럼 세트 자료 ID를 쓴다.`,
  6: `비전공 원장님이 그대로 진행할 수 있는 교사용 지침서를 만들어라: general(세트 준비물·일정(2시간 등원 = 2차시)·목적), glossary 3개 이상, merge_guide(3단계에서 mergeable_with로 표시된 쌍마다 lessons·skip_activities·time_budget_120 합 120), grading_guide(common_errors 문항별 흔한 오답 3개 이상과 검수 시 볼 곳(item_no는 5단계 문항 번호 ${ITEM_NO_RANGE}), review_tips 2~5개, retry_guidance), per_lesson(차시마다 지도안에 없는 메모만 0~3개).`,
  7: `차시별 피드백 안내장 틀(NoticePlan)을 만들어라. per_lesson: 차시마다 topic_summary(60자, "~활동에서 ~을 배웠습니다"), preview(50자, 다음 차시 예고; 마지막 차시는 세트 마무리), home_study_suggestion(60자, 혼자 실행 가능한 구체 행동 1개, "~해 봅시다" 청유형), quiz_notes(퀴즈 문항마다 틀렸을 때 줄 40자 코멘트: 부분 긍정 + 역접 + 완곡, 부정 서술어 금지; 퀴즈 없는 차시는 빈 배열), criteria_phrases(단원 평가 차시만: 두 문항의 채점표 요소 전부 — 5단계 채점표 요소명 그대로, good 2개 이상(정도부사+완성동사), improve 2개 이상(부분 긍정 + 역접 + 다음 행동); 교수 차시는 null). footer_disclaimer는 정확히 "${NOTICE_DISCLAIMER}". 다른 학생 비교·등수·"못한다/실패" 금지.`,
}

/** 성취수준(A~E) 블록을 넣는 단계: 적합성 판단·재구성·차시(활동지 층)·문항(척도)·안내장(요소 문구). */
const LEVEL_STAGES = new Set<Stage>([1, 2, 3, 5, 7])
/** 예시 은행 카드를 넣는 단계와 문항 종류(3단계 활동 아이디어 2장). 5단계는 통째 예시 + 카드(EXEMPLARS_5). */
const EXEMPLAR_STAGES: Partial<Record<Stage, 'any' | '서술형' | '논술형'>> = { 3: 'any', 5: 'any' }
/**
 * 5단계 참고 예시(대표 2026-09-26 "학습했다는데 공개 예시 문항 수준에 못 미친다"): 서술형 1 + 논술형 1건을 통째로
 * (채점 기준표 전 요소 × 전 척도·유의점·예시답안 전부·출처, 건당 ≤3,500자) + 짧은 카드 2장. 카드만으로는 채점표·예시답안이
 * 잘려 모양과 밀도가 모델에 닿지 않았다. 생성 입력 상한 45k자(tests/prompts.test.ts 크기 가드). 프롬프트에 기관명은 쓰지 않는다.
 */
const EXEMPLARS_5 = { full: 1, cards: 2 } as const

function schoolOf(level: string): '초' | '중' | '고' {
  return level === '초' || level === '고' ? level : '중'
}

function knowledgeBlocks(stage: Stage, ctx: Ctx): string {
  const blocks: string[] = []
  if (LEVEL_STAGES.has(stage) && ctx.standards.length) {
    const lv = levelsBlock(ctx.standards.map((s) => s.code))
    if (lv) blocks.push(`성취수준(평가원 원문 — 재구성·목표·활동지 층·척도 어휘의 근거):\n${lv}`)
  }
  const kind = EXEMPLAR_STAGES[stage]
  if (kind && ctx.subject) {
    const q = { subject: ctx.subject, school_level: schoolOf(ctx.theme.level), grade: ctx.theme.grade, codes: ctx.standards.map((s) => s.code), unit: ctx.unit ?? null, kind, answerMode: 'screen' as const }
    const ex = stage === 5 ? exemplarsBlockFull(q, EXEMPLARS_5) : exemplarsBlock(q, 2)
    if (ex) blocks.push(ex)
  }
  return blocks.length ? `\n\n${blocks.join('\n\n')}` : ''
}

/** prior.shared_materials(대주제 공유 자료)의 A~Z ID를 오름차순으로 뽑는다. */
function sharedMaterialIds(prior: Record<string, unknown>): string[] {
  const shared = prior.shared_materials
  if (!Array.isArray(shared)) return []
  return shared
    .map((m) => (m as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string' && /^[A-Z]$/.test(id))
    .sort()
}

/**
 * 4단계(자료)에서 세트 자료가 공유 자료와 같은 글자를 쓰면 게시 스냅샷이 세트 쪽을 버린다(publish.ts의 병합 규칙) —
 * 그래서 프롬프트에서 미리 공유 자료 ID를 알려 주고 그다음 글자부터 이어 붙이게 한다.
 */
function sharedMaterialLettering(ctx: Ctx): string {
  const ids = sharedMaterialIds(ctx.prior)
  if (ids.length === 0) return ''
  const last = ids[ids.length - 1]
  const next = last < 'Z' ? String.fromCharCode(last.charCodeAt(0) + 1) : 'Z'
  return `\n\n대주제 공유 자료 ID: ${ids.join(', ')} — 이 자료들은 다시 만들지 말고, 새로 만드는 세트 자료의 ID는 ${next}부터 이어서 붙여라(같은 ID를 다시 쓰면 그 자료는 버려진다). 새 자료의 source.kind는 "자작"이다.`
}

/**
 * 가짜 응답(fixture) 키. 과목이 있으면 `stage2-generate-과학`처럼 과목을 붙여 과목별 fixture를 쓰게 하고,
 * 그 파일이 없으면 `lib/ai/mock.ts`가 과목을 뗀 기본 키로 떨어진다. 0단계(대주제 소개)는 과목이 없으므로 그대로다.
 * 1단계도 과목이 붙지만 과목별 파일을 두지 않으므로 항상 기본 파일로 떨어진다(의도한 범위: 과목별 파일은 2~7단계만).
 */
export function fixtureKeyFor(stage: Stage, role: 'generate' | 'review', ctx: Ctx) {
  return `stage${stage}-${role}${ctx.subject ? `-${ctx.subject}` : ''}`
}

/**
 * 생성에 붙이는 이전 단계(확정본). 과제 문장이 실제로 기대는 단계만 넣는다 — 전부 넣으면 5~7단계 생성 입력이 4만~5만 자가 된다.
 * 2←1(추천 성취기준), 3←2(재구조화·목표·level_anchor), 4←2·3(목표·자료가 쓰일 차시), 5←2·3·4(level_anchor 척도 근거·평가 배치·자료),
 * 6←3·5(병합 표시·채점표), 7←3·5(차시·퀴즈, 채점표 요소명). 0단계(확정된 대주제 소개, 몇 문장)는 1~7단계 모두에 넣는다 —
 * 대주제 맥락이 모든 단계의 근거라서다(repo.ts buildStatuses 주석·tests/theme-intro.test.ts).
 */
const GENERATE_PRIOR: Record<Stage, number[]> = { 0: [], 1: [0], 2: [0, 1], 3: [0, 2], 4: [0, 2, 3], 5: [0, 2, 3, 4], 6: [0, 3, 5], 7: [0, 3, 5] }
/** 대주제 공유 자료(prior.shared_materials)를 같이 보여 줄 생성 단계: 4(공유 수치를 그대로 쓰고 ID를 이어 붙임)·5(문항이 공유 자료 ID를 참조). */
const GENERATE_SHARED_MATERIALS = new Set<Stage>([4, 5])

export function buildPrompt(stage: Stage, ctx: Ctx) {
  const lettering = stage === 4 ? sharedMaterialLettering(ctx) : ''
  const prior = priorBlockFor(ctx, GENERATE_PRIOR[stage], GENERATE_SHARED_MATERIALS.has(stage) ? ['shared_materials'] : [], '이 단계에 필요한 것만')
  return {
    system: rulesFor(ctx.subject),
    user: `${header(ctx)}${knowledgeBlocks(stage, ctx)}\n\n과제: ${TASKS[stage]}${stage === 1 ? schoolCodeNote(ctx) : ''}${lettering}${prior}`,
    fixtureKey: fixtureKeyFor(stage, 'generate', ctx),
  }
}

/**
 * 검토 AI 초점(스펙 §2 각 단계의 [AI] 항목). [TS] 순수 검사(lib/studio/checks.ts)가 먼저 돌고, 통과했을 때만 이 검토가 불린다 —
 * 그래서 여기에는 기계로 판정하기 어려운 것(의미·수준·구체성)과 기계 검사의 판단 근거를 사람 말로 다시 적은 것만 둔다.
 */
const REVIEW_FOCUS: Record<Stage, string> = {
  // 0단계는 성취기준을 고르기 전의 한 줄 스케치다 — 뒤 단계(1: 성취기준, 4: 자료·출처, 5: 채점)의 요구로 반려하지 않게 범위를 못 박는다(2026-09-24)
  0: '이 단계는 성취기준을 고르기 전의 대주제 소개와 과목별 한 줄 아이디어 스케치다. 다음 세 가지만 본다. (a) 소개문 어휘가 위 학교급 학생이 읽을 수준이고 길이가 3~4문장인지(어휘가 학교급을 벗어나면 grade_level, 길이는 other). (b) 과목별 아이디어가 그 과목의 이 학교급 교육과정 범위 안에 있는지(grade_level) — 다른 학교급 내용(예: 중학교 대주제에 고등학교 내용)이면 그 과목 아이디어를 이 학교급 수준으로 좁힌 예를 detail에 함께 적는다. 같은 학년군 안에서 몇 학년 내용인지는 반려 사유가 아니다. (c) 소개문·아이디어가 결론이나 정답을 미리 말하지 않는지(other). 성취기준 원문, 출처 표기 계획, 자료 계획, 채점 계획은 요구하지 않는다 — 모두 뒤 단계에서 다루므로 이것이 없다는 이유로 반려하지 않는다. 위 세 가지에 문제가 없으면 pass=true, issues=[].',
  1: '추천한 성취기준이 이 학교급의 성취기준인지만 본다 — 코드가 아래 학교급 접두로 시작하지 않으면 grade_level. 그리고 이 대주제 상황으로 그 성취기준을 수업할 수 있는지(other). 2022 개정 성취기준은 학년군 단위이므로 학년군 안에서 몇 학년에 배우는 내용인지는 따지지 않고, 그것으로 반려하지 않는다.',
  2: '재구조화 문장마다 원문에 없는 동사·대상·개념이 있는지(fidelity). 재구조화 문장이 위의 C 문장(도달점)보다 좁거나 다른 활동인지(level). 통합이면 merged_with에 함께 묶은 성취기준 코드가 빠짐없이 있고 그 원 성취기준의 학습요소가 남았는지, 통합이 아니면 merged_with가 빈 배열인지. 핵심질문 후보가 사실 확인형인지. 학습 목표에 세 축이 다 있고 서술어가 통일됐는지. 재구성 문장 두 가지(성취기준마다의 reconstructed_text와 통합 문장 reconstruction)가 모두 성취기준 원문의 낱말과 문장 틀 낱말만 쓰는지 — 대주제 상황(위 대주제 제목의 낱말, 축제·일회용품 등)이 재구성 문장에 섞였으면 fidelity. 대주제 상황은 학습 목표(learning_goals)·핵심질문 후보에 있어야 정상이므로 그것은 반려하지 않는다. 핵심질문 후보가 6단계(기능어 → 재구성 문장 → 핵심 이해 → 질문형 → 수업 전체 점검 → 문항과 구분)로 뽑혔는지(L-04): 두 축("무엇인가?" + "어떻게 알 수 있는가?"; 기능어가 주장이면 입장 + 근거, 감상이면 인상 + 근거)이 한 질문에 다 있는지, 자료를 바꿔도 반복해 쓸 수 있고 차시 활동과 단원 평가 문항으로 이어지는지(한 자료·한 문제에서만 쓰고 버릴 질문이면 other), 문항 문장처럼 자료 지시("다음 자료를 읽고"·"자료 B의")나 응답 방식("쓰시오"·분량·조건)을 담았으면 other.',
  3: `모든 성취기준이 어느 차시엔가 배정됐는지(coverage). 교수 차시마다 퀴즈 3문항(마지막 교수 차시 포함)이 차시 핵심질문을 점검하고 정답이 맞으며, 정답이 낱말·수치·짧은 구라 표기가 조금 달라도 맞힐 수 있는지(quiz). 퀴즈가 모두 단답형(type "short", choices null)인지 — 선택지가 있거나 "다음 중"처럼 보기를 고르는 객관식 문항이 있으면 other(서논술 과정이라 객관식은 없다). ${SET_KINDS}이 마지막 교수 차시 뒤 단원 평가 차시(kind "assessment", ${SESSION_STEPS})에 함께 있고 교수 차시에는 서·논술형이 없는지(coverage). 발문이 원장이 읽고 그대로 진행할 만큼 구체적이고 if_stuck이 정답을 그대로 말하지 않는지. 교수 차시 활동지 기본·표준·도전이 실제로 난이도 차이가 나는지(level). caution_notes에 오개념이 있는지. 시간 배분이 활동량과 맞는지. 교수 차시의 수업·퀴즈가 단원 평가 문항의 답을 미리 말하지 않는지(C-03). 차시 materials_used가 이 과목 수업과 무관한 대주제 공유 자료를 가리키는지(other) — 이 과목 활동지·발문·퀴즈 어디에도 쓰이지 않는 공유 자료를 단지 대주제가 공유한다는 이유로 적어 넣었으면 짚는다.`,
  4: '수치 자료의 합계·비율이 맞는지. 자료가 답을 대신하지 않는지(문항이 요구할 정리·계산 결과나 결론 문장이 있으면 other). 찬반·비교 자료의 균형. 학교급(학년군) 어휘 수준. 표가 한 화면(25행·6열)인지. source가 자작인지. 세트 자료가 문항·차시가 실제로 쓰는 2~4개뿐인지 — 3단계 차시의 materials_used가 가리키지 않는 자료를 늘어놓았거나 공유 자료와 합쳐 5개를 넘으면 other(세트 자료는 문항·차시가 실제로 쓰는 2~4개만 만든다; 공유 자료는 이 과목 문항이 인용할 것만 materials_used에 넣고 나머지는 쓰지 않는다). 자료 안의 지시·사실이 서로 모순되거나 지시 대상이 모호한 문장(예: 가져온 컵을 반납하라)이 있으면 other. 자료 유형이 그 자료가 이끌 사고(재구성 문장·핵심질문·차시의 기능어)에 맞는지(C-33: 추론형은 짧은 대화문·메시지·안내문·광고문·이메일·짧은 글, 주장형은 서로 다른 입장의 짧은 자료 2개·통계 사례·찬반 상황, 비교형은 두 대상 소개문·표·그래프·설명글 2개, 파악형은 연표·사료·기사·요약문·개념도·설명문, 이해·적용형은 실험 결과·생활 사례·그림·도식·조건 제시문) — 예를 들어 비교를 시키는데 비교할 두 대상이나 기준이 자료에 없으면 other. 답이 그대로 드러날 만큼 노골적이거나 근거로 삼을 단서(표현·어조·반복·상황 맥락·수치)가 없어 모호하면 other. 학생에게 낯선 주제면 other.',
  5: `문항마다 예시답안을 채점표로 실제로 채점해 적힌 요소별 점수·총점이 나오는지, 논술형 상/중/하 예시답안 총점에 assumed_short_points(그 예시가 전제한 서술형 문항 점수 ${ASSUMED_SHORT_RANGE})를 더한 세트 총점이 등급표에서 각 밴드에 떨어지는지(rubric; 불일치면 어느 요소가 몇 점 차이인지 detail에 적는다). 서술형 예시답안의 assumed_short_points가 null인지. 문항 lesson_no가 3단계 unit_plan.assessment_plan.summative_placement의 차시(단원 평가 차시)와 같은지(coverage). 문항 ${SET_ITEM_COUNT}개 = ${POINTS_SUM}, 등급표 일치. 두 문항 모두 총체적 상/중/하가 있고 요소별 점수와 어긋나지 않는지(rubric, C-15). 서술형 예시답안이 1~${SHORT_POINTS}점 단계마다 있는지. 문두가 전제문+발문+[배점]이고 사고 순서 = 조건 순서인지. 자료에서 골라 쓰게 하는 발문이 무엇을 고르는지 막연하면("한 가지씩 골라"만 있고 어느 자료에서 어떤 항목(사실·품목·수치)인지 없으면) other. 논술형 situation의 role·audience가 대주제·자료에 나오지 않는 인물이면 other(대주제·자료에 등장하는 사람만). 문항은 자료와 한 덩어리다: materials_used가 문두가 자료를 쓰는 순서와 같은지, stem·conditions가 자료를 문항 안 번호 <자료 1>·<자료 2>로만 가리키는지(세트 자료 ID "자료 A"·"자료 F"로 가리키면 other), 전제문이 <자료 n>마다 무엇인지 한 마디씩 소개하는지(없으면 other). 서술형에 조건(items)이 있으면 other, 논술형 조건이 2~4개가 아니면 other. 조건이 풀이 과정·공식·수치·순서를 담고 있으면 other(조건은 지침만). 지침은 입장·근거 개수·인용할 자료·형식·분량·초과 응답 규칙이다(C-32). 반면 예시(피해야 할 조건 문구 — 풀이 힌트): "미지수를 정하고 일차방정식을 세울 것"처럼 풀이 방법 자체를 지시하는 문구, "π를 3으로 계산할 것"처럼 계산에 쓸 값을 지정하는 문구, 학생이 채워야 할 값을 미리 짝지어 나열한 표나 목록 — 이런 조건이 있으면 other. length가 셀 수 있는 분량이고 format이 표/문장/문단·종결어미를 밝히는지("제한 없음" 같은 빈 분량이 있으면 other). 척도 descriptor가 관찰 가능한 표현인지, 인접 단계가 부사만 다른지(level). 논술형에 가치·태도 축 요소가 있으면 정당화 가능성 기준인지. 예시 은행 문장을 그대로 베끼지 않았는지(source). 형식·밀도를 위 "예시 문항 전체" 2건(서술형 1·논술형 1)과 견준다: 형식 틀(평가 요소 → 전제문·<자료 n>·발문·[N점] → 조건 → 채점 기준표(요소 × 척도, 총체적) → 예시답안 → 채점 시 유의점) 중 빠진 칸이 있으면 other, 척도 서술이 예시보다 얇으면(단계마다 학생이 무엇을 했고 무엇이 빠졌는지 없이 "정확히/대체로" 같은 정도 표현뿐이면) other, 예시답안이 예시보다 눈에 띄게 짧아 그 점수의 근거를 보여 주지 못하면 other. 예시의 요소 수·배점·조건 개수·조건 내용은 견주지 않는다(이 세트 규칙이 우선). 성취기준 이탈 여부. 8문항 자가 점검(성취기준 부합·3범주 반영·상황맥락·고차 사고·채점기준 부합·변별·명료성·채점자 불변성).`,
  6: '비전공자가 따라 할 수 있는 구체성. merge_guide가 3단계 병합 표시와 같은지, per_lesson 수가 차시 수와 같은지. common_errors가 채점표 요소와 연결되는지.',
  7: '문장이 활동명으로 시작하는지, 근거 없는 인성 평가가 없는지, 학부모가 읽어도 어색하지 않은지, 부정 서술어·비교·단독 평어가 없는지(notice). per_lesson 수가 차시 수와 같고 단원 평가 차시에만 criteria_phrases가 있는지(두 문항의 요소 전부). criteria_phrases의 요소명이 5단계 채점표와 같은지. home_study_suggestion이 혼자 실행 가능한 구체 행동인지.',
}
/**
 * 검토에 붙이는 이전 단계(확정본). 검토 초점이 실제로 대조하는 단계만 넣는다 — 전부 넣으면 5~7단계 검토 입력이 4만 자를 넘는다.
 * 2→1(추천 이유), 3→2(재구조화·목표), 4→3(자료가 쓰일 차시), 5→3·4(평가 배치·자료), 6→3·5(병합 표시·채점표), 7→3·5(차시·퀴즈 수, 채점표 요소명).
 */
const REVIEW_PRIOR: Record<Stage, number[]> = { 0: [], 1: [], 2: [1], 3: [2], 4: [3], 5: [3, 4], 6: [3, 5], 7: [3, 5] }
/** 대주제 공유 자료(prior.shared_materials)를 같이 보여 줄 검토 단계: 4(공유 수치를 그대로 썼는지)·5(문항이 공유 자료 ID를 참조할 수 있음). */
const REVIEW_SHARED_MATERIALS = new Set<Stage>([4, 5])

/** 생성(GENERATE_PRIOR)·검토(REVIEW_PRIOR)가 같이 쓴다. scope 는 머리말 괄호 안 문구. */
function priorBlockFor(ctx: Ctx, stages: number[], extraKeys: string[] = [], scope = '검토에 필요한 단계만'): string {
  const keys = [...stages.map((n) => `stage${n}`), ...extraKeys].filter((k) => ctx.prior[k] !== undefined)
  if (keys.length === 0) return ''
  return `\n\n지금까지 확정된 내용(${scope}):\n${JSON.stringify(Object.fromEntries(keys.map((k) => [k, ctx.prior[k]])), null, 1)}`
}

const REVIEWER = '당신은 이제 검토자다. 생성 결과가 규칙을 지켰는지 검사하고 pass/issues로만 답한다. 문제가 없으면 pass=true, issues=[]. issues[].kind는 fidelity·grade_level·coverage·quiz·rubric·level·source·notice·other 중 하나. grade_level은 학교급이 실제로 틀린 경우(예: 중학교 세트에 고등학교·초등학교 성취기준이나 내용)에만 쓴다 — 성취기준은 학년군 단위라 같은 학년군 안의 학년 차이는 grade_level이 아니다.'

export function buildReviewPrompt(stage: Stage, ctx: Ctx, output: unknown) {
  // 규칙은 첫 블록(캐시), 검토자 지시는 둘째 블록(캐시 없음) → 같은 과목의 생성·검토가 같은 캐시 항목을 공유한다
  const system: string[] = [rulesFor(ctx.subject), REVIEWER]
  const prior = priorBlockFor(ctx, REVIEW_PRIOR[stage], REVIEW_SHARED_MATERIALS.has(stage) ? ['shared_materials'] : [])
  const user = `${header(ctx)}${knowledgeBlocks(stage, ctx)}${prior}\n\n검토 초점: ${REVIEW_FOCUS[stage]}${stage === 1 ? schoolCodeNote(ctx) : ''}\n\n생성 결과:\n${JSON.stringify(output, null, 1)}`
  return { system, user, fixtureKey: fixtureKeyFor(stage, 'review', ctx) }
}
