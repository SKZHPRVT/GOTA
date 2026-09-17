import * as THREE from 'three';
import { Bullet } from '../entities/bullet.js';

export class CombatSystem {
    constructor(scene) {
        this.scene = scene;
        this.bullets = [];
    }

    // Автоаим: найти ближайшего врага в радиусе
    findNearestTarget(from, entities, maxRange) {
        let nearest = null;
        let nearestDist = maxRange;

        for (const e of entities) {
            if (!e.alive) continue;
            const dist = from.distanceTo(e.mesh.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = e;
            }
        }
        return nearest;
    }

    // Выстрел
    shoot(from, target, team) {
        const startPos = from.clone().add(new THREE.Vector3(0, 1.2, 0));
        const direction = new THREE.Vector3()
            .subVectors(target.mesh.position, startPos)
            .normalize();

        const bullet = new Bullet(this.scene, startPos, direction, team);
        this.bullets.push(bullet);
        return bullet;
    }

    // Обновление: пули летят, проверяем попадания
    update(dt, enemies, player) {
        for (const bullet of this.bullets) {
            bullet.update(dt);
            if (!bullet.alive) continue;

            // Проверка попадания в enemies (если пуля от игрока)
            if (bullet.team === 'T') {
                for (const e of enemies) {
                    if (!e.alive) continue;
                    const dist = bullet.mesh.position.distanceTo(e.mesh.position);
                    if (dist < 1.0) {
                        e.takeDamage(bullet.damage);
                        bullet.destroy();
                        break;
                    }
                }
            } else {
                // Пуля от врага — проверяем игрока
                if (player.alive) {
                    const dist = bullet.mesh.position.distanceTo(player.mesh.position);
                    if (dist < 1.0) {
                        player.takeDamage(bullet.damage);
                        bullet.destroy();
                    }
                }
            }
        }

        // Очистка мёртвых пуль
        this.bullets = this.bullets.filter(b => b.alive);
    }
}
