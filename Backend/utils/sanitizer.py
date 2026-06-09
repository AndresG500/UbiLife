import html
import re

def sanitize_string(value: str, max_length: int = None) -> str:
    if not isinstance(value, str):
        return value
    
    sanitized = html.escape(value.strip())
    
    if max_length and len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
    
    return sanitized

def sanitize_dict(data: dict, max_length: int = 1000) -> dict:
    if not isinstance(data, dict):
        return data
    
    result = {}
    for key, value in data.items():
        if isinstance(value, str):
            result[key] = sanitize_string(value, max_length)
        elif isinstance(value, dict):
            result[key] = sanitize_dict(value, max_length)
        elif isinstance(value, list):
            result[key] = [sanitize_dict(item, max_length) if isinstance(item, dict) else sanitize_string(str(item), max_length) if isinstance(item, str) else item for item in value]
        else:
            result[key] = value
    
    return result