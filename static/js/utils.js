// utils.js
export function updateWirePath(x1, y1, x2, y2) {
  let dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function getAnchorCenter($anchor) {
  let offset = $anchor.offset();
  let width = $anchor.outerWidth();
  let height = $anchor.outerHeight();
  let canvasOffset = $("#canvas").offset();
  return {
    x: offset.left - canvasOffset.left + width / 2,
    y: offset.top - canvasOffset.top + height / 2
  };
}
