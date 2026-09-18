import * as THREE from 'three';

const BULLET_SPEED = 50;
const BULLET_LIFETIME = 1.5;

export class Bullet {
    constructor(scene, position, direction, team, damage = 15) {
        this.scene = scene;
        this.team = team;
        this.damage = damage;
        this.life = BULLET_LIFETIME;
        this.alive = true;

        // Толстая пуля — 0.35 радиус
        const geo = new THREE.SphereGeometry(0.35, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: team === 'T' ? 0xFFAA00 : 0x66AAFF
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(position);
        scene.add(this.mesh);

        this.direction = direction.clone().normalize();
    }

    update(dt) {
        if (!this.alive) return;

        const step = this.direction.clone().multiplyScalar(BULLET_SPEED * dt);
        this.mesh.position.add(step);
        this.life -= dt;

        if (this.life <= 0) this.destroy();
    }

    destroy() {
        this.alive = false;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
