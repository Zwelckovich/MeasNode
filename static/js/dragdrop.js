// dragdrop.js (version 0.1.22g)
import { updateWiresForNode } from "./node.js";

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
    
    // Log for debugging.
    console.log("Drag Start (screen):", {
      canvasRect,
      nodeRect,
      offsetScreenX,
      offsetScreenY
    });
    
    function onMouseMove(ev2) {
      // Get the current canvas bounding rectangle.
      let canvasRect = $("#canvas")[0].getBoundingClientRect();
      // Retrieve current global pan and zoom values.
      let currentZoom = window.zoom || 1;
      let currentPanX = window.panX || 0;
      let currentPanY = window.panY || 0;
      
      // Compute new mouse position in screen coordinates.
      // We use clientX/clientY for consistency.
      let newClientX = ev2.clientX;
      let newClientY = ev2.clientY;
      
      // Now convert the new client position to workflow coordinates.
      // Workflow coordinates are computed as:
      // (clientX - canvasRect.left - pan) / zoom.
      let newMouseWF_X = (newClientX - canvasRect.left - currentPanX) / currentZoom;
      let newMouseWF_Y = (newClientY - canvasRect.top - currentPanY) / currentZoom;
      
      // The node's new workflow position should be the mouse workflow coordinate
      // minus the offset (converted to workflow units).
      let offsetWF_X = offsetScreenX / currentZoom;
      let offsetWF_Y = offsetScreenY / currentZoom;
      
      let newNodeX = newMouseWF_X - offsetWF_X;
      let newNodeY = newMouseWF_Y - offsetWF_Y;
      
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
