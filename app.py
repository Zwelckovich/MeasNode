import os
import importlib.util
import mimetypes
import uuid
import json
import time
import logging
import queue
import shutil
from pathlib import Path
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


# ---------------- API Endpoint: /api/projects (GET) ------------------
@app.route("/api/projects", methods=["GET"])
def api_get_projects():
    """
    Returns a JSON array of all projects with their workflows.
    Each project includes:
      - name: project name (folder name)
      - workflows: array of workflow filenames
    """
    projects = []
    projects_dir = Path("projects")

    # Create projects directory if it doesn't exist
    projects_dir.mkdir(exist_ok=True)

    try:
        # Scan each subdirectory in projects folder
        for project_folder in projects_dir.iterdir():
            if project_folder.is_dir():
                workflows = []
                # Find all .json files in the project folder
                for workflow_file in project_folder.glob("*.json"):
                    workflows.append(workflow_file.name)

                projects.append({
                    "name": project_folder.name,
                    "workflows": sorted(workflows)
                })

        # Sort projects by name
        projects.sort(key=lambda x: x["name"])
        return jsonify(projects)

    except Exception as e:
        logging.error(f"Error loading projects: {e}")
        return jsonify({"error": "Failed to load projects"}), 500


# ---------------- API Endpoint: /api/projects (POST) ------------------
@app.route("/api/projects", methods=["POST"])
def api_create_project():
    """
    Creates a new project folder.
    Expects JSON payload with:
      - name: project name
    """
    try:
        data = request.json
        project_name = data.get("name", "").strip()

        if not project_name:
            return jsonify({"error": "Project name is required"}), 400

        # Validate project name (basic validation)
        if not project_name.replace("_", "").replace("-", "").replace(" ", "").isalnum():
            return jsonify({"error": "Invalid project name"}), 400

        projects_dir = Path("projects")
        projects_dir.mkdir(exist_ok=True)

        project_path = projects_dir / project_name

        # Check if project already exists
        if project_path.exists():
            return jsonify({"error": "Project already exists"}), 409

        # Create project directory
        project_path.mkdir()

        logging.info(f"Created project: {project_name}")
        return jsonify({"message": "Project created successfully", "name": project_name})

    except Exception as e:
        logging.error(f"Error creating project: {e}")
        return jsonify({"error": "Failed to create project"}), 500


# ---------------- API Endpoint: /api/projects/duplicate (POST) ------------------
@app.route("/api/projects/duplicate", methods=["POST"])
def api_duplicate_project():
    """
    Duplicates an entire project with all its workflows.
    Expects JSON payload with:
      - sourceProject: source project name
      - targetProject: target project name
    """
    try:
        data = request.json
        source_project = data.get("sourceProject", "").strip()
        target_project = data.get("targetProject", "").strip()

        if not source_project or not target_project:
            return jsonify({"error": "Source and target project names are required"}), 400

        projects_dir = Path("projects")
        source_path = projects_dir / source_project
        target_path = projects_dir / target_project

        # Check if source project exists
        if not source_path.exists():
            return jsonify({"error": "Source project does not exist"}), 404

        # Check if target project already exists
        if target_path.exists():
            return jsonify({"error": "Target project already exists"}), 409

        # Copy the entire project directory
        shutil.copytree(source_path, target_path)

        logging.info(f"Duplicated project: {source_project} to {target_project}")
        return jsonify({"message": "Project duplicated successfully"})

    except Exception as e:
        logging.error(f"Error duplicating project: {e}")
        return jsonify({"error": "Failed to duplicate project"}), 500


# ---------------- API Endpoint: /api/projects/delete (DELETE) ------------------
@app.route("/api/projects/delete", methods=["DELETE"])
def api_delete_project():
    """
    Deletes an entire project and all its workflows.
    Expects JSON payload with:
      - project: project name to delete
    """
    try:
        data = request.json
        project_name = data.get("project", "").strip()

        if not project_name:
            return jsonify({"error": "Project name is required"}), 400

        projects_dir = Path("projects")
        project_path = projects_dir / project_name

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Delete the entire project directory
        shutil.rmtree(project_path)

        logging.info(f"Deleted project: {project_name}")
        return jsonify({"message": "Project deleted successfully"})

    except Exception as e:
        logging.error(f"Error deleting project: {e}")
        return jsonify({"error": "Failed to delete project"}), 500


# ---------------- API Endpoint: /api/projects/rename (PUT) ------------------
@app.route("/api/projects/rename", methods=["PUT"])
def api_rename_project():
    """
    Renames a project.
    Expects JSON payload with:
      - oldName: current project name
      - newName: new project name
    """
    try:
        data = request.json
        old_name = data.get("oldName", "").strip()
        new_name = data.get("newName", "").strip()

        if not old_name or not new_name:
            return jsonify({"error": "Old and new project names are required"}), 400

        # Validate new project name
        if not new_name.replace("_", "").replace("-", "").replace(" ", "").isalnum():
            return jsonify({"error": "Invalid project name"}), 400

        projects_dir = Path("projects")
        old_path = projects_dir / old_name
        new_path = projects_dir / new_name

        # Check if source project exists
        if not old_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Check if target project already exists
        if new_path.exists():
            return jsonify({"error": "A project with the new name already exists"}), 409

        # Rename the project directory
        old_path.rename(new_path)

        logging.info(f"Renamed project: {old_name} to {new_name}")
        return jsonify({"message": "Project renamed successfully"})

    except Exception as e:
        logging.error(f"Error renaming project: {e}")
        return jsonify({"error": "Failed to rename project"}), 500


# ---------------- API Endpoint: /api/workflows (POST) ------------------
@app.route("/api/workflows", methods=["POST"])
def api_create_workflow():
    """
    Creates a new empty workflow file.
    Expects JSON payload with:
      - project: project name
      - name: workflow name
    """
    try:
        data = request.json
        project_name = data.get("project", "").strip()
        workflow_name = data.get("name", "").strip()

        if not project_name or not workflow_name:
            return jsonify({"error": "Project and workflow name are required"}), 400

        projects_dir = Path("projects")
        project_path = projects_dir / project_name

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Add .json extension if not present
        if not workflow_name.endswith(".json"):
            workflow_name += ".json"

        workflow_path = project_path / workflow_name

        # Check if workflow already exists
        if workflow_path.exists():
            return jsonify({"error": "Workflow already exists"}), 409

        # Create empty workflow
        empty_workflow = {
            "nodes": [],
            "wires": []
        }

        with open(workflow_path, "w") as f:
            json.dump(empty_workflow, f, indent=2)

        logging.info(f"Created workflow: {workflow_name} in project: {project_name}")
        return jsonify({"message": "Workflow created successfully", "name": workflow_name})

    except Exception as e:
        logging.error(f"Error creating workflow: {e}")
        return jsonify({"error": "Failed to create workflow"}), 500


# ---------------- API Endpoint: /api/workflows/duplicate (POST) ------------------
@app.route("/api/workflows/duplicate", methods=["POST"])
def api_duplicate_workflow():
    """
    Duplicates a workflow within a project.
    Expects JSON payload with:
      - project: project name
      - sourceWorkflow: source workflow filename
      - targetWorkflow: target workflow filename
    """
    try:
        data = request.json
        project_name = data.get("project", "").strip()
        source_workflow = data.get("sourceWorkflow", "").strip()
        target_workflow = data.get("targetWorkflow", "").strip()

        if not project_name or not source_workflow or not target_workflow:
            return jsonify({"error": "Project name and workflow names are required"}), 400

        projects_dir = Path("projects")
        project_path = projects_dir / project_name

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Add .json extension if not present
        if not source_workflow.endswith(".json"):
            source_workflow += ".json"
        if not target_workflow.endswith(".json"):
            target_workflow += ".json"

        source_path = project_path / source_workflow
        target_path = project_path / target_workflow

        # Check if source workflow exists
        if not source_path.exists():
            return jsonify({"error": "Source workflow does not exist"}), 404

        # Check if target workflow already exists
        if target_path.exists():
            return jsonify({"error": "Target workflow already exists"}), 409

        # Copy the workflow file
        shutil.copy2(source_path, target_path)

        logging.info(f"Duplicated workflow: {source_workflow} to {target_workflow}")
        return jsonify({"message": "Workflow duplicated successfully"})

    except Exception as e:
        logging.error(f"Error duplicating workflow: {e}")
        return jsonify({"error": "Failed to duplicate workflow"}), 500


# ---------------- API Endpoint: /api/workflows/delete (DELETE) ------------------
@app.route("/api/workflows/delete", methods=["DELETE"])
def api_delete_workflow():
    """
    Deletes a workflow.
    Expects JSON payload with:
      - project: project name
      - workflow: workflow filename
    """
    try:
        data = request.json
        project_name = data.get("project", "").strip()
        workflow_name = data.get("workflow", "").strip()

        if not project_name or not workflow_name:
            return jsonify({"error": "Project and workflow names are required"}), 400

        projects_dir = Path("projects")
        project_path = projects_dir / project_name

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Add .json extension if not present
        if not workflow_name.endswith(".json"):
            workflow_name += ".json"

        workflow_path = project_path / workflow_name

        # Check if workflow exists
        if not workflow_path.exists():
            return jsonify({"error": "Workflow does not exist"}), 404

        # Delete the workflow file
        workflow_path.unlink()

        logging.info(f"Deleted workflow: {workflow_name} from project: {project_name}")
        return jsonify({"message": "Workflow deleted successfully"})

    except Exception as e:
        logging.error(f"Error deleting workflow: {e}")
        return jsonify({"error": "Failed to delete workflow"}), 500


# ---------------- API Endpoint: /api/workflows/rename (PUT) ------------------
@app.route("/api/workflows/rename", methods=["PUT"])
def api_rename_workflow():
    """
    Renames a workflow.
    Expects JSON payload with:
      - project: project name
      - oldName: current workflow filename
      - newName: new workflow filename
    """
    try:
        data = request.json
        project_name = data.get("project", "").strip()
        old_name = data.get("oldName", "").strip()
        new_name = data.get("newName", "").strip()

        if not project_name or not old_name or not new_name:
            return jsonify({"error": "Project name and workflow names are required"}), 400

        projects_dir = Path("projects")
        project_path = projects_dir / project_name

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Add .json extension if not present
        if not old_name.endswith(".json"):
            old_name += ".json"
        if not new_name.endswith(".json"):
            new_name += ".json"

        old_path = project_path / old_name
        new_path = project_path / new_name

        # Check if source workflow exists
        if not old_path.exists():
            return jsonify({"error": "Workflow does not exist"}), 404

        # Check if target workflow already exists
        if new_path.exists():
            return jsonify({"error": "A workflow with the new name already exists"}), 409

        # Rename the workflow file
        old_path.rename(new_path)

        logging.info(f"Renamed workflow: {old_name} to {new_name}")
        return jsonify({"message": "Workflow renamed successfully"})

    except Exception as e:
        logging.error(f"Error renaming workflow: {e}")
        return jsonify({"error": "Failed to rename workflow"}), 500


# ---------------- API Endpoint: /api/workflows/save (POST) ------------------
@app.route("/api/workflows/save", methods=["POST"])
def api_save_workflow():
    """
    Saves workflow data to a file.
    Expects JSON payload with:
      - project: project name
      - workflow: workflow filename
      - data: workflow data (nodes, wires, etc.)
    """
    try:
        data = request.json
        project_name = data.get("project", "").strip()
        workflow_name = data.get("workflow", "").strip()
        workflow_data = data.get("data", {})

        if not project_name or not workflow_name:
            return jsonify({"error": "Project and workflow name are required"}), 400

        projects_dir = Path("projects")
        project_path = projects_dir / project_name

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Add .json extension if not present
        if not workflow_name.endswith(".json"):
            workflow_name += ".json"

        workflow_path = project_path / workflow_name

        # Save workflow data
        with open(workflow_path, "w") as f:
            json.dump(workflow_data, f, indent=2)

        logging.info(f"Saved workflow: {workflow_name} in project: {project_name}")
        return jsonify({"message": "Workflow saved successfully"})

    except Exception as e:
        logging.error(f"Error saving workflow: {e}")
        return jsonify({"error": "Failed to save workflow"}), 500


# ---------------- API Endpoint: /api/workflows/<project>/<workflow> (GET) ------------------
@app.route("/api/workflows/<project>/<workflow>", methods=["GET"])
def api_load_workflow(project, workflow):
    """
    Loads workflow data from a file.
    Returns the workflow JSON data.
    """
    try:
        projects_dir = Path("projects")
        project_path = projects_dir / project

        # Check if project exists
        if not project_path.exists():
            return jsonify({"error": "Project does not exist"}), 404

        # Add .json extension if not present
        if not workflow.endswith(".json"):
            workflow += ".json"

        workflow_path = project_path / workflow

        # Check if workflow exists
        if not workflow_path.exists():
            return jsonify({"error": "Workflow does not exist"}), 404

        # Load workflow data
        with open(workflow_path, "r") as f:
            workflow_data = json.load(f)

        logging.info(f"Loaded workflow: {workflow} from project: {project}")
        return jsonify(workflow_data)

    except Exception as e:
        logging.error(f"Error loading workflow: {e}")
        return jsonify({"error": "Failed to load workflow"}), 500


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