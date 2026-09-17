import * as THREE from 'three';

const SPEED = 5;
const ATTACK_RANGE = 18;
const ATTACK_COOLDOWN = 1.2;

export class Enemy {
    constructor(scene, team = 'CT', position = new THREE.Vector3(0, 0, -40)) {
        this.scene = scene;
        this.team = team;
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;
        this.speed = SPEED;
        this.attackTimer = 0;

        this.mesh = new THREE.Group();

        // Тело
        const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.7);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xCC3333 });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.45;
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Голова
        const headGeo = new THREE.SphereGeometry(0.55, 16, 16);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xFFDDA0 });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.25;
        this.head.castShadow = true;
        this.mesh.add(this.head);

        // Нос
        const noseGeo = new THREE.BoxGeometry(0.15, 0.15, 0.35);
        const noseMat = new THREE.MeshLambertMaterial({ color: 0x660000 });
        this.nose = new THREE.Mesh(noseGeo, noseMat);
        this.nose.position.set(0, 1.25, -0.55);
        this.mesh.add(this.nose);

        // Глаза
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.18, 1.35, -0.5);
        this.mesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.18, 1.35, -0.5);
        this.mesh.add(eyeR);

        // Ноги
        const legGeo = new THREE.BoxGeometry(0.25, 0.4, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        this.legL = new THREE.Mesh(legGeo, legMat);
        this.legL.position.set(-0.25, 0.2, 0);
        this.mesh.add(this.legL);
        this.legR = new THREE.Mesh(legGeo, legMat);
        this.legR.position.set(0.25, 0.2, 0);
        this.mesh.add(this.legR);

        // Полоска HP над головой
        const hpBarBgGeo = new THREE.PlaneGeometry(1.2, 0.15);
        const hpBarBgMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.hpBarBg = new THREE.Mesh(hpBarBgGeo, hpBarBgMat);
        this.hpBarBg.position.y = 2.0;
        this.mesh.add(this.hpBarBg);

        const hpBarGeo = new THREE.PlaneGeometry(1.2, 0.15);
        const hpBarMat = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
        this.hpBar = new THREE.Mesh(hpBarGeo, hpBarMat);
        this.hpBar.position.y = 2.0;
        this.hpBar.position.z = 0.01;
        this.mesh.add(this.hpBar);

        this.mesh.position.copy(position);
        scene.add(this.mesh);

        this.animTime = 0;
        this.wanderTarget = position.clone();
        this.wanderTimer = 0;
    }

    update(dt, playerPos) {
        if (!this.alive) return;

        // HP-бар всегда лицом к камере — упрощённо игнорируем

        // Обновляем HP-бар
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        this.hpBar.scale.x = hpPercent;
        this.hpBar.position.x = -(1 - hpPercent) * 0.6;

        const toPlayer = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
        const distToPlayer = toPlayer.length();

        // Атака
        this.attackTimer -= dt;
        if (distToPlayer < ATTACK_RANGE && this.attackTimer <= 0) {
            this.attackTimer = ATTACK_COOLDOWN;
            return {
                type: 'shoot',
                from: this.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
                direction: toPlayer.clone().normalize(),
                team: this.team
            };
        }

        // Движение: если далеко — идём к игроку, если близко — стоим
        if (distToPlayer > ATTACK_RANGE * 0.7) {
            const moveDir = toPlayer.clone().normalize();
            moveDir.multiplyScalar(this.speed * dt);
            this.mesh.position.add(moveDir);

            const angle = Math.atan2(toPlayer.x, toPlayer.z);
            this.mesh.rotation.y = angle + Math.PI;

            this.animTime += dt * 12;
            const swing = Math.sin(this.animTime) * 0.15;
            this.legL.position.z = swing;
            this.legR.position.z = -swing;
        } else {
            // Смотрим на игрока
            const angle = Math.atan2(toPlayer.x, toPlayer.z);
            this.mesh.rotation.y = angle + Math.PI;
            this.legL.position.z = 0;
            this.legR.position.z = 0;
        }

        return null;
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        }
    }

    die() {
        this.alive = false;
        this.scene.remove(this.mesh);
    }
}
