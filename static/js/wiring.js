// wiring.js - Wire connection management
import { updateWirePath, getAnchorCenter, getMouseWFCoordinates } from "./utils.js";

/**
 * Initializes wiring functionality for the canvas.
 * Handles mouse movement and release events for drawing connections between nodes.
 */
export function initWiring() {
  // Handle mouse movement during wiring
  $("#canvas").on("mousemove", function(ev) {
    if (window.currentWireLine && window.currentWire) {
      // Recalculate the starting point from the current anchor element
      let startPos;
      if (window.currentWire.fromAnchorElement) {
        startPos = getAnchorCenter(window.currentWire.fromAnchorElement);
      } else {
        startPos = { x: window.currentWire.startX, y: window.currentWire.startY };
      }
      
      const mouseWF = getMouseWFCoordinates(ev);
      window.currentWireLine.setAttribute(
        "d",
        updateWirePath(startPos.x, startPos.y, mouseWF.x, mouseWF.y)
      );
    }
  });
  
  // Handle mouse up to complete wiring
  $("#canvas").on("mouseup", function(ev) {
    if (window.currentWireLine && window.currentWire) {
      let targetAnchor = document.elementFromPoint(ev.clientX, ev.clientY);
      
      if (targetAnchor && $(targetAnchor).hasClass("anchor")) {
        let targetType = $(targetAnchor).hasClass("output") ? "output" : "input";
        
        // Only connect output->input, not input->input or output->output
        if (window.currentWire.fromType === "output" && targetType === "input") {
          let fromNodeId = window.currentWire.fromNode.data("id");
          let fromAnchor = window.currentWire.fromAnchor;
          let toNode = $(targetAnchor).closest(".node");
          let toNodeId = toNode.data("id");
          let toAnchor = $(targetAnchor).attr("data-anchor");
          let pos = getAnchorCenter($(targetAnchor));
          
          // Store the connection
          window.wires.push({
            fromNode: fromNodeId,
            fromAnchor: fromAnchor,
            toNode: toNodeId,
            toAnchor: toAnchor,
            line: window.currentWireLine,
            lineStartX: window.currentWire.startX,
            lineStartY: window.currentWire.startY
          });
          
          // Update the path with final positions
          window.currentWireLine.setAttribute(
            "d",
            updateWirePath(window.currentWire.startX, window.currentWire.startY, pos.x, pos.y)
          );
        } else {
          // Remove the line if trying to make an invalid connection
          window.currentWireLine.remove();
        }
      } else {
        // Remove the line if not dropped on an anchor
        window.currentWireLine.remove();
      }
    }
    
    // Reset the current wire state
    window.currentWire = null;
    window.currentWireLine = null;
  });
}