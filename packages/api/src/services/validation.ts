// Formule de Haversine — distance en mètres entre deux points GPS
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Vérifie si la position de l'utilisateur est dans le rayon de validation du checkpoint.
 */
export function validateCheckpointPosition(
  userLat: number,
  userLng: number,
  cpLat: number,
  cpLng: number,
  radiusMetres: number,
): boolean {
  const distance = haversineMetres(userLat, userLng, cpLat, cpLng);
  return distance <= radiusMetres;
}
