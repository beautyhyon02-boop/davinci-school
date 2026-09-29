// 메모리 안 가짜 Supabase(테스트 전용). from(table).select/insert/update/delete/upsert + eq/in/is/not/order + maybeSingle/single/then.
// 표마다 줄 배열을 들고 실제로 고치므로, 서버 로직이 남긴 최종 상태와 쓰기 기록(writes)을 함께 확인할 수 있다.
// missing: 없는 표(마이그레이션 전) — 그 표에 대한 모든 호출이 PostgREST 처럼 { data: null, error } 를 돌려준다.
// failOn: 'insert:gradings' 처럼 적으면 그 쓰기가 error 를 돌려준다(줄은 바뀌지 않는다).
type Row = Record<string, unknown>
export type Write = { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; rows?: Row[]; patch?: Row; matched?: number }

export function memoryDb(tables: Record<string, Row[]>, opts: { missing?: string[]; failOn?: string[] } = {}) {
  const writes: Write[] = []
  let seq = 0
  const missing = new Set(opts.missing ?? [])
  const failOn = new Set(opts.failOn ?? [])

  function chain(table: string, op: 'select' | Write['op'], payload?: Row | Row[], conflict?: string) {
    const preds: ((r: Row) => boolean)[] = []
    const self: Record<string, unknown> = {}
    let done: Promise<{ data: unknown; error: unknown }> | null = null
    const exec = (single: boolean) => {
      if (done) return done
      done = Promise.resolve().then(() => {
        if (missing.has(table)) return { data: null, error: { code: '42P01', message: `relation "${table}" does not exist` } }
        if (failOn.has(`${op}:${table}`)) return { data: null, error: { message: 'forced failure' } }
        if (!tables[table]) tables[table] = []
        const all = tables[table]
        const match = (r: Row) => preds.every((p) => p(r))
        let out: Row[] = []
        if (op === 'select') out = all.filter(match)
        else if (op === 'insert') {
          out = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: `${table}-${++seq}`, ...r }))
          all.push(...out); writes.push({ table, op, rows: out })
        } else if (op === 'upsert') {
          const keys = (conflict ?? 'id').split(',').map((k) => k.trim())
          for (const r of Array.isArray(payload) ? payload : [payload!]) {
            const hit = all.find((x) => keys.every((k) => x[k] === r[k]))
            if (hit) { Object.assign(hit, r); out.push(hit) } else { const n = { id: `${table}-${++seq}`, ...r }; all.push(n); out.push(n) }
          }
          writes.push({ table, op, rows: out })
        } else if (op === 'update') {
          out = all.filter(match); for (const r of out) Object.assign(r, payload as Row)
          writes.push({ table, op, patch: payload as Row, matched: out.length })
        } else {
          out = all.filter(match); tables[table] = all.filter((r) => !match(r))
          writes.push({ table, op, matched: out.length })
        }
        return { data: single ? out[0] ?? null : out, error: null }
      })
      return done
    }
    self.select = () => self
    self.eq = (c: string, v: unknown) => { preds.push((r) => r[c] === v); return self }
    self.in = (c: string, v: unknown[]) => { preds.push((r) => v.includes(r[c])); return self }
    self.is = (c: string, v: unknown) => { preds.push((r) => (r[c] ?? null) === v); return self }
    self.not = (c: string, _o: string, v: unknown) => { preds.push((r) => (r[c] ?? null) !== v); return self }
    self.order = () => self
    self.limit = () => self
    self.maybeSingle = () => exec(true)
    self.single = () => exec(true)
    self.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec(false).then(res, rej)
    return self
  }
  return {
    tables, writes,
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      insert: (rows: Row | Row[]) => chain(table, 'insert', rows),
      update: (patch: Row) => chain(table, 'update', patch),
      delete: () => chain(table, 'delete'),
      upsert: (rows: Row | Row[], o?: { onConflict?: string }) => chain(table, 'upsert', rows, o?.onConflict),
    }),
  }
}
