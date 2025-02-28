// dragdrop.js - Node dragging functionality
import { updateWiresForNode } from "./node.js";
import { clientToLogical } from "./utils.js";

/**
 * Makes a node draggable.
 * Supports group dragging if multiple nodes are selected.
 * 
 * For group dragging:
 * - Freeze the pan/zoom values at drag start
 * - Record initial mouse screen coordinates
 * - Record each selected node's initial position
 * - On mousemove, compute screen-to-workflow deltas and update positions
 */
export function makeDraggable($node) {
  $node.on("mousedown", function(ev) {
    // Prevent dragging if clicking on an anchor, its label, or form fields
    if ($(ev.target).closest(".anchor").length > 0 || 
        $(ev.target).closest(".anchor-label").length > 0) {
      return;
    }
    
    if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") {
      return;
    }
    
    if (ev.which !== 1) {
      return;
    }
    
    // Freeze current pan and zoom values at drag start
    const fixedZoom = window.zoom || 1;
    const fixedPanX = window.panX || 0;
    const fixedPanY = window.panY || 0;
    
    // Record initial mouse coordinates
    const initialClientX = ev.clientX;
    const initialClientY = ev.clientY;
    
    // Compute initial mouse workflow coordinates
    let initialMouseWF = clientToLogical(
      ev.clientX, ev.clientY, fixedZoom, fixedPanX, fixedPanY
    );
    
    // Get canvas bounding rectangle
    const canvasRect = $("#canvas")[0].getBoundingClientRect();
    
    // For single-node dragging: compute offset between mouse and node's top-left
    const nodeRect = $node[0].getBoundingClientRect();
    const offsetScreenX = ev.clientX - nodeRect.left;
    const offsetScreenY = ev.clientY - nodeRect.top;
    
    // Determine nodes to drag (selected group or single node)
    let $selectedNodes = $(".node.selected");
    if ($selectedNodes.length === 0) {
      $selectedNodes = $node;
    }
    
    // Record each selected node's initial position
    let groupInitialPositions = {};
    $selectedNodes.each(function() {
      let leftVal = parseFloat($(this).css("left"));
      let topVal = parseFloat($(this).css("top"));
      groupInitialPositions[$(this).data("id")] = { x: leftVal, y: topVal };
    });
    
    function onMouseMove(ev2) {
      // Get workflow boundaries
      const workflowWidth = $("#workflow").width();
      const workflowHeight = $("#workflow").height();
      
      if ($selectedNodes.length > 1) {
        // Group dragging
        let deltaScreenX = ev2.clientX - initialClientX;
        let deltaScreenY = ev2.clientY - initialClientY;
        
        // Convert screen delta to workflow delta
        let deltaWFX = deltaScreenX / fixedZoom;
        let deltaWFY = deltaScreenY / fixedZoom;
        
        // Update each selected node's position
        $selectedNodes.each(function() {
          let nodeId = $(this).data("id");
          let origPos = groupInitialPositions[nodeId];
          let nodeWidth = $(this).outerWidth();
          let nodeHeight = $(this).outerHeight();
          
          let newNodeX = origPos.x + deltaWFX;
          let newNodeY = origPos.y + deltaWFY;
          
          // Clamp to workflow boundaries
          newNodeX = Math.max(0, Math.min(newNodeX, workflowWidth - nodeWidth));
          newNodeY = Math.max(0, Math.min(newNodeY, workflowHeight - nodeHeight));
          
          $(this).css({ left: newNodeX, top: newNodeY });
          updateWiresForNode($(this));
        });
      } else {
        // Single node dragging
        let currentZoom = window.zoom || 1;
        let currentPanX = window.panX || 0;
        let currentPanY = window.panY || 0;
        
        let newMouseWF = clientToLogical(
          ev2.clientX, ev2.clientY, currentZoom, currentPanX, currentPanY
        );
        
        let offsetWF_X = offsetScreenX / currentZoom;
        let offsetWF_Y = offsetScreenY / currentZoom;
        
        let newNodeX = newMouseWF.x - offsetWF_X;
        let newNodeY = newMouseWF.y - offsetWF_Y;
        
        let nodeWidth = $node.outerWidth();
        let nodeHeight = $node.outerHeight();
        
        // Clamp to workflow boundaries
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