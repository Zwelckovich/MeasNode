// wiring.js (version 0.1.23)
import { updateWirePath, getAnchorCenter } from "./utils.js";

/**
 * Converts a mouse event's client coordinates into workflow coordinates,
 * based on the workflow container's bounding rectangle and current zoom.
 */
function getMouseWFCoordinates(ev) {
  const wfElem = document.getElementById("workflow");
  const wfRect = wfElem.getBoundingClientRect();
  const currentZoom = window.zoom || 1;
  return {
    x: (ev.clientX - wfRect.left) / currentZoom,
    y: (ev.clientY - wfRect.top) / currentZoom
  };
}

export function initWiring() {
  $("#canvas").on("mousemove", function(ev) {
    if (window.currentWireLine && window.currentWire) {
      // Recalculate the starting point from the current anchor element.
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
  
  $("#canvas").on("mouseup", function(ev) {
    if (window.currentWireLine && window.currentWire) {
      let targetAnchor = document.elementFromPoint(ev.clientX, ev.clientY);
      if (targetAnchor && $(targetAnchor).hasClass("anchor")) {
        let targetType = $(targetAnchor).hasClass("output") ? "output" : "input";
        if (window.currentWire.fromType === "output" && targetType === "input") {
          let fromNodeId = window.currentWire.fromNode.data("id");
          let fromAnchor = window.currentWire.fromAnchor;
          let toNode = $(targetAnchor).closest(".node");
          let toNodeId = toNode.data("id");
          let toAnchor = $(targetAnchor).attr("data-anchor");
          let pos = getAnchorCenter($(targetAnchor));
          window.wires.push({
            fromNode: fromNodeId,
            fromAnchor: fromAnchor,
            toNode: toNodeId,
            toAnchor: toAnchor,
            line: window.currentWireLine,
            lineStartX: window.currentWire.startX,
            lineStartY: window.currentWire.startY
          });
          window.currentWireLine.setAttribute(
            "d",
            updateWirePath(window.currentWire.startX, window.currentWire.startY, pos.x, pos.y)
          );
        } else {
          window.currentWireLine.remove();
        }
      } else {
        window.currentWireLine.remove();
      }
    }
    window.currentWire = null;
    window.currentWireLine = null;
  });
}
