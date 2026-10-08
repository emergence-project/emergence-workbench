/** 실제 칸 폭에 맞춰 덜 중요한 열부터 숨긴다. 사용자가 켠 열은 폭이 모자라도 남긴다.
 * 한 묶음은 함께 숨긴다(논문: 저널·arXiv), 여러 묶음은 들어갈 때까지 차례로 숨긴다(지식: 프로젝트 → 링크).
 */
export function tableHiddenColumns<Id extends string>(
  layout: { order: readonly Id[]; hidden: readonly Id[]; shown: readonly Id[] },
  available: number,
  width: (id: Id) => number,
  groups: readonly (readonly Id[])[],
): Id[] {
  const hidden = [...layout.hidden]
  let minimum = layout.order.filter((id) => !hidden.includes(id)).reduce((sum, id) => sum + width(id), 0)
  for (const group of groups) {
    if (minimum <= available) break
    for (const id of group) {
      if (!hidden.includes(id) && !layout.shown.includes(id) && layout.order.includes(id)) {
        hidden.push(id)
        minimum -= width(id)
      }
    }
  }
  return hidden
}
