export class CollisionSystem {
    constructor(colliders) {
        this.colliders = colliders;
        this.playerRadius = 0.4;
    }

    canMoveTo(x, z) {
        const r = this.playerRadius;
        for (const c of this.colliders) {
            if (!c) continue;
            const closestX = Math.max(c.minX, Math.min(x, c.maxX));
            const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
            const dx = x - closestX;
            const dz = z - closestZ;
            if (dx * dx + dz * dz < r * r) {
                return false;
            }
        }
        return true;
    }

    resolveMove(currentX, currentZ, deltaX, deltaZ) {
        let newX = currentX + deltaX;
        let newZ = currentZ + deltaZ;

        if (!this.canMoveTo(newX, newZ)) {
            if (this.canMoveTo(newX, currentZ)) {
                newZ = currentZ;
            } else if (this.canMoveTo(currentX, newZ)) {
                newX = currentX;
            } else {
                newX = currentX;
                newZ = currentZ;
            }
        }

        return { x: newX, z: newZ };
    }

    // Проверка: прямая видимость между двумя точками (не пересекает ли стены)
    hasLineOfSight(from, to) {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return true;

        const steps = Math.ceil(dist / 0.5); // шаг 0.5 юнита
        const stepX = dx / steps;
        const stepZ = dz / steps;

        let x = from.x;
        let z = from.z;

        for (let i = 1; i < steps; i++) {
            x += stepX;
            z += stepZ;
            if (!this.canMoveTo(x, z)) {
                return false;
            }
        }
        return true;
    }
}
