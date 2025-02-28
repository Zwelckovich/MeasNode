// utils.js - Centralized utility functions
const $ = window.jQuery || window.$;

/**
 * Computes an S-shaped Bézier curve path between two points.
 * @param {number} x1 - Start point x coordinate
 * @param {number} y1 - Start point y coordinate
 * @param {number} x2 - End point x coordinate
 * @param {number} y2 - End point y coordinate
 * @returns {string} SVG path data string
 */
export function updateWirePath(x1, y1, x2, y2) {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * Reads a CSS custom property value as a number.
 * @param {string} varName - CSS variable name (without the -- prefix)
 * @param {number} fallback - Default value if variable is not found
 * @returns {number} The numeric value of the CSS variable or fallback
 */
export function getCssVarNumber(varName, fallback) {
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(`--${varName}`);
  return parseFloat(rawValue) || fallback;
}

/**
 * Returns the center of the anchor element in workflow (logical) coordinates.
 * @param {jQuery} $anchor - The anchor element
 * @returns {Object} {x, y} coordinates in workflow space
 */
export function getAnchorCenter($anchor) {
  // Get the workflow container element
  const wfElem = document.getElementById("workflow");
  if (!wfElem) {
    console.error("Workflow container (#workflow) not found!");
    return { x: 0, y: 0 };
  }
  
  // Get bounding rectangles in screen (client) coordinates
  const wfRect = wfElem.getBoundingClientRect();
  const anchorRect = $anchor[0].getBoundingClientRect();
  
  // Calculate the center of the anchor in screen coordinates
  const centerX = (anchorRect.left + anchorRect.right) / 2;
  const centerY = (anchorRect.top + anchorRect.bottom) / 2;
  
  // Convert the screen coordinates to workflow coordinates
  const currentZoom = window.zoom || 1;
  return {
    x: (centerX - wfRect.left) / currentZoom,
    y: (centerY - wfRect.top) / currentZoom
  };
}

/**
 * Converts client (mouse) coordinates into logical workflow coordinates.
 * @param {number} clientX - Client X coordinate (from mouse event)
 * @param {number} clientY - Client Y coordinate (from mouse event)
 * @param {number} [zoomVal] - Current zoom level (default: window.zoom)
 * @param {number} [panXVal] - Current X pan offset (default: window.panX)
 * @param {number} [panYVal] - Current Y pan offset (default: window.panY)
 * @returns {Object} {x, y} coordinates in workflow space
 */
export function clientToLogical(clientX, clientY, zoomVal, panXVal, panYVal) {
  const canvasRect = document.getElementById("canvas").getBoundingClientRect();
  const z = (zoomVal !== undefined) ? zoomVal : (window.zoom || 1);
  const panX = (panXVal !== undefined) ? panXVal : (window.panX || 0);
  const panY = (panYVal !== undefined) ? panYVal : (window.panY || 0);
  return {
    x: (clientX - canvasRect.left - panX) / z,
    y: (clientY - canvasRect.top - panY) / z
  };
}

/**
 * Converts a mouse event's client coordinates into workflow coordinates.
 * @param {MouseEvent} ev - Mouse event object
 * @returns {Object} {x, y} coordinates in workflow space
 */
export function getMouseWFCoordinates(ev) {
  const wfElem = document.getElementById("workflow");
  const wfRect = wfElem.getBoundingClientRect();
  const currentZoom = window.zoom || 1;
  return {
    x: (ev.clientX - wfRect.left) / currentZoom,
    y: (ev.clientY - wfRect.top) / currentZoom
  };
}

/**
 * Computes the height required for parameter fields in a node.
 * @param {number} numFields - Number of input fields
 * @returns {number} Calculated height in pixels
 */
export function computeFieldAreaHeight(numFields) {
  const fieldLineHeight = getCssVarNumber("field-line-height", 25);
  const fieldPadding = getCssVarNumber("field-padding", 10);
  const bottomPadding = getCssVarNumber("node-bottom-padding", 15); // Additional bottom padding
  return numFields * fieldLineHeight + fieldPadding + bottomPadding;
}