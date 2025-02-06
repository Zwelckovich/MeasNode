import os
import importlib.util
import mimetypes
import uuid
import json
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# Global dictionary to store workflow processing generators keyed by token.
pending_workflows = {}

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

# ---------------- API Endpoint: /api/execute (POST) ------------------
@app.route("/api/execute", methods=["POST"])
def api_execute():
    """
    Accepts a JSON payload describing the workflow, starts processing, and returns a unique token.
    The processing will be streamed via SSE at the /api/execute_stream endpoint.
    """
    workflow = request.json
    token = str(uuid.uuid4())
    
    def generate_progress():
        nodes = {}
        node_classes = load_node_modules()

        # Instantiate nodes.
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

        processing_order = []
        results = {}

        def evaluate_node(node):
            # First, evaluate all inputs (post-order):
            inputs = {}
            for inp in node.inputs:
                name = inp["name"]
                if name in node.input_connections:
                    source_node, _ = node.input_connections[name]
                    # Recursively evaluate the input and capture its result.
                    value = yield from evaluate_node(source_node)
                    inputs[name] = value
                else:
                    inputs[name] = 0
            # After inputs are evaluated, yield PROCESSING event.
            yield f"data: PROCESSING {node.node_id}\n\n"
            result = node.execute(**inputs)
            results[node.node_id] = result
            processing_order.append(node.node_id)
            yield f"data: DONE {node.node_id}\n\n"
            return result

        # Evaluate nodes of type "Result Node".
        for node in nodes.values():
            if node.title == "Result Node":
                gen = evaluate_node(node)
                try:
                    for event in gen:
                        yield event
                except StopIteration as e:
                    results[node.node_id] = e.value

        # Finally, yield an END event with processing order and results.
        yield f"data: END {json.dumps({'order': processing_order, 'results': results})}\n\n"

    pending_workflows[token] = generate_progress()
    return jsonify({"token": token})

# ---------------- API Endpoint: /api/execute_stream (GET) ------------------
@app.route("/api/execute_stream", methods=["GET"])
def api_execute_stream():
    token = request.args.get("token")
    if not token or token not in pending_workflows:
        return "Invalid token", 400
    def stream():
        gen = pending_workflows[token]
        try:
            for event in gen:
                yield event
        finally:
            del pending_workflows[token]
    return Response(stream(), mimetype="text/event-stream")

# ---------------- Main Page Route ------------------
@app.route("/")
def index():
    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    return render_template("index.html")

# ---------------- Main Entry Point ------------------
if __name__ == "__main__":
    app.run(debug=True)
