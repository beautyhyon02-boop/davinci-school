import type { Snapshot } from '@/lib/studio/publish'
import { gradeLabel } from '@/lib/studio/level-map'
import { NOTICE_PROMPT_RULES } from '@/lib/studio/prompts/rules/notice'
import { sortScale } from '@/lib/studio/scale'
import type { NoticeT } from './notice-schema'
import type { NoticeEvidence } from './notice'

/**
 * 학생별 안내장 초안 프롬프트(AI 1회, role 'grade'). 첫 system 블록 = N-01~12 규칙(캐시).
 * 뼈대와 근거에는 확정 채점만 들어 있다(N-03) — 미확정 AI 채점 초안은 이 함수에 오지 않는다.
 */
export function buildNoticePrompt({ snapshot, lessonNo, skeleton, evidence = [] }: { snapshot: Snapshot; lessonNo: number; skeleton: NoticeT; evidence?: NoticeEvidence[] }) {
  const plan = snapshot.notice_plan?.per_lesson.find((p) => p.lesson_no === lessonNo)
  const items = snapshot.assessment?.items.filter((it) => it.lesson_no === lessonNo) ?? []   // 단원 평가 차시 = 서술형 + 논술형
  const user = [
    `학생: ${skeleton.student_name} · ${snapshot.cover.grade != null ? `${snapshot.cover.level} ${snapshot.cover.grade}학년` : gradeLabel(snapshot.cover.level, null)} · ${snapshot.cover.subject} ${lessonNo}차시`,
    `과제: 아래 안내장 뼈대의 빈 칸만 채워라 — 틀린 퀴즈의 note(40자, 부분 긍정+역접+완곡), 요소별 good_point(60자, 활동명+구체 행위+정도부사)와 improve_point(60자, 부분 긍정+역접+혼자 할 수 있는 다음 행동; 만점 요소는 null), 재도전이 있으면 그 문항 종류마다 improvement_comments[{kind, comment}](70자, 이전 점수를 출발점으로). 학부모와 학생이 함께 읽는다. 요소명은 채점표 그대로. 점수·정오·이름은 바꾸지 않는다. 다른 학생·등수·비교는 쓰지 않는다.`,
    plan?.criteria_phrases ? `문구 은행(여기서 골라 학생의 근거에 맞게 다듬는다):\n${JSON.stringify(plan.criteria_phrases, null, 1)}` : '',
    ...items.map((item) => `채점표 요소와 척도(${item.kind}, ${item.points}점):\n${item.rubric.criteria.map((c) => `- ${c.name}: ${sortScale(c.scale).map((s) => `${s.points}=${s.descriptor}`).join(' / ')}`).join('\n')}`),
    evidence.length ? `확정 채점의 요소별 근거(원장 확정본):\n${evidence.map((e) => `- ${e.kind} ${e.attempt}회차 ${e.criterion_name} ${e.points}/${e.max}: ${e.evidence}`).join('\n')}` : '',
    `뼈대(확정 채점만 들어 있음):\n${JSON.stringify(skeleton, null, 1)}`,
  ].filter(Boolean).join('\n\n')
  return { system: [NOTICE_PROMPT_RULES], user, fixtureKey: 'notice-draft' as const }
}
