from app import BaseNode
import time

class Node(BaseNode):
    title = "Debug Node"
    category = "Debug"         # New category attribute
    inputs = [
        {"name": "a", "type": "int"},
        {"name": "b", "type": "int"},
        {"name": "c", "type": "int"},
        {"name": "d", "type": "int"},
        {"name": "e", "type": "int"}
    ]
    outputs = [{"name": "output", "type": "int"}]
    parameters_def = [
        {"name": "operation", "type": "dropdown", "options": ["exp"], "default": "exp"},
        {"name": "value", "type": "int", "default": 42}
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["operation"] = "exp"

    def execute(self, **inputs):
        time.sleep(2)
        a = inputs.get("a", 0)
        b = inputs.get("b", 0)
        c = inputs.get("c", 0)
        d = inputs.get("d", 0)  # Fixed: retrieve 'd'
        e = inputs.get("e", 0)  # Fixed: retrieve 'e'
        return a ** b + c + d + e
