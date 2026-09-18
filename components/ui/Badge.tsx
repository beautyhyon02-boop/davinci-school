const tones = {
  mint: 'bg-mint-100 text-mint-700',
  lemon: 'bg-lemon-100 text-lemon-600',
  lavender: 'bg-lavender-100 text-lavender-700',
  gray: 'bg-ink-100 text-ink-500',
} as const
export function Badge({ tone = 'mint', children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}
