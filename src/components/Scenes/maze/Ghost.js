import * as THREE from 'three';

export default class Ghost {
  constructor(x, y, cellSize, mazeGen, type = 'patrol') {
    this.cellSize = cellSize;
    this.mazeGen = mazeGen;
    this.type = type;
    this.position = new THREE.Vector3(x * cellSize, 1.6, y * cellSize);
    this.state = 'patrol';
    this.speed = type === 'hunter' ? 3.5 : 2.0;
    this.chaseSpeed = type === 'hunter' ? 5.5 : 3.0;
    this.detectionRange = type === 'hunter' ? 14 : 8;
    this.attackRange = 1.2;
    this.attackCooldown = 0;

    const geom = new THREE.SphereGeometry(0.6, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: type === 'hunter' ? 0xff6666 : 0x8888ff, transparent: true, opacity: 0.65, emissive: 0x222222 });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.position);

    this.light = new THREE.PointLight(type === 'hunter' ? 0xff4444 : 0x4444ff, 0.8, 5);
    this.light.position.copy(this.position);
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.light);
  }
  removeFrom(scene) {
    scene.remove(this.mesh);
    scene.remove(this.light);
  }

  patrol(delta) {
    // simple wandering: pick random direction occasionally
    if (!this._dir || Math.random() < 0.01) {
      const dirs = [new THREE.Vector2(1,0), new THREE.Vector2(-1,0), new THREE.Vector2(0,1), new THREE.Vector2(0,-1)];
      this._dir = dirs[Math.floor(Math.random()*dirs.length)];
    }
    const nextX = this.position.x + this._dir.x * this.speed * delta;
    const nextZ = this.position.z + this._dir.y * this.speed * delta;
    const cx = Math.round(nextX / this.cellSize);
    const cy = Math.round(nextZ / this.cellSize);
    if (!this.mazeGen.isWall(cx, cy)) {
      this.position.x = nextX; this.position.z = nextZ;
    }
  }

  chase(delta, playerPos) {
    const dir = new THREE.Vector3().subVectors(playerPos, this.position);
    dir.y = 0; const dist = dir.length();
    if (dist > 0.0001) dir.normalize();
    this.position.addScaledVector(dir, this.chaseSpeed * delta);
  }

  update(delta, playerPos) {
    const dist = this.position.distanceTo(playerPos);
    if (dist < this.attackRange && this.attackCooldown <= 0) {
      this.attackCooldown = 1.2;
      return 'attack';
    }
    if (this.attackCooldown > 0) this.attackCooldown -= delta;

    if (dist < this.detectionRange) {
      this.state = 'chase';
    } else if (this.state === 'chase' && dist > this.detectionRange * 1.5) {
      this.state = 'patrol';
    }

    if (this.state === 'chase') this.chase(delta, playerPos); else this.patrol(delta);

    // float and sync visuals
    this.mesh.position.copy(this.position);
    this.mesh.position.y = 1.6 + Math.sin(performance.now()*0.002) * 0.1;
    this.light.position.copy(this.mesh.position);
    return null;
  }
}
