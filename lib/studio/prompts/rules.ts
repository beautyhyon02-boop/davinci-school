// 규칙 v2는 rules/ 아래(부록 A와 1:1). 이 파일은 기존 import(`./rules`) 호환용 재수출이다.
import { rulesFor } from './rules/index'
export { rulesFor, allRuleIds } from './rules/index'

/** @deprecated 과목별 규칙은 rulesFor(subject). 과목 없는 호출(0·1단계)용. */
export const RULES = rulesFor('')
