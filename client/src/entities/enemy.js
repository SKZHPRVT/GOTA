import * as THREE from 'three';

const ATTACK_RANGE = 22;
const ATTACK_COOLDOWN = 1.2;
const SPEED = 8;

const toonGradient = (() => {
    const colors = new Uint8Array([80, 160, 220, 255]);
    const tex = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    tex.needsUpdate = true;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
})();

function toonMat(color) {
    return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
}

function addOutline(mesh, thickness = 0.08) {
    const outline = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
    );
    outline.scale.multiplyScalar(1 + thickness);
    mesh.add(outline);
}

export class Enemy {
    constructor(scene, team = 'CT', position = { x: 0, z: -42 }, role = 'mid') {
        this.scene = scene;
        this.team = team;
        this.role = role; // 'mid' | 'A' | 'B'
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;
        this.speed = team === 'T' ? SPEED * 0.9 : SPEED;
        this.attackTimer = 0;
        this.target = null;

        // Домашняя позиция — куда возвращаться
        this.homePos = position.clone ? position.clone() : { x: position.x, z: position.z };
        this.currentGoal = { x: position.x, z: position.z }; // текущая цель

        const isT = team === 'T';
        const colors = isT
            ? { head: 0xE8C88A, body: 0x8B6F4A, arms: 0x8B6F4A, legs: 0x5A4732, gun: 0x2A2A2A, accent: 0xAA0000 }
            : { head: 0xE8C88A, body: 0x3A5A8A, arms: 0x3A5A8A, legs: 0x2A3A5A, gun: 0x2A2A2A, accent: 0x2255AA };

        this.mesh = new THREE.Group();

        // Ноги
        const legGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8);
        const legMat = toonMat(colors.legs);

        this.legL = new THREE.Mesh(legGeo, legMat);
        this.legL.position.set(-0.18, 0.25, 0);
        this.legL.castShadow = true;
        addOutline(this.legL, 0.1);
        this.mesh.add(this.legL);

        this.legR = new THREE.Mesh(legGeo, legMat);
        this.legR.position.set(0.18, 0.25, 0);
        this.legR.castShadow = true;
        addOutline(this.legR, 0.1);
        this.mesh.add(this.legR);

        // Туловище
        const bodyGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.7, 12);
        const bodyMat = toonMat(colors.body);
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.85;
        this.body.castShadow = true;
        addOutline(this.body, 0.05);
        this.mesh.add(this.body);

        // Бронежилет CT
        if (!isT) {
            const vestGeo = new THREE.BoxGeometry(0.5, 0.45, 0.42);
            const vestMat = toonMat(0x1A2A3A);
            this.vest = new THREE.Mesh(vestGeo, vestMat);
            this.vest.position.y = 0.9;
            addOutline(this.vest, 0.08);
            this.mesh.add(this.vest);
        }

        // Голова — октаэдр
        const headGeo = new THREE.OctahedronGeometry(0.42, 0);
        const headMat = toonMat(colors.head);
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.55;
        this.head.scale.set(1, 0.95, 1);
        this.head.castShadow = true;
        addOutline(this.head, 0.06);
        this.mesh.add(this.head);

        // Шлем CT
        if (!isT) {
            const helmetGeo = new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const helmetMat = toonMat(0x1A2A3A);
            this.helmet = new THREE.Mesh(helmetGeo, helmetMat);
            this.helmet.position.y = 1.6;
            addOutline(this.helmet, 0.06);
            this.mesh.add(this.helmet);
        }

        // Бандана T
        if (isT) {
            const bandGeo = new THREE.BoxGeometry(0.75, 0.08, 0.75);
            const bandMat = toonMat(colors.accent);
            this.bandana = new THREE.Mesh(bandGeo, bandMat);
            this.bandana.position.y = 1.68;
            addOutline(this.bandana, 0.1);
            this.mesh.add(this.bandana);
        }

        // Глаза
        const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.15, 1.6, -0.35);
        this.mesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.15, 1.6, -0.35);
        this.mesh.add(eyeR);

        // Руки
        const armGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6);
        const armMat = toonMat(colors.arms);

        this.armL = new THREE.Mesh(armGeo, armMat);
        this.armL.position.set(-0.42, 0.95, 0);
        this.armL.rotation.z = 0.15;
        addOutline(this.armL, 0.1);
        this.mesh.add(this.armL);

        this.armR = new THREE.Mesh(armGeo, armMat);
        this.armR.position.set(0.42, 0.95, 0);
        this.armR.rotation.z = -0.15;
        addOutline(this.armR, 0.1);
        this.mesh.add(this.armR);

        // Оружие
        this.gun = new THREE.Group();

        const gunBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.12, 0.9),
            toonMat(colors.gun)
        );
        this.gun.add(gunBody);

        const gunStock = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.16, 0.3),
            toonMat(0x3A2A1A)
        );
        gunStock.position.set(0, 0, 0.5);
        this.gun.add(gunStock);

        this.gun.position.set(0.55, 0.95, -0.45);
        this.mesh.add(this.gun);

        // HP-бар
        const hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.15),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        hpBarBg.position.y = 2.3;
        this.mesh.add(hpBarBg);

        this.hpBar = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.15),
            new THREE.MeshBasicMaterial({ color: team === 'T' ? 0xFFD24A : 0x5CA8FF })
        );
        this.hpBar.position.y = 2.3;
        this.hpBar.position.z = 0.01;
        this.mesh.add(this.hpBar);

        this.mesh.position.set(position.x, 0, position.z);
        scene.add(this.mesh);

        this.animTime = 0;
    }

    // Найти ближайшего врага
    findTarget(enemyList, playerPos, playerAlive) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const e of enemyList) {
            if (!e.alive || e === this) continue;
            if (e.team === this.team) continue;
            const d = this.mesh.position.distanceTo(e.mesh.position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = e;
            }
        }

        if (playerAlive && playerPos) {
            const playerTeam = 'T';
            if (playerTeam !== this.team) {
                const d = this.mesh.position.distanceTo(playerPos);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = { mesh: { position: playerPos }, alive: true, _isPlayer: true };
                }
            }
        }

        this.target = nearest;
        return nearest;
    }

    update(dt, enemyList, playerPos, playerAlive, collision = null, hasLOS = () => true) {
        if (!this.alive) return null;

        const hpPercent = Math.max(0, this.hp / this.maxHp);
        this.hpBar.scale.x = hpPercent;
        this.hpBar.position.x = -(1 - hpPercent) * 0.6;

        const target = this.findTarget(enemyList, playerPos, playerAlive);

        if (!target) {
            // Нет цели — идём к домашней точке
            return this.moveTo(this.homePos, dt, collision);
        }

        const toTarget = new THREE.Vector3().subVectors(
            target.mesh.position, this.mesh.position
        );
        const distToTarget = toTarget.length();

        this.attackTimer -= dt;

        // Если есть цель и есть LOS — стреляем
        if (
            distToTarget < ATTACK_RANGE &&
            this.attackTimer <= 0 &&
            hasLOS(this.mesh.position, target.mesh.position)
        ) {
            this.attackTimer = ATTACK_COOLDOWN;
            return {
                type: 'shoot',
                from: this.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
                direction: toTarget.clone().normalize(),
                team: this.team,
                targetRef: target
            };
        }

        // Движение к цели или к домашней точке
        if (distToTarget > ATTACK_RANGE * 0.7) {
            this.moveTo(target.mesh.position, dt, collision);
        } else {
            // Смотрим на цель, стоим
            const angle = Math.atan2(toTarget.x, toTarget.z);
            this.mesh.rotation.y = angle + Math.PI;
        }

        return null;
    }

    // Универсальное движение к точке с анимацией
    moveTo(targetPos, dt, collision) {
        const to = new THREE.Vector3().subVectors(
            new THREE.Vector3(targetPos.x, 0, targetPos.z),
            this.mesh.position
        );
        const dist = to.length();

        if (dist < 1) return null;

        const moveDir = to.clone().normalize().multiplyScalar(this.speed * dt);

        if (collision) {
            const cur = this.mesh.position;
            const res = collision.resolveMove(cur.x, cur.z, moveDir.x, moveDir.z);
            this.mesh.position.x = res.x;
            this.mesh.position.z = res.z;
        } else {
            this.mesh.position.add(moveDir);
        }

        const angle = Math.atan2(to.x, to.z);
        this.mesh.rotation.y = angle + Math.PI;

        // Анимация ходьбы
        this.animTime += dt * 10;
        const swing = Math.sin(this.animTime) * 0.5;

        this.legL.rotation.x = swing;
        this.legR.rotation.x = -swing;
        this.armL.rotation.x = -swing * 0.7;
        this.armR.rotation.x = swing * 0.7;

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
