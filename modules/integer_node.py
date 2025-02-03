from app import BaseNode

class Node(BaseNode):
    title = "Integer Node"
    category = "Input"        # New category attribute
    inputs = []               # No inputs.
    outputs = [{"name": "output", "type": "int"}]
    parameters_def = [
        {"name": "value", "type": "int", "default": 42}
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["value"] = 42

    def execute(self, **inputs):
        return int(self.parameters.get("value", 0))
