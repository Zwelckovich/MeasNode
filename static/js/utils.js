// utils.js (version 0.1.23)
export function updateWirePath(x1, y1, x2, y2) {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * Returns the center of the anchor element in workflow (logical) coordinates.
 * 
 * This function works by:
 *   1. Obtaining the anchor element’s bounding rectangle (in screen coordinates).
 *   2. Obtaining the workflow container’s bounding rectangle (in screen coordinates).
 *   3. Calculating the anchor’s center in screen coordinates.
 *   4. Converting that screen–space center into workflow coordinates by subtracting
 *      the workflow container's top/left and dividing by the current zoom factor.
 */
export function getAnchorCenter($anchor) {
  // Get the workflow container element.
  const wfElem = document.getElementById("workflow");
  if (!wfElem) {
    console.error("Workflow container (#workflow) not found!");
    return { x: 0, y: 0 };
  }
  
  // Get bounding rectangles in screen (client) coordinates.
  const wfRect = wfElem.getBoundingClientRect();
  const anchorRect = $anchor[0].getBoundingClientRect();
  
  // Calculate the center of the anchor in screen coordinates.
  const centerX = (anchorRect.left + anchorRect.right) / 2;
  const centerY = (anchorRect.top + anchorRect.bottom) / 2;
  
  // Get the current zoom factor (default to 1 if undefined).
  const currentZoom = window.zoom || 1;
  
  // Convert the screen coordinates to workflow coordinates.
  return {
    x: (centerX - wfRect.left) / currentZoom,
    y: (centerY - wfRect.top) / currentZoom
  };
}
