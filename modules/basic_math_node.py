from app import BaseNode
import logging
import time


class Node(BaseNode):
    title = "BasicMath Node"
    category = "Math"  # New category attribute
    inputs = [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}]
    outputs = [{"name": "output", "type": "int"}]
    parameters_def = [
        {
            "name": "operation",
            "type": "dropdown",
            "options": ["add", "subtract", "multiply", "divide"],
            "default": "add",
        }
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.parameters["operation"] = "add"

    def execute(self, **inputs):
        logging.info(
            f"BasicMath Node {self.node_id} executing with values {inputs.get('a', 0)} and {inputs.get('b', 0)}"
        )
        a = inputs.get("a", 0)
        b = inputs.get("b", 0)
        op = self.parameters.get("operation", "add")
        try:
            if op == "add":
                time.sleep(3)
                return a + b
            elif op == "subtract":
                return a - b
            elif op == "multiply":
                return a * b
            elif op == "divide":
                return a / b if b != 0 else 0
        except Exception:
            return 0
