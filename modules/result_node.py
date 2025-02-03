from app import BaseNode

class Node(BaseNode):
    title = "Result Node"
    inputs = [{"name": "input", "type": "int"}]
    outputs = []  # No outputs.
    parameters_def = [
        {"name": "result", "type": "int", "default": 0}
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        # Initialize the result parameter to an empty string.
        self.parameters["result"] = ""

    def execute(self, **inputs):
        # Get the input value (defaulting to 0 if not connected).
        result = inputs.get("input", 0)
        # Update the "result" parameter so that the front end can display it.
        self.parameters["result"] = str(result)
        return str(result)
