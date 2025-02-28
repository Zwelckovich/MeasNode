// contextMenu.js - Right-click context menu functionality
const $ = window.jQuery || window.$;

/**
 * Shows a context menu for a node with delete option
 * @param {number} x - X position for menu
 * @param {number} y - Y position for menu
 * @param {jQuery} $node - The node element that was right-clicked
 */
export function showContextMenu(x, y, $node) {
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
    if ($node.hasClass("selected")) {
      $(".node.selected").each(function() {
        deleteNode($(this));
      });
    } else {
      deleteNode($node);
    }
    removeContextMenu();
  });
}

/**
 * Shows a context menu for an anchor with wire delete option
 * @param {number} x - X position for menu
 * @param {number} y - Y position for menu
 * @param {jQuery} $anchor - The anchor element that was right-clicked
 * @param {Object} connection - The wire connection data
 */
export function showAnchorContextMenu(x, y, $anchor, connection) {
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

/**
 * Removes any open context menu
 */
export function removeContextMenu() {
  $(".context-menu").remove();
}

/**
 * Deletes a node and its connected wires
 * @param {jQuery} $node - The node to delete
 */
function deleteNode($node) {
  const nodeId = $node.data("id");
  window.wires = window.wires.filter(function(w) {
    if (w.fromNode === nodeId || w.toNode === nodeId) {
      $(w.line).remove();
      return false;
    }
    return true;
  });
  $node.remove();
}

// Close context menu when clicking outside
$(document).on("mousedown", function(ev) {
  if (!$(ev.target).closest(".context-menu").length) {
    removeContextMenu();
  }
});