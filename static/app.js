$(document).ready(function() {
  // Global variables
  let nodeCounter = 0;
  let nodes = {};      // Map nodeId -> node DOM element
  let wires = [];      // Array to hold wiring info objects
  let currentWire = null;  // For wiring in progress (stores start info)
  let currentWireLine = null; // SVG path element in progress

  // Global storage for node definitions fetched from the backend.
  // Maps a node type (title) to its definition (including parameters, inputs, outputs, category).
  let nodeDefinitions = {};

  // --- Create the Library Popup Dynamically (if not already present) ---
  if ($("#libraryPopup").length === 0) {
    let $libraryPopup = $(`
      <div id="libraryPopup" style="
           position: fixed;
           width: 200px;
           height: 90%;
           background-color: #555;
           color: white;
           overflow-y: auto;
           padding: 10px;
           box-sizing: border-box;
           z-index: 1000;
           display: none;">
        <div id="closeLibraryPopup" style="text-align: right; cursor: pointer; margin-bottom: 10px;">X</div>
        <div id="libraryItems"></div>
      </div>
    `);
    $("body").append($libraryPopup);
  }

  // --- Fetch node definitions from backend and group by category ---
  $.getJSON("/api/nodes")
    .done(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        console.log("Received node definitions:", data);
        // Group nodes by category.
        let groups = {};
        data.forEach(function(def) {
          let cat = def.category || "Uncategorized";
          if (!groups[cat]) {
            groups[cat] = [];
          }
          groups[cat].push(def);
          // Store definition keyed by title.
          nodeDefinitions[def.title] = def;
        });
        // Build the category tree in the library popup.
        for (let category in groups) {
          let $catHeader = $(`
            <div class="library-cat-header" style="background:#666; padding:5px; cursor:pointer; margin-top:5px;">
              ${category} <span style="float:right;">&#9660;</span>
            </div>
          `);
          let $catContainer = $('<div class="library-cat-items" style="padding-left:5px;"></div>');
          groups[category].forEach(function(def) {
            let $item = $(`
              <div class="library-item" style="background: #777; margin: 3px 0; padding: 5px; cursor: move;">
                ${def.title}
              </div>
            `);
            $item.attr("data-type", def.title);
            $catContainer.append($item);
          });
          $("#libraryItems").append($catHeader);
          $("#libraryItems").append($catContainer);
        }
        $(".library-item").attr("draggable", "true");
        $(".library-item").on("dragstart", function(ev) {
          ev.originalEvent.dataTransfer.setData("text/plain", $(this).attr("data-type"));
        });
        $(".library-cat-header").on("click", function() {
          $(this).next(".library-cat-items").slideToggle();
          let $arrow = $(this).find("span");
          if ($arrow.html() === "▼" || $arrow.html() === "&#9660;") {
            $arrow.html("&#9654;");
          } else {
            $arrow.html("&#9660;");
          }
        });
      } else {
        console.error("No node definitions returned from /api/nodes. Check your backend.");
      }
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      console.error("Error loading node definitions:", textStatus, errorThrown);
    });

  // --- Position the Library Popup Relative to the Sidebar ---
  $(document).ready(function(){
    $("#libraryButton").on("click", function(){
       let sidebarOffset = $("#sidebar").offset();
       let sidebarWidth = $("#sidebar").outerWidth(true);
       // Position the popup so its left edge is exactly at the right edge of the sidebar.
       $("#libraryPopup").css({
          left: (sidebarOffset.left + sidebarWidth) + "px",
          top: sidebarOffset.top + "px"
       });
       $("#libraryPopup").show();
    });
    $("#closeLibraryPopup").on("click", function(){
       $("#libraryPopup").hide();
    });
  });

  // --- Canvas Setup ---
  if ($("#canvas").length === 0) {
    $("body").append('<div id="canvas" style="position: relative; width: 80%; height: 80%; margin: 50px auto; border: 1px solid #ccc;"></div>');
  }
  if ($("#svgOverlay").length === 0) {
    $("#canvas").append('<svg id="svgOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></svg>');
  }

  // --- Canvas Drag & Drop for Nodes ---
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

  // --- Helper: Compute S-shaped Bézier path ---
  function updateWirePath(x1, y1, x2, y2) {
    let dx = (x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  // --- Function to Create and Add a Node to the Canvas ---
  function addNode(type, x, y) {
    let nodeId = "node_" + (++nodeCounter);
    let $node = $(`
      <div class="node" data-id="${nodeId}" data-type="${type}" style="width:150px; height:120px; background:#444; color:white; padding:10px 10px 10px 30px; position:absolute;">
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
        if (def.parameters && def.parameters.length > 0) {
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
        }
      } else {
        if (def.parameters && def.parameters.length > 0) {
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
    } else {
      console.error("No definition found for node type:", type);
    }
    
    // Dynamically create anchor points based on def.inputs and def.outputs.
    let defaultHeight = 120;
    let margin = 10;
    let availableHeight = defaultHeight - 2 * margin;
    if (def) {
      let inputs = def.inputs || [];
      inputs.forEach(function(inp, index) {
        let posY = margin + availableHeight * (index + 1) / (inputs.length + 1);
        $node.append(`<div class="anchor input" data-anchor="${inp.name}" style="position:absolute; left:-8px; top:${posY}px; background:#00aa00; border-radius:50%; border:2px solid #fff; cursor:pointer;"></div>`);
      });
      let outputs = def.outputs || [];
      outputs.forEach(function(outp, index) {
        let posY = margin + availableHeight * (index + 1) / (outputs.length + 1);
        $node.append(`<div class="anchor output" data-anchor="${outp.name}" style="position:absolute; right:-8px; top:${posY}px; background:#aa0000; border-radius:50%; border:2px solid #fff; cursor:pointer;"></div>`);
      });
    } else {
      console.error("No anchor information available for node type", type);
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
    
    // Wiring: left-click on an anchor starts wiring and also selects the anchor.
    $node.find(".anchor").on("mousedown", function(ev) {
      if (ev.which !== 1) return;
      ev.stopPropagation();
      let $anchor = $(this);
      // Use left-click to select the anchor.
      selectAnchor($anchor);
      // Start wiring.
      currentWireLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
      currentWireLine.setAttribute("stroke", "#fff");
      currentWireLine.setAttribute("stroke-width", "2");
      currentWireLine.setAttribute("fill", "none");
      let svg = document.getElementById("svgOverlay");
      svg.appendChild(currentWireLine);
      let pos = getAnchorCenter($anchor);
      currentWire = {
        fromNode: $anchor.closest(".node"),
        fromAnchor: $anchor.attr("data-anchor"),
        fromType: $anchor.hasClass("output") ? "output" : "input",
        startX: pos.x,
        startY: pos.y
      };
      currentWireLine.setAttribute("d", updateWirePath(currentWire.startX, currentWire.startY, pos.x, pos.y));
    });
    
    // Right-click on an anchor: show the context menu for deleting its wire.
    $node.find(".anchor").on("contextmenu", function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      let $anchor = $(this);
      // Do not select the anchor on right-click.
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
          wires.push({
            fromNode: fromNodeId,
            fromAnchor: fromAnchor,
            toNode: toNodeId,
            toAnchor: toAnchor,
            line: currentWireLine,
            lineStartX: currentWire.startX,
            lineStartY: currentWire.startY
          });
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
        w.lineStartX = pos.x;
        w.lineStartY = pos.y;
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
  
  // Anchor selection: add a blue border by adding the "selected" class.
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
      <div class="context-menu" style="position:fixed; background:#ccc; padding:5px; border:1px solid #999; z-index:2000;">
        <ul style="list-style:none; margin:0; padding:0;">
          <li id="deleteNode" style="cursor:pointer;">Delete Node</li>
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
  
  // Context menu for anchors to delete a connected wire.
  function showAnchorContextMenu(x, y, $anchor, connection) {
    removeContextMenu();
    let $menu = $(`
      <div class="context-menu" style="position:fixed; background:#ccc; padding:5px; border:1px solid #999; z-index:2000;">
        <ul style="list-style:none; margin:0; padding:0;">
          <li id="deleteWire" style="cursor:pointer;">Delete Wire</li>
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
  
  // If Start button does not exist, create one.
  if ($("#startBtn").length === 0) {
    $("body").append('<button id="startBtn" style="position:fixed; bottom:10px; right:10px; padding:10px; width:100px; height:30px;">Start</button>');
  }
});
