// Presentation-only visibility for a condition's takeoff graphics. Quantities,
// reports, and saved geometry continue to use the complete data collections.
// A missing flag means visible so projects saved before this setting remain
// unchanged when opened.
/** @param {{ takeoff_visible?: boolean } | null | undefined} condition */
export function conditionTakeoffVisible(condition) {
  return condition?.takeoff_visible !== false;
}

/**
 * @param {{
 *   conditions?: Array<{ id: string, takeoff_visible?: boolean, [key: string]: any }>,
 *   shapes?: Array<{ id: string, condition_id?: string, sheet_id?: string, [key: string]: any }>,
 *   markups?: Array<{ id?: string, measurement_shape_id?: string, sheet_id?: string, [key: string]: any }>,
 *   chainLinkFences?: Array<{ id?: string, shape_id?: string, sheet_id?: string, [key: string]: any }>
 * }} content
 */
export function filterVisibleConditionContent({ conditions = [], shapes = [], markups = [], chainLinkFences = [] } = {}) {
  const conditionsById = new Map(conditions.map((condition) => [condition.id, condition]));
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
  const visibleShapes = shapes.filter((shape) => conditionTakeoffVisible(conditionsById.get(shape.condition_id)));
  const visibleShapeIds = new Set(visibleShapes.map((shape) => shape.id));

  // Only automatic measurement callouts are condition-owned markups. Manual
  // notes, arrows, clouds, highlights, stamps, and drawings remain independent.
  const visibleMarkups = markups.filter((markup) => {
    if (!markup.measurement_shape_id) return true;
    return !shapesById.has(markup.measurement_shape_id) || visibleShapeIds.has(markup.measurement_shape_id);
  });
  const visibleChainLinkFences = chainLinkFences.filter((fence) => (
    !fence.shape_id || !shapesById.has(fence.shape_id) || visibleShapeIds.has(fence.shape_id)
  ));

  return { shapes: visibleShapes, markups: visibleMarkups, chainLinkFences: visibleChainLinkFences };
}
