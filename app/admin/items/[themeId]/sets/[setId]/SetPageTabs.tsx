'use client'
import { useState, type ReactNode } from 'react'
import { app } from '@/content/site'

const copy = app.studio.publish.tabs

/** 제작(단계 마법사)과 미리보기(패키지 렌더러 + 게시)를 탭으로 나눈다. 둘 다 서버에서 이미 렌더된 상태로 내려오므로
 * 탭 전환은 표시/숨김만 담당하고 다시 불러오지 않는다. */
export function SetPageTabs({ wizard, preview }: { wizard: ReactNode; preview: ReactNode }) {
  const [tab, setTab] = useState<'wizard' | 'preview'>('wizard')

  return (
    <div>
      <div data-print="omit" className="flex gap-2">
        <button
          onClick={() => setTab('wizard')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'wizard' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
        >
          {copy.wizard}
        </button>
        <button
          onClick={() => setTab('preview')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'preview' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
        >
          {copy.preview}
        </button>
      </div>
      <div className="mt-4" style={{ display: tab === 'wizard' ? 'block' : 'none' }}>{wizard}</div>
      <div className="mt-4" style={{ display: tab === 'preview' ? 'block' : 'none' }}>{preview}</div>
    </div>
  )
}
