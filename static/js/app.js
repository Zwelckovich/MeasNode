// app.js (version 0.2.2-deletion-undo-only-final2)
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

// === Zoom and Pan on Workflow ===
// The pan/zoom transforms are applied to the #workflow container.
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

//////////////////////////////////////////////////////
// --- Deletion Undo/Redo State Management ---
// We maintain two stacks for deletion events only.
let deletionUndoStack = [];
let deletionRedoStack = [];

// Helper: Log deletion undo stack for debugging.
function logDeletionUndoStack(action) {
  console.log(`DELETION UNDO STACK after ${action}: Length = ${deletionUndoStack.length}`);
  if (deletionUndoStack.length > 0) {
    console.log("Top deletion state:", JSON.stringify(deletionUndoStack[deletionUndoStack.length - 1]));
  }
}

// Capture the current workflow state (nodes and wires).
function getWorkflowState() {
  let state = { nodes: [], wires: [] };
  $(".node").each(function() {
    let $node = $(this);
    state.nodes.push({
      id: $node.data("id"),
      type: $node.data("type"),
      left: parseFloat($node.css("left")),
      top: parseFloat($node.css("top")),
      parameters: (function(){
         let params = {};
         $node.find(".parameters input, .parameters select").each(function() {
           let cls = $(this).attr("class") || "";
           let match = cls.match(/param-([\w-]+)/);
           if (match) {
             params[match[1]] = $(this).val();
           }
         });
         return params;
      })()
    });
  });
  // Capture wires from window.wires.
  state.wires = window.wires.map(w => ({
    fromNode: w.fromNode,
    fromAnchor: w.fromAnchor,
    toNode: w.toNode,
    toAnchor: w.toAnchor
  }));
  return state;
}

// Restore the workflow state.
function restoreWorkflowState(state) {
  // Clear the workflow container.
  $("#workflow").empty();
  // Re-add the SVG overlay element.
  $("#workflow").append('<svg id="svgOverlay"></svg>');
  
  window.wires = [];
  window.nodes = {};
  // Recreate nodes from the snapshot.
  state.nodes.forEach(n => {
    let $node = addNode(n.type, n.left, n.top);
    // Restore parameter values.
    $node.find(".parameters input, .parameters select").each(function() {
      let cls = $(this).attr("class") || "";
      let match = cls.match(/param-([\w-]+)/);
      if (match && n.parameters.hasOwnProperty(match[1])) {
        $(this).val(n.parameters[match[1]]);
      }
    });
    // Overwrite the auto-generated id with the saved id.
    $node.attr("data-id", n.id);
    window.nodes[n.id] = $node;
  });
  // Recreate wires.
  state.wires.forEach(wireData => {
    createWireFromData(wireData);
  });
  updateWorkflowTransform();
}

// Save the current deletion state BEFORE performing a deletion.
function saveDeletionState() {
  let state = getWorkflowState();
  deletionUndoStack.push(state);
  deletionRedoStack = [];
  logDeletionUndoStack("saveDeletionState");
}

//////////////////////////////////////////////////////
// Helper: getAnchorCenter
function getAnchorCenter($anchor) {
  const wfElem = document.getElementById("workflow");
  const wfRect = wfElem.getBoundingClientRect();
  const anchorRect = $anchor[0].getBoundingClientRect();
  const centerX = (anchorRect.left + anchorRect.right) / 2;
  const centerY = (anchorRect.top + anchorRect.bottom) / 2;
  const currentZoom = window.zoom || 1;
  return {
    x: (centerX - wfRect.left) / currentZoom,
    y: (centerY - wfRect.top) / currentZoom
  };
}

//////////////////////////////////////////////////////
// Helper: createWireFromData
function createWireFromData(wireData) {
  let $fromNode = window.nodes[wireData.fromNode];
  let $toNode = window.nodes[wireData.toNode];
  if (!$fromNode || !$toNode) return;
  let $fromAnchor = $fromNode.find(`.anchor.output[data-anchor="${wireData.fromAnchor}"]`);
  let $toAnchor = $toNode.find(`.anchor.input[data-anchor="${wireData.toAnchor}"]`);
  if (!$fromAnchor.length || !$toAnchor.length) return;
  let newLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
  newLine.setAttribute("stroke", "#fff");
  newLine.setAttribute("stroke-width", "2");
  newLine.setAttribute("fill", "none");
  document.getElementById("svgOverlay").appendChild(newLine);
  let startPos = getAnchorCenter($fromAnchor);
  let endPos = getAnchorCenter($toAnchor);
  newLine.setAttribute("d", updateWirePath(startPos.x, startPos.y, endPos.x, endPos.y));
  window.wires.push({
    fromNode: wireData.fromNode,
    fromAnchor: wireData.fromAnchor,
    toNode: wireData.toNode,
    toAnchor: wireData.toAnchor,
    line: newLine,
    lineStartX: startPos.x,
    lineStartY: startPos.y
  });
}

//////////////////////////////////////////////////////
// Global Key Handlers for Deletion Undo/Redo (Deletion events only)
$(document).on("keydown", function(ev) {
  if (ev.ctrlKey && (ev.key === "z" || ev.key === "Z")) {
    // Undo deletion.
    if (deletionUndoStack.length > 0) {
      let currentState = getWorkflowState();
      deletionRedoStack.push(currentState);
      let prevState = deletionUndoStack.pop();
      restoreWorkflowState(prevState);
      logDeletionUndoStack("UNDO");
    }
    ev.preventDefault();
  } else if (ev.ctrlKey && (ev.key === "y" || ev.key === "Y")) {
    // Redo deletion.
    if (deletionRedoStack.length > 0) {
      let currentState = getWorkflowState();
      deletionUndoStack.push(currentState);
      let nextState = deletionRedoStack.pop();
      restoreWorkflowState(nextState);
      logDeletionUndoStack("REDO");
    }
    ev.preventDefault();
  }
});

//////////////////////////////////////////////////////
// Main Document Ready
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
    // (No deletion state saving on drop in this deletion-only undo/redo version.)
  });

  // --- Pan & Lasso Selection ---
  $("#canvas").on("mousedown", function(ev) {
    // Lasso selection if CTRL is held and target is background.
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
        if (lassoWidth > 0 && lassoHeight > 0) {
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
        }
        $lasso.remove();
        $(document).off("mousemove.lasso mouseup.lasso");
      });
      ev.preventDefault();
      return;
    }
    // Otherwise, if clicking on background for panning.
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

  // --- Global Delete Key Handler (for deletion events only) ---
  $(document).on("keydown", function(ev) {
    if (ev.key === "Delete" || ev.keyCode === 46) {
      // Save state BEFORE deletion so that we can undo the deletion.
      saveDeletionState();
      $(".node.selected").each(function() {
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
      console.log("Deletion event: Nodes deleted.");
      ev.preventDefault();
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
