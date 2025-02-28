// library.js - Node library management
const $ = window.jQuery || window.$;

/**
 * Initializes the library popup and populates it with node definitions
 * fetched from the backend API.
 */
export function initLibrary() {
  // Create library popup if it doesn't exist
  if ($("#libraryPopup").length === 0) {
    $("body").append(`
      <div id="libraryPopup">
        <div id="closeLibraryPopup">X</div>
        <div id="libraryItems"></div>
      </div>
    `);
  }

  // Fetch node definitions from backend
  $.getJSON("/api/nodes")
    .done(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        console.log("Received node definitions:", data);
        
        // Group nodes by category
        let groups = {};
        data.forEach(function(def) {
          let cat = def.category || "Uncategorized";
          if (!groups[cat]) {
            groups[cat] = [];
          }
          groups[cat].push(def);
          
          // Store definition in global nodeDefinitions
          window.nodeDefinitions = window.nodeDefinitions || {};
          window.nodeDefinitions[def.title] = def;
        });
        
        // Create category sections in library popup
        for (let category in groups) {
          // Category header
          let $catHeader = $(`
            <div class="library-cat-header">
              ${category} <span style="float:right;">&#9660;</span>
            </div>
          `);
          
          // Container for items in this category
          let $catContainer = $('<div class="library-cat-items" style="padding-left:5px;"></div>');
          
          // Create items for each node definition
          groups[category].forEach(function(def) {
            let $item = $(`
              <div class="library-item">${def.title}</div>
            `);
            $item.attr("data-type", def.title);
            $catContainer.append($item);
          });
          
          // Add to library popup
          $("#libraryItems").append($catHeader);
          $("#libraryItems").append($catContainer);
        }
        
        // Make library items draggable
        $(".library-item").attr("draggable", "true");
        $(".library-item").on("dragstart", function(ev) {
          ev.originalEvent.dataTransfer.setData("text/plain", $(this).attr("data-type"));
        });
        
        // Toggle category containers when header clicked
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

  // Show/hide library popup
  $("#libraryButton").on("click", function() {
    let sidebarOffset = $("#sidebar").offset();
    let sidebarWidth = $("#sidebar").outerWidth(true);
    
    $("#libraryPopup").css({
      left: (sidebarOffset.left + sidebarWidth) + "px",
      top: sidebarOffset.top + "px"
    });
    
    $("#libraryPopup").show();
  });
  
  $("#closeLibraryPopup").on("click", function() {
    $("#libraryPopup").hide();
  });
}