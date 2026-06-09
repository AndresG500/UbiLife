from math import radians, sin, cos, sqrt, atan2


def calcular_distancia(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    lat1, lat2, dlat, dlng = map(radians, [lat1, lat2, lat2 - lat1, lng2 - lng1])
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))
