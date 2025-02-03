import os
import importlib.util
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# ---------------- Base Node Class ------------------
class BaseNode:
    """
    Base class for all nodes.
    Each node module should subclass this.
    """
    title = "Base Node"
    category = "Uncategorized"  # New attribute for categorization.
    inputs = []      # Example: [{"name": "input1", "type": "int"}]
    outputs = []     # Example: [{"name": "output", "type": "int"}]
    parameters_def = []  # Example: [{"name": "value", "type": "int", "default": 42}]

    def __init__(self, node_id):
        self.node_id = node_id
        self.parameters = {}
        self.input_connections = {}  # To be filled as { input_name: (source_node, "output") }

    def execute(self, **inputs):
        """Override this method in subclasses to implement node logic."""
        return None

# ---------------- Node Modules Loader ------------------
def load_node_modules():
    """
    Scans the 'modules' folder for Python files (ignoring __init__.py) and imports them.
    Each module should define a class named "Node" that is a subclass of BaseNode.
    Returns a dictionary mapping each node's title to its class.
    """
    node_classes = {}
    modules_dir = os.path.join(os.path.dirname(__file__), "modules")
    if not os.path.exists(modules_dir):
        print("Modules directory not found:", modules_dir)
        return node_classes

    for fname in os.listdir(modules_dir):
        if fname.endswith(".py") and fname != "__init__.py":
            mod_name = fname[:-3]
            path = os.path.join(modules_dir, fname)
            spec = importlib.util.spec_from_file_location(mod_name, path)
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
            except Exception as e:
                print(f"Error loading module {fname}: {e}")
                continue
            if hasattr(mod, "Node"):
                cls = mod.Node
                node_classes[cls.title] = cls
    return node_classes

# ---------------- API Endpoint: /api/nodes ------------------
@app.route("/api/nodes", methods=["GET"])
def api_nodes():
    """
    Returns a JSON array of available node definitions.
    Each node definition includes:
      - title: the node title (unique)
      - category: the node category (for grouping in the library)
      - parameters: the parameter definitions (from parameters_def)
      - inputs: the input definitions
      - outputs: the output definitions
    """
    node_classes = load_node_modules()
    definitions = []
    for title, cls in node_classes.items():
        definitions.append({
            "title": title,
            "category": getattr(cls, "category", "Uncategorized"),
            "parameters": getattr(cls, "parameters_def", []),
            "inputs": getattr(cls, "inputs", []),
            "outputs": getattr(cls, "outputs", [])
        })
    return jsonify(definitions)

# ---------------- API Endpoint: /api/execute ------------------
@app.route("/api/execute", methods=["POST"])
def api_execute():
    """
    Expects a JSON payload describing the workflow.
    The workflow JSON should have a "nodes" array, where each node is defined with:
      - id: unique node identifier
      - type: the node title (to look up the corresponding Python class)
      - parameters: parameter values (as entered by the user)
      - connections: a mapping of input names to the source node IDs.
    
    This endpoint instantiates the nodes, sets up connections, recursively evaluates the nodes,
    and returns the results of each "Result Node" in a JSON object.
    """
    workflow = request.json
    nodes = {}
    node_classes = load_node_modules()

    # Instantiate nodes based on workflow payload.
    for node_data in workflow.get("nodes", []):
        node_type = node_data.get("type")
        NodeClass = node_classes.get(node_type)
        if NodeClass:
            node_instance = NodeClass(node_id=node_data["id"])
            node_instance.parameters.update(node_data.get("parameters", {}))
            nodes[node_instance.node_id] = node_instance

    # Set up connections.
    for node_data in workflow.get("nodes", []):
        node_id = node_data.get("id")
        node_instance = nodes.get(node_id)
        for input_name, source_node_id in node_data.get("connections", {}).items():
            if source_node_id in nodes:
                source_node = nodes[source_node_id]
                node_instance.input_connections[input_name] = (source_node, "output")

    # Recursive evaluation.
    def evaluate_node(node):
        inputs = {}
        for inp in node.inputs:
            name = inp["name"]
            if name in node.input_connections:
                source_node, _ = node.input_connections[name]
                inputs[name] = evaluate_node(source_node)
            else:
                inputs[name] = 0  # Default value if not connected.
        return node.execute(**inputs)

    results = {}
    for node in nodes.values():
        if node.title == "Result Node":
            results[node.node_id] = evaluate_node(node)
    return jsonify({"results": results})

# ---------------- Main Page Route ------------------
@app.route("/")
def index():
    # Render the index.html template (should be placed in the "templates" folder).
    return render_template("index.html")

# ---------------- Main Entry Point ------------------
if __name__ == "__main__":
    app.run(debug=True)
