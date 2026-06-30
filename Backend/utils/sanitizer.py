import html
import re

def sanitize_string(value: str, max_length: int = None) -> str:
    if not isinstance(value, str):
        return value
    
    sanitized = html.escape(value.strip())
    
    if max_length and len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
    
    return sanitized
