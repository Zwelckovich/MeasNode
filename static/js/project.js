// project.js - Project and workflow management
const $ = window.jQuery || window.$;

let currentProject = null;
let currentWorkflow = null;
let hasUnsavedChanges = false;
let lastSavedState = null;

/**
 * Initializes the project management system
 */
export function initProject() {
  createProjectPopup();
  loadProjects();

  // Track changes to detect unsaved state
  trackWorkflowChanges();

  // Load last workflow on startup
  loadLastWorkflow();

  // Set up event listeners
  $("#projectButton").on("click", showProjectPopup);
  $("#closeProjectPopup").on("click", hideProjectPopup);

  // Project management buttons
  $("#newProjectBtn").on("click", createNewProject);
  $("#newWorkflowBtn").on("click", createNewWorkflow);
  $("#saveWorkflowBtn").on("click", saveCurrentWorkflow);
  $("#loadWorkflowBtn").on("click", loadSelectedWorkflow);
  $("#duplicateBtn").on("click", duplicateItem);
  $("#deleteBtn").on("click", deleteItem);
  $("#renameBtn").on("click", renameItem);

  // Project search functionality
  $("#projectSearch").on("input", filterProjects);
  $("#clearProjectSearch").on("click", clearProjectSearch);

  // Handle project/workflow selection with event delegation - scoped to project popup only
  $(document).on("click", "#projectPopup .tree-folder-name", selectProject);
  $(document).on("click", "#projectPopup .workflow-item", selectWorkflow);
}

/**
 * Creates the project popup HTML structure
 */
function createProjectPopup() {
  if ($("#projectPopup").length === 0) {
    $("body").append(`
      <div id="projectPopup">
        <div id="project-header">
          <div id="closeProjectPopup" title="Close">×</div>
          <div id="projectButtons">
            <button id="newProjectBtn" class="project-btn" title="Create New Project">New Project</button>
            <button id="newWorkflowBtn" class="project-btn disabled" title="Create New Workflow">New Workflow</button>
            <button id="saveWorkflowBtn" class="project-btn disabled" title="Save Current Workflow">Save</button>
            <button id="loadWorkflowBtn" class="project-btn disabled" title="Load Selected Workflow">Load</button>
            <button id="duplicateBtn" class="project-btn disabled" title="Duplicate Project or Workflow">Duplicate</button>
            <button id="deleteBtn" class="project-btn disabled" title="Delete Project or Workflow">Delete</button>
            <button id="renameBtn" class="project-btn disabled" title="Rename Project or Workflow">Rename</button>
          </div>
          <div id="searchContainer">
            <input type="text" id="projectSearch" placeholder="Search projects...">
            <button id="clearProjectSearch" title="Clear search">×</button>
          </div>
        </div>
        <div id="projectTree"></div>
      </div>
    `);
  }
}

/**
 * Shows the project popup
 */
async function showProjectPopup() {
  // If project popup is already visible, hide it instead
  if ($("#projectPopup").hasClass("visible")) {
    hideProjectPopup();
    return;
  }

  // Close library popup if open
  $("#libraryPopup").removeClass("visible");

  let sidebarOffset = $("#sidebar").offset();
  let sidebarWidth = $("#sidebar").outerWidth(true);

  $("#projectPopup").css({
    left: (sidebarOffset.left + sidebarWidth) + "px",
    top: sidebarOffset.top + "px"
  });

  $("#projectPopup").addClass("visible");
  $("#projectSearch").focus();

  // Refresh project list to catch any file system changes
  await loadProjects();

  // Restore selection state
  restoreSelectionState();
}

/**
 * Hides the project popup
 */
function hideProjectPopup() {
  $("#projectPopup").removeClass("visible");
}

/**
 * Loads all projects from the backend
 */
async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    const projects = await response.json();
    displayProjects(projects);
  } catch (error) {
    console.error("Error loading projects:", error);
  }
}

/**
 * Displays projects in the tree structure
 */
function displayProjects(projects) {
  const $projectTree = $("#projectTree");
  $projectTree.empty();

  if (projects.length === 0) {
    $projectTree.append('<div class="no-projects">No projects found. Create your first project!</div>');
    return;
  }

  projects.forEach(project => {
    const $projectItem = $(`
      <div class="tree-category project-category" data-project="${project.name}">
        <div class="tree-folder">
          <span class="tree-toggle">▶</span>
          <span class="tree-folder-icon">📁</span>
          <span class="tree-folder-name">${project.name}</span>
        </div>
        <div class="tree-items project-workflows" style="display: none;"></div>
      </div>
    `);

    const $workflowsContainer = $projectItem.find(".project-workflows");

    // Add workflows
    project.workflows.forEach(workflow => {
      const $workflowItem = $(`
        <div class="tree-item workflow-item" data-project="${project.name}" data-workflow="${workflow}">
          <span class="tree-node-icon">📄</span>
          <span class="tree-node-name">${workflow.replace('.json', '')}</span>
        </div>
      `);
      $workflowsContainer.append($workflowItem);
    });

    $projectTree.append($projectItem);
  });

  // Set up folder toggle functionality - scoped to project popup only
  $("#projectPopup .tree-toggle").off("click").on("click", function(e) {
    e.stopPropagation(); // Prevent project selection when clicking toggle
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

  // Set up folder icon click (also toggles) - scoped to project popup only
  $("#projectPopup .tree-folder-icon").off("click").on("click", function(e) {
    e.stopPropagation(); // Prevent project selection
    $(this).siblings(".tree-toggle").click();
  });
}

/**
 * Selects a project
 */
function selectProject(event) {
  // Don't select if clicking on the toggle arrow or folder icon
  if ($(event.target).hasClass('tree-toggle') || $(event.target).hasClass('tree-folder-icon')) {
    return;
  }

  event.stopPropagation();
  const projectName = $(this).closest(".project-category").data("project");

  // Remove previous selection - scoped to project popup
  $("#projectPopup .project-category").removeClass("selected");
  $("#projectPopup .workflow-item").removeClass("selected");

  // Select current project
  $(this).closest(".project-category").addClass("selected");

  currentProject = projectName;
  currentWorkflow = null;
  updateButtonStates();

  console.log("Selected project:", projectName);
}

/**
 * Selects a workflow
 */
function selectWorkflow(event) {
  event.stopPropagation();
  const $item = $(this);
  const projectName = $item.data("project");
  const workflowName = $item.data("workflow");

  // Remove previous selection - scoped to project popup
  $("#projectPopup .project-category").removeClass("selected");
  $("#projectPopup .workflow-item").removeClass("selected");

  // Select current workflow and its project
  $item.addClass("selected");
  $item.closest(".project-category").addClass("selected");

  currentProject = projectName;
  currentWorkflow = workflowName;
  updateButtonStates();

  console.log("Selected workflow:", workflowName, "in project:", projectName);
}

/**
 * Updates button states based on current selection
 */
function updateButtonStates() {
  const hasProject = currentProject !== null;
  const hasWorkflow = currentWorkflow !== null;

  // New Workflow button - enabled if project is selected
  $("#newWorkflowBtn").toggleClass("disabled", !hasProject);

  // Save button - enabled if project is selected
  $("#saveWorkflowBtn").toggleClass("disabled", !hasProject);

  // Load button - enabled if workflow is selected
  $("#loadWorkflowBtn").toggleClass("disabled", !hasWorkflow);

  // Duplicate button - enabled if project or workflow is selected
  $("#duplicateBtn").toggleClass("disabled", !hasProject);

  // Delete button - enabled if project or workflow is selected
  $("#deleteBtn").toggleClass("disabled", !hasProject);

  // Rename button - enabled if project or workflow is selected
  $("#renameBtn").toggleClass("disabled", !hasProject);
}

/**
 * Creates a new project
 */
async function createNewProject() {
  const projectName = prompt("Enter project name:");
  if (!projectName || projectName.trim() === "") return;

  try {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName.trim() })
    });

    if (response.ok) {
      await loadProjects(); // Refresh the project list
      console.log("Created project:", projectName);
    } else {
      const errorData = await response.json();
      alert("Error creating project: " + (errorData.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error creating project:", error);
    alert("Error creating project");
  }
}

/**
 * Creates a new workflow in the selected project
 */
async function createNewWorkflow() {
  if (!currentProject) {
    alert("Please select a project first");
    return;
  }

  const workflowName = prompt("Enter workflow name:");
  if (!workflowName || workflowName.trim() === "") return;

  // Check for unsaved changes
  if (hasUnsavedChanges) {
    if (!confirm("You have unsaved changes. Creating a new workflow will discard them. Continue?")) {
      return;
    }
  }

  try {
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: currentProject,
        name: workflowName.trim()
      })
    });

    if (response.ok) {
      // Clear current workflow
      clearWorkflow();
      currentWorkflow = workflowName.trim() + ".json";
      saveCurrentState();

      // Refresh project list but maintain selection
      await loadProjects();
      restoreSelectionState();

      console.log("Created workflow:", workflowName);
    } else {
      const errorData = await response.json();
      alert("Error creating workflow: " + (errorData.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error creating workflow:", error);
    alert("Error creating workflow");
  }
}

/**
 * Saves the current workflow
 */
async function saveCurrentWorkflow() {
  if (!currentProject) {
    alert("Please select a project first");
    return;
  }

  let workflowName = currentWorkflow;

  // If no workflow is selected, prompt for name
  if (!workflowName) {
    const name = prompt("Enter workflow name:");
    if (!name || name.trim() === "") return;
    workflowName = name.trim() + ".json";
  }

  const workflowData = getCurrentWorkflowData();

  try {
    const response = await fetch("/api/workflows/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: currentProject,
        workflow: workflowName,
        data: workflowData
      })
    });

    if (response.ok) {
      currentWorkflow = workflowName;
      saveCurrentState();
      updateLastWorkflow(currentProject, workflowName);

      // Refresh project list but maintain selection
      await loadProjects();
      restoreSelectionState();

      console.log("Saved workflow:", workflowName);
    } else {
      const errorData = await response.json();
      alert("Error saving workflow: " + (errorData.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error saving workflow:", error);
    alert("Error saving workflow");
  }
}

/**
 * Loads the selected workflow
 */
async function loadSelectedWorkflow() {
  if (!currentProject || !currentWorkflow) {
    alert("Please select a workflow first");
    return;
  }

  // Check for unsaved changes
  if (hasUnsavedChanges) {
    if (!confirm("You have unsaved changes that will be lost. Continue?")) {
      return;
    }
  }

  try {
    const response = await fetch(`/api/workflows/${currentProject}/${currentWorkflow}`);
    if (response.ok) {
      const workflowData = await response.json();
      loadWorkflowData(workflowData);
      saveCurrentState();
      updateLastWorkflow(currentProject, currentWorkflow);
      console.log("Loaded workflow:", currentWorkflow);
    } else {
      const errorData = await response.json();
      alert("Error loading workflow: " + (errorData.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error loading workflow:", error);
    alert("Error loading workflow");
  }
}

/**
 * Restores the selection state in the UI after refreshing projects
 */
function restoreSelectionState() {
  if (currentProject) {
    // Find and select the current project
    const $projectCategory = $(`#projectPopup .project-category[data-project="${currentProject}"]`);
    if ($projectCategory.length) {
      $projectCategory.addClass("selected");

      // Expand the project to show workflows if a workflow is selected
      if (currentWorkflow) {
        const $toggle = $projectCategory.find(".tree-toggle");
        const $items = $projectCategory.find(".tree-items");
        $toggle.text("▼");
        $items.show();

        // Select the current workflow
        const $workflowItem = $(`#projectPopup .workflow-item[data-project="${currentProject}"][data-workflow="${currentWorkflow}"]`);
        if ($workflowItem.length) {
          $workflowItem.addClass("selected");
        }
      }
    }
  }

  updateButtonStates();
}

/**
 * Gets the current workflow data
 */
function getCurrentWorkflowData() {
  const nodes = [];
  const wires = [];

  // Collect node data
  $(".node").each(function() {
    const $node = $(this);
    const nodeData = {
      id: $node.data("id"),
      type: $node.data("type"),
      position: {
        x: parseFloat($node.css("left")),
        y: parseFloat($node.css("top"))
      },
      parameters: {}
    };

    // Collect parameters
    $node.find(".parameters input, .parameters select").each(function() {
      const $input = $(this);
      const className = $input.attr("class") || "";
      const match = className.match(/param-([\w-]+)/);
      if (match) {
        nodeData.parameters[match[1]] = $input.val();
      }
    });

    nodes.push(nodeData);
  });

  // Collect wire data
  window.wires.forEach(wire => {
    wires.push({
      fromNode: wire.fromNode,
      fromAnchor: wire.fromAnchor,
      toNode: wire.toNode,
      toAnchor: wire.toAnchor
    });
  });

  return { nodes, wires };
}

/**
 * Loads workflow data into the editor
 */
function loadWorkflowData(workflowData) {
  // Clear current workflow
  clearWorkflow();

  // Load nodes
  workflowData.nodes.forEach(nodeData => {
    const $node = window.addNode(nodeData.type, nodeData.position.x, nodeData.position.y);
    if ($node) {
      $node.attr("data-id", nodeData.id);
      window.nodes[nodeData.id] = $node;

      // Set parameters
      Object.keys(nodeData.parameters).forEach(paramName => {
        $node.find(`.param-${paramName}`).val(nodeData.parameters[paramName]);
      });
    }
  });

  // Load wires
  workflowData.wires.forEach(wireData => {
    createWireFromData(wireData);
  });
}

/**
 * Clears the current workflow
 */
function clearWorkflow() {
  $("#workflow").empty();
  $("#workflow").append('<svg id="svgOverlay"></svg>');
  window.wires = [];
  window.nodes = {};
}

/**
 * Creates a wire from saved data
 */
function createWireFromData(wireData) {
  const $fromNode = window.nodes[wireData.fromNode];
  const $toNode = window.nodes[wireData.toNode];
  if (!$fromNode || !$toNode) return;

  const $fromAnchor = $fromNode.find(`.anchor.output[data-anchor="${wireData.fromAnchor}"]`);
  const $toAnchor = $toNode.find(`.anchor.input[data-anchor="${wireData.toAnchor}"]`);
  if (!$fromAnchor.length || !$toAnchor.length) return;

  const newLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
  newLine.setAttribute("stroke", "#fff");
  newLine.setAttribute("stroke-width", "2");
  newLine.setAttribute("fill", "none");
  document.getElementById("svgOverlay").appendChild(newLine);

  const startPos = window.getAnchorCenter($fromAnchor);
  const endPos = window.getAnchorCenter($toAnchor);
  newLine.setAttribute("d", window.updateWirePath(startPos.x, startPos.y, endPos.x, endPos.y));

  window.wires.push({
    fromNode: wireData.fromNode,
    fromAnchor: wireData.fromAnchor,
    toNode: wireData.toNode,
    toAnchor: wireData.toAnchor,
    line: newLine,
    lineStartX: startPos.x,
    lineStartY: startPos.y
  });
}

/**
 * Tracks workflow changes to detect unsaved state
 */
function trackWorkflowChanges() {
  // Save initial state
  saveCurrentState();

  // Set up change detection
  setInterval(checkForChanges, 1000);
}

/**
 * Saves the current state for change detection
 */
function saveCurrentState() {
  lastSavedState = JSON.stringify(getCurrentWorkflowData());
  hasUnsavedChanges = false;
}

/**
 * Checks for changes in the workflow
 */
function checkForChanges() {
  const currentState = JSON.stringify(getCurrentWorkflowData());
  const changed = currentState !== lastSavedState;

  if (changed !== hasUnsavedChanges) {
    hasUnsavedChanges = changed;
    updateTitle();
  }
}

/**
 * Updates the page title to show unsaved changes
 */
function updateTitle() {
  const baseTitle = "MeasNode - Visual Programming Editor";
  const projectInfo = currentProject && currentWorkflow ?
    ` - ${currentProject}/${currentWorkflow.replace('.json', '')}` : "";
  const unsavedIndicator = hasUnsavedChanges ? " *" : "";

  document.title = baseTitle + projectInfo + unsavedIndicator;
}

/**
 * Updates the last opened workflow in localStorage
 */
function updateLastWorkflow(project, workflow) {
  localStorage.setItem("lastProject", project);
  localStorage.setItem("lastWorkflow", workflow);
}

/**
 * Loads the last opened workflow on startup
 */
async function loadLastWorkflow() {
  const lastProject = localStorage.getItem("lastProject");
  const lastWorkflow = localStorage.getItem("lastWorkflow");

  if (lastProject && lastWorkflow) {
    try {
      const response = await fetch(`/api/workflows/${lastProject}/${lastWorkflow}`);
      if (response.ok) {
        const workflowData = await response.json();
        loadWorkflowData(workflowData);
        currentProject = lastProject;
        currentWorkflow = lastWorkflow;
        saveCurrentState();
        updateButtonStates();
        console.log("Loaded last workflow:", lastWorkflow, "from project:", lastProject);
      }
    } catch (error) {
      console.log("Could not load last workflow:", error);
    }
  }
}

/**
 * Filter projects based on search input
 */
function filterProjects() {
  const searchTerm = $("#projectSearch").val().toLowerCase().trim();

  if (searchTerm === "") {
    $("#projectPopup .project-category").show();
    $("#projectPopup .workflow-item").show();
    $("#projectPopup .tree-items").hide();
    $("#projectPopup .tree-toggle").text("▶");
    return;
  }

  let hasResults = false;

  $("#projectPopup .project-category").each(function() {
    const $category = $(this);
    const projectName = $category.data("project").toLowerCase();
    const $workflows = $category.find(".workflow-item");
    let categoryHasMatches = false;

    // Check project name
    if (projectName.includes(searchTerm)) {
      categoryHasMatches = true;
      $workflows.show();
    } else {
      // Check workflow names
      $workflows.each(function() {
        const workflowName = $(this).find(".tree-node-name").text().toLowerCase();
        if (workflowName.includes(searchTerm)) {
          $(this).show();
          categoryHasMatches = true;
        } else {
          $(this).hide();
        }
      });
    }

    if (categoryHasMatches) {
      $category.show();
      $category.find(".tree-items").show();
      $category.find(".tree-toggle").text("▼");
      hasResults = true;
    } else {
      $category.hide();
    }
  });

  // Show no results message
  if (!hasResults) {
    if ($("#noProjectResults").length === 0) {
      $("#projectTree").append(
        '<div id="noProjectResults" class="no-results">No projects or workflows found</div>'
      );
    }
  } else {
    $("#noProjectResults").remove();
  }
}

/**
 * Clears the project search
 */
function clearProjectSearch() {
  $("#projectSearch").val("").trigger("input");
  $("#projectSearch").focus();
}

/**
 * Duplicates the selected project or workflow
 */
async function duplicateItem() {
  if (!currentProject) {
    alert("Please select a project or workflow first");
    return;
  }

  try {
    if (currentWorkflow) {
      // Duplicate workflow
      const baseName = currentWorkflow.replace('.json', '');
      const newName = baseName + '_clone';

      const response = await fetch("/api/workflows/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: currentProject,
          sourceWorkflow: currentWorkflow,
          targetWorkflow: newName + '.json'
        })
      });

      if (response.ok) {
        await loadProjects();
        restoreSelectionState();
        console.log("Duplicated workflow:", currentWorkflow, "to", newName + '.json');
      } else {
        const errorData = await response.json();
        alert("Error duplicating workflow: " + (errorData.error || "Unknown error"));
      }
    } else {
      // Duplicate project
      const newProjectName = currentProject + '_clone';

      const response = await fetch("/api/projects/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProject: currentProject,
          targetProject: newProjectName
        })
      });

      if (response.ok) {
        await loadProjects();
        restoreSelectionState();
        console.log("Duplicated project:", currentProject, "to", newProjectName);
      } else {
        const errorData = await response.json();
        alert("Error duplicating project: " + (errorData.error || "Unknown error"));
      }
    }
  } catch (error) {
    console.error("Error duplicating item:", error);
    alert("Error duplicating item");
  }
}

/**
 * Deletes the selected project or workflow with confirmation
 */
async function deleteItem() {
  if (!currentProject) {
    alert("Please select a project or workflow first");
    return;
  }

  let confirmMessage;
  let deleteUrl;
  let deleteData;

  if (currentWorkflow) {
    // Delete workflow
    confirmMessage = `⚠️ WARNING: Are you sure you want to delete the workflow "${currentWorkflow.replace('.json', '')}"?\n\nThis action cannot be undone!`;
    deleteUrl = "/api/workflows/delete";
    deleteData = {
      project: currentProject,
      workflow: currentWorkflow
    };
  } else {
    // Delete project
    confirmMessage = `⚠️ DANGER: Are you sure you want to delete the entire project "${currentProject}" and ALL its workflows?\n\nThis will permanently delete:\n- The project folder\n- All workflow files inside it\n\nThis action cannot be undone!`;
    deleteUrl = "/api/projects/delete";
    deleteData = {
      project: currentProject
    };
  }

  if (!confirm(confirmMessage)) {
    return;
  }

  // Double confirmation for project deletion
  if (!currentWorkflow) {
    if (!confirm(`This is your final warning!\n\nYou are about to permanently delete the project "${currentProject}" and ALL its content.\n\nType "DELETE" in the next prompt to confirm.`)) {
      return;
    }

    const confirmation = prompt('Type "DELETE" to confirm the deletion:');
    if (confirmation !== "DELETE") {
      alert("Deletion cancelled - confirmation text did not match.");
      return;
    }
  }

  try {
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deleteData)
    });

    if (response.ok) {
      // Clear selection if we deleted the current item
      if (!currentWorkflow) {
        // Deleted entire project
        currentProject = null;
        currentWorkflow = null;
      } else {
        // Deleted workflow, keep project selected
        currentWorkflow = null;
      }

      await loadProjects();
      restoreSelectionState();
      console.log("Deleted successfully");
    } else {
      const errorData = await response.json();
      alert("Error deleting: " + (errorData.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error deleting item:", error);
    alert("Error deleting item");
  }
}

/**
 * Renames the selected project or workflow
 */
async function renameItem() {
  if (!currentProject) {
    alert("Please select a project or workflow first");
    return;
  }

  let currentName, newName, renameUrl, renameData;

  if (currentWorkflow) {
    // Rename workflow
    currentName = currentWorkflow.replace('.json', '');
    newName = prompt(`Enter new name for workflow "${currentName}":`, currentName);

    if (!newName || newName.trim() === "" || newName.trim() === currentName) {
      return;
    }

    renameUrl = "/api/workflows/rename";
    renameData = {
      project: currentProject,
      oldName: currentWorkflow,
      newName: newName.trim() + '.json'
    };
  } else {
    // Rename project
    currentName = currentProject;
    newName = prompt(`Enter new name for project "${currentName}":`, currentName);

    if (!newName || newName.trim() === "" || newName.trim() === currentName) {
      return;
    }

    renameUrl = "/api/projects/rename";
    renameData = {
      oldName: currentProject,
      newName: newName.trim()
    };
  }

  try {
    const response = await fetch(renameUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renameData)
    });

    if (response.ok) {
      // Update current selection to the new name
      if (currentWorkflow) {
        currentWorkflow = newName.trim() + '.json';
      } else {
        currentProject = newName.trim();
      }

      await loadProjects();
      restoreSelectionState();
      console.log("Renamed successfully");
    } else {
      const errorData = await response.json();
      alert("Error renaming: " + (errorData.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error renaming item:", error);
    alert("Error renaming item");
  }
}

// Export functions for use in other modules
export {
  hasUnsavedChanges,
  saveCurrentState,
  getCurrentWorkflowData,
  loadWorkflowData,
  clearWorkflow
};