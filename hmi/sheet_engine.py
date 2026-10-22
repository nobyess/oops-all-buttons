"""Initialize the application's restricted formula registry without SciPy.

The upstream registry eagerly imports advanced statistics and financial modules.
Our sheets expose only a small whitelist. Reuse upstream parsing, operators,
wrappers and math/text/logic functions, with local numeric/count aggregates.
Installed third-party sources are not modified.
"""
import functools
import threading

_lock = threading.RLock()
_engine = None


def load_engine():
    global _engine
    with _lock:
        if _engine is not None:return _engine
        import formulas
        import numpy as np
        from formulas import functions as registry

        def aggregate(operation, *arguments):
            if operation not in ('COUNT', 'COUNTA'):
                registry.raise_errors(arguments)
            if operation == 'COUNTA':predicate = registry.is_not_empty
            elif operation == 'COUNT':predicate = functools.partial(registry.is_number, xl_return=False)
            else:predicate = registry.is_number
            values = []
            for argument in arguments:
                # Keep upstream scalar coercion, empty-range and error semantics.
                converted = registry._convert_args(argument)
                values.extend(registry.flatten(converted, check=predicate))
            if operation in ('COUNT', 'COUNTA'):return len(values)
            if operation == 'AVERAGE':
                return np.mean(values) if values else registry.Error.errors['#DIV/0!']
            return (min if operation == 'MIN' else max)(values or [0])

        registry.SUBMODULES = ['.info', '.logic', '.math', '.text']
        for name in ('AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA'):
            registry.FUNCTIONS[name] = registry.wrap_func(functools.partial(aggregate, name))
        registry.get_functions.cache_clear()
        # Initialize under the lock before any sheet threads compile expressions.
        registry.get_functions()
        _engine = formulas
        return formulas
