from app import BaseNode

class Node(BaseNode):
    title = "BasicMath Node"
    inputs = [
        {"name": "a", "type": "int"},
        {"name": "b", "type": "int"}
    ]
    outputs = [{"name": "output", "type": "int"}]
    parameters_def = [
        {
            "name": "operation",
            "type": "dropdown",
            "options": ["add", "subtract", "multiply", "divide"],
            "default": "add"
        }
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["operation"] = "add"

    def execute(self, **inputs):
        a = inputs.get("a", 0)
        b = inputs.get("b", 0)
        op = self.parameters.get("operation", "add")
        try:
            if op == "add":
                return a + b
            elif op == "subtract":
                return a - b
            elif op == "multiply":
                return a * b
            elif op == "divide":
                return a / b if b != 0 else 0
        except Exception:
            return 0
