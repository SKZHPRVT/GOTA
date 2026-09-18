// Простая AABB-коллизия: игрок — точка с радиусом r
export class CollisionSystem {
    constructor(colliders) {
        this.colliders = colliders;
        this.playerRadius = 0.5;
    }

    // Проверка: может ли игрок стоять в позиции (x, z)
    canMoveTo(x, z) {
        const r = this.playerRadius;
        for (const c of this.colliders) {
            if (!c) continue;
            // AABB: проверяем, пересекается ли круг (x,z,r) с прямоугольником
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

    // Скольжение: пробуем по X, потом по Z
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
}
