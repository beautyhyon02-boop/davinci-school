/**
 * 규칙 한 줄. id·tags는 스펙 부록 A(docs/superpowers/specs/2026-09-25-item-studio-v2-design.md)와 1:1이다.
 * nature: P 프롬프트 문장, S 스키마·검토 코드, O 운영 절차(PS = P+S, SO = S+O). O가 섞인 규칙은 생성 프롬프트에 넣지 않는다.
 */
export type Rule = { id: string; text: string; tags: string[]; nature: 'P' | 'S' | 'O' | 'PS' | 'SO' }
export const rule = (id: string, nature: Rule['nature'], text: string, ...tags: string[]): Rule => ({ id, nature, text, tags })
