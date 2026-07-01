const cache = new Map<string, string>()

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (cache.has(key)) return cache.get(key)!

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es`,
      { headers: { 'User-Agent': 'UbiLife/1.0' } }
    )
    const data = await res.json()
    const a = data.address ?? {}
    const partes = [
      a.road ?? a.pedestrian ?? a.path,
      a.house_number,
      a.suburb ?? a.neighbourhood ?? a.quarter,
      a.city ?? a.town ?? a.village ?? a.municipality,
    ].filter(Boolean)
    const direccion = partes.length > 0 ? partes.join(', ') : data.display_name?.split(',').slice(0, 2).join(',') ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    cache.set(key, direccion)
    return direccion
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}
