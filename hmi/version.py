"""Application version from portable build metadata or the source checkout."""
import json
import sys
from pathlib import Path


def application_version():
    root=Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parents[1]
    try:
        metadata=json.loads((root/'BUILD-INFO.json').read_text(encoding='utf-8'))
        value=metadata.get('version') if isinstance(metadata,dict) else None
        if isinstance(value,str) and value.strip():return value.strip()
    except (OSError,ValueError,TypeError):pass
    try:return (root/'VERSION').read_text(encoding='utf-8').strip() or 'development'
    except OSError:return 'development'
