// dragdrop.js (version 0.1.40-final)
import { updateWiresForNode } from "./node.js";

/**
 * Converts client (mouse) coordinates into logical workflow coordinates,
 * using the provided zoom and pan values.
 * Logical coordinates = (clientX - canvasRect.left - panX) / zoom.
 */
function clientToLogical(clientX, clientY, zoomVal, panXVal, panYVal) {
  const canvasRect = document.getElementById("canvas").getBoundingClientRect();
  return {
    x: (clientX - canvasRect.left - panXVal) / zoomVal,
    y: (clientY - canvasRect.top - panYVal) / zoomVal
  };
}

/**
 * Makes a node draggable.
 * Supports group dragging if multiple nodes are selected.
 * 
 * For group dragging:
 *  - At drag start, we freeze the current pan/zoom values.
 *  - We record the initial mouse screen coordinates.
 *  - For each selected node, we record its initial left and top values (as numbers) 
 *    from its inline CSS (assumed to be in workflow coordinates).
 *  - On each mousemove, we compute the screen delta (difference in client coordinates),
 *    convert that delta into workflow delta by dividing by the fixed zoom, and then
 *    set each node’s new position to its recorded initial position plus the workflow delta.
 * 
 * For single-node dragging, we use the original offset‑based logic (with current global pan/zoom).
 * In all cases, the new positions are clamped within the workflow border (0 to 10000).
 */
export function makeDraggable($node) {
  $node.on("mousedown", function(ev) {
    // Prevent dragging if clicking on an anchor, its label, or form fields.
    if ($(ev.target).closest(".anchor").length > 0 || $(ev.target).closest(".anchor-label").length > 0)
      return;
    if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT")
      return;
    if (ev.which !== 1)
      return;
    
    // Freeze the current pan and zoom values at drag start.
    const fixedZoom = window.zoom || 1;
    const fixedPanX = window.panX || 0;
    const fixedPanY = window.panY || 0;
    
    // Record the initial mouse screen coordinates.
    const initialClientX = ev.clientX;
    const initialClientY = ev.clientY;
    
    // Compute the initial mouse workflow coordinates using the fixed pan/zoom.
    let initialMouseWF = clientToLogical(ev.clientX, ev.clientY, fixedZoom, fixedPanX, fixedPanY);
    
    // Get the canvas's bounding rectangle.
    const canvasRect = $("#canvas")[0].getBoundingClientRect();
    
    // For single-node dragging: compute the fixed offset (in screen coordinates) between the mouse and the node's top-left.
    const nodeRect = $node[0].getBoundingClientRect();
    const offsetScreenX = ev.clientX - nodeRect.left;
    const offsetScreenY = ev.clientY - nodeRect.top;
    
    // Determine the group of nodes to drag.
    // If nodes with the "selected" class exist, use them; otherwise, drag only the current node.
    let $selectedNodes = $(".node.selected");
    if ($selectedNodes.length === 0) {
      $selectedNodes = $node;
    }
    
    // For group dragging, record each selected node's initial position by reading its inline "left" and "top".
    let groupInitialPositions = {};
    $selectedNodes.each(function() {
      let leftVal = parseFloat($(this).css("left"));
      let topVal = parseFloat($(this).css("top"));
      groupInitialPositions[$(this).data("id")] = { x: leftVal, y: topVal };
    });
    
    function onMouseMove(ev2) {
      // Define workflow boundaries.
      const workflowWidth = 10000;
      const workflowHeight = 10000;
      
      if ($selectedNodes.length > 1) {
        // For group dragging, compute the screen delta from the initial mouse position.
        let deltaScreenX = ev2.clientX - initialClientX;
        let deltaScreenY = ev2.clientY - initialClientY;
        
        // Convert the screen delta to workflow delta using the fixed zoom.
        let deltaWFX = deltaScreenX / fixedZoom;
        let deltaWFY = deltaScreenY / fixedZoom;
        
        // For each selected node, update its position as:
        // new position = recorded initial position + workflow delta.
        $selectedNodes.each(function() {
          let nodeId = $(this).data("id");
          let origPos = groupInitialPositions[nodeId];
          let nodeWidth = $(this).outerWidth();
          let nodeHeight = $(this).outerHeight();
          
          let newNodeX = origPos.x + deltaWFX;
          let newNodeY = origPos.y + deltaWFY;
          
          // Clamp the new position.
          newNodeX = Math.max(0, Math.min(newNodeX, workflowWidth - nodeWidth));
          newNodeY = Math.max(0, Math.min(newNodeY, workflowHeight - nodeHeight));
          
          $(this).css({ left: newNodeX, top: newNodeY });
          updateWiresForNode($(this));
        });
      } else {
        // For single-node dragging, use the original offset-based logic with current global pan/zoom.
        let currentZoom = window.zoom || 1;
        let currentPanX = window.panX || 0;
        let currentPanY = window.panY || 0;
        let newMouseWF = {
          x: (ev2.clientX - canvasRect.left - currentPanX) / currentZoom,
          y: (ev2.clientY - canvasRect.top - currentPanY) / currentZoom
        };
        let offsetWF_X = offsetScreenX / currentZoom;
        let offsetWF_Y = offsetScreenY / currentZoom;
        
        let newNodeX = newMouseWF.x - offsetWF_X;
        let newNodeY = newMouseWF.y - offsetWF_Y;
        
        let nodeWidth = $node.outerWidth();
        let nodeHeight = $node.outerHeight();
        newNodeX = Math.max(0, Math.min(newNodeX, workflowWidth - nodeWidth));
        newNodeY = Math.max(0, Math.min(newNodeY, workflowHeight - nodeHeight));
        
        $node.css({ left: newNodeX, top: newNodeY });
        updateWiresForNode($node);
      }
    }
    
    $(document).on("mousemove.nodeDrag", onMouseMove);
    $(document).on("mouseup.nodeDrag", function() {
      $(document).off("mousemove.nodeDrag mouseup.nodeDrag");
    });
    
    ev.preventDefault();
  });
}
