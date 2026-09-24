// 세트 구조의 숫자(배점·시간·문항 수)는 lib/studio/assessment-structure.ts 한 곳에서 온다(fix wave 2).
// 1) 검토 초점·과제·규칙 문장이 상수에서 만든 숫자를 담는지(상수를 바꾸면 문장이 따라 바뀐다),
// 2) 그 문장을 만드는 소스에 구조 숫자가 글자로 박혀 있지 않은지(주석 제외)를 본다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { COMMON_RULES, LESSON_RULES, SUBJECT_RULES } from '@/lib/studio/prompts/rules/index'
import { SET_ITEMS, SET_TOTAL, SHORT_POINTS, ESSAY_POINTS, SHORT_TOTAL, SET_ITEM_COUNT, ASSESSMENT_SESSION } from '@/lib/studio/assessment-structure'
import { app } from '@/content/site'

const ctx = { theme: { title: 't', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards: [{ code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }], prior: {} }
const [shortStep, essayStep] = ASSESSMENT_SESSION.steps
const focus = (stage: 3 | 5 | 7) => buildReviewPrompt(stage, ctx, {}).user.split('검토 초점: ')[1]
const rule = (id: string) => [...COMMON_RULES, ...LESSON_RULES, ...Object.values(SUBJECT_RULES).flat()].find((r) => r.id === id)!.text

describe('structure numbers follow assessment-structure.ts', () => {
  it('REVIEW_FOCUS[5] carries the points sum, the assumed 서술형 range and the exemplar steps from the constants', () => {
    expect(SET_ITEMS.서술형.points).toBe(SHORT_POINTS)
    const f = focus(5)
    expect(f).toContain(`서술형 ${SHORT_POINTS} + 논술형 ${ESSAY_POINTS} = ${SET_TOTAL}`)
    expect(f).toContain(`${SET_TOTAL}`)
    expect(f).toContain(`0~${SHORT_TOTAL}`)
    expect(f).toContain(`1~${SHORT_POINTS}점 단계마다`)
    expect(f).toContain(`문항 ${SET_ITEM_COUNT}개`)
  })
  it('REVIEW_FOCUS[3], stage-6 task and the two copy strings take the session minutes and item count from the constants', () => {
    expect(focus(3)).toContain(`${shortStep.step_label} ${shortStep.minutes}분 + ${essayStep.step_label} ${essayStep.minutes}분`)
    expect(buildPrompt(6, ctx).user).toContain(`item_no는 5단계 문항 번호 1~${SET_ITEM_COUNT}`)
    expect(app.classroom.student.assessmentIntro(shortStep.minutes, essayStep.minutes)).toContain(`(${shortStep.minutes}분)`)
    expect(app.packageView.lessons.assessmentSessionNote(shortStep.minutes, essayStep.minutes)).toContain(`(${essayStep.minutes}분)`)
    expect(app.classroom.student.assessmentIntro(1, 2)).toContain('(2분)')
  })
  it('rule texts C-14, C-31, L-09, S-수-02 are rendered from the constants', () => {
    expect(rule('C-14')).toContain(`${SHORT_POINTS}점이면 ${Array.from({ length: SHORT_POINTS }, (_, i) => SHORT_POINTS - i).join('·')}`)
    expect(rule('C-31')).toContain(`(${SHORT_POINTS}점,`); expect(rule('C-31')).toContain(`(${ESSAY_POINTS}점,`); expect(rule('C-31')).toContain(`= ${SET_TOTAL}점`); expect(rule('C-31')).toContain(`0~${SHORT_TOTAL}`)
    expect(rule('L-09')).toContain(`${shortStep.step_label} ${shortStep.minutes} · ${essayStep.step_label} ${essayStep.minutes}`)
    expect(rule('S-수-02')).toContain(`서술형(${SHORT_POINTS}점)`)
  })
  it('the sources that build these strings contain no structure numbers as literals (comments excluded)', () => {
    const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
    const files = ['lib/studio/prompts/stages.ts', 'lib/studio/prompts/rules/common.ts', 'lib/studio/prompts/rules/lesson.ts', 'lib/studio/prompts/rules/subjects/수학.ts']
    const LITERALS = [/서술형 ?\(?\d+점/, /논술형 ?\(?1\d점/, /= ?22\b/, /\b1[05]분|\b35분/, /\b0~6\b/, /\b1~6점/, /문항 번호 1~2/, /6·5·4·3·2·1/]
    for (const f of files) for (const re of LITERALS) expect(code(f), `${f}: ${re}`).not.toMatch(re)
    const site = code('content/site.ts')
    expect(site).not.toMatch(/서술형(?: 문항)?\(\d+분\)/)
  })
})
