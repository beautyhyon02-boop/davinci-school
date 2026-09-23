import { NOTICE_FORBIDDEN, SUGGEST_ENDINGS } from '@/lib/studio/checks'
import type { NoticeT } from './notice-schema'

/**
 * 짧은 부정("못 셌다", "못 풀어서") — N-05. 7단계 틀 검사(NOTICE_FORBIDDEN)는 긴 부정("못한다/못했다/못함")만 잡는다.
 * '못' 뒤에 띄어쓰기가 있을 때만 잡아 사실 설명 속 긴 부정("분해하지 못하기 때문")은 건드리지 않는다.
 */
const SHORT_NEGATION: [RegExp, string] = [/(^|\s)못\s+[가-힣]+/, '짧은 부정("못 ~") 대신 "~하는 데 어려움이 있다"']

/**
 * 학생별 안내장 문장 검사(순수). 빈 배열이면 통과. 부록 A N-01·02·04·05·06·12 + 확정 점수 ≤ 만점.
 * N-03(미확정 점수)은 뼈대 조립(buildNoticeSkeleton)과 서버 액션이, N-07~11 중 P 규칙은 프롬프트가 맡는다.
 * 원장 작성 칸(참여 관찰·원장 한마디)도 같은 규칙으로 검사한다.
 */
export function lintNotice(n: NoticeT, otherStudentNames: string[]): string[] {
  const issues: string[] = []
  const others = otherStudentNames.filter((name) => name && name !== n.student_name)
  const texts: [string, string | null][] = [
    ['학습 요약', n.lesson_context.topic_summary], ['다음 차시', n.next_lesson.preview], ['가정 학습', n.next_lesson.home_study_suggestion],
    ['원장 한마디', n.director_message], ['참여 관찰', n.participation.director_comment],
    ...n.participation.quiz.items.map((it, i): [string, string | null] => [`퀴즈 ${i + 1}`, it.note]),
    ...(n.essay_result?.criteria_feedback.flatMap((c): [string, string | null][] => [[`${c.criterion_name} 잘한 점`, c.good_point], [`${c.criterion_name} 보완`, c.improve_point]]) ?? []),
    ['재도전', n.essay_result?.retry?.improvement_comment ?? null],
  ]
  for (const [where, text] of texts) {
    if (!text) continue
    for (const [re, why] of [...NOTICE_FORBIDDEN, SHORT_NEGATION]) if (re.test(text)) issues.push(`${where}: "${text.match(re)?.[0].trim()}" — ${why}`)
    for (const name of others) if (text.includes(name)) issues.push(`${where}: 다른 학생 이름(${name}) 언급`)
  }
  if (!SUGGEST_ENDINGS.test(n.next_lesson.home_study_suggestion.trim())) issues.push('가정 학습 제안이 청유형으로 끝나지 않음')
  for (const c of n.essay_result?.criteria_feedback ?? []) {
    if (c.good_point.trim()) continue
    issues.push(c.improve_point ? `${c.criterion_name}: 잘한 점 없이 보완만 있음` : `${c.criterion_name}: 잘한 점이 비어 있음`)
  }
  const e = n.essay_result
  if (e && (e.confirmed_score > e.total_points || (e.retry && e.retry.after_score > e.total_points))) issues.push('확정 점수가 만점을 넘음')
  return issues
}
