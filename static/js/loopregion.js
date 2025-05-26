// loopregion.js - Loop region functionality with dynamic bounds
const $ = window.jQuery || window.$;

// Global loop regions storage
window.loopRegions = window.loopRegions || {};
window.loopCounter = 0;

export class LoopRegion {
  constructor(config) {
    this.id = config.id || "loop_" + (++window.loopCounter);
    this.nodes = config.nodes || [];
    this.type = config.type || 'for'; // 'for' or 'while'
    this.iterations = config.iterations || 5;
    this.condition = config.condition || null;

    // Visual properties
    this.bounds = this.calculateBounds();
    this.$element = null;

    // Execution state
    this.entryPoints = new Map(); // External → Internal connections
    this.exitPoints = new Map();  // Internal → External connections
    this.internalWires = [];      // Wires between nodes inside loop

    // Analyze connections
    this.analyzeConnections();
  }

  calculateBounds() {
    if (this.nodes.length === 0) return { x: 0, y: 0, width: 200, height: 100 };

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.nodes.forEach(nodeId => {
      const $node = window.nodes[nodeId];
      if (!$node) return;

      const pos = $node.position();
      const width = $node.outerWidth();
      const height = $node.outerHeight();

      minX = Math.min(minX, pos.left);
      minY = Math.min(minY, pos.top);
      maxX = Math.max(maxX, pos.left + width);
      maxY = Math.max(maxY, pos.top + height);
    });

    // Add padding
    const padding = 20;
    const headerHeight = 40;

    return {
      x: minX - padding,
      y: minY - padding - headerHeight,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2 + headerHeight
    };
  }

  // Update bounds and reposition the visual element
  updateBounds() {
    this.bounds = this.calculateBounds();
    if (this.$element) {
      this.$element.css({
        left: this.bounds.x,
        top: this.bounds.y,
        width: this.bounds.width,
        height: this.bounds.height
      });
    }
  }

  // Check if a point is inside this loop region
  containsPoint(x, y) {
    return x >= this.bounds.x &&
           x <= this.bounds.x + this.bounds.width &&
           y >= this.bounds.y &&
           y <= this.bounds.y + this.bounds.height;
  }

  // Check if a node is inside this loop region visually
  containsNode(nodeId) {
    const $node = window.nodes[nodeId];
    if (!$node) return false;

    const pos = $node.position();
    const centerX = pos.left + $node.outerWidth() / 2;
    const centerY = pos.top + $node.outerHeight() / 2;

    return this.containsPoint(centerX, centerY);
  }

  // Add a node to this loop region
  addNode(nodeId) {
    if (!this.nodes.includes(nodeId)) {
      this.nodes.push(nodeId);
      this.updateBounds();
      this.analyzeConnections();
    }
  }

  // Remove a node from this loop region
  removeNode(nodeId) {
    const index = this.nodes.indexOf(nodeId);
    if (index > -1) {
      this.nodes.splice(index, 1);
      this.updateBounds();
      this.analyzeConnections();
    }
  }

  analyzeConnections() {
    // Clear previous analysis
    this.entryPoints.clear();
    this.exitPoints.clear();
    this.internalWires = [];

    // Analyze all wires
    window.wires.forEach(wire => {
      const fromInside = this.nodes.includes(wire.fromNode);
      const toInside = this.nodes.includes(wire.toNode);

      if (!fromInside && toInside) {
        // Entry point: external → internal
        const key = `${wire.toNode}:${wire.toAnchor}`;
        this.entryPoints.set(key, {
          sourceNode: wire.fromNode,
          sourceAnchor: wire.fromAnchor,
          targetNode: wire.toNode,
          targetAnchor: wire.toAnchor,
          wire: wire
        });
      } else if (fromInside && !toInside) {
        // Exit point: internal → external
        const key = `${wire.fromNode}:${wire.fromAnchor}`;
        this.exitPoints.set(key, {
          sourceNode: wire.fromNode,
          sourceAnchor: wire.fromAnchor,
          targetNode: wire.toNode,
          targetAnchor: wire.toAnchor,
          wire: wire
        });
      } else if (fromInside && toInside) {
        // Internal wire
        this.internalWires.push(wire);
      }
    });
  }

  render() {
    const headerText = this.type === 'for'
      ? `Loop ${this.iterations}x`
      : `While ${this.getConditionText()}`;

    this.$element = $(`
      <div class="loop-region" data-id="${this.id}">
        <div class="loop-header">
          <span class="loop-icon">${this.type === 'for' ? '🔁' : '🔄'}</span>
          <span class="loop-title">${headerText}</span>
          <div class="loop-controls">
            <button class="loop-edit" title="Edit loop">✏️</button>
            <button class="loop-delete" title="Delete loop">❌</button>
          </div>
        </div>
        <div class="loop-body"></div>
        <div class="loop-progress" style="display:none;">
          <div class="progress-bar"></div>
          <span class="progress-text">0/${this.iterations}</span>
        </div>
      </div>
    `);

    // Position the element
    this.$element.css({
      position: 'absolute',
      left: this.bounds.x,
      top: this.bounds.y,
      width: this.bounds.width,
      height: this.bounds.height
    });

    // Attach event handlers
    this.attachEventHandlers();

    return this.$element;
  }

  attachEventHandlers() {
    const self = this;

    // Edit button
    this.$element.find('.loop-edit').on('click', function(e) {
      e.stopPropagation();
      self.showEditDialog();
    });

    // Delete button
    this.$element.find('.loop-delete').on('click', function(e) {
      e.stopPropagation();
      if (confirm('Delete this loop region?')) {
        self.destroy();
      }
    });

    // Make header draggable (moves all contained nodes)
    this.$element.find('.loop-header').on('mousedown', function(e) {
      if ($(e.target).hasClass('loop-edit') || $(e.target).hasClass('loop-delete')) {
        return;
      }

      const startX = e.pageX;
      const startY = e.pageY;
      const initialPositions = {};

      // Record initial positions of all nodes
      self.nodes.forEach(nodeId => {
        const $node = window.nodes[nodeId];
        if ($node) {
          const pos = $node.position();
          initialPositions[nodeId] = { left: pos.left, top: pos.top };
        }
      });

      const regionPos = self.$element.position();
      const initialRegionPos = { left: regionPos.left, top: regionPos.top };

      function onMouseMove(e2) {
        const dx = e2.pageX - startX;
        const dy = e2.pageY - startY;

        // Move region
        self.$element.css({
          left: initialRegionPos.left + dx,
          top: initialRegionPos.top + dy
        });

        // Move all contained nodes
        self.nodes.forEach(nodeId => {
          const $node = window.nodes[nodeId];
          if ($node && initialPositions[nodeId]) {
            $node.css({
              left: initialPositions[nodeId].left + dx,
              top: initialPositions[nodeId].top + dy
            });

            // Update wires
            if (window.updateWiresForNode) {
              window.updateWiresForNode($node);
            }
          }
        });
      }

      $(document).on('mousemove.loopDrag', onMouseMove);
      $(document).on('mouseup.loopDrag', function() {
        $(document).off('mousemove.loopDrag mouseup.loopDrag');
        self.bounds = self.calculateBounds();
      });

      e.preventDefault();
    });
  }

  showEditDialog() {
    const currentIterations = this.iterations;
    const newIterations = prompt(`Number of iterations:`, currentIterations);

    if (newIterations && !isNaN(newIterations)) {
      this.iterations = parseInt(newIterations);
      this.$element.find('.loop-title').text(`Loop ${this.iterations}x`);
      this.$element.find('.progress-text').text(`0/${this.iterations}`);
    }
  }

  getConditionText() {
    // For while loops - to be implemented
    return "condition";
  }

  updateProgress(current, total) {
    const $progress = this.$element.find('.loop-progress');
    const $bar = $progress.find('.progress-bar');
    const $text = $progress.find('.progress-text');

    $progress.show();
    const percent = (current / total) * 100;
    $bar.css('width', percent + '%');
    $text.text(`${current}/${total}`);

    // Add executing class to nodes
    this.nodes.forEach(nodeId => {
      const $node = window.nodes[nodeId];
      if ($node) {
        $node.addClass('loop-executing');
      }
    });
  }

  clearProgress() {
    this.$element.find('.loop-progress').hide();
    this.$element.find('.progress-bar').css('width', '0%');

    // Remove executing class
    this.nodes.forEach(nodeId => {
      const $node = window.nodes[nodeId];
      if ($node) {
        $node.removeClass('loop-executing');
      }
    });
  }

  destroy() {
    this.$element.remove();
    delete window.loopRegions[this.id];
  }
}

// Function to create a loop region from selected nodes
export function createLoopRegion(selectedNodeIds) {
  if (!selectedNodeIds || selectedNodeIds.length === 0) {
    alert('Please select nodes to include in the loop');
    return;
  }

  // Show configuration dialog
  const iterations = prompt('Number of iterations:', '5');
  if (!iterations || isNaN(iterations)) {
    return;
  }

  // Create the loop region
  const region = new LoopRegion({
    nodes: selectedNodeIds,
    type: 'for',
    iterations: parseInt(iterations)
  });

  // Store globally
  window.loopRegions[region.id] = region;

  // Render and add to workflow
  const $element = region.render();
  $('#workflow').append($element);

  // Clear selection
  $('.node').removeClass('selected');

  return region;
}

// Global function to update all loop regions when nodes move
window.updateLoopRegions = function() {
  if (!window.loopRegions) return;

  Object.values(window.loopRegions).forEach(region => {
    // Check if any nodes have moved out of their current regions
    const nodesToRemove = [];
    region.nodes.forEach(nodeId => {
      if (!region.containsNode(nodeId)) {
        nodesToRemove.push(nodeId);
      }
    });

    // Remove nodes that are no longer inside
    nodesToRemove.forEach(nodeId => {
      region.removeNode(nodeId);
    });

    // Check for nodes that might have moved into this region
    Object.keys(window.nodes).forEach(nodeId => {
      if (!region.nodes.includes(nodeId) && region.containsNode(nodeId)) {
        // Check if this node is already in another region
        let inOtherRegion = false;
        Object.values(window.loopRegions).forEach(otherRegion => {
          if (otherRegion.id !== region.id && otherRegion.nodes.includes(nodeId)) {
            inOtherRegion = true;
          }
        });

        // Only add if not in another region
        if (!inOtherRegion) {
          region.addNode(nodeId);
        }
      }
    });

    // Update bounds
    region.updateBounds();
  });
};