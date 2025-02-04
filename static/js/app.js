// app.js (version 0.1.22)
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

// Expose these variables globally so that other modules (e.g., dragdrop.js) can use them.
window.zoom = zoom;
window.panX = panX;
window.panY = panY;

// Update the transform on the workflow container.
function updateWorkflowTransform() {
  $("#workflow").css("transform", `translate(${panX}px, ${panY}px) scale(${zoom})`);
}

$(document).ready(function() {
  // Initialize the library menu.
  initLibrary();
  
  // Initialize wiring events.
  initWiring();

  // Bind drag-and-drop on canvas for nodes.
  $("#canvas").on("dragover", function(ev) {
    ev.preventDefault();
  });
  $("#canvas").on("drop", function(ev) {
    ev.preventDefault();
    // Get the type from the drag data.
    let type = ev.originalEvent.dataTransfer.getData("text/plain");
    let canvasOffset = $("#canvas").offset();
    let x = ev.originalEvent.pageX - canvasOffset.left;
    let y = ev.originalEvent.pageY - canvasOffset.top;
    // Convert drop coordinates from canvas space to workflow space.
    let wfX = (x - panX) / zoom;
    let wfY = (y - panY) / zoom;
    addNode(type, wfX, wfY);
  });

  // Pan: Start panning when clicking on the canvas background.
  $("#canvas").on("mousedown", function(ev) {
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

  // Zoom: Adjust zoom level using the mouse wheel on the canvas.
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
    // Adjust pan so that the point under the cursor remains fixed.
    panX = panX - (zoom - oldZoom) * (mouseX - panX) / oldZoom;
    panY = panY - (zoom - oldZoom) * (mouseY - panY) / oldZoom;
    window.zoom = zoom;
    window.panX = panX;
    window.panY = panY;
    updateWorkflowTransform();
  });

  // Wiring events (mousemove and mouseup) are handled in wiring.js.

  // Bind the Start button event (workflow assembly and AJAX).
  $("#startBtn").on("click", function() {
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
    $.ajax({
      url: "/api/execute",
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify(workflow),
      success: function(response) {
        console.log("Execution response:", response);
        for (let nodeId in response.results) {
          let $resultElem = $(`.node[data-id="${nodeId}"] .param-result`);
          console.log("Updating node", nodeId, "found result element count:", $resultElem.length);
          $resultElem.val(response.results[nodeId]);
        }
      },
      error: function() {
        alert("Error executing workflow.");
      }
    });
  });

  if ($("#startBtn").length === 0) {
    $("body").append('<button id="startBtn" style="position:fixed; bottom:10px; right:10px; padding:10px; width:100px; height:30px;">Start</button>');
  }
  
  updateWorkflowTransform();
});
