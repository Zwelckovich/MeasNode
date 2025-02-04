// wiring.js
import { updateWirePath, getAnchorCenter } from "./utils.js";

/**
 * Initializes wiring events on the canvas.
 * 
 * Binds mousemove and mouseup events to update and finalize wiring (SVG path)
 * when the user drags from one anchor to another.
 */
export function initWiring() {
  // Update the wiring path as the mouse moves.
  $("#canvas").on("mousemove", function(ev) {
    if (window.currentWireLine && window.currentWire) {
      let canvasOffset = $(this).offset();
      let x = ev.pageX - canvasOffset.left;
      let y = ev.pageY - canvasOffset.top;
      window.currentWireLine.setAttribute("d", updateWirePath(
        window.currentWire.startX,
        window.currentWire.startY,
        x,
        y
      ));
    }
  });
  
  // Finalize wiring on mouseup.
  $("#canvas").on("mouseup", function(ev) {
    if (window.currentWireLine && window.currentWire) {
      let targetAnchor = document.elementFromPoint(ev.clientX, ev.clientY);
      if (targetAnchor && $(targetAnchor).hasClass("anchor")) {
        let targetType = $(targetAnchor).hasClass("output") ? "output" : "input";
        // Only allow wiring from an output anchor to an input anchor.
        if (window.currentWire.fromType === "output" && targetType === "input") {
          let fromNodeId = window.currentWire.fromNode.data("id");
          let fromAnchor = window.currentWire.fromAnchor;
          let toNode = $(targetAnchor).closest(".node");
          let toNodeId = toNode.data("id");
          let toAnchor = $(targetAnchor).attr("data-anchor");
          let pos = getAnchorCenter($(targetAnchor));
          // Save the wire.
          window.wires.push({
            fromNode: fromNodeId,
            fromAnchor: fromAnchor,
            toNode: toNodeId,
            toAnchor: toAnchor,
            line: window.currentWireLine,
            lineStartX: window.currentWire.startX,
            lineStartY: window.currentWire.startY
          });
          // Update the path to its final state.
          window.currentWireLine.setAttribute("d", updateWirePath(
            window.currentWire.startX,
            window.currentWire.startY,
            pos.x,
            pos.y
          ));
        } else {
          // If wiring criteria aren't met, remove the temporary wire.
          window.currentWireLine.remove();
        }
      } else {
        window.currentWireLine.remove();
      }
    }
    // Reset global wiring variables.
    window.currentWire = null;
    window.currentWireLine = null;
  });
}
