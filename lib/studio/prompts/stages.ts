import { rulesFor } from './rules/index'
import { levelsBlock } from '@/lib/reference/levels'
import { exemplarsBlock } from '@/lib/reference/exemplars'
import { NOTICE_DISCLAIMER, type Stage } from '@/lib/studio/schemas'

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
    `성취기준(원문, 절대 변형 금지):`,
    ...ctx.standards.map((s) => `${s.code} ${s.text}`),
  ].join('\n')
}

const TASKS: Record<Stage, string> = {
  0: '대주제 소개문(3~4문장)과 참여 과목별로 이 대주제와 연결할 수 있는 수업 아이디어를 한 줄씩 제안하라.',
  1: '주어진 성취기준이 이 대주제와 학년에 적합한지 판단하고, 부적합한 것이 있으면 이유와 함께 표시하라. 해당 학년 교과서에서 다루는 내용만 적합으로 본다.',
  2: '재구조화 표(standards: 성취기준마다 통합/재조정/유지, original_text는 원문 그대로, reconstructed_text는 "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다", reason 태그, learning_elements)와 세트 통합 문장 1개(reconstruction), 학습 목표 3~5개(각각 axis=지식·이해/과정·기능/가치·태도, 세 축 모두 1개 이상), 세트 핵심질문 후보 2~3개를 만들어라. 위에 준 C 문장(도달점)보다 좁아지거나 다른 활동을 가리키지 않게 한다. level_anchor는 빈 배열로 둔다(서버가 채운다).',
  3: 'unit_plan(set_title, set_key_question, lesson_map, assessment_plan: formative·summative_placement 3건·rubric_note 상/중/하)과 4~6차시 lessons를 설계하라. 각 차시: 담당 성취기준 1~2개, topic, 차시 핵심질문, goal, time_budget(도입 10·전개 40·정리 10, 합 60), flow(intro 불릿, main 소단계 2~4개에 minutes 합 = 전개 시간, wrapup 불릿), teacher_script.questions 발문 2~4개(prompt·expected_answer·if_stuck), materials_used(자료 ID A~F만), materials_needed(준비물), caution_notes(오개념 1개 이상), worksheet(tasks 2~5개: 기본·표준·도전 각 1개 이상, tier·level_ref·answer_space·expected; self_check 1~3), formative_check.quiz(논술형을 배치한 차시는 0문항(빈 배열), 그 외 차시는 3문항), assessment(서술형1·서술형2·논술형 중 하나 또는 null; 서술형은 중후반, 논술형은 마지막 차시), mergeable_with·merge_note.',
  4: '차시와 문항에 필요한 가상 자료를 만들어라. 표는 열·행으로, 설명글은 본문으로. 수치는 합계와 비율이 맞아야 한다. 공유 자료가 주어지면 그 수치를 그대로 쓴다. 자료는 원자료만 담는다(role="raw") — 학생이 문항에서 만들어야 할 결과(정리된 도수분포표·계산된 상대도수·평균·결론 문장)를 body나 표에 미리 적지 않는다. 배경 설명글은 role="context". 이번 세트는 전부 자작이므로 source.kind는 "자작", attribution은 null, ai_assisted는 false. 표는 5~25행·열 6개 이하.',
  5: '문항 카드 3장을 만들어라: 서술형 2개(각 3점, 문두 끝 "[3점]") + 논술형 1개(16점, "[16점]"). 각 카드: evaluation_elements("~하기" 1~3개), situation(논술형은 role·audience·purpose·product 필수, 서술형은 null), materials_used(자료 ID, 원자료 1개 이상), stem(자료 한 줄 전제문 + 발문 + [N점]), conditions(items 1~5개: no·text(부분배점 소괄호 병기)·verb(행동 동사 원형)·points·category 내용/형식; length는 셀 수 있는 분량("제한 없음" 금지, 영어는 단어 수); format은 표/문장/문단·종결어미·단위; answer_mode: 표·그래프·수식 작성은 "paper"(세트당 최대 1개), 글은 "screen"; overflow_rule), rubric(criteria: 서술형은 1~3요소로 max 합 3, 논술형은 정확히 4요소 × max 4, 요소마다 axis와 condition_nos(모든 조건이 어느 요소엔가 대응), scale은 0..max 정수마다 descriptor(관찰 가능한 표현, 0점은 무응답/시도 구분, 인접 단계가 부사만 다르면 안 됨)·example; holistic은 논술형만 상/중/하; notes 1~4줄), exemplar_answers(서술형: 만점과 부분점수 예시 최소 1개씩, 논술형: 상/중/하 각 1개; points·scores·text·rationale), level_map(A~E 예상 점수 구간 + trait), min_competency는 null(서버가 E 문장을 채움), references(참고한 예시 id·출처). 그리고 grade_boundaries 7행(총 22점, level_ref 병기)과 feedback_templates 상/중/하(1~2문장, 존댓말). 학생은 stem과 conditions만 보고 답안을 쓴다.',
  6: '비전공 원장님이 그대로 진행할 수 있는 교사용 지침서를 만들어라: general(세트 준비물·일정(2시간 등원 = 2차시)·목적), glossary 3개 이상, merge_guide(3단계에서 mergeable_with로 표시된 쌍마다 lessons·skip_activities·time_budget_120 합 120), grading_guide(common_errors 문항별 흔한 오답 3개 이상과 검수 시 볼 곳, review_tips 2~5개, retry_guidance), per_lesson(차시마다 지도안에 없는 메모만 0~3개).',
  7: `차시별 피드백 안내장 틀(NoticePlan)을 만들어라. per_lesson: 차시마다 topic_summary(60자, "~활동에서 ~을 배웠습니다"), preview(50자, 다음 차시 예고; 마지막 차시는 세트 마무리), home_study_suggestion(60자, 혼자 실행 가능한 구체 행동 1개, "~해 봅시다" 청유형), quiz_notes(퀴즈 문항마다 틀렸을 때 줄 40자 코멘트: 부분 긍정 + 역접 + 완곡, 부정 서술어 금지; 퀴즈 없는 차시는 빈 배열), criteria_phrases(서·논술형이 있는 차시만: 5단계 채점표 요소명 그대로, good 2개 이상(정도부사+완성동사), improve 2개 이상(부분 긍정 + 역접 + 다음 행동); 그 외 차시는 null). footer_disclaimer는 정확히 "${NOTICE_DISCLAIMER}". 다른 학생 비교·등수·"못한다/실패" 금지.`,
}

/** 성취수준(A~E) 블록을 넣는 단계: 적합성 판단·재구성·차시(활동지 층)·문항(척도)·안내장(요소 문구). */
const LEVEL_STAGES = new Set<Stage>([1, 2, 3, 5, 7])
/** 예시 은행 카드를 넣는 단계와 문항 종류. */
const EXEMPLAR_STAGES: Partial<Record<Stage, 'any' | '서술형' | '논술형'>> = { 3: 'any', 5: 'any' }

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
    const ex = exemplarsBlock(
      { subject: ctx.subject, school_level: schoolOf(ctx.theme.level), grade: ctx.theme.grade, codes: ctx.standards.map((s) => s.code), unit: ctx.unit ?? null, kind, answerMode: 'screen' },
      stage === 5 ? 5 : 2,
    )
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

export function buildPrompt(stage: Stage, ctx: Ctx) {
  const prior = Object.keys(ctx.prior).length ? `\n\n지금까지 확정된 내용:\n${JSON.stringify(ctx.prior, null, 1)}` : ''
  const lettering = stage === 4 ? sharedMaterialLettering(ctx) : ''
  return {
    system: rulesFor(ctx.subject),
    user: `${header(ctx)}${knowledgeBlocks(stage, ctx)}\n\n과제: ${TASKS[stage]}${lettering}${prior}`,
    fixtureKey: fixtureKeyFor(stage, 'generate', ctx),
  }
}

// REVIEW_FOCUS·buildReviewPrompt는 Task 4에서 v2 검토 초점으로 교체된다. 여기서는 규칙 블록만 과목별로 바꾸고 7단계 자리를 채운다.
const REVIEW_FOCUS: Record<Stage, string> = {
  0: '소개문이 학년 수준인지, 과목별 아이디어가 그 과목 성취기준으로 이어질 수 있는지.',
  1: '추천한 성취기준이 해당 학년 교과서 범위인지(다른 학년 내용이면 grade_level 이슈).',
  2: '재구성에 원문에 없는 동사·대상·개념이 있는지(fidelity). 핵심질문 후보가 사실 확인형인지. 학습 목표가 성취기준을 벗어나는지.',
  3: '모든 성취기준이 어느 차시엔가 배정됐는지(coverage). 퀴즈가 차시 핵심질문을 점검하는지, 정답이 맞는지(quiz). 서술형1·2·논술형이 각 1회 배치됐는지.',
  4: '수치 자료의 합계·비율이 맞는지. 자료가 답을 대신하지 않는지(문항이 요구할 정리·계산 결과가 자료에 미리 적혀 있으면 kind other 로 지적). 학년 어휘 수준.',
  5: '채점표로 예시답안 상/중/하를 실제로 채점했을 때 적힌 점수·등급이 나오는지(rubric). 배점 합계 22, 등급표 일치. 문두가 조건+평가요소+기능+배점인지. conditions가 학생 혼자 답안을 쓸 수 있을 만큼 구체적인지(length가 셀 수 있는 분량인지, "제한 없음" 같은 빈 조건이 없는지 — 있으면 kind other). 성취기준 이탈 여부.',
  6: '비전공자가 따라 할 수 있는 구체성. 차시 수와 per_lesson 수 일치.',
  7: '차시 수와 per_lesson 수 일치. 서·논술형이 있는 차시만 criteria_phrases가 있고 요소명이 채점표와 같은지. 다른 학생 비교·등수·부정 서술어가 없는지.',
}

const REVIEWER = '당신은 이제 검토자다. 생성 결과가 규칙을 지켰는지 검사하고 pass/issues로만 답한다. 문제가 없으면 pass=true, issues=[].'

export function buildReviewPrompt(stage: Stage, ctx: Ctx, output: unknown) {
  // 규칙은 첫 블록(캐시), 검토자 지시는 둘째 블록(캐시 없음) → 같은 과목의 생성·검토가 같은 캐시 항목을 공유한다
  const system: string[] = [rulesFor(ctx.subject), REVIEWER]
  const user = `${header(ctx)}\n\n검토 초점: ${REVIEW_FOCUS[stage]}\n\n생성 결과:\n${JSON.stringify(output, null, 1)}`
  return { system, user, fixtureKey: fixtureKeyFor(stage, 'review', ctx) }
}
