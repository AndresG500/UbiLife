import os
from fastapi import Request
from slowapi import Limiter

_trust_proxy = os.getenv("TRUST_PROXY", "0").lower() in ("1", "true", "yes")


def _get_ip(request: Request) -> str:
    if _trust_proxy:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host


limiter = Limiter(key_func=_get_ip, default_limits=["120/minute"])
