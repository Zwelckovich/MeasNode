// app.js (version 0.1.43 SSE final)
// Ensure jQuery is loaded globally (from index.html) before this module runs.

import { initLibrary } from "./library.js";
import { addNode, nodeDefinitions, titleHeight, anchorAreaTop, anchorSpacing } from "./node.js";
import { initWiring } from "./wiring.js";
import { makeDraggable } from "./dragdrop.js";
import { showContextMenu, showAnchorContextMenu, removeContextMenu } from "./contextMenu.js";
import { updateWirePath } from "./utils.js";

window.showContextMenu = showContextMenu;
window.showAnchorContextMenu = showAnchorContextMenu;
window.removeContextMenu = removeContextMenu;
window.nodeCounter = 0;
window.wires = [];
window.currentWire = null;
window.currentWireLine = null;
window.nodeDefinitions = nodeDefinitions;
window.makeDraggable = makeDraggable;

let zoom = 1.0;
let panX = 0;
let panY = 0;
const minZoom = 0.2;
const maxZoom = 4.0;
window.zoom = zoom;
window.panX = panX;
window.panY = panY;

function updateWorkflowTransform() {
  $("#workflow").css("transform", `translate(${panX}px, ${panY}px) scale(${zoom})`);
}

$(document).ready(function() {
  initLibrary();
  initWiring();

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
          // Optionally, you could remove processing for that node here.
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
