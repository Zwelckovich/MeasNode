// contextMenu.js
const $ = window.jQuery || window.$;

export function showContextMenu(x, y, $node) {
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
    // If the right-clicked node is selected, delete all selected nodes.
    if ($node.hasClass("selected")) {
      $(".node.selected").each(function() {
        deleteNode($(this));
      });
    } else {
      // Otherwise, delete only the node that was right-clicked.
      deleteNode($node);
    }
    removeContextMenu();
  });
}

export function showAnchorContextMenu(x, y, $anchor, connection) {
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
    window.wires = window.wires.filter(function(w) {
      if (w === connection) {
        $(w.line).remove();
        return false;
      }
      return true;
    });
    removeContextMenu();
  });
}

export function removeContextMenu() {
  $(".context-menu").remove();
}

// Helper function to delete a node and remove its associated wires.
function deleteNode($node) {
  const nodeId = $node.data("id");
  // Remove wires connected to this node.
  window.wires = window.wires.filter(function(w) {
    if (w.fromNode === nodeId || w.toNode === nodeId) {
      $(w.line).remove();
      return false;
    }
    return true;
  });
  // Remove the node element.
  $node.remove();
}
