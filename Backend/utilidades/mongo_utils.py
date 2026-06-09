from bson import ObjectId
from typing import Union


def to_object_id(value: Union[str, ObjectId, None]) -> Union[ObjectId, None]:
    """Convierte un valor a ObjectId de forma segura."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception:
            return None
    return None


def to_str_id(value: Union[str, ObjectId, None]) -> str:
    """Convierte un valor a string de forma segura."""
    if value is None:
        return ""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, str):
        return value
    return str(value)


def ensure_str(value: Union[str, ObjectId, list, None]) -> Union[str, list, None]:
    """Asegura que un valor o lista de valores sean strings."""
    if value is None:
        return None
    if isinstance(value, list):
        return [to_str_id(v) for v in value]
    return to_str_id(value)


def find_by_id_str(collection, id_str: str):
    """Busca en colección por ID string, intentando ambos formatos."""
    obj_id = to_object_id(id_str)
    if obj_id:
        return collection.find_one({"_id": obj_id})
    return collection.find_one({"_id": id_str})


def update_by_id_str(collection, id_str: str, update_dict: dict):
    """Actualiza documento por ID string."""
    obj_id = to_object_id(id_str)
    if obj_id:
        return collection.update_one({"_id": obj_id}, update_dict)
    return collection.update_one({"_id": id_str}, update_dict)