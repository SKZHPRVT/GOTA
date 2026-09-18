import * as THREE from 'three';
import { Bullet } from '../entities/bullet.js';

const HIT_RADIUS = 2.5;   // было 1.0 — увеличили под ×4 персонажей

export class CombatSystem {
    constructor(scene) {
        this.scene = scene;
        this.bullets = [];
    }

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

    shoot(from, target, team) {
        const startPos = from.clone().add(new THREE.Vector3(0, 1.6, 0));
        const direction = new THREE.Vector3()
            .subVectors(target.mesh.position, startPos)
            .normalize();

        const bullet = new Bullet(this.scene, startPos, direction, team, 15);
        this.bullets.push(bullet);
        return bullet;
    }

    update(dt, enemies, player, onPlayerDamage) {
        for (const bullet of this.bullets) {
            bullet.update(dt);
            if (!bullet.alive) continue;

            if (bullet.team === 'T') {
                for (const e of enemies) {
                    if (!e.alive) continue;
                    if (e.team === 'T') continue;
                    const dist = bullet.mesh.position.distanceTo(e.mesh.position);
                    if (dist < HIT_RADIUS) {
                        e.takeDamage(bullet.damage);
                        bullet.destroy();
                        break;
                    }
                }
            } else {
                if (player.alive) {
                    const dist = bullet.mesh.position.distanceTo(player.mesh.position);
                    if (dist < HIT_RADIUS) {
                        player.takeDamage(bullet.damage);
                        bullet.destroy();
                        if (onPlayerDamage) onPlayerDamage(bullet.damage);
                    }
                }
            }
        }

        this.bullets = this.bullets.filter(b => b.alive);
    }
}
