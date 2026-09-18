import * as THREE from 'three';

const SPEED = 10;
const ATTACK_RANGE = 16;
const ATTACK_COOLDOWN = 0.4;

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
    constructor(scene, team = 'T', spawn = { x: 5, z: -24 }) {
        this.scene = scene;
        this.team = team;
        this.speed = SPEED;
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;
        this.attackTimer = 0;
        this.attackRange = ATTACK_RANGE;
        this.attackCooldown = ATTACK_COOLDOWN;

        this.mesh = new THREE.Group();

        const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.7);
        const bodyMat = toonMat(team === 'T' ? 0xDDAA33 : 0x3366CC);
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
        const noseMat = toonMat(0xFF6600);
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
        const legMat = toonMat(0x333333);
        this.legL = new THREE.Mesh(legGeo, legMat);
        this.legL.position.set(-0.25, 0.2, 0);
        addOutline(this.legL, 0.12);
        this.mesh.add(this.legL);
        this.legR = new THREE.Mesh(legGeo, legMat);
        this.legR.position.set(0.25, 0.2, 0);
        addOutline(this.legR, 0.12);
        this.mesh.add(this.legR);

        const hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.15),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        hpBarBg.position.y = 2.1;
        this.mesh.add(hpBarBg);

        this.hpBar = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.15),
            new THREE.MeshBasicMaterial({ color: 0x00FF00 })
        );
        this.hpBar.position.y = 2.1;
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
        if (move.length() > 0.15) {
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
            this.animTime += dt * 15;
            const swing = Math.sin(this.animTime) * 0.15;
            this.legL.position.z = swing;
            this.legR.position.z = -swing;
        } else {
            this.legL.position.z = 0;
            this.legR.position.z = 0;
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
