from app import BaseNode

class Node(BaseNode):
    title = "Result Node"
    category = "Output"       # New category attribute
    inputs = [{"name": "input", "type": "int"}]
    outputs = []
    parameters_def = [
        {"name": "result", "type": "int", "default": 0}
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["result"] = 0

    def execute(self, **inputs):
        result = inputs.get("input", 0)
        self.parameters["result"] = result
        return result
