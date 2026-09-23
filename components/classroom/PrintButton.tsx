'use client'
import { Button } from '@/components/ui/Button'

/** 브라우저 인쇄. 메뉴·버튼은 app/globals.css 의 @media print 가 숨긴다. */
export function PrintButton({ label }: { label: string }) {
  return <Button type="button" variant="ghost" onClick={() => window.print()}>{label}</Button>
}
