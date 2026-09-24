'use client'
import { Button } from '@/components/ui/Button'

/** 브라우저 인쇄. 메뉴·버튼은 app/globals.css 의 @media print 가 숨긴다.
 * sheet='questions' → 인쇄 직전 <html> 에 print-questions 를 붙여 표지·자료·문항·답란만 남기고, 인쇄 창이 닫히면(afterprint) 뗀다. */
export function PrintButton({ label, sheet }: { label: string; sheet?: 'questions' }) {
  function onClick() {
    if (sheet === 'questions') {
      const root = document.documentElement
      root.classList.add('print-questions')
      window.addEventListener('afterprint', () => root.classList.remove('print-questions'), { once: true })
    }
    window.print()
  }
  return <Button type="button" variant="ghost" onClick={onClick}>{label}</Button>
}
