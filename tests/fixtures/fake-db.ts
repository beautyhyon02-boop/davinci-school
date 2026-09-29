// 메모리 안 가짜 Supabase(테스트 전용). from(table).select/insert/update/delete/upsert + eq/in/is/not/order/range + maybeSingle/single/then.
// 표마다 줄 배열을 들고 실제로 고치므로, 서버 로직이 남긴 최종 상태와 쓰기 기록(writes)을 함께 확인할 수 있다.
// missing: 없는 표(마이그레이션 전) — 그 표에 대한 모든 호출이 PostgREST 처럼 { data: null, error } 를 돌려준다.
// failOn: 'insert:gradings' 처럼 적으면 그 쓰기가 error 를 돌려준다(줄은 바뀌지 않는다). 'select:answers' 처럼 읽기도 된다.
// maxRows: 한 번의 select 가 돌려주는 줄 수의 한도(PostgREST 기본 1000 을 흉내 낸다). .order() 로 줄을 세우고 .range(from, to) 로 잘라 읽는다.
// maxIn: .in() 목록이 이보다 길면 error(주소가 너무 길어 요청이 실패하는 것을 흉내 낸다). 기본은 제한 없음.
// reads: select 마다 한 줄 — 표 이름과 .in() 목록 길이(묶어 읽었는지 확인할 때 쓴다).
type Row = Record<string, unknown>
export type Write = { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; rows?: Row[]; patch?: Row; matched?: number }

export type Read = { table: string; inCounts: number[]; range: [number, number] | null }

const compare = (a: unknown, b: unknown) => {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return a < b ? -1 : 1
}

export function memoryDb(tables: Record<string, Row[]>, opts: { missing?: string[]; failOn?: string[]; maxRows?: number; maxIn?: number } = {}) {
  const writes: Write[] = []
  const reads: Read[] = []
  const maxRows = opts.maxRows ?? 1000
  let seq = 0
  const missing = new Set(opts.missing ?? [])
  const failOn = new Set(opts.failOn ?? [])

  function chain(table: string, op: 'select' | Write['op'], payload?: Row | Row[], conflict?: string) {
    const preds: ((r: Row) => boolean)[] = []
    const orders: { col: string; asc: boolean }[] = []
    const inCounts: number[] = []
    let range: [number, number] | null = null
    const self: Record<string, unknown> = {}
    let done: Promise<{ data: unknown; error: unknown }> | null = null
    const exec = (single: boolean) => {
      if (done) return done
      done = Promise.resolve().then(() => {
        if (missing.has(table)) return { data: null, error: { code: '42P01', message: `relation "${table}" does not exist` } }
        if (failOn.has(`${op}:${table}`)) return { data: null, error: { message: 'forced failure' } }
        if (opts.maxIn !== undefined && inCounts.some((n) => n > opts.maxIn!)) return { data: null, error: { message: 'URI too long' } }
        if (!tables[table]) tables[table] = []
        const all = tables[table]
        const match = (r: Row) => preds.every((p) => p(r))
        let out: Row[] = []
        if (op === 'select') {
          out = all.filter(match)
          for (const o of [...orders].reverse()) out = [...out].sort((a, b) => (o.asc ? 1 : -1) * compare(a[o.col], b[o.col]))
          if (range) out = out.slice(range[0], range[1] + 1)
          out = out.slice(0, maxRows)
          reads.push({ table, inCounts: [...inCounts], range })
        } else if (op === 'insert') {
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
    self.in = (c: string, v: unknown[]) => { inCounts.push(v.length); preds.push((r) => v.includes(r[c])); return self }
    self.is = (c: string, v: unknown) => { preds.push((r) => (r[c] ?? null) === v); return self }
    self.not = (c: string, _o: string, v: unknown) => { preds.push((r) => (r[c] ?? null) !== v); return self }
    self.order = (c: string, o?: { ascending?: boolean }) => { orders.push({ col: c, asc: o?.ascending !== false }); return self }
    self.range = (from: number, to: number) => { range = [from, to]; return self }
    self.limit = () => self
    self.maybeSingle = () => exec(true)
    self.single = () => exec(true)
    self.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec(false).then(res, rej)
    return self
  }
  return {
    tables, writes, reads,
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      insert: (rows: Row | Row[]) => chain(table, 'insert', rows),
      update: (patch: Row) => chain(table, 'update', patch),
      delete: () => chain(table, 'delete'),
      upsert: (rows: Row | Row[], o?: { onConflict?: string }) => chain(table, 'upsert', rows, o?.onConflict),
    }),
  }
}
