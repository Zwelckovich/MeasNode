import os
import importlib.util
import mimetypes
import uuid
import json
import time
import logging
import queue
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# Global dictionary to store workflow processing generators keyed by token.
pending_workflows = {}

# --- Set up a global log queue and custom logging handler ---
log_queue = queue.Queue()


class QueueHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            log_queue.put(msg)
        except Exception:
            self.handleError(record)


# Set up the logging system
queue_handler = QueueHandler()
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
queue_handler.setFormatter(formatter)
logging.getLogger().addHandler(queue_handler)
logging.getLogger().setLevel(logging.INFO)


# ---------------- Base Node Class ------------------
class BaseNode:
    """
    Base class for all nodes.
    Each node module should subclass this.
    """

    title = "Base Node"
    category = "Uncategorized"  # New attribute for categorization.
    inputs = []  # Example: [{"name": "input1", "type": "int"}]
    outputs = []  # Example: [{"name": "output", "type": "int"}]
    parameters_def = []  # Example: [{"name": "value", "type": "int", "default": 42}]

    def __init__(self, node_id):
        self.node_id = node_id
        self.parameters = {}
        self.input_connections = {}  # To be filled as { input_name: (source_node, "output") }


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
        definitions.append(
            {
                "title": title,
                "category": getattr(cls, "category", "Uncategorized"),
                "parameters": getattr(cls, "parameters_def", []),
                "inputs": getattr(cls, "inputs", []),
                "outputs": getattr(cls, "outputs", []),
            }
        )
    return jsonify(definitions)


# ---------------- API Endpoint: /api/execute (POST) ------------------
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
    and returns a unique token.
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
                    node_instance.input_connections[input_name] = (
                        source_node,
                        "output",
                    )

        processing_order = []
        results = {}
        evaluated_nodes = {}  # Cache for memoization

        def evaluate_node(node, evaluated=None):
            """
            Recursively evaluates a node and its inputs using memoization to avoid redundant calculations.

            Args:
                node: The node to evaluate
                evaluated: Dictionary of already evaluated nodes {node_id: result}

            Returns:
                The result of the node's execution
            """
            # Initialize memoization dictionary if not provided
            if evaluated is None:
                evaluated = {}

            # If this node has already been evaluated, return the cached result
            if node.node_id in evaluated:
                return evaluated[node.node_id]

            # Prepare inputs by evaluating input connections
            inputs = {}
            for inp in node.inputs:
                name = inp["name"]
                if name in node.input_connections:
                    source_node, _ = node.input_connections[name]
                    # Recursively evaluate the source node, passing the evaluation cache
                    value = yield from evaluate_node(source_node, evaluated)
                    inputs[name] = value
                else:
                    # Default value if no connection
                    inputs[name] = 0

            # Signal that we're processing this node
            yield f"data: PROCESSING {node.node_id}\n\n"

            # Execute the node's logic
            result = node.execute(**inputs)

            # Cache the result
            evaluated[node.node_id] = result

            # Add node to processing order
            processing_order.append(node.node_id)

            # Signal that node processing is complete
            yield f"data: DONE {node.node_id}\n\n"

            return result

        # Find all result nodes
        result_nodes = [node for node in nodes.values() if node.title == "Result Node"]

        # Process each result node
        for node in result_nodes:
            gen = evaluate_node(node, evaluated_nodes)
            try:
                for event in gen:
                    yield event
            except StopIteration as e:
                results[node.node_id] = e.value

        # Include results for all evaluated nodes
        for node_id, result in evaluated_nodes.items():
            results[node_id] = result

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
        except Exception as e:
            # Log the exception and yield an END event with an error message.
            logging.error(f"Error in execution stream: {e}")
            yield f"data: END {json.dumps({'order': [], 'results': {}, 'error': str(e)})}\n\n"
        finally:
            del pending_workflows[token]

    return Response(stream(), mimetype="text/event-stream")


# ---------------- API Endpoint: /api/logs ------------------
@app.route("/api/logs")
def stream_logs():
    """
    Streams actual log messages from the global log queue via Server-Sent Events.
    When no log message is available or the message is empty, a comment line is sent
    so that no visible log line is added to the log window.
    """

    def generate_logs():
        while True:
            try:
                # Wait for up to 1 second for a log message.
                msg = log_queue.get(timeout=1)
                # Only yield a log message if it is not empty.
                if msg.strip():
                    yield f"data: {msg}\n\n"
                else:
                    # Yield a comment line which the client can ignore.
                    yield ": keepalive\n\n"
            except queue.Empty:
                # When timeout occurs, send a keepalive comment.
                yield ": keepalive\n\n"

    return Response(generate_logs(), mimetype="text/event-stream")


# ---------------- Main Page Route ------------------
@app.route("/")
def index():
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    return render_template("index.html")


# ---------------- Main Entry Point ------------------
if __name__ == "__main__":
    app.run(debug=True)
