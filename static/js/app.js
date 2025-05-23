import { initLibrary } from "./library.js";
import { addNode, nodeDefinitions, updateWiresForNode } from "./node.js";
import { initWiring } from "./wiring.js";
import { makeDraggable } from "./dragdrop.js";
import { showContextMenu, showAnchorContextMenu, removeContextMenu } from "./contextMenu.js";
import { updateWirePath, getCssVarNumber, getMouseWFCoordinates, clientToLogical, getAnchorCenter } from "./utils.js";
import { initProject, hasUnsavedChanges } from "./project.js";

// Expose context menu functions globally
window.showContextMenu = showContextMenu;
window.showAnchorContextMenu = showAnchorContextMenu;
window.removeContextMenu = removeContextMenu;

// Expose functions globally for project system
window.addNode = addNode;
window.getAnchorCenter = getAnchorCenter;
window.updateWirePath = updateWirePath;

// Global variables for nodes, wiring, and node definitions
window.nodeCounter = 0;
window.wires = [];
window.currentWire = null;
window.currentWireLine = null;
window.nodeDefinitions = nodeDefinitions;
window.makeDraggable = makeDraggable;

// Initialize zoom and pan values
let zoom = 1.0;
let panX = 0;
let panY = 0;
const minZoom = getCssVarNumber("min-zoom", 0.2);
const maxZoom = getCssVarNumber("max-zoom", 4.0);
window.zoom = zoom;
window.panX = panX;
window.panY = panY;

/**
 * Updates the workflow container's transform to apply zoom and pan
 */
function updateWorkflowTransform() {
  $("#workflow").css("transform", `translate(${panX}px, ${panY}px) scale(${zoom})`);
}

//////////////////////////////////////////////////////
// --- Deletion Undo/Redo State Management ---
let deletionUndoStack = [];
let deletionRedoStack = [];

/**
 * Logs information about the deletion undo stack state for debugging
 * @param {string} action - Description of the action that triggered logging
 */
function logDeletionUndoStack(action) {
  console.log(`DELETION UNDO STACK after ${action}: Length = ${deletionUndoStack.length}`);
  if (deletionUndoStack.length > 0) {
    console.log("Top deletion state:", JSON.stringify(deletionUndoStack[deletionUndoStack.length - 1]));
  }
}

/**
 * Captures the current workflow state
 * @returns {Object} State object containing nodes and wires
 */
function getWorkflowState() {
  let state = { nodes: [], wires: [] };

  // Capture all nodes with their positions and parameters
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

  // Capture all wire connections
  state.wires = window.wires.map(w => ({
    fromNode: w.fromNode,
    fromAnchor: w.fromAnchor,
    toNode: w.toNode,
    toAnchor: w.toAnchor
  }));

  return state;
}

/**
 * Restores a previously saved workflow state
 * @param {Object} state - The state object to restore
 */
function restoreWorkflowState(state) {
  // Clear existing workflow
  $("#workflow").empty();
  $("#workflow").append('<svg id="svgOverlay"></svg>');

  window.wires = [];
  window.nodes = {};

  // Recreate nodes
  state.nodes.forEach(n => {
    let $node = addNode(n.type, n.left, n.top);
    $node.find(".parameters input, .parameters select").each(function() {
      let cls = $(this).attr("class") || "";
      let match = cls.match(/param-([\w-]+)/);
      if (match && n.parameters.hasOwnProperty(match[1])) {
        $(this).val(n.parameters[match[1]]);
      }
    });
    $node.attr("data-id", n.id);
    window.nodes[n.id] = $node;
  });

  // Recreate wires
  state.wires.forEach(wireData => {
    createWireFromData(wireData);
  });

  updateWorkflowTransform();
}

/**
 * Saves the current workflow state to the undo stack
 */
function saveDeletionState() {
  let state = getWorkflowState();
  deletionUndoStack.push(state);
  deletionRedoStack = [];
  logDeletionUndoStack("saveDeletionState");
}

/**
 * Creates a wire connection from saved data
 * @param {Object} wireData - Wire connection data
 */
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

// Keyboard event handler for undo/redo
$(document).on("keydown", function(ev) {
  // Undo with Ctrl+Z
  if (ev.ctrlKey && (ev.key === "z" || ev.key === "Z")) {
    if (deletionUndoStack.length > 0) {
      let currentState = getWorkflowState();
      deletionRedoStack.push(currentState);
      let prevState = deletionUndoStack.pop();
      restoreWorkflowState(prevState);
      logDeletionUndoStack("UNDO");
    }
    ev.preventDefault();
  }
  // Redo with Ctrl+Y
  else if (ev.ctrlKey && (ev.key === "y" || ev.key === "Y")) {
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

$(document).ready(function() {
  // Initialize log window
  $("#logButton").on("click", function() {
    $("#logWindow").toggle();
    if ($("#logWindow").is(":visible")) {
      const logSource = new EventSource("/api/logs");
      logSource.onmessage = function(e) {
        if (e.data.startsWith(":")) return;
        $("#logContent").append(e.data + "<br>");
        $("#logWindow").scrollTop($("#logWindow")[0].scrollHeight);
      };
      logSource.onerror = function(err) {
        console.error("Log SSE error:", err);
        logSource.close();
      };
      window.logSource = logSource;
    } else {
      if (window.logSource) {
        window.logSource.close();
        window.logSource = null;
      }
    }
  });

  $("#closeLogWindow").on("click", function() {
    $("#logWindow").hide();
    if (window.logSource) {
      window.logSource.close();
      window.logSource = null;
    }
  });

  // Initialize the application components
  initLibrary();
  initWiring();
  initProject();

  // Handle drag-and-drop for creating new nodes
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

  // Handle canvas mouse interactions for selection and pan
  $("#canvas").on("mousedown", function(ev) {
    // If Ctrl is held, start lasso selection
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
        $lasso.css({ left, top, width, height });
      });

      $(document).on("mouseup.lasso", function() {
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

    // Otherwise, clear selection and start panning
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

  // Handle mouse wheel for zooming
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

    // Adjust pan to keep mouse position stable during zoom
    panX = panX - (zoom - oldZoom) * (mouseX - panX) / oldZoom;
    panY = panY - (zoom - oldZoom) * (mouseY - panY) / oldZoom;

    window.zoom = zoom;
    window.panX = panX;
    window.panY = panY;

    updateWorkflowTransform();
  });

  // Handle Delete key for removing selected nodes
  $(document).on("keydown", function(ev) {
    if (ev.key === "Delete" || ev.keyCode === 46) {
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

  // Handle browser close/refresh with unsaved changes warning
  window.addEventListener("beforeunload", function(e) {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    }
  });

  // Handle Start button click to execute workflow
  $("#startBtn").on("click", function() {
    $(".node").removeClass("processing");
    
    // Build workflow data structure
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
    
    // Submit workflow to backend and handle streaming response
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
        } 
        else if (e.data.startsWith("END")) {
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
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("SSE connection closed normally.");
          return;
        }
        console.error("SSE error:", err);
        eventSource.close();
      };
    })
    .catch(err => {
      console.error("Error submitting workflow:", err);
      alert("Error executing workflow.");
    });
  });
  
  // Initialize workflow transform
  updateWorkflowTransform();
});