// node.js
import { updateWirePath } from "./utils.js"; // Ensure this is exported from utils.js

// Ensure the global nodes object exists.
window.nodes = window.nodes || {};

// Global object to store node definitions from the backend.
export let nodeDefinitions = {};

// Layout constants.
const titleHeight = 30;          // Height for node title area.
const anchorAreaTop = 35;        // Y-coordinate where anchors begin.
const anchorSpacing = 20;        // Vertical spacing between anchors.

// Compute the field area height dynamically: 25px per field plus 10px padding.
function computeFieldAreaHeight(numFields) {
  return numFields * 25 + 10;
}

// Main function to create and add a node to the workflow.
function addNode(type, x, y) {
  let def = nodeDefinitions[type];
  if (!def) {
    console.error("No definition found for node type:", type);
    return;
  }
  let numInputs = def.inputs ? def.inputs.length : 0;
  let numOutputs = def.outputs ? def.outputs.length : 0;
  let maxAnchors = Math.max(numInputs, numOutputs);
  let numFields = def.parameters && def.parameters.length ? def.parameters.length : 0;
  let fieldAreaHeight = computeFieldAreaHeight(numFields);
  // Total node height = title area + (anchor area) + field area.
  let nodeHeight = titleHeight + (maxAnchors * anchorSpacing) + fieldAreaHeight;
  // The parameters (fields) area begins immediately after the anchor area.
  let fieldAreaTop = titleHeight + (maxAnchors * anchorSpacing);
  
  let nodeId = "node_" + (++window.nodeCounter);  // Global node counter.
  let $node = $(`
    <div class="node" data-id="${nodeId}" data-type="${type}" 
         style="width:150px; height:${nodeHeight}px; background:#444; color:white; padding: ${fieldAreaTop}px 10px 10px 30px; position:absolute;">
      <div class="node-title" style="position:absolute; top:0; left:0; width:100%; height:${titleHeight}px; text-align:center; line-height:${titleHeight}px; border-bottom:1px solid #666;">
        ${type}
      </div>
      <div class="parameters"></div>
    </div>
  `);
  // Position relative to #workflow.
  $node.css({ left: x, top: y });
  let $params = $node.find(".parameters");
  $params.empty();

  if (def.parameters && def.parameters.length > 0) {
    if (type === "Result Node") {
      def.parameters.forEach(function(param) {
        if (param.type === "int") {
          $params.append(
            `<input type="number" class="param-${param.name}" value="${param.default}" placeholder="${param.name}" readonly style="width:100%; margin-bottom:2px;">`
          );
        } else if (param.type === "text") {
          $params.append(
            `<input type="text" class="param-${param.name}" value="${param.default}" placeholder="${param.name}" readonly style="width:100%; margin-bottom:2px;">`
          );
        } else if (param.type === "dropdown") {
          let optionsHtml = "";
          if (param.options && Array.isArray(param.options)) {
            param.options.forEach(function(opt) {
              optionsHtml += `<option value="${opt}" ${opt === param.default ? "selected" : ""}>${opt}</option>`;
            });
          }
          $params.append(
            `<select class="param-${param.name}" disabled style="width:100%; margin-bottom:2px;">${optionsHtml}</select>`
          );
        }
      });
    } else {
      def.parameters.forEach(function(param) {
        if (param.type === "int") {
          $params.append(
            `<input type="number" class="param-${param.name}" value="${param.default}" placeholder="${param.name}" style="width:100%; margin-bottom:2px;">`
          );
        } else if (param.type === "text") {
          $params.append(
            `<input type="text" class="param-${param.name}" value="${param.default}" placeholder="${param.name}" style="width:100%; margin-bottom:2px;">`
          );
        } else if (param.type === "dropdown") {
          let optionsHtml = "";
          if (param.options && Array.isArray(param.options)) {
            param.options.forEach(function(opt) {
              optionsHtml += `<option value="${opt}" ${opt === param.default ? "selected" : ""}>${opt}</option>`;
            });
          }
          $params.append(
            `<select class="param-${param.name}" style="width:100%; margin-bottom:2px;">${optionsHtml}</select>`
          );
        }
      });
    }
  }
  
  // Create Anchor Points and Labels.
  if (def.inputs && def.inputs.length > 0) {
    def.inputs.forEach(function(inp, index) {
      let posY = anchorAreaTop + index * anchorSpacing;
      let $anchor = $(`
        <div class="anchor input" data-anchor="${inp.name}" style="position:absolute; left:-8px; top:${posY}px; cursor:pointer;"></div>
      `);
      let $label = $(`
        <span class="anchor-label" style="position:absolute; left:12px; top:${posY + 1}px; font-size:10px; color:#fff; pointer-events:none;">
          ${inp.name}
        </span>
      `);
      $node.append($anchor);
      $node.append($label);
    });
  }
  if (def.outputs && def.outputs.length > 0) {
    def.outputs.forEach(function(outp, index) {
      let posY = anchorAreaTop + index * anchorSpacing;
      let $anchor = $(`
        <div class="anchor output" data-anchor="${outp.name}" style="position:absolute; right:-8px; top:${posY}px; cursor:pointer;"></div>
      `);
      let $label = $(`
        <span class="anchor-label" style="position:absolute; right:12px; top:${posY + 1}px; font-size:10px; color:#fff; pointer-events:none;">
          ${outp.name}
        </span>
      `);
      $node.append($anchor);
      $node.append($label);
    });
  }
  
  // Append the node to the workflow container.
  $("#workflow").append($node);
  window.nodes[nodeId] = $node;
  
  // Attach mousedown handler to anchors to start wiring.
  $node.find(".anchor").on("mousedown", function(ev) {
    if (ev.which !== 1) return;
    ev.stopPropagation();
    let $anchor = $(this);
    selectAnchor($anchor);
    console.log("Anchor selected:", $anchor.attr("data-anchor"));
    // Create the SVG path for wiring.
    window.currentWireLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    window.currentWireLine.setAttribute("stroke", "#fff");
    window.currentWireLine.setAttribute("stroke-width", "2");
    window.currentWireLine.setAttribute("fill", "none");
    let svg = document.getElementById("svgOverlay");
    svg.appendChild(window.currentWireLine);
    // Get the anchor's center (using getAnchorCenter from utils.js).
    let pos = getAnchorCenter($anchor);
    // Store the starting anchor element reference.
    window.currentWire = {
      fromNode: $anchor.closest(".node"),
      fromAnchor: $anchor.attr("data-anchor"),
      fromType: $anchor.hasClass("output") ? "output" : "input",
      fromAnchorElement: $anchor, // store reference
      startX: pos.x,
      startY: pos.y
    };
    // Start with a zero-length path.
    window.currentWireLine.setAttribute("d", updateWirePath(pos.x, pos.y, pos.x, pos.y));
  });
  
  // Attach contextmenu handler on node for right-click to delete node.
  $node.on("contextmenu", function(ev) {
    ev.preventDefault();
    if ($(this).hasClass("selected") && window.showContextMenu) {
      window.showContextMenu(ev.pageX, ev.pageY, $(this));
    }
  });
  
  // Attach contextmenu handler on anchors for right-click to delete wire.
  $node.find(".anchor").on("contextmenu", function(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    let $anchor = $(this);
    let anchorName = $anchor.attr("data-anchor");
    let $parentNode = $anchor.closest(".node");
    let nodeId = $parentNode.data("id");
    let connection = window.wires.find(function(w) {
      return (w.fromNode === nodeId && w.fromAnchor === anchorName) ||
             (w.toNode === nodeId && w.toAnchor === anchorName);
    });
    if (connection && window.showAnchorContextMenu) {
      window.showAnchorContextMenu(ev.pageX, ev.pageY, $anchor, connection);
    }
  });
  
  // Attach normal mousedown handler for node selection.
  $node.on("mousedown", function(ev) {
    if ($(ev.target).closest(".anchor").length > 0 || $(ev.target).closest(".anchor-label").length > 0) {
      return;
    }
    if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") return;
    if (ev.which === 1) {
      selectNode($(this));
      ev.stopPropagation();
    }
  });
  
  makeDraggable($node);
  return $node;
}

// Function to select a node (adds a blue border and deselects others).
function selectNode($node) {
  $(".node").removeClass("selected");
  $node.addClass("selected");
  if (window.removeContextMenu) {
    window.removeContextMenu();
  }
}

// Function to select an anchor (adds a blue border to the anchor).
function selectAnchor($anchor) {
  $(".anchor").removeClass("selected");
  $anchor.addClass("selected");
}

// Function to update wires connected to a node.
function updateWiresForNode($node) {
  let nodeId = $node.data("id");
  window.wires.forEach(function(w) {
    if (w.fromNode === nodeId) {
      let $fromAnchor = $node.find(`.anchor.output[data-anchor="${w.fromAnchor}"]`);
      let pos = getAnchorCenter($fromAnchor);
      w.lineStartX = pos.x;
      w.lineStartY = pos.y;
      let $toNode = window.nodes[w.toNode];
      if ($toNode) {
        let $toAnchor = $toNode.find(`.anchor.input[data-anchor="${w.toAnchor}"]`);
        let endPos = getAnchorCenter($toAnchor);
        w.line.setAttribute("d", updateWirePath(pos.x, pos.y, endPos.x, endPos.y));
      }
    }
    if (w.toNode === nodeId) {
      let $toAnchor = $node.find(`.anchor.input[data-anchor="${w.toAnchor}"]`);
      let pos = getAnchorCenter($toAnchor);
      let startX = w.lineStartX || 0;
      let startY = w.lineStartY || 0;
      w.line.setAttribute("d", updateWirePath(startX, startY, pos.x, pos.y));
    }
  });
}

// Helper function to get the center of an anchor element in workflow coordinates.
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

// Export functions and constants.
export { addNode, titleHeight, anchorAreaTop, anchorSpacing, updateWiresForNode, selectNode, selectAnchor };
