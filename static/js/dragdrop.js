// dragdrop.js
import { updateWiresForNode } from "./node.js";

export function makeDraggable($node) {
  $node.on("mousedown", function(ev) {
    // Prevent dragging if clicking on an anchor or its label.
    if ($(ev.target).closest(".anchor").length > 0 || $(ev.target).closest(".anchor-label").length > 0) {
      return;
    }
    if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") return;
    if (ev.which !== 1) return;
    let pos = $node.position();
    let startX = ev.pageX, startY = ev.pageY;
    let origX = pos.left, origY = pos.top;
    function onMouseMove(ev2) {
      let dx = ev2.pageX - startX;
      let dy = ev2.pageY - startY;
      $node.css({ left: origX + dx, top: origY + dy });
      updateWiresForNode($node);
    }
    $(document).on("mousemove.nodeDrag", onMouseMove);
    $(document).on("mouseup.nodeDrag", function() {
      $(document).off("mousemove.nodeDrag mouseup.nodeDrag");
    });
    ev.preventDefault();
  });
}
