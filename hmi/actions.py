"""Add action handlers here. All writes pass through the tag service."""
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Action:
    label: str
    handler: Callable
    needs_value: bool = False


ACTIONS = {
    'toggle': Action('Toggle', lambda current, value: 0 if current else 1),
    'set': Action('Set To', lambda current, value: value, True),
    'increment': Action('Increment By', lambda current, value: current + value, True),
    'decrement': Action('Decrement By', lambda current, value: current - value, True),
}


def validate_value_input(data, value=None):
    import math
    for key,limit in [('promptText',200),('unitText',80)]:
        if key in data and (not isinstance(data[key],str) or len(data[key])>limit):
            raise ValueError(f'{key} must be text of at most {limit} characters')
    minimum, maximum = float(data.get('minimum', 0)), float(data.get('maximum', 100))
    if not math.isfinite(minimum) or not math.isfinite(maximum) or minimum > maximum:
        raise ValueError('Invalid Value Input minimum or maximum')
    if value is not None:
        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError('Value is outside the allowed range')
        if not data.get('allowDecimal', False) and not value.is_integer():
            raise ValueError('Enter a whole number')
