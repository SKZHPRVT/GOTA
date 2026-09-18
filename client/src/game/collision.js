export class CollisionSystem {
    constructor(colliders) {
        this.colliders = colliders;
        this.playerRadius = 0.6;   // было 1.0 — уменьшили чтобы не залипали
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

    // НОВОЕ: раздельные проверки по X и Z — чтобы скользить по стенам
    canMoveToX(x, z) {
        const r = this.playerRadius;
        for (const c of this.colliders) {
            if (!c) continue;
            const closestX = Math.max(c.minX, Math.min(x, c.maxX));
            const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
            const dx = x - closestX;
            const dz = z - closestZ;
            if (dx * dx + dz * dz < r * r) return false;
        }
        return true;
    }

    resolveMove(currentX, currentZ, deltaX, deltaZ) {
        let newX = currentX;
        let newZ = currentZ;

        // Пробуем полный шаг
        if (this.canMoveTo(currentX + deltaX, currentZ + deltaZ)) {
            return { x: currentX + deltaX, z: currentZ + deltaZ };
        }

        // Пробуем только по X
        if (this.canMoveTo(currentX + deltaX, currentZ)) {
            newX = currentX + deltaX;
            return { x: newX, z: currentZ };
        }

        // Пробуем только по Z
        if (this.canMoveTo(currentX, currentZ + deltaZ)) {
            newZ = currentZ + deltaZ;
            return { x: currentX, z: newZ };
        }

        // Ничего не вышло — стоим
        return { x: currentX, z: currentZ };
    }

    hasLineOfSight(from, to) {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return true;

        const steps = Math.ceil(dist / 0.5);
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
