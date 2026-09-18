import * as THREE from 'three';

const ATTACK_RANGE = 22;
const ATTACK_COOLDOWN = 1.2;
const SCALE = 1.5;

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
    constructor(scene, team = 'CT', position = { x: 0, z: -42 }) {
        this.scene = scene;
        this.team = team; // 'T' или 'CT'
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;

        // T-боты медленнее, CT быстрее
        this.speed = team === 'T' ? 7 : 8;

        this.attackTimer = 0;
        this.target = null; // текущая цель (Enemy или Player)

        const bodyColor = team === 'T' ? 0xDDAA33 : 0xCC3333; // жёлтый vs красный
        const legColor = 0x222222;

        this.mesh = new THREE.Group();
        this.mesh.scale.setScalar(SCALE);

        const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.7);
        const bodyMat = toonMat(bodyColor);
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.45;
        this.body.castShadow = true;
        addOutline(this.body);
        this.mesh.add(this.body);

        const headGeo = new THREE.SphereGeometry(0.6, 16, 16);
        const headMat = toonMat(0xFFDDA0);
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.3;
        this.head.castShadow = true;
        addOutline(this.head, 0.06);
        this.mesh.add(this.head);

        const noseGeo = new THREE.BoxGeometry(0.15, 0.15, 0.35);
        const noseMat = toonMat(team === 'T' ? 0xFF6600 : 0x660000);
        this.nose = new THREE.Mesh(noseGeo, noseMat);
        this.nose.position.set(0, 1.3, -0.6);
        addOutline(this.nose, 0.15);
        this.mesh.add(this.nose);

        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.18, 1.4, -0.55);
        this.mesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.18, 1.4, -0.55);
        this.mesh.add(eyeR);

        const legGeo = new THREE.BoxGeometry(0.25, 0.4, 0.25);
        const legMat = toonMat(legColor);
        this.legL = new THREE.Mesh(legGeo, legMat);
        this.legL.position.set(-0.25, 0.2, 0);
        addOutline(this.legL, 0.12);
        this.mesh.add(this.legL);
        this.legR = new THREE.Mesh(legGeo, legMat);
        this.legR.position.set(0.25, 0.2, 0);
        addOutline(this.legR, 0.12);
        this.mesh.add(this.legR);

        // HP-бар
        const hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.15),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        hpBarBg.position.y = 2.1;
        this.mesh.add(hpBarBg);

        this.hpBar = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.15),
            new THREE.MeshBasicMaterial({ color: team === 'T' ? 0xFFD24A : 0xFF6666 })
        );
        this.hpBar.position.y = 2.1;
        this.hpBar.position.z = 0.01;
        this.mesh.add(this.hpBar);

        this.mesh.position.set(position.x, 0, position.z);
        scene.add(this.mesh);

        this.animTime = 0;
    }

    // Ищем ближайшего врага
    findTarget(enemyList, playerPos, playerAlive) {
        let nearest = null;
        let nearestDist = Infinity;

        // Проверяем врагов (ботов другой команды)
        for (const e of enemyList) {
            if (!e.alive || e === this) continue;
            if (e.team === this.team) continue;
            const d = this.mesh.position.distanceTo(e.mesh.position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = e;
            }
        }

        // Проверяем игрока, если он враг
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
        if (!target) return null;

        const toTarget = new THREE.Vector3().subVectors(
            target.mesh.position, this.mesh.position
        );
        const distToTarget = toTarget.length();

        this.attackTimer -= dt;

        // Атака
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

        // Движение к цели
        if (distToTarget > ATTACK_RANGE * 0.7) {
            const moveDir = toTarget.clone().normalize().multiplyScalar(this.speed * dt);
            if (collision) {
                const cur = this.mesh.position;
                const res = collision.resolveMove(cur.x, cur.z, moveDir.x, moveDir.z);
                this.mesh.position.x = res.x;
                this.mesh.position.z = res.z;
            } else {
                this.mesh.position.add(moveDir);
            }

            const angle = Math.atan2(toTarget.x, toTarget.z);
            this.mesh.rotation.y = angle + Math.PI;

            this.animTime += dt * 12;
            const swing = Math.sin(this.animTime) * 0.15;
            this.legL.position.z = swing;
            this.legR.position.z = -swing;
        } else {
            const angle = Math.atan2(toTarget.x, toTarget.z);
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
