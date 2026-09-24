import { rulesFor } from './rules/index'
import { levelsBlock } from '@/lib/reference/levels'
import { exemplarsBlock, exemplarsBlockMixed } from '@/lib/reference/exemplars'
import { NOTICE_DISCLAIMER, type Stage } from '@/lib/studio/schemas'
import { SET_ITEM_COUNT, SET_TOTAL, SHORT_POINTS, ESSAY_POINTS, SHORT_TOTAL, SHORT_CRITERIA, ESSAY_CRITERIA, CRITERION_MAX, TEACHING_LESSONS, ASSESSMENT_SESSION } from '@/lib/studio/assessment-structure'
import { SHORT_EXEMPLAR_STEPS, POINTS_SUM, ASSUMED_SHORT_RANGE, ITEM_NO_RANGE, SESSION_STEPS, SET_KINDS } from '@/lib/studio/structure-text'

export type Ctx = {
  theme: { title: string; level: string; grade: number; subjects: string[] }
  subject: string
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
  /** 단원명(선택) — 예시 은행에서 같은 단원 예시를 고를 때만 쓴다. */
  unit?: string | null
}

const LEVEL_NAME: Record<string, string> = { '초': '초등학교', '중': '중학교', '고': '고등학교' }

function header(ctx: Ctx) {
  return [
    `대주제: ${ctx.theme.title}`,
    `학교급·학년: ${LEVEL_NAME[ctx.theme.level] ?? ctx.theme.level} ${ctx.theme.grade}학년 (모든 내용은 이 학년 수준)`,
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
  0: '대주제 소개문(3~4문장)과 참여 과목별로 이 대주제와 연결할 수 있는 수업 아이디어를 한 줄씩 제안하라. 아이디어는 한 줄 스케치이며 해당 학년 교과서 범위 안에서만 제안한다; 자료·출처·채점은 여기서 다루지 않는다. 소개문은 결론이나 정답을 미리 말하지 않는다.',
  1: '주어진 성취기준이 이 대주제와 학년에 적합한지 판단하고, 부적합한 것이 있으면 이유와 함께 표시하라. 해당 학년 교과서에서 다루는 내용만 적합으로 본다.',
  2: '재구조화 표(standards: 성취기준마다 통합/재조정/유지, original_text는 원문 그대로, reconstructed_text는 "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다", reason 태그, merged_with(재구조화 유형이 통합이면 함께 묶은 다른 성취기준 코드 배열, 그 외는 빈 배열), learning_elements; reconstructed_text는 original_text와 merged_with 성취기준 원문에 있는 어휘만 쓴다)와 세트 통합 문장 1개(reconstruction), 학습 목표 3~5개(각각 axis=지식·이해/과정·기능/가치·태도, 세 축 모두 1개 이상), 세트 핵심질문 후보 2~3개를 만들어라. 위에 준 C 문장(도달점)보다 좁아지거나 다른 활동을 가리키지 않게 한다. level_anchor는 빈 배열로 둔다(서버가 채운다).',
  3: `unit_plan(set_title, set_key_question, lesson_map(모든 차시, 단원 평가 차시 포함), assessment_plan: formative·summative_placement ${SET_ITEM_COUNT}건(서술형 → 논술형, 두 건 모두 단원 평가 차시 번호)·rubric_note 상/중/하)과 lessons를 설계하라: 교수 차시 ${TEACHING_LESSONS.min}~${TEACHING_LESSONS.max}개(보통 ${TEACHING_LESSONS.max}개) + 마지막 교수 차시 뒤 단원 평가 차시 1개. 교수 차시(kind "teaching"): 담당 성취기준 1~2개, topic, 차시 핵심질문, goal, time_budget(도입 10·전개 40·정리 10, 합 60), flow(intro 불릿, main 소단계 2~4개에 minutes 합 = 전개 시간, wrapup 불릿), teacher_script.questions 발문 2~4개(prompt·expected_answer·if_stuck), materials_used(자료 ID A~F만), materials_needed(준비물), caution_notes(오개념 1개 이상), worksheet(tasks 2~5개: 기본·표준·도전 각 1개 이상, tier·level_ref·answer_space·expected; self_check 1~3), formative_check.quiz(마지막 교수 차시 포함 모든 교수 차시에 정확히 3문항), assessment는 빈 배열, mergeable_with·merge_note. ${SESSION_TEXT}.`,
  4: '차시와 문항에 필요한 가상 자료를 만들어라. 표는 열·행으로, 설명글은 본문으로. 수치는 합계와 비율이 맞아야 한다. 공유 자료가 주어지면 그 수치를 그대로 쓴다. 자료는 원자료만 담는다(role="raw") — 학생이 문항에서 만들어야 할 결과(정리된 도수분포표·계산된 상대도수·평균·결론 문장)를 body나 표에 미리 적지 않는다. 배경 설명글은 role="context". 이번 세트는 전부 자작이므로 source.kind는 "자작", attribution은 null, ai_assisted는 false. 표는 5~25행·열 6개 이하.',
  5: `문항 카드 ${SET_ITEM_COUNT}장을 만들어라: 서술형 1개(${SHORT_POINTS}점, 문두 끝 "[${SHORT_POINTS}점]") → 논술형 1개(${ESSAY_POINTS}점, "[${ESSAY_POINTS}점]") 순서. 위 참고 예시의 문장·수치는 옮기지 않는다. 각 카드: lesson_no(두 문항 모두 3단계 unit_plan.assessment_plan.summative_placement의 단원 평가 차시 번호를 그대로 옮긴다), evaluation_elements("~하기" 1~3개), situation(논술형은 role·audience·purpose·product 필수, 서술형은 null), materials_used(자료 ID, 원자료 1개 이상), stem(자료 한 줄 전제문 + 발문 + [N점]), conditions(조건은 지침만 — 풀이 힌트 금지(C-32): 서술형은 conditions.items를 빈 배열로 두고 length·format·answer_mode만 채운다, 논술형은 items 2~4개로 답안이 지켜야 할 제약만 쓴다(입장 정하기·근거 개수·인용할 자료·형식·분량·초과 응답 규칙) — 계산식·공식, 계산에 딸린 반올림 지시, "먼저 ~하고 다음에 ~한다" 같은 풀이 순서, 답이 되는 자료 수치, 결론은 조건에 쓰지 않는다(수업을 이해하지 못한 학생이 조건만 따라 답을 만들 수 있으면 안 된다); items마다 no·text(필요한 조건만 끝에 부분배점 소괄호 병기)·verb(동사 원형)·points·category 내용/형식; length는 셀 수 있는 분량("제한 없음" 금지, 영어는 단어 수); format은 표/문장/문단·종결어미·단위; answer_mode: 표·그래프·수식 작성은 "paper"(세트당 최대 1개), 글은 "screen"; overflow_rule), rubric(criteria: 서술형은 ${SHORT_CRITERIA.min}~${SHORT_CRITERIA.max}요소로 max 합 ${SHORT_POINTS}(요소마다 max ${CRITERION_MAX} 이하), 논술형은 정확히 ${ESSAY_CRITERIA.count}요소 × max ${ESSAY_CRITERIA.max}, 요소마다 axis와 condition_nos(모든 조건이 어느 요소엔가 대응; 서술형 요소와 조건을 가리키지 않는 요소는 빈 배열), scale은 0..max 정수마다 descriptor(관찰 가능한 표현, 0점은 무응답/시도 구분, 인접 단계가 부사만 다르면 안 됨)·example; holistic은 두 문항 모두 상/중/하(답안 전체의 모습, 요소별 점수와 어긋나지 않게 — 하는 0점 답안까지 포함, C-15); notes 1~4줄), exemplar_answers(서술형: 0점을 뺀 총점 단계마다 1개(1~${SHORT_POINTS}점 각 1개: ${SHORT_EXEMPLAR_STEPS}), 논술형: 상/중/하 각 1개; points·scores·text·rationale; 논술형 예시답안마다 assumed_short_points(이 예시가 전제하는 서술형 문항 점수 0~${SHORT_TOTAL}; 상/중/하 밴드가 등급표와 맞도록 고른다), 서술형 예시답안은 assumed_short_points=null), level_map(A~E 예상 점수 구간 + trait), min_competency는 null(서버가 E 문장을 채움), references(참고한 예시 id·출처). 그리고 grade_boundaries 7행(총 ${SET_TOTAL}점 = 서술형 ${SHORT_POINTS} + 논술형 ${ESSAY_POINTS}, level_ref 병기)과 feedback_templates 상/중/하(1~2문장, 존댓말). 학생에게는 자료·stem·conditions만 보인다(채점표·예시답안은 보이지 않는다).`,
  6: `비전공 원장님이 그대로 진행할 수 있는 교사용 지침서를 만들어라: general(세트 준비물·일정(2시간 등원 = 2차시)·목적), glossary 3개 이상, merge_guide(3단계에서 mergeable_with로 표시된 쌍마다 lessons·skip_activities·time_budget_120 합 120), grading_guide(common_errors 문항별 흔한 오답 3개 이상과 검수 시 볼 곳(item_no는 5단계 문항 번호 ${ITEM_NO_RANGE}), review_tips 2~5개, retry_guidance), per_lesson(차시마다 지도안에 없는 메모만 0~3개).`,
  7: `차시별 피드백 안내장 틀(NoticePlan)을 만들어라. per_lesson: 차시마다 topic_summary(60자, "~활동에서 ~을 배웠습니다"), preview(50자, 다음 차시 예고; 마지막 차시는 세트 마무리), home_study_suggestion(60자, 혼자 실행 가능한 구체 행동 1개, "~해 봅시다" 청유형), quiz_notes(퀴즈 문항마다 틀렸을 때 줄 40자 코멘트: 부분 긍정 + 역접 + 완곡, 부정 서술어 금지; 퀴즈 없는 차시는 빈 배열), criteria_phrases(단원 평가 차시만: 두 문항의 채점표 요소 전부 — 5단계 채점표 요소명 그대로, good 2개 이상(정도부사+완성동사), improve 2개 이상(부분 긍정 + 역접 + 다음 행동); 교수 차시는 null). footer_disclaimer는 정확히 "${NOTICE_DISCLAIMER}". 다른 학생 비교·등수·"못한다/실패" 금지.`,
}

/** 성취수준(A~E) 블록을 넣는 단계: 적합성 판단·재구성·차시(활동지 층)·문항(척도)·안내장(요소 문구). */
const LEVEL_STAGES = new Set<Stage>([1, 2, 3, 5, 7])
/** 예시 은행 카드를 넣는 단계와 문항 종류(3단계 활동 아이디어 2장). 5단계는 서술형 2 + 논술형 3장(EXEMPLARS_5). */
const EXEMPLAR_STAGES: Partial<Record<Stage, 'any' | '서술형' | '논술형'>> = { 3: 'any', 5: 'any' }
/** 5단계 참고 카드: 종류별로 뽑는다(서술형 2 + 논술형 3). 프롬프트에 기관명은 쓰지 않는다(2026-09-26). */
const EXEMPLARS_5 = { 서술형: 2, 논술형: 3 } as const

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
    const ex = stage === 5 ? exemplarsBlockMixed(q, EXEMPLARS_5) : exemplarsBlock(q, 2)
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
    user: `${header(ctx)}${knowledgeBlocks(stage, ctx)}\n\n과제: ${TASKS[stage]}${lettering}${prior}`,
    fixtureKey: fixtureKeyFor(stage, 'generate', ctx),
  }
}

/**
 * 검토 AI 초점(스펙 §2 각 단계의 [AI] 항목). [TS] 순수 검사(lib/studio/checks.ts)가 먼저 돌고, 통과했을 때만 이 검토가 불린다 —
 * 그래서 여기에는 기계로 판정하기 어려운 것(의미·수준·구체성)과 기계 검사의 판단 근거를 사람 말로 다시 적은 것만 둔다.
 */
const REVIEW_FOCUS: Record<Stage, string> = {
  // 0단계는 성취기준을 고르기 전의 한 줄 스케치다 — 뒤 단계(1: 성취기준, 4: 자료·출처, 5: 채점)의 요구로 반려하지 않게 범위를 못 박는다(2026-09-24)
  0: '이 단계는 성취기준을 고르기 전의 대주제 소개와 과목별 한 줄 아이디어 스케치다. 다음 세 가지만 본다. (a) 소개문이 해당 학년 수준의 어휘이고 길이가 3~4문장인지(grade_level). (b) 과목별 아이디어가 그 과목의 해당 학년 교과 내용 범위 안에 있는지(grade_level) — 다른 학년 내용이면 그 과목 아이디어를 해당 학년 수준(예: 중1)으로 좁힌 예를 detail에 함께 적는다. (c) 소개문·아이디어가 결론이나 정답을 미리 말하지 않는지(other). 성취기준 원문, 출처 표기 계획, 자료 계획, 채점 계획은 요구하지 않는다 — 모두 뒤 단계에서 다루므로 이것이 없다는 이유로 반려하지 않는다. 위 세 가지에 문제가 없으면 pass=true, issues=[].',
  1: '추천한 성취기준이 해당 학년 교과서 범위인지(다른 학년 내용이면 grade_level 이슈).',
  2: '재구조화 문장마다 원문에 없는 동사·대상·개념이 있는지(fidelity). 재구조화 문장이 위의 C 문장(도달점)보다 좁거나 다른 활동인지(level). 통합이면 merged_with에 함께 묶은 성취기준 코드가 빠짐없이 있고 그 원 성취기준의 학습요소가 남았는지, 통합이 아니면 merged_with가 빈 배열인지. 핵심질문 후보가 사실 확인형인지. 학습 목표에 세 축이 다 있고 서술어가 통일됐는지. 재구성에 축제·일회용품 같은 맥락이 섞였는지.',
  3: `모든 성취기준이 어느 차시엔가 배정됐는지(coverage). 교수 차시마다 퀴즈 3문항(마지막 교수 차시 포함)이 차시 핵심질문을 점검하고 정답이 맞는지(quiz). ${SET_KINDS}이 마지막 교수 차시 뒤 단원 평가 차시(kind "assessment", ${SESSION_STEPS})에 함께 있고 교수 차시에는 서·논술형이 없는지(coverage). 발문이 원장이 읽고 그대로 진행할 만큼 구체적이고 if_stuck이 정답을 그대로 말하지 않는지. 교수 차시 활동지 기본·표준·도전이 실제로 난이도 차이가 나는지(level). caution_notes에 오개념이 있는지. 시간 배분이 활동량과 맞는지. 교수 차시의 수업·퀴즈가 단원 평가 문항의 답을 미리 말하지 않는지(C-03).`,
  4: '수치 자료의 합계·비율이 맞는지. 자료가 답을 대신하지 않는지(문항이 요구할 정리·계산 결과나 결론 문장이 있으면 other). 찬반·비교 자료의 균형. 학년 어휘 수준. 표가 한 화면(25행·6열)인지. source가 자작인지.',
  5: `문항마다 예시답안을 채점표로 실제로 채점해 적힌 요소별 점수·총점이 나오는지, 논술형 상/중/하 예시답안 총점에 assumed_short_points(그 예시가 전제한 서술형 문항 점수 ${ASSUMED_SHORT_RANGE})를 더한 세트 총점이 등급표에서 각 밴드에 떨어지는지(rubric; 불일치면 어느 요소가 몇 점 차이인지 detail에 적는다). 서술형 예시답안의 assumed_short_points가 null인지. 문항 lesson_no가 3단계 unit_plan.assessment_plan.summative_placement의 차시(단원 평가 차시)와 같은지(coverage). 문항 ${SET_ITEM_COUNT}개 = ${POINTS_SUM}, 등급표 일치. 두 문항 모두 총체적 상/중/하가 있고 요소별 점수와 어긋나지 않는지(rubric, C-15). 서술형 예시답안이 1~${SHORT_POINTS}점 단계마다 있는지. 문두가 전제문+발문+[배점]이고 사고 순서 = 조건 순서인지. 서술형에 조건(items)이 있으면 other, 논술형 조건이 2~4개가 아니면 other. 조건이 풀이 과정·공식·수치·순서를 담고 있으면 other(조건은 지침만). 지침은 입장·근거 개수·인용할 자료·형식·분량·초과 응답 규칙이다(C-32). length가 셀 수 있는 분량이고 format이 표/문장/문단·종결어미를 밝히는지("제한 없음" 같은 빈 분량이 있으면 other). 척도 descriptor가 관찰 가능한 표현인지, 인접 단계가 부사만 다른지(level). 논술형에 가치·태도 축 요소가 있으면 정당화 가능성 기준인지. 예시 은행 문장을 그대로 베끼지 않았는지(source). 성취기준 이탈 여부. 8문항 자가 점검(성취기준 부합·3범주 반영·상황맥락·고차 사고·채점기준 부합·변별·명료성·채점자 불변성).`,
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

const REVIEWER = '당신은 이제 검토자다. 생성 결과가 규칙을 지켰는지 검사하고 pass/issues로만 답한다. 문제가 없으면 pass=true, issues=[]. issues[].kind는 fidelity·grade_level·coverage·quiz·rubric·level·source·notice·other 중 하나.'

export function buildReviewPrompt(stage: Stage, ctx: Ctx, output: unknown) {
  // 규칙은 첫 블록(캐시), 검토자 지시는 둘째 블록(캐시 없음) → 같은 과목의 생성·검토가 같은 캐시 항목을 공유한다
  const system: string[] = [rulesFor(ctx.subject), REVIEWER]
  const prior = priorBlockFor(ctx, REVIEW_PRIOR[stage], REVIEW_SHARED_MATERIALS.has(stage) ? ['shared_materials'] : [])
  const user = `${header(ctx)}${knowledgeBlocks(stage, ctx)}${prior}\n\n검토 초점: ${REVIEW_FOCUS[stage]}\n\n생성 결과:\n${JSON.stringify(output, null, 1)}`
  return { system, user, fixtureKey: fixtureKeyFor(stage, 'review', ctx) }
}
