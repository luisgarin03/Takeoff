export function estimateActivityHeight(line) {
  const value = String(line.description || '');
  if (typeof document !== 'undefined') {
    const measure = document.createElement('textarea');
    measure.style.cssText = 'position:fixed!important;left:-10000px!important;top:0!important;width:377px!important;height:0!important;min-height:0!important;max-height:none!important;box-sizing:border-box!important;font:12px/13px Arial,sans-serif!important;padding:1px 4px!important;border:1px solid transparent!important;overflow:hidden!important;white-space:pre-wrap!important;overflow-wrap:break-word!important;visibility:hidden!important;';
    measure.value = value;
    document.body.appendChild(measure);
    const height = Math.max(38, measure.scrollHeight + 6);
    measure.remove();
    return height;
  }
  return Math.max(38, value.split('\n').reduce((sum,text) => sum + Math.max(1,Math.ceil(text.length / 45)),0) * 13 + 12);
}
export function paginateEstimateActivities(lines, heightFor = estimateActivityHeight) {
  const pages = [[]]; let used = 0;
  lines.forEach((line,index) => {
    const height = heightFor(line);
    const capacity = pages.length === 1 ? 280 : 564;
    if (height > 564) throw new Error('An activity is too long for one page. Split it into separate activities.');
    if (used + height > capacity && (pages.at(-1).length || pages.length === 1)) { pages.push([]); used = 0; }
    pages.at(-1).push({ line,index,height }); used += height;
  });
  return pages;
}
