from app import BaseNode

class Node(BaseNode):
    title = "Exp Math Node"
    inputs = [
        {"name": "a", "type": "int"},
        {"name": "b", "type": "int"}
    ]
    outputs = [{"name": "output", "type": "int"}]
    parameters_def = [
        {
            "name": "operation",
            "type": "dropdown",
            "options": ["exp"],
            "default": "exp"
        }
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["operation"] = "exp"

    def execute(self, **inputs):
        a = inputs.get("a", 0)
        b = inputs.get("b", 0)
        op = self.parameters.get("operation", "exp")
        try:
            if op == "exp":
                return a ** b
        except Exception:
            return 0
