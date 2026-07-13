from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any


def log_json(**fields: Any) -> None:
    """Emit one structured JSON log line to stdout."""
    payload: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        **{k: v for k, v in fields.items() if v is not None},
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()
