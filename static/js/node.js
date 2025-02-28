// node.js - Node creation and management
import { 
  updateWirePath, 
  getAnchorCenter, 
  getCssVarNumber, 
  computeFieldAreaHeight 
} from "./utils.js";

// Ensure the global nodes object exists
window.nodes = window.nodes || {};

// Global object to store node definitions from the backend
export let nodeDefinitions = {};

// Layout constants from CSS variables
const titleHeight = getCssVarNumber("node-title-height", 30);
const anchorAreaTop = getCssVarNumber("anchor-area-top", 35);
const anchorSpacing = getCssVarNumber("anchor-spacing", 20);
const nodeWidth = getCssVarNumber("node-width", 150);

// Main function to create and add a node to the workflow
function addNode(type, x, y) {
  let def = nodeDefinitions[type];
  if (!def) {
    console.error("No definition found for node type:", type);
    return null;
  }
  
  let numInputs = def.inputs ? def.inputs.length : 0;
  let numOutputs = def.outputs ? def.outputs.length : 0;
  let maxAnchors = Math.max(numInputs, numOutputs);
  let numFields = def.parameters && def.parameters.length ? def.parameters.length : 0;
  let fieldAreaHeight = computeFieldAreaHeight(numFields);
  
  // Total node height = title area + anchor area + field area
  let nodeHeight = titleHeight + (maxAnchors * anchorSpacing) + fieldAreaHeight;
  
  // The parameters (fields) area begins after the anchor area
  let fieldAreaTop = titleHeight + (maxAnchors * anchorSpacing);
  
  let nodeId = "node_" + (++window.nodeCounter);
  let $node = $(`
    <div class="node" data-id="${nodeId}" data-type="${type}" 
         style="width:${nodeWidth}px; height:${nodeHeight}px; padding-top:${fieldAreaTop}px;">
      <div class="node-title">${type}</div>
      <div class="parameters"></div>
    </div>
  `);
  
  // Position relative to #workflow
  $node.css({ left: x, top: y });
  let $params = $node.find(".parameters");
  $params.empty();

  // Create parameter fields based on node type
  if (def.parameters && def.parameters.length > 0) {
    const isResultNode = type === "Result Node";
    
    def.parameters.forEach(function(param) {
      if (param.type === "int") {
        $params.append(`
          <input type="number" class="param-${param.name}" value="${param.default}" 
                 placeholder="${param.name}" ${isResultNode ? 'readonly' : ''}>
        `);
      } else if (param.type === "text") {
        $params.append(`
          <input type="text" class="param-${param.name}" value="${param.default}" 
                 placeholder="${param.name}" ${isResultNode ? 'readonly' : ''}>
        `);
      } else if (param.type === "dropdown") {
        let optionsHtml = "";
        if (param.options && Array.isArray(param.options)) {
          param.options.forEach(function(opt) {
            optionsHtml += `<option value="${opt}" ${opt === param.default ? "selected" : ""}>${opt}</option>`;
          });
        }
        
        $params.append(`
          <select class="param-${param.name}" ${isResultNode ? 'disabled' : ''}>${optionsHtml}</select>
        `);
      }
    });
  }
  
  // Create anchor points and labels
  if (def.inputs && def.inputs.length > 0) {
    def.inputs.forEach(function(inp, index) {
      let posY = anchorAreaTop + index * anchorSpacing;
      let $anchor = $(`<div class="anchor input" data-anchor="${inp.name}"></div>`);
      let $label = $(`<span class="anchor-label left-label">${inp.name}</span>`);
      
      $anchor.css({ top: posY });
      $label.css({ top: posY + 1 });
      
      $node.append($anchor);
      $node.append($label);
    });
  }
  
  if (def.outputs && def.outputs.length > 0) {
    def.outputs.forEach(function(outp, index) {
      let posY = anchorAreaTop + index * anchorSpacing;
      let $anchor = $(`<div class="anchor output" data-anchor="${outp.name}"></div>`);
      let $label = $(`<span class="anchor-label right-label">${outp.name}</span>`);
      
      $anchor.css({ top: posY });
      $label.css({ top: posY + 1 });
      
      $node.append($anchor);
      $node.append($label);
    });
  }
  
  // Append the node to the workflow container
  $("#workflow").append($node);
  window.nodes[nodeId] = $node;
  
  // Attach event handlers
  $node.find(".anchor").on("mousedown", handleAnchorMouseDown);
  $node.find(".anchor").on("contextmenu", handleAnchorContextMenu);
  $node.on("contextmenu", handleNodeContextMenu);
  $node.on("mousedown", handleNodeMouseDown);
  
  // Make the node draggable
  if (window.makeDraggable) {
    window.makeDraggable($node);
  }
  
  return $node;
}

// Handler for anchor mousedown - starts wiring
function handleAnchorMouseDown(ev) {
  if (ev.which !== 1) return;
  ev.stopPropagation();
  
  let $anchor = $(this);
  selectAnchor($anchor);
  console.log("Anchor selected:", $anchor.attr("data-anchor"));
  
  // Create the SVG path for wiring
  window.currentWireLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
  window.currentWireLine.setAttribute("stroke", "#fff");
  window.currentWireLine.setAttribute("stroke-width", "2");
  window.currentWireLine.setAttribute("fill", "none");
  
  let svg = document.getElementById("svgOverlay");
  svg.appendChild(window.currentWireLine);
  
  // Get the anchor's center
  let pos = getAnchorCenter($anchor);
  
  // Store the starting anchor info
  window.currentWire = {
    fromNode: $anchor.closest(".node"),
    fromAnchor: $anchor.attr("data-anchor"),
    fromType: $anchor.hasClass("output") ? "output" : "input",
    fromAnchorElement: $anchor,
    startX: pos.x,
    startY: pos.y
  };
  
  // Start with a zero-length path
  window.currentWireLine.setAttribute("d", updateWirePath(pos.x, pos.y, pos.x, pos.y));
}

// Handler for anchor right-click - show wire delete menu
function handleAnchorContextMenu(ev) {
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
}

// Handler for node right-click - show node delete menu
function handleNodeContextMenu(ev) {
  ev.preventDefault();
  if ($(this).hasClass("selected") && window.showContextMenu) {
    window.showContextMenu(ev.pageX, ev.pageY, $(this));
  }
}

// Handler for node mousedown - select node with multi-select support
function handleNodeMouseDown(ev) {
  if ($(ev.target).closest(".anchor").length > 0 || 
      $(ev.target).closest(".anchor-label").length > 0) {
    return;
  }
  
  if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") return;
  
  if (ev.which === 1) {
    // If CTRL is held, toggle selection; otherwise, if multiple nodes are already 
    // selected, keep group selection intact
    if (ev.ctrlKey) {
      if ($(this).hasClass("selected")) {
        $(this).removeClass("selected");
      } else {
        $(this).addClass("selected");
      }
    } else {
      // If more than one node is already selected, do not clear the selection
      // Otherwise, clear any existing selection and select this node
      if ($(".node.selected").length <= 1) {
        selectNode($(this));
      }
    }
    ev.stopPropagation();
  }
}

// Function to select a node (clears selection and selects the given node)
function selectNode($node) {
  $(".node").removeClass("selected");
  $node.addClass("selected");
  if (window.removeContextMenu) {
    window.removeContextMenu();
  }
}

// Function to select an anchor (adds a blue border to the anchor)
function selectAnchor($anchor) {
  $(".anchor").removeClass("selected");
  $anchor.addClass("selected");
}

// Function to update wires connected to a node
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

// Export functions and constants
export { 
  addNode, 
  titleHeight, 
  anchorAreaTop, 
  anchorSpacing, 
  updateWiresForNode, 
  selectNode, 
  selectAnchor 
};