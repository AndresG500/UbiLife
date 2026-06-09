"""
Utilidades geográficas para UbiLife.
"""

from math import radians, sin, cos, sqrt, atan2


def distancia_metros(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calcula la distancia en metros entre dos puntos geográficos
    usando la fórmula Haversine.

    Args:
        lat1, lng1: Coordenadas del primer punto (en grados decimales).
        lat2, lng2: Coordenadas del segundo punto (en grados decimales).

    Returns:
        Distancia en metros entre ambos puntos.
    """
    R = 6_371_000  # Radio de la Tierra en metros

    phi1 = radians(lat1)
    phi2 = radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lng2 - lng1)

    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c