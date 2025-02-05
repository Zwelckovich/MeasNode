// dragdrop.js (version 0.1.36)
import { updateWiresForNode } from "./node.js";

/**
 * Converts client (mouse) coordinates into logical workflow coordinates.
 * Logical coordinates = (clientX - canvasRect.left - panX) / zoom.
 */
function clientToLogical(clientX, clientY) {
  const canvasRect = document.getElementById("canvas").getBoundingClientRect();
  const currentZoom = window.zoom || 1;
  const currentPanX = window.panX || 0;
  const currentPanY = window.panY || 0;
  return {
    x: (clientX - canvasRect.left - currentPanX) / currentZoom,
    y: (clientY - canvasRect.top - currentPanY) / currentZoom
  };
}

/**
 * Makes a node draggable.
 * At drag start, we compute the logical position of the mouse and the node's logical position,
 * then calculate the offset between them. On each mousemove, we update the node's logical position
 * so that the node's top-left remains at (current logical mouse position - offset).
 * The new position is clamped so that the node cannot be moved outside the workflow border.
 */
export function makeDraggable($node) {
  $node.on("mousedown", function(ev) {
    // Prevent dragging if clicking on an anchor or its label.
    if ($(ev.target).closest(".anchor").length > 0 || $(ev.target).closest(".anchor-label").length > 0) {
      return;
    }
    if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") return;
    if (ev.which !== 1) return;
    
    // Get the canvas's bounding rectangle (for stable screen coordinates).
    let canvasRect = $("#canvas")[0].getBoundingClientRect();
    
    // Get the node's current bounding rectangle in screen coordinates.
    let nodeRect = $node[0].getBoundingClientRect();
    
    // Compute the fixed offset between the mouse pointer and the node's top-left corner in screen coordinates.
    let offsetScreenX = ev.clientX - nodeRect.left;
    let offsetScreenY = ev.clientY - nodeRect.top;
    
    // Get the node's current position in the workflow (background sheet) coordinate system.
    let pos = $node.position(); // pos.left and pos.top
    let origX = pos.left;
    let origY = pos.top;
    
    // Log for debugging with added node coordinates.
    console.log("Drag Start (screen):", {
      canvasRect,
      nodeRect,
      offsetScreenX,
      offsetScreenY,
      origX, // Node's x coordinate in the workflow coordinate system
      origY  // Node's y coordinate in the workflow coordinate system
    });
    
    function onMouseMove(ev2) {
      // Get the current canvas bounding rectangle.
      let canvasRect = $("#canvas")[0].getBoundingClientRect();
      // Retrieve current global pan and zoom values.
      let currentZoom = window.zoom || 1;
      let currentPanX = window.panX || 0;
      let currentPanY = window.panY || 0;
      
      // Compute new mouse position in screen coordinates.
      let newClientX = ev2.clientX;
      let newClientY = ev2.clientY;
      
      // Convert the new client position to workflow coordinates.
      let newMouseWF_X = (newClientX - canvasRect.left - currentPanX) / currentZoom;
      let newMouseWF_Y = (newClientY - canvasRect.top - currentPanY) / currentZoom;
      
      // The node's new workflow position should be the mouse workflow coordinate minus the offset.
      let offsetWF_X = offsetScreenX / currentZoom;
      let offsetWF_Y = offsetScreenY / currentZoom;
      
      let newNodeX = newMouseWF_X - offsetWF_X;
      let newNodeY = newMouseWF_Y - offsetWF_Y;
      
      // Clamp the new node position so that it remains within the workflow border.
      // Assuming the workflow border spans from 0 to 10000 in both x and y.
      let nodeWidth = $node.outerWidth();
      let nodeHeight = $node.outerHeight();
      const workflowWidth = 10000;
      const workflowHeight = 10000;
      
      newNodeX = Math.max(0, Math.min(newNodeX, workflowWidth - nodeWidth));
      newNodeY = Math.max(0, Math.min(newNodeY, workflowHeight - nodeHeight));
      
      $node.css({ left: newNodeX, top: newNodeY });
      updateWiresForNode($node);
    }
    
    $(document).on("mousemove.nodeDrag", onMouseMove);
    $(document).on("mouseup.nodeDrag", function() {
      $(document).off("mousemove.nodeDrag mouseup.nodeDrag");
    });
    
    ev.preventDefault();
  });
}
