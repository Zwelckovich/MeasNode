const $ = window.jQuery || window.$;
if (!$) {
  console.error("jQuery is not loaded! Ensure that jQuery is included in your HTML before this module.");
}

export function initLibrary() {
  if ($("#libraryPopup").length === 0) {
    $("body").append(`
      <div id="libraryPopup">
        <div id="closeLibraryPopup">X</div>
        <div id="libraryItems"></div>
      </div>
    `);
  }

  $.getJSON("/api/nodes")
    .done(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        console.log("Received node definitions:", data);
        let groups = {};
        data.forEach(function(def) {
          let cat = def.category || "Uncategorized";
          if (!groups[cat]) {
            groups[cat] = [];
          }
          groups[cat].push(def);
          window.nodeDefinitions = window.nodeDefinitions || {};
          window.nodeDefinitions[def.title] = def;
        });
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

  $("#libraryButton").on("click", function(){
     let sidebarOffset = $("#sidebar").offset();
     let sidebarWidth = $("#sidebar").outerWidth(true);
     $("#libraryPopup").css({
        left: (sidebarOffset.left + sidebarWidth) + "px",
        top: sidebarOffset.top + "px"
     });
     $("#libraryPopup").show();
  });
  $("#closeLibraryPopup").on("click", function(){
     $("#libraryPopup").hide();
  });
}
