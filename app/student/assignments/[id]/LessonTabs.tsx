'use client'
import { useState, type ReactNode } from 'react'
import { app } from '@/content/site'

const copy = app.classroom.student

/**
 * 서버 컴포넌트는 함수(render prop)를 클라이언트 컴포넌트로 넘길 수 없다(직렬화 불가) —
 * 대신 차시 번호로 키를 매긴 React 노드 맵(panels)을 미리 만들어 넘긴다. React 노드는 직렬화 가능하다.
 */
/** labels: 기본 "N차시" 대신 쓸 탭 이름(단원 평가 차시 → "6차시 · 단원 평가"). */
export function LessonTabs({ lessons, openLessons, initial, panels, labels = {} }: { lessons: number[]; openLessons: number; initial: number; panels: Record<number, ReactNode>; labels?: Record<number, string> }) {
  const [active, setActive] = useState(initial)
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {lessons.map((n) => {
          const open = n <= openLessons
          return (
            <button key={n} type="button" disabled={!open} onClick={() => setActive(n)} title={open ? undefined : copy.locked}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${active === n ? 'bg-ink-900 text-white' : open ? 'bg-ink-100 text-ink-700' : 'bg-ink-100/50 text-ink-500'}`}>
              {labels[n] ?? copy.lessonTab(n)}{open ? '' : ' 🔒'}
            </button>
          )
        })}
      </div>
      {/* key={active}: 차시를 바꾸면 패널 안의 QuizForm/AnswerEditor 가 새로 마운트되어 이전 차시 상태(응답·결과)를 물려받지 않는다. */}
      <div key={active} className="mt-4">{panels[active]}</div>
    </div>
  )
}
