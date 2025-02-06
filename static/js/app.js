// app.js (version 0.2.2)
// Ensure jQuery is loaded globally (from index.html) before this module runs.

// Import modules (adjust paths if necessary)
import { initLibrary } from "./library.js";
import { addNode, nodeDefinitions, titleHeight, anchorAreaTop, anchorSpacing } from "./node.js";
import { initWiring } from "./wiring.js";
import { makeDraggable } from "./dragdrop.js";
import { showContextMenu, showAnchorContextMenu, removeContextMenu } from "./contextMenu.js";
import { updateWirePath } from "./utils.js"; // For wiring

// Attach context menu functions to window so they are available globally.
window.showContextMenu = showContextMenu;
window.showAnchorContextMenu = showAnchorContextMenu;
window.removeContextMenu = removeContextMenu;

// Global variables for wiring and node count.
window.nodeCounter = 0;
window.wires = [];
window.currentWire = null;
window.currentWireLine = null;

// Expose nodeDefinitions and makeDraggable globally if needed.
window.nodeDefinitions = nodeDefinitions;
window.makeDraggable = makeDraggable;

// === New Feature: Zoom and Pan on Workflow ===
// The pan/zoom transforms are applied to the #workflow container.
let zoom = 1.0;
let panX = 0;
let panY = 0;
const minZoom = 0.2;
const maxZoom = 4.0;
window.zoom = zoom;
window.panX = panX;
window.panY = panY;

// Update the transform on the workflow container.
function updateWorkflowTransform() {
  $("#workflow").css("transform", `translate(${panX}px, ${panY}px) scale(${zoom})`);
}

$(document).ready(function() {
  initLibrary();
  initWiring();

  // --- Drag & Drop for Nodes ---
  $("#canvas").on("dragover", function(ev) {
    ev.preventDefault();
  });
  $("#canvas").on("drop", function(ev) {
    ev.preventDefault();
    let type = ev.originalEvent.dataTransfer.getData("text/plain");
    let canvasOffset = $("#canvas").offset();
    let x = ev.originalEvent.pageX - canvasOffset.left;
    let y = ev.originalEvent.pageY - canvasOffset.top;
    let wfX = (x - panX) / zoom;
    let wfY = (y - panY) / zoom;
    addNode(type, wfX, wfY);
  });

  // --- Pan & Lasso Selection ---
  $("#canvas").on("mousedown", function(ev) {
    // Lasso selection if CTRL key is held and click target is background.
    if (ev.ctrlKey && (ev.target.id === "canvas" || ev.target.id === "workflow")) {
      let $lasso = $("<div id='lasso-selection'></div>");
      $lasso.css({
        position: "absolute",
        border: "1px dashed #fff",
        "background-color": "rgba(0, 150, 255, 0.2)",
        left: ev.pageX,
        top: ev.pageY,
        width: 0,
        height: 0,
        zIndex: 5000
      });
      $("body").append($lasso);
      let startX = ev.pageX;
      let startY = ev.pageY;
      $(document).on("mousemove.lasso", function(ev2) {
        let currX = ev2.pageX;
        let currY = ev2.pageY;
        let left = Math.min(startX, currX);
        let top = Math.min(startY, currY);
        let width = Math.abs(currX - startX);
        let height = Math.abs(currY - startY);
        $lasso.css({ left: left, top: top, width: width, height: height });
      });
      $(document).on("mouseup.lasso", function(ev3) {
        let lassoOffset = $lasso.offset();
        let lassoWidth = $lasso.outerWidth();
        let lassoHeight = $lasso.outerHeight();
        $(".node").each(function() {
          let $node = $(this);
          let nodeOffset = $node.offset();
          let nodeWidth = $node.outerWidth();
          let nodeHeight = $node.outerHeight();
          if (nodeOffset.left >= lassoOffset.left &&
              nodeOffset.top >= lassoOffset.top &&
              (nodeOffset.left + nodeWidth) <= (lassoOffset.left + lassoWidth) &&
              (nodeOffset.top + nodeHeight) <= (lassoOffset.top + lassoHeight)) {
            $node.addClass("selected");
          }
        });
        $lasso.remove();
        $(document).off("mousemove.lasso mouseup.lasso");
      });
      ev.preventDefault();
      return;
    }
    // Otherwise, if clicking on the background (not on a node), do pan.
    if (ev.target.id === "canvas" || ev.target.id === "workflow" || ev.target.id === "svgOverlay") {
      $(".node").removeClass("selected");
      $(".anchor").removeClass("selected");
      removeContextMenu();
      let panStartX = ev.pageX;
      let panStartY = ev.pageY;
      $(document).on("mousemove.pan", function(ev2) {
        let dx = ev2.pageX - panStartX;
        let dy = ev2.pageY - panStartY;
        panX += dx;
        panY += dy;
        window.panX = panX;
        window.panY = panY;
        updateWorkflowTransform();
        panStartX = ev2.pageX;
        panStartY = ev2.pageY;
      });
      $(document).on("mouseup.pan", function() {
        $(document).off("mousemove.pan mouseup.pan");
      });
    }
  });

  // --- Zoom ---
  $("#canvas").on("wheel", function(ev) {
    ev.preventDefault();
    let canvasOffset = $("#canvas").offset();
    let mouseX = ev.pageX - canvasOffset.left;
    let mouseY = ev.pageY - canvasOffset.top;
    let oldZoom = zoom;
    let delta = ev.originalEvent.deltaY;
    let zoomFactor = delta > 0 ? 0.9 : 1.1;
    zoom *= zoomFactor;
    zoom = Math.min(maxZoom, Math.max(minZoom, zoom));
    panX = panX - (zoom - oldZoom) * (mouseX - panX) / oldZoom;
    panY = panY - (zoom - oldZoom) * (mouseY - panY) / oldZoom;
    window.zoom = zoom;
    window.panX = panX;
    window.panY = panY;
    updateWorkflowTransform();
  });

  // --- Wiring events are handled in wiring.js ---

  // --- Global Delete Key Handler ---
  $(document).on("keydown", function(ev) {
    // Check if the Delete key (key code 46) is pressed.
    if (ev.key === "Delete" || ev.keyCode === 46) {
      // Remove all selected nodes.
      $(".node.selected").each(function() {
        // Remove associated wires.
        let nodeId = $(this).data("id");
        window.wires = window.wires.filter(function(w) {
          if (w.fromNode === nodeId || w.toNode === nodeId) {
            $(w.line).remove();
            return false;
          }
          return true;
        });
        $(this).remove();
      });
    }
  });

  // --- Start Button & SSE Processing ---
  $("#startBtn").on("click", function() {
    $(".node").removeClass("processing");
    let workflow = { nodes: [] };
    let nodeConnections = {};
    window.wires.forEach(function(w) {
      if (!nodeConnections[w.toNode]) {
        nodeConnections[w.toNode] = {};
      }
      nodeConnections[w.toNode][w.toAnchor] = w.fromNode;
    });
    $(".node").each(function() {
      let $node = $(this);
      let type = $node.data("type");
      let id = $node.data("id");
      let parameters = {};
      let def = nodeDefinitions[type];
      if (def && def.parameters && def.parameters.length > 0 && type !== "Result Node") {
        def.parameters.forEach(function(param) {
          if (param.type === "int" || param.type === "text") {
            parameters[param.name] = $node.find(`.param-${param.name}`).val();
          } else if (param.type === "dropdown") {
            parameters[param.name] = $node.find(`.param-${param.name}`).val();
          }
        });
      }
      workflow.nodes.push({
        id: id,
        type: type,
        parameters: parameters,
        connections: nodeConnections[id] || {}
      });
    });
    console.log("Workflow JSON:", workflow);
    
    fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow)
    })
    .then(response => response.json())
    .then(data => {
      const token = data.token;
      const eventSource = new EventSource(`/api/execute_stream?token=${token}`);
      eventSource.onmessage = function(e) {
        console.log("SSE event:", e.data);
        if (e.data.startsWith("PROCESSING")) {
          const parts = e.data.split(" ");
          const nodeId = parts[1];
          $(".node").removeClass("processing");
          $(".node[data-id='" + nodeId + "']").addClass("processing");
        } else if (e.data.startsWith("DONE")) {
          // Optionally handle DONE events.
        } else if (e.data.startsWith("END")) {
          try {
            const endData = JSON.parse(e.data.replace("END ", ""));
            for (let nodeId in endData.results) {
              $(`.node[data-id="${nodeId}"] .param-result`).val(endData.results[nodeId]);
            }
          } catch (err) {
            console.error("Error parsing END event:", err);
          }
          $(".node.processing").removeClass("processing");
          eventSource.close();
        }
      };
      eventSource.onerror = function(err) {
        console.error("SSE error:", err);
        eventSource.close();
      };
    })
    .catch(err => {
      console.error("Error submitting workflow:", err);
      alert("Error executing workflow.");
    });
  });

  if ($("#startBtn").length === 0) {
    $("body").append('<button id="startBtn" style="position:fixed; bottom:10px; right:10px; padding:10px; width:100px; height:30px;">Start</button>');
  }
  
  updateWorkflowTransform();
});
