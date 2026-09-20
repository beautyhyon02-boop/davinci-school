import { RULES } from './rules'
import type { Stage } from '@/lib/studio/schemas'

export type Ctx = {
  theme: { title: string; level: string; grade: number; subjects: string[] }
  subject: string
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
}

const LEVEL_NAME: Record<string, string> = { '초': '초등학교', '중': '중학교', '고': '고등학교' }

function header(ctx: Ctx) {
  return [
    `대주제: ${ctx.theme.title}`,
    `학교급·학년: ${LEVEL_NAME[ctx.theme.level] ?? ctx.theme.level} ${ctx.theme.grade}학년 (모든 내용은 이 학년 수준)`,
    ...(ctx.theme.subjects.length > 0 ? [`참여 과목: ${ctx.theme.subjects.join(', ')}`] : []),
    ...(ctx.subject ? [`과목: ${ctx.subject}`] : []),
    `성취기준(원문, 절대 변형 금지):`,
    ...ctx.standards.map(s => `${s.code} ${s.text}`),
  ].join('\n')
}

const TASKS: Record<Stage, string> = {
  0: '대주제 소개문(3~4문장)과 참여 과목별로 이 대주제와 연결할 수 있는 수업 아이디어를 한 줄씩 제안하라.',
  1: '주어진 성취기준이 이 대주제와 학년에 적합한지 판단하고, 부적합한 것이 있으면 이유와 함께 표시하라. 해당 학년 교과서에서 다루는 내용만 적합으로 본다.',
  2: '성취기준을 원문 어휘를 보존하며 한 문장으로 재구성하고, 학습 목표 3~4개, 세트 핵심질문 후보 2~3개를 만들어라.',
  3: '재구성·학습 목표·핵심질문을 바탕으로 4~6차시 수업을 설계하라. 각 차시에 담당 성취기준, 차시 핵심질문, 60분 흐름, 필요한 자료(아이디만, A~F), 마무리 퀴즈(논술형을 배치한 차시는 0문항(빈 배열), 그 외 차시는 3문항), 평가 배치(서술형1·서술형2·논술형 중 하나 또는 null), 병합 가능 차시를 적어라.',
  4: '차시와 문항에 필요한 가상 자료를 만들어라. 표는 열·행으로, 설명글은 본문으로. 수치는 합계와 비율이 맞아야 한다. 공유 자료가 주어지면 그 수치를 그대로 쓴다.',
  5: '서술형 2개(각 3점)와 논술형 1개(16점)를 만들어라. 문두는 조건+평가요소+기능+배점. 각 문항의 채점표, 등급 경계표(총 22점, 7등급), 논술형 예시답안 상/중/하(요소별 점수·총점·등급 포함), 피드백 문구 틀을 만들어라.',
  6: '비전공 원장님이 그대로 진행할 수 있는 교사용 지침서를 만들어라: 세트 전체(준비물·일정·목적), 용어 정리, 차시별 진행 메모.',
}

/** prior.shared_materials(대주제 공유 자료)의 A~Z ID를 오름차순으로 뽑는다. */
function sharedMaterialIds(prior: Record<string, unknown>): string[] {
  const shared = prior.shared_materials
  if (!Array.isArray(shared)) return []
  return shared
    .map(m => (m as { id?: unknown }).id)
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
  return `\n\n대주제 공유 자료 ID: ${ids.join(', ')} — 이 자료들은 다시 만들지 말고, 새로 만드는 세트 자료의 ID는 ${next}부터 이어서 붙여라(같은 ID를 다시 쓰면 그 자료는 버려진다).`
}

/**
 * 가짜 응답(fixture) 키. 과목이 있으면 `stage2-generate-과학`처럼 과목을 붙여 과목별 fixture를 쓰게 하고,
 * 그 파일이 없으면 `lib/ai/mock.ts`가 과목을 뗀 기본 키로 떨어진다. 0단계(대주제 소개)는 과목이 없으므로 그대로다.
 */
export function fixtureKeyFor(stage: Stage, role: 'generate' | 'review', ctx: Ctx) {
  return `stage${stage}-${role}${ctx.subject ? `-${ctx.subject}` : ''}`
}

export function buildPrompt(stage: Stage, ctx: Ctx) {
  const prior = Object.keys(ctx.prior).length ? `\n\n지금까지 확정된 내용:\n${JSON.stringify(ctx.prior, null, 1)}` : ''
  const lettering = stage === 4 ? sharedMaterialLettering(ctx) : ''
  return { system: RULES, user: `${header(ctx)}\n\n과제: ${TASKS[stage]}${lettering}${prior}`, fixtureKey: fixtureKeyFor(stage, 'generate', ctx) }
}

const REVIEW_FOCUS: Record<Stage, string> = {
  0: '소개문이 학년 수준인지, 과목별 아이디어가 그 과목 성취기준으로 이어질 수 있는지.',
  1: '추천한 성취기준이 해당 학년 교과서 범위인지(다른 학년 내용이면 grade_level 이슈).',
  2: '재구성에 원문에 없는 동사·대상·개념이 있는지(fidelity). 핵심질문 후보가 사실 확인형인지. 학습 목표가 성취기준을 벗어나는지.',
  3: '모든 성취기준이 어느 차시엔가 배정됐는지(coverage). 퀴즈가 차시 핵심질문을 점검하는지, 정답이 맞는지(quiz). 서술형1·2·논술형이 각 1회 배치됐는지.',
  4: '수치 자료의 합계·비율이 맞는지. 자료가 답을 대신하지 않는지. 학년 어휘 수준.',
  5: '채점표로 예시답안 상/중/하를 실제로 채점했을 때 적힌 점수·등급이 나오는지(rubric). 배점 합계 22, 등급표 일치. 문두가 조건+평가요소+기능+배점인지. 성취기준 이탈 여부.',
  6: '비전공자가 따라 할 수 있는 구체성. 차시 수와 per_lesson 수 일치.',
}

const REVIEWER = '당신은 이제 검토자다. 생성 결과가 규칙을 지켰는지 검사하고 pass/issues로만 답한다. 문제가 없으면 pass=true, issues=[].'

export function buildReviewPrompt(stage: Stage, ctx: Ctx, output: unknown) {
  // RULES는 첫 블록(캐시), 검토자 지시는 둘째 블록(캐시 없음) → 생성·검토가 같은 캐시 항목을 공유한다
  const system: string[] = [RULES, REVIEWER]
  const user = `${header(ctx)}\n\n검토 초점: ${REVIEW_FOCUS[stage]}\n\n생성 결과:\n${JSON.stringify(output, null, 1)}`
  return { system, user, fixtureKey: fixtureKeyFor(stage, 'review', ctx) }
}
