$(document).ready(function() {
  // Global variables
  let nodeCounter = 0;
  let nodes = {};      // Map nodeId -> node DOM element
  let wires = [];      // Array to hold wiring info objects
  let currentWire = null;  // For wiring in progress (stores start info)
  let currentWireLine = null; // SVG path element in progress

  // Global storage for node definitions fetched from the backend.
  // Maps a node type (title) to its definition (including parameters_def, inputs, outputs).
  let nodeDefinitions = {};

  // Populate the library menu by fetching node definitions from the backend.
  $.getJSON("/api/nodes")
    .done(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(function(def) {
          nodeDefinitions[def.title] = def;
          $("#library").append(
            `<li draggable="true" class="library-item" data-type="${def.title}">${def.title}</li>`
          );
        });
        // Attach dragstart event using delegation.
        $("#library").on("dragstart", "li.library-item", function(ev) {
          ev.originalEvent.dataTransfer.setData("text/plain", $(this).data("type"));
        });
      } else {
        console.error("No node definitions returned from /api/nodes. Please ensure your Python backend returns a proper JSON array.");
      }
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      console.error("Error loading node definitions:", textStatus, errorThrown);
    });

  // Canvas drop events.
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

  // Helper: Compute an S-shaped (cubic Bézier) path given start and end coordinates.
  function updateWirePath(x1, y1, x2, y2) {
    let dx = (x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  // Function to create and add a node to the canvas.
  function addNode(type, x, y) {
    let nodeId = "node_" + (++nodeCounter);
    let $node = $(`
      <div class="node" data-id="${nodeId}" data-type="${type}">
        <strong>${type}</strong>
        <div class="parameters"></div>
      </div>
    `);
    $node.css({ left: x, top: y });
    let $params = $node.find(".parameters");
    $params.empty();
    let def = nodeDefinitions[type];
    if (def) {
      if (type === "Result Node") {
        // For Result Node, create a readonly input field for each parameter.
        if (def.parameters && def.parameters.length > 0) {
          def.parameters.forEach(function(param) {
            if (param.type === "int") {
              $params.append(
                `<input type="number" class="param-${param.name}" value="${param.default}" placeholder="${param.name}" readonly>`
              );
            } else if (param.type === "text") {
              $params.append(
                `<input type="text" class="param-${param.name}" value="${param.default}" placeholder="${param.name}" readonly>`
              );
            } else if (param.type === "dropdown") {
              let optionsHtml = "";
              if (param.options && Array.isArray(param.options)) {
                param.options.forEach(function(opt) {
                  optionsHtml += `<option value="${opt}" ${opt === param.default ? "selected" : ""}>${opt}</option>`;
                });
              }
              $params.append(
                `<select class="param-${param.name}" disabled>${optionsHtml}</select>`
              );
            }
          });
        }
      } else {
        // For other nodes, create editable parameter fields.
        if (def.parameters && def.parameters.length > 0) {
          def.parameters.forEach(function(param) {
            if (param.type === "int") {
              $params.append(
                `<input type="number" class="param-${param.name}" value="${param.default}" placeholder="${param.name}">`
              );
            } else if (param.type === "text") {
              $params.append(
                `<input type="text" class="param-${param.name}" value="${param.default}" placeholder="${param.name}">`
              );
            } else if (param.type === "dropdown") {
              let optionsHtml = "";
              if (param.options && Array.isArray(param.options)) {
                param.options.forEach(function(opt) {
                  optionsHtml += `<option value="${opt}" ${opt === param.default ? "selected" : ""}>${opt}</option>`;
                });
              }
              $params.append(
                `<select class="param-${param.name}">${optionsHtml}</select>`
              );
            }
          });
        }
      }
    } else {
      console.error("No definition found for node type:", type);
    }

    // Dynamically create anchor points based on the node definition.
    // Assume a default node height of 120px with a margin of 10px.
    let defaultHeight = 120;
    let margin = 10;
    let availableHeight = defaultHeight - 2 * margin;
    if (def) {
      // Create input anchors on the left.
      let inputs = def.inputs || [];
      inputs.forEach(function(inp, index) {
        let posY = margin + availableHeight * (index + 1) / (inputs.length + 1);
        $node.append(`<div class="anchor input" data-anchor="${inp.name}" style="left:-8px; top:${posY}px;"></div>`);
      });
      // Create output anchors on the right.
      let outputs = def.outputs || [];
      outputs.forEach(function(outp, index) {
        let posY = margin + availableHeight * (index + 1) / (outputs.length + 1);
        $node.append(`<div class="anchor output" data-anchor="${outp.name}" style="right:-8px; top:${posY}px;"></div>`);
      });
    } else {
      console.error("Falling back: No anchor information available for node type", type);
    }

    $("#canvas").append($node);
    nodes[nodeId] = $node;
    makeDraggable($node);

    // Node selection.
    $node.on("mousedown", function(ev) {
      if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") return;
      if (ev.which === 1) {
        selectNode($(this));
        ev.stopPropagation();
      }
    });

    // Node context menu.
    $node.on("contextmenu", function(ev) {
      ev.preventDefault();
      if ($(this).hasClass("selected")) {
        showContextMenu(ev.pageX, ev.pageY, $(this));
      }
    });

    // Wiring: left-click on an anchor starts wiring.
    $node.find(".anchor").on("mousedown", function(ev) {
      if (ev.which !== 1) return;
      ev.stopPropagation();
      let $anchor = $(this);
      // Create a new SVG path element for the wire.
      currentWireLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
      currentWireLine.setAttribute("stroke", "#fff");
      currentWireLine.setAttribute("stroke-width", "2");
      currentWireLine.setAttribute("fill", "none");
      let svg = document.getElementById("svgOverlay");
      svg.appendChild(currentWireLine);
      let pos = getAnchorCenter($anchor);
      // Store starting coordinates in currentWire.
      currentWire = {
        fromNode: $anchor.closest(".node"),
        fromAnchor: $anchor.attr("data-anchor"),
        fromType: $anchor.hasClass("output") ? "output" : "input",
        startX: pos.x,
        startY: pos.y
      };
      // Set initial path.
      currentWireLine.setAttribute("d", updateWirePath(currentWire.startX, currentWire.startY, pos.x, pos.y));
    });

    // Right-click on an anchor: select it and, if connected, show context menu to delete its wire.
    $node.find(".anchor").on("contextmenu", function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      let $anchor = $(this);
      selectAnchor($anchor);
      let anchorName = $anchor.attr("data-anchor");
      let $parentNode = $anchor.closest(".node");
      let nodeId = $parentNode.data("id");
      let connection = wires.find(function(w) {
        return (w.fromNode === nodeId && w.fromAnchor === anchorName) ||
               (w.toNode === nodeId && w.toAnchor === anchorName);
      });
      if (connection) {
        showAnchorContextMenu(ev.pageX, ev.pageY, $anchor, connection);
      }
    });
    return $node;
  }

  // Returns the center (x, y) of an anchor element in canvas coordinates.
  function getAnchorCenter($anchor) {
    let offset = $anchor.offset();
    let width = $anchor.outerWidth();
    let height = $anchor.outerHeight();
    let canvasOffset = $("#canvas").offset();
    return {
      x: offset.left - canvasOffset.left + width / 2,
      y: offset.top - canvasOffset.top + height / 2
    };
  }

  // Update the current wire path as the mouse moves.
  $("#canvas").on("mousemove", function(ev) {
    if (currentWireLine && currentWire) {
      let canvasOffset = $(this).offset();
      let x = ev.pageX - canvasOffset.left;
      let y = ev.pageY - canvasOffset.top;
      currentWireLine.setAttribute("d", updateWirePath(currentWire.startX, currentWire.startY, x, y));
    }
  });

  // On mouse up on canvas, complete wiring if dropped on a valid target anchor.
  $("#canvas").on("mouseup", function(ev) {
    if (currentWireLine && currentWire) {
      let targetAnchor = document.elementFromPoint(ev.clientX, ev.clientY);
      if (targetAnchor && $(targetAnchor).hasClass("anchor")) {
        let targetType = $(targetAnchor).hasClass("output") ? "output" : "input";
        if (currentWire.fromType === "output" && targetType === "input") {
          let fromNodeId = currentWire.fromNode.data("id");
          let fromAnchor = currentWire.fromAnchor;
          let toNode = $(targetAnchor).closest(".node");
          let toNodeId = toNode.data("id");
          let toAnchor = $(targetAnchor).attr("data-anchor");
          let pos = getAnchorCenter($(targetAnchor));
          // When the connection is finalized, store the starting coordinates.
          wires.push({
            fromNode: fromNodeId,
            fromAnchor: fromAnchor,
            toNode: toNodeId,
            toAnchor: toAnchor,
            line: currentWireLine,
            lineStartX: currentWire.startX,
            lineStartY: currentWire.startY
          });
          // Finalize the wire path.
          currentWireLine.setAttribute("d", updateWirePath(currentWire.startX, currentWire.startY, pos.x, pos.y));
        } else {
          currentWireLine.remove();
        }
      } else {
        currentWireLine.remove();
      }
    }
    currentWire = null;
    currentWireLine = null;
  });

  // Make nodes draggable.
  function makeDraggable($node) {
    $node.on("mousedown", function(ev) {
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

  // Update positions of wires connected to a node.
  function updateWiresForNode($node) {
    let nodeId = $node.data("id");
    wires.forEach(function(w) {
      if (w.fromNode === nodeId) {
        let $fromAnchor = $node.find(`.anchor.output[data-anchor="${w.fromAnchor}"]`);
        let pos = getAnchorCenter($fromAnchor);
        // Update the starting point and stored coordinates.
        w.lineStartX = pos.x;
        w.lineStartY = pos.y;
        // For updating, we need the current end point from the path.
        // For simplicity, we recalc the path using the stored start and the current end of the wire.
        // Find the to-node's current position:
        let $toNode = nodes[w.toNode];
        if ($toNode) {
          let $toAnchor = $toNode.find(`.anchor.input[data-anchor="${w.toAnchor}"]`);
          let endPos = getAnchorCenter($toAnchor);
          w.line.setAttribute("d", updateWirePath(pos.x, pos.y, endPos.x, endPos.y));
        }
      }
      if (w.toNode === nodeId) {
        let $toAnchor = $node.find(`.anchor.input[data-anchor="${w.toAnchor}"]`);
        let pos = getAnchorCenter($toAnchor);
        // Use stored starting coordinates.
        let startX = w.lineStartX || 0;
        let startY = w.lineStartY || 0;
        w.line.setAttribute("d", updateWirePath(startX, startY, pos.x, pos.y));
      }
    });
  }

  // Node selection.
  function selectNode($node) {
    $(".node").removeClass("selected");
    $node.addClass("selected");
    removeContextMenu();
  }

  // Anchor selection: add a blue border (via a "selected" class).
  function selectAnchor($anchor) {
    $(".anchor").removeClass("selected");
    $anchor.addClass("selected");
  }

  // Deselect nodes and anchors when clicking on the canvas background.
  $("#canvas").on("mousedown", function(ev) {
    if (ev.target.id === "canvas" || ev.target.id === "svgOverlay") {
      $(".node").removeClass("selected");
      $(".anchor").removeClass("selected");
      removeContextMenu();
    }
  });

  // Context menu for nodes.
  function showContextMenu(x, y, $node) {
    removeContextMenu();
    let $menu = $(`
      <div class="context-menu">
        <ul>
          <li id="deleteNode">Delete Node</li>
        </ul>
      </div>
    `);
    $menu.css({ left: x, top: y });
    $("body").append($menu);
    $menu.find("#deleteNode").on("click", function() {
      let nodeId = $node.data("id");
      wires = wires.filter(function(w) {
        if (w.fromNode === nodeId || w.toNode === nodeId) {
          $(w.line).remove();
          return false;
        }
        return true;
      });
      $node.remove();
      removeContextMenu();
    });
  }

  // Context menu for anchors for deleting a connected wire.
  function showAnchorContextMenu(x, y, $anchor, connection) {
    removeContextMenu();
    let $menu = $(`
      <div class="context-menu">
        <ul>
          <li id="deleteWire">Delete Wire</li>
        </ul>
      </div>
    `);
    $menu.css({ left: x, top: y });
    $("body").append($menu);
    $menu.find("#deleteWire").on("click", function() {
      wires = wires.filter(function(w) {
        if (w === connection) {
          $(w.line).remove();
          return false;
        }
        return true;
      });
      removeContextMenu();
    });
  }

  function removeContextMenu() {
    $(".context-menu").remove();
  }
  $(document).on("mousedown", function(ev) {
    if (!$(ev.target).closest(".context-menu").length) {
      removeContextMenu();
    }
  });

  // Start button: Assemble the workflow JSON and send it to the backend.
  $("#startBtn").on("click", function() {
    let workflow = { nodes: [] };
    let nodeConnections = {};
    wires.forEach(function(w) {
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
          // For Result Node, update the readonly input field.
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
});
