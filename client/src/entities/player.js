import * as THREE from 'three';

const SPEED = 10;

export class Player {
    constructor(scene, team = 'T') {
        this.team = team;
        this.speed = SPEED;
        this.hp = 100;
        this.maxHp = 100;

        this.mesh = new THREE.Group();

        const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.7);
        const bodyMat = new THREE.MeshLambertMaterial({
            color: team === 'T' ? 0xDDAA33 : 0x3366CC
        });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.45;
        this.body.castShadow = true;
        this.mesh.add(this.body);

        const headGeo = new THREE.SphereGeometry(0.55, 16, 16);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xFFDDA0 });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.25;
        this.head.castShadow = true;
        this.mesh.add(this.head);

        const noseGeo = new THREE.BoxGeometry(0.15, 0.15, 0.35);
        const noseMat = new THREE.MeshLambertMaterial({ color: 0xFF6600 });
        this.nose = new THREE.Mesh(noseGeo, noseMat);
        this.nose.position.set(0, 1.25, -0.55);
        this.mesh.add(this.nose);

        const legGeo = new THREE.BoxGeometry(0.25, 0.4, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        this.legL = new THREE.Mesh(legGeo, legMat);
        this.legL.position.set(-0.25, 0.2, 0);
        this.mesh.add(this.legL);
        this.legR = new THREE.Mesh(legGeo, legMat);
        this.legR.position.set(0.25, 0.2, 0);
        this.mesh.add(this.legR);

        this.mesh.position.set(0, 0, 40);
        scene.add(this.mesh);

        this.scene = scene;
        this.direction = new THREE.Vector3(0, 0, -1);
        this.animTime = 0;
    }

    update(dt, input) {
        if (!input) return;

        const move = new THREE.Vector3(input.x, 0, -input.y);
        if (move.length() > 0.15) {
            move.normalize().multiplyScalar(this.speed * dt);
            this.mesh.position.add(move);
            this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -48, 48);
            this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -48, 48);

            const angle = Math.atan2(move.x, move.z);
            this.mesh.rotation.y = angle;

            this.animTime += dt * 15;
            const swing = Math.sin(this.animTime) * 0.15;
            this.legL.position.z = swing;
            this.legR.position.z = -swing;
        } else {
            this.legL.position.z = 0;
            this.legR.position.z = 0;
        }
    }
}
