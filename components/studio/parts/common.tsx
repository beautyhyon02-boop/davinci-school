import type { ReactNode } from 'react'
import { app } from '@/content/site'

// 패키지 화면 조각(parts/)이 함께 쓰는 작은 틀. parts/ 는 서버·클라이언트 어디서나 렌더된다 —
// node:fs 를 쓰는 모듈(@/lib/reference/levels 등)을 가져오지 않고, 함수 prop 없이 평범한 데이터만 받는다.

const copy = app.packageView

export function Label({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink-500">{children}</span>
}

/** 채점 자료 접이식. open = 관리자 미리보기·제작소(펼침), 원장 열람은 접힘. */
export function Answers({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details open={open} data-print="omit" className="mt-3 rounded-lg bg-lemon-100/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink-500">{copy.answersToggle}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}

/** 저장된 출력은 옛 판·손으로 고친 판일 수 있다 — 배열이 아니면 빈 배열로 읽는다(빠진 칸은 그리지 않는다). */
export const arr = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])
