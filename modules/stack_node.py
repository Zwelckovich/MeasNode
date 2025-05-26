from app import BaseNode
import json


class Node(BaseNode):
    title = "Stack Node"
    category = "Data"
    inputs = [{"name": "value", "type": "any"}]
    outputs = [{"name": "stack", "type": "array"}]
    parameters_def = [
        {"name": "stack_display", "type": "text", "default": "[]"},
        {"name": "clear_on_start", "type": "dropdown", "options": ["yes", "no"], "default": "yes"}
    ]

    def __init__(self, node_id):
        super().__init__(node_id)
        self.stack = []
        self.parameters["stack_display"] = "[]"
        self.parameters["clear_on_start"] = "yes"

    def execute(self, **inputs):
        # In a loop context, maintain state across iterations
        # For now, just append the value
        value = inputs.get("value", 0)
        self.stack.append(value)

        # Update display parameter (read-only)
        self.parameters["stack_display"] = json.dumps(self.stack)

        # Return the current stack
        return self.stack.copy()  # Return copy to prevent external modification