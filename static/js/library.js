// library.js - Node library management with tree structure and search
const $ = window.jQuery || window.$;

/**
 * Initializes the library popup and populates it with node definitions
 * fetched from the backend API in a tree-like structure with search.
 */
export function initLibrary() {
  // Create library popup if it doesn't exist
  if ($("#libraryPopup").length === 0) {
    $("body").append(`
      <div id="libraryPopup">
        <div id="library-header">
          <div id="closeLibraryPopup" title="Close">×</div>
          <div id="searchContainer">
            <input type="text" id="nodeSearch" placeholder="Search nodes...">
            <button id="clearSearch" title="Clear search">×</button>
          </div>
        </div>
        <div id="libraryTree"></div>
      </div>
    `);
  }

  // Fetch node definitions from backend
  $.getJSON("/api/nodes")
    .done(function (data) {
      if (Array.isArray(data) && data.length > 0) {
        console.log("Received node definitions:", data);

        // Group nodes by category
        let groups = {};
        data.forEach(function (def) {
          let cat = def.category || "Uncategorized";
          if (!groups[cat]) {
            groups[cat] = [];
          }
          groups[cat].push(def);

          // Store definition in global nodeDefinitions
          window.nodeDefinitions = window.nodeDefinitions || {};
          window.nodeDefinitions[def.title] = def;
        });

        // Create tree structure in library popup
        const $libraryTree = $("#libraryTree");
        $libraryTree.empty();

        // Sort categories alphabetically
        const sortedCategories = Object.keys(groups).sort();

        sortedCategories.forEach(function (category) {
          // Category folder item
          const $categoryItem = $(`
            <div class="tree-category">
              <div class="tree-folder">
                <span class="tree-toggle">▶</span>
                <span class="tree-folder-icon">📁</span>
                <span class="tree-folder-name">${category}</span>
              </div>
              <div class="tree-items" style="display: none;"></div>
            </div>
          `);

          const $itemsContainer = $categoryItem.find(".tree-items");

          // Sort nodes within category alphabetically
          const sortedNodes = groups[category].sort((a, b) =>
            a.title.localeCompare(b.title)
          );

          // Create items for each node definition
          sortedNodes.forEach(function (def) {
            const $item = $(`
              <div class="tree-item" data-type="${def.title}" draggable="true">
                <span class="tree-node-icon">📄</span>
                <span class="tree-node-name">${def.title}</span>
              </div>
            `);

            // Store the full definition in data attribute for search
            $item.data("nodedef", JSON.stringify(def));
            $itemsContainer.append($item);
          });

          $libraryTree.append($categoryItem);
        });

        // Toggle folders when clicked - make the entire tree-folder div clickable
        $("#libraryPopup .tree-folder").on("click", function () {
          const $category = $(this).closest(".tree-category");
          const $toggle = $category.find(".tree-toggle");
          const $items = $category.find(".tree-items");

          if ($items.is(":visible")) {
            $toggle.text("▶");
            $items.slideUp(150);
          } else {
            $toggle.text("▼");
            $items.slideDown(150);
          }
        });

        // Make tree items draggable
        $(".tree-item").on("dragstart", function (ev) {
          ev.originalEvent.dataTransfer.setData("text/plain", $(this).attr("data-type"));
        });

        // Setup search functionality
        setupSearch();
      } else {
        console.error("No node definitions returned from /api/nodes. Check your backend.");
      }
    })
    .fail(function (jqXHR, textStatus, errorThrown) {
      console.error("Error loading node definitions:", textStatus, errorThrown);
    });

  // Show/hide library popup with toggle behavior
  $("#libraryButton").on("click", function () {
    // If library popup is already visible, hide it instead
    if ($("#libraryPopup").hasClass("visible")) {
      $("#libraryPopup").removeClass("visible");
      return;
    }

    // Close project popup if open
    $("#projectPopup").removeClass("visible");

    let sidebarOffset = $("#sidebar").offset();
    let sidebarWidth = $("#sidebar").outerWidth(true);

    $("#libraryPopup").css({
      left: (sidebarOffset.left + sidebarWidth) + "px",
      top: sidebarOffset.top + "px"
    });

    $("#libraryPopup").addClass("visible");
    $("#nodeSearch").focus();
  });

  $("#closeLibraryPopup").on("click", function () {
    $("#libraryPopup").removeClass("visible");
  });
}

/**
 * Sets up the search functionality for the library tree
 */
function setupSearch() {
  // Clear search button
  $("#clearSearch").on("click", function () {
    $("#nodeSearch").val("").trigger("input");
    $("#nodeSearch").focus();
  });

  // Node search functionality
  $("#nodeSearch").on("input", function () {
    const searchTerm = $(this).val().toLowerCase().trim();

    if (searchTerm === "") {
      // Reset the tree view when search is empty
      $("#libraryPopup .tree-category").show();
      $("#libraryPopup .tree-item").show();
      $("#libraryPopup .tree-items").hide();
      $("#libraryPopup .tree-toggle").text("▶");

      // Reset any highlighting
      $("#libraryPopup .tree-node-name").each(function () {
        $(this).text($(this).text());
      });

      return;
    }

    let hasResults = false;

    // Loop through each category in library popup only
    $("#libraryPopup .tree-category").each(function () {
      const $category = $(this);
      const $items = $category.find(".tree-item");
      let categoryHasMatches = false;

      // Check each node in the category
      $items.each(function () {
        const $item = $(this);
        const nodeName = $item.find(".tree-node-name").text().toLowerCase();
        const nodeDefString = $item.data("nodedef") || "{}";
        let nodeDef;

        try {
          nodeDef = JSON.parse(nodeDefString);
        } catch (e) {
          nodeDef = {};
        }

        // Search in node name and properties
        const nameMatch = nodeName.includes(searchTerm);
        const propsMatch = searchInProps(nodeDef, searchTerm);

        if (nameMatch || propsMatch) {
          // Show this item
          $item.show();
          categoryHasMatches = true;
          hasResults = true;

          // Highlight the matching term in the name
          if (nameMatch) {
            highlightText($item.find(".tree-node-name"), searchTerm);
          }
        } else {
          // Hide this item
          $item.hide();
        }
      });

      // Show/hide the category based on whether it has matching items
      if (categoryHasMatches) {
        $category.show();
        $category.find(".tree-items").show();
        $category.find(".tree-toggle").text("▼");
      } else {
        $category.hide();
      }
    });

    // Show a message if no results were found
    if (!hasResults) {
      if ($("#noResultsMessage").length === 0) {
        $("#libraryTree").append(
          '<div id="noResultsMessage" class="no-results">No nodes found matching your search</div>'
        );
      }
    } else {
      $("#noResultsMessage").remove();
    }
  });
}

/**
 * Searches for a term in an object's properties recursively
 * @param {Object} obj - The object to search in
 * @param {string} term - The search term
 * @returns {boolean} True if term is found
 */
function searchInProps(obj, term) {
  if (!obj || typeof obj !== 'object') return false;

  // Check direct properties
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];

      // Check string values
      if (typeof val === 'string' && val.toLowerCase().includes(term)) {
        return true;
      }

      // Check property names
      if (key.toLowerCase().includes(term)) {
        return true;
      }

      // Recurse into objects and arrays
      if (typeof val === 'object' && val !== null) {
        if (searchInProps(val, term)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Highlights search term in text
 * @param {jQuery} $element - The element containing text
 * @param {string} term - The term to highlight
 */
function highlightText($element, term) {
  const text = $element.text();
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();

  if (!lowerText.includes(lowerTerm)) return;

  const parts = [];
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerTerm);

  while (index !== -1) {
    // Add the text before the match
    if (index > lastIndex) {
      parts.push(text.substring(lastIndex, index));
    }

    // Add the highlighted match
    parts.push(`<span class="highlight">${text.substring(index, index + term.length)}</span>`);

    // Update indices
    lastIndex = index + term.length;
    index = lowerText.indexOf(lowerTerm, lastIndex);
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // Replace the element's content
  $element.html(parts.join(''));
}