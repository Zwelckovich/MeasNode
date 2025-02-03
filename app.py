import os
import importlib.util
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# ---------------- Base Node Class ------------------
class BaseNode:
    """
    Base class for all nodes. Each node module should subclass this.
    """
    title = "Base Node"
    inputs = []   # e.g., [{"name": "input1", "type": "int"}]
    outputs = []  # e.g., [{"name": "output", "type": "int"}]
    parameters_def = []  # A list of parameter definitions

    def __init__(self, node_id):
        self.node_id = node_id
        self.input_connections = {}  # e.g., { "input1": (source_node, "output") }
        self.parameters = {}

    def execute(self, **inputs):
        """
        Override in subclasses to process inputs and produce an output.
        """
        return None

# ---------------- Load Node Modules ------------------
def load_node_modules():
    """
    Scans the 'modules' folder for .py files (ignoring __init__.py) and imports them.
    Each module is expected to define a class named "Node" that inherits from BaseNode.
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
            # Each module should define a class named "Node"
            if hasattr(mod, "Node"):
                cls = mod.Node
                if cls.title in node_classes:
                    print(f"Warning: Duplicate title found ({cls.title}). Module {fname} may be overriding an existing node.")
                node_classes[cls.title] = cls
    return node_classes

# ---------------- API Endpoint: /api/nodes ------------------
@app.route("/api/nodes", methods=["GET"])
def api_nodes():
    """
    Returns a JSON array of node definitions.
    Each definition is an object with at least:
      - title: the node title (unique)
      - parameters: the parameter definitions (from the node class's parameters_def attribute)
      - inputs: the list of input definitions
      - outputs: the list of output definitions

    Example response:
    [
      {
        "title": "Integer Node",
        "parameters": [{"name": "value", "type": "int", "default": 42}],
        "inputs": [],
        "outputs": [{"name": "output", "type": "int"}]
      },
      {
        "title": "BasicMath Node",
        "parameters": [{"name": "operation", "type": "dropdown", "options": ["add", "subtract", "multiply", "divide"], "default": "add"}],
        "inputs": [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
        "outputs": [{"name": "output", "type": "int"}]
      },
      {
        "title": "Result Node",
        "parameters": [],
        "inputs": [{"name": "input", "type": "int"}],
        "outputs": []
      }
    ]
    """
    node_classes = load_node_modules()
    definitions = []
    for title, cls in node_classes.items():
        definitions.append({
            "title": title,
            "parameters": getattr(cls, "parameters_def", []),
            "inputs": getattr(cls, "inputs", []),
            "outputs": getattr(cls, "outputs", [])
        })
    return jsonify(definitions)

# ---------------- API Endpoint: /api/execute ------------------
@app.route("/api/execute", methods=["POST"])
def api_execute():
    workflow = request.json
    nodes = {}
    node_classes = load_node_modules()

    # Instantiate nodes based on the workflow payload.
    for node_data in workflow.get("nodes", []):
        node_type = node_data.get("type")
        NodeClass = node_classes.get(node_type)
        if NodeClass:
            node_instance = NodeClass(node_id=node_data["id"])
            node_instance.parameters.update(node_data.get("parameters", {}))
            nodes[node_instance.node_id] = node_instance

    # Set up connections.
    for node_data in workflow.get("nodes", []):
        node_id = node_data["id"]
        node_instance = nodes.get(node_id)
        for input_name, source_id in node_data.get("connections", {}).items():
            if source_id in nodes:
                source_node = nodes[source_id]
                node_instance.input_connections[input_name] = (source_node, "output")

    # Recursive evaluation.
    def evaluate_node(node: BaseNode):
        inputs = {}
        for inp in node.inputs:
            name = inp["name"]
            if name in node.input_connections:
                source_node, _ = node.input_connections[name]
                inputs[name] = evaluate_node(source_node)
            else:
                inputs[name] = 0
        return node.execute(**inputs)

    results = {}
    for node in nodes.values():
        if node.title == "Result Node":
            results[node.node_id] = evaluate_node(node)
    return jsonify({"results": results})


# ---------------- Web UI Route ------------------
@app.route("/")
def index():
    # Render your main template (ensure index.html exists in your templates folder)
    return render_template("index.html")

# ---------------- Main ------------------
if __name__ == "__main__":
    app.run(debug=True)
