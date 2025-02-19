const $ = window.jQuery || window.$;

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

export function removeContextMenu() {
  $(".context-menu").remove();
}

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
