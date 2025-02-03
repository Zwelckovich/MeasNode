from app import BaseNode

class Node(BaseNode):
    title = "Exp Math Node"
    category = "Math"         # New category attribute
    inputs = [
        {"name": "a", "type": "int"},
        {"name": "b", "type": "int"}
    ]
    outputs = [{"name": "output", "type": "int"}]
    parameters_def = [
        {"name": "operation", "type": "dropdown", "options": ["exp"], "default": "exp"}
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["operation"] = "exp"

    def execute(self, **inputs):
        a = inputs.get("a", 0)
        b = inputs.get("b", 0)
        return a ** b
