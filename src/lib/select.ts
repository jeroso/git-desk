/**
 * 리스트에서 anchor와 target 사이의 구간(양끝 포함)을 순서대로 돌려준다.
 * Shift+클릭 범위 선택에 쓴다. anchor가 없거나 리스트에 없으면 target 하나만,
 * target이 리스트에 없으면 빈 배열을 돌려준다(방어적).
 */
export function rangeBetween<T>(items: T[], anchor: T | null, target: T): T[] {
  const ti = items.indexOf(target)
  if (ti === -1) return []
  const ai = anchor === null ? -1 : items.indexOf(anchor)
  if (ai === -1) return [target]
  const [lo, hi] = ai <= ti ? [ai, ti] : [ti, ai]
  return items.slice(lo, hi + 1)
}
