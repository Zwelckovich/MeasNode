// app.js (version 0.1.8)
// Ensure jQuery is loaded globally (from index.html) before this module runs.

// Import modules (adjust the paths if necessary)
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

// Global variables for wiring and node count
window.nodeCounter = 0;
window.wires = [];
window.currentWire = null;
window.currentWireLine = null;

// Expose nodeDefinitions and makeDraggable globally if needed by other modules
window.nodeDefinitions = nodeDefinitions;
window.makeDraggable = makeDraggable;

// When the DOM is ready, initialize everything.
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
    let type = ev.originalEvent.dataTransfer.getData("text/plain");
    let offset = $(this).offset();
    let x = ev.originalEvent.pageX - offset.left;
    let y = ev.originalEvent.pageY - offset.top;
    addNode(type, x, y);
  });

  // Bind canvas mousedown to deselect nodes.
  $("#canvas").on("mousedown", function(ev) {
    if (ev.target.id === "canvas" || ev.target.id === "svgOverlay") {
      $(".node").removeClass("selected");
      $(".anchor").removeClass("selected");
      removeContextMenu();
    }
  });

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

  // If the Start button doesn't exist, create it.
  if ($("#startBtn").length === 0) {
    $("body").append('<button id="startBtn" style="position:fixed; bottom:10px; right:10px; padding:10px; width:100px; height:30px;">Start</button>');
  }
});
