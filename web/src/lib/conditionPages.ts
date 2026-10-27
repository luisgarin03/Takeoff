import { compareSheetKeys, parseSheetKey } from "./sheetKey";

export interface ConditionPageShape {
  condition_id?: string | null;
  sheet_id?: string | null;
}

/** Return each condition's distinct used pages in loaded PDF/page order. */
export function conditionPageKeys(
  shapes: readonly ConditionPageShape[],
  fileNames: readonly string[] = [],
): Map<string, string[]> {
  const keysByCondition = new Map<string, Set<string>>();
  for (const shape of shapes) {
    const conditionId = String(shape.condition_id || "");
    const sheetId = String(shape.sheet_id || "");
    if (!conditionId || !sheetId) continue;
    let pages = keysByCondition.get(conditionId);
    if (!pages) {
      pages = new Set<string>();
      keysByCondition.set(conditionId, pages);
    }
    pages.add(sheetId);
  }

  const fileOrder = new Map(fileNames.map((name, index) => [name, index]));
  const compareProjectPages = (left: string, right: string) => {
    const a = parseSheetKey(left);
    const b = parseSheetKey(right);
    const ai = fileOrder.get(a.file);
    const bi = fileOrder.get(b.file);
    if (ai != null || bi != null) {
      if (ai == null) return 1;
      if (bi == null) return -1;
      if (ai !== bi) return ai - bi;
      return a.page - b.page;
    }
    return compareSheetKeys(left, right);
  };

  return new Map([...keysByCondition].map(([conditionId, keys]) => [conditionId, [...keys].sort(compareProjectPages)]));
}
