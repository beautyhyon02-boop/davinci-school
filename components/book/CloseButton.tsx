'use client'
import { Button } from '@/components/ui/Button'

/** 인쇄 전용 쪽의 [닫기] — 새 탭으로 열렸으면 탭을 닫고, 닫히지 않으면(주소로 바로 들어온 경우) 세트 화면으로 돌아간다. */
export function CloseButton({ label, href }: { label: string; href: string }) {
  function onClick() {
    window.close()
    window.setTimeout(() => { if (!window.closed) window.location.href = href }, 150)
  }
  return <Button type="button" variant="ghost" onClick={onClick}>{label}</Button>
}
