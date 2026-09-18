import * as THREE from 'three';

const SPEED = 20;
const ATTACK_RANGE = 20;
const ATTACK_COOLDOWN = 0.8;

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

export class Player {
    constructor(scene, team = 'T', spawn = { x: 0, z: 0 }) {
        this.scene = scene;
        this.team = team;
        this.speed = SPEED;
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;
        this.attackTimer = 0;
        this.attackRange = ATTACK_RANGE;
        this.attackCooldown = ATTACK_COOLDOWN;

        // Цвета по команде
        const isT = team === 'T';
        const colors = isT
            ? { head: 0xE8C88A, body: 0x8B6F4A, arms: 0x8B6F4A, legs: 0x5A4732, gun: 0x2A2A2A, accent: 0xAA0000 }
            : { head: 0xE8C88A, body: 0x3A5A8A, arms: 0x3A5A8A, legs: 0x2A3A5A, gun: 0x2A2A2A, accent: 0x2255AA };

        this.mesh = new THREE.Group();

        // === НОГИ (цилиндры, будут анимированы) ===
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

        // === ТУЛОВИЩЕ (цилиндр) ===
        const bodyGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.7, 12);
        const bodyMat = toonMat(colors.body);
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.85;
        this.body.castShadow = true;
        addOutline(this.body, 0.05);
        this.mesh.add(this.body);

        // Бронежилет у CT
        if (!isT) {
            const vestGeo = new THREE.BoxGeometry(0.5, 0.45, 0.42);
            const vestMat = toonMat(0x1A2A3A);
            this.vest = new THREE.Mesh(vestGeo, vestMat);
            this.vest.position.y = 0.9;
            addOutline(this.vest, 0.08);
            this.mesh.add(this.vest);
        }

        // === ГОЛОВА (октаэдр — куб со срезанными углами) ===
        const headGeo = new THREE.OctahedronGeometry(0.42, 0);
        const headMat = toonMat(colors.head);
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.55;
        this.head.scale.set(1, 0.95, 1);
        this.head.castShadow = true;
        addOutline(this.head, 0.06);
        this.mesh.add(this.head);

        // Шлем у CT
        if (!isT) {
            const helmetGeo = new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const helmetMat = toonMat(0x1A2A3A);
            this.helmet = new THREE.Mesh(helmetGeo, helmetMat);
            this.helmet.position.y = 1.6;
            addOutline(this.helmet, 0.06);
            this.mesh.add(this.helmet);
        }

        // Бандана у T
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

        // === РУКИ (цилиндры, будут анимированы) ===
        const armGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6);
        const armMat = toonMat(colors.arms);

        this.armL = new THREE.Mesh(armGeo, armMat);
        this.armL.position.set(-0.42, 0.95, 0);
        this.armL.rotation.z = 0.15;
        this.armL.castShadow = true;
        addOutline(this.armL, 0.1);
        this.mesh.add(this.armL);

        this.armR = new THREE.Mesh(armGeo, armMat);
        this.armR.position.set(0.42, 0.95, 0);
        this.armR.rotation.z = -0.15;
        this.armR.castShadow = true;
        addOutline(this.armR, 0.1);
        this.mesh.add(this.armR);

        // === ОРУЖИЕ (AK-47 из кубов) ===
        this.gun = new THREE.Group();

        const gunBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.12, 0.9),
            toonMat(colors.gun)
        );
        gunBody.position.set(0, 0, 0);
        this.gun.add(gunBody);

        const gunStock = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.16, 0.3),
            toonMat(0x3A2A1A)
        );
        gunStock.position.set(0, 0, 0.5);
        this.gun.add(gunStock);

        const gunMag = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.22, 0.1),
            toonMat(0x1A1A1A)
        );
        gunMag.position.set(0, -0.15, 0.05);
        this.gun.add(gunMag);

        // Крепим оружие к правой руке
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
            new THREE.MeshBasicMaterial({ color: 0x00FF00 })
        );
        this.hpBar.position.y = 2.3;
        this.hpBar.position.z = 0.01;
        this.mesh.add(this.hpBar);

        this.mesh.position.set(spawn.x, 0, spawn.z);
        scene.add(this.mesh);

        this.animTime = 0;
        this.moveDirection = new THREE.Vector3(0, 0, 0);
    }

    update(dt, input, collision = null) {
        if (!input || !this.alive) return;

        const move = new THREE.Vector3(input.x, 0, input.y);
        let isMoving = false;

        if (move.length() > 0.15) {
            isMoving = true;
            move.normalize().multiplyScalar(this.speed * dt);

            if (collision) {
                const cur = this.mesh.position;
                const res = collision.resolveMove(cur.x, cur.z, move.x, move.z);
                this.mesh.position.x = res.x;
                this.mesh.position.z = res.z;
            } else {
                this.mesh.position.add(move);
            }

            this.moveDirection.copy(move).normalize();
        }

        // Анимация ходьбы
        if (isMoving) {
            this.animTime += dt * 12;
            const swing = Math.sin(this.animTime) * 0.5;

            // Ноги — вперёд-назад
            this.legL.rotation.x = swing;
            this.legR.rotation.x = -swing;

            // Руки — противоположно ногам
            this.armL.rotation.x = -swing * 0.7;
            this.armR.rotation.x = swing * 0.7;

            // Лёгкое покачивание тела
            this.body.rotation.z = Math.sin(this.animTime * 2) * 0.03;
        } else {
            // Плавное возвращение в покой
            this.legL.rotation.x *= 0.85;
            this.legR.rotation.x *= 0.85;
            this.armL.rotation.x *= 0.85;
            this.armR.rotation.x *= 0.85;
            this.body.rotation.z *= 0.85;
        }

        const hpPercent = Math.max(0, this.hp / this.maxHp);
        this.hpBar.scale.x = hpPercent;
        this.hpBar.position.x = -(1 - hpPercent) * 0.6;
    }

    faceTarget(targetPos) {
        const dir = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
        const angle = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = angle + Math.PI;
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
        }
    }
}
