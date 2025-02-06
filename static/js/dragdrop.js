// dragdrop.js (version 0.1.40-final)
import { updateWiresForNode } from "./node.js";

/**
 * Converts client (mouse) coordinates into logical workflow coordinates,
 * using the provided zoom and pan values.
 * Logical coordinates = (clientX - canvasRect.left - panX) / zoom.
 */
function clientToLogical(clientX, clientY, zoomVal, panXVal, panYVal) {
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
 * Makes a node draggable.
 * Supports group dragging if multiple nodes are selected.
 * For group dragging, we freeze the pan/zoom values at drag start, record the initial mouse screen coordinates,
 * and record each selected node's initial left/top (read from inline CSS) as numbers.
 * On mousemove, we compute the screen delta, convert that delta to workflow delta (by dividing by the fixed zoom),
 * and update each node's position as its initial position plus the delta.
 * The new positions are clamped to remain within the workflow border, whose width and height
 * are read dynamically from the #workflow element.
 * For single-node dragging, the original offset-based logic is used.
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
    
    // Compute the initial mouse workflow coordinates using fixed pan/zoom.
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
      // Dynamically read workflow boundaries from the #workflow element.
      const workflowWidth = $("#workflow").width();
      const workflowHeight = $("#workflow").height();
      
      if ($selectedNodes.length > 1) {
        // Group dragging: compute the screen delta from the initial mouse position.
        let deltaScreenX = ev2.clientX - initialClientX;
        let deltaScreenY = ev2.clientY - initialClientY;
        
        // Convert screen delta to workflow delta using the fixed zoom.
        let deltaWFX = deltaScreenX / fixedZoom;
        let deltaWFY = deltaScreenY / fixedZoom;
        
        // For each selected node, update its position.
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
        // Single node dragging: use the original offset-based logic with current global pan/zoom.
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
