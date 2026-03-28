/**
 * HotAirBalloon — slow, vertical-focused flying vehicle.
 * Great for sightseeing. Drifts with gentle horizontal movement.
 */

import * as THREE from "three";
import { FlyingVehicle } from "./FlyingVehicle";

export class HotAirBalloon extends FlyingVehicle {
  private swayTime: number = 0;

  constructor() {
    super("hot_air_balloon", "Hot Air Balloon", {
      maxSpeed: 12,
      acceleration: 8,
      drag: 0.15,
      pitchSpeed: 0.3,
      rollSpeed: 0.4,
      yawSpeed: 0.6,
      rollReturn: 8.0,
      minAltitude: 8,
      boostMultiplier: 1.3,
      canHover: true,
    });
  }

  buildModel(): THREE.Group {
    const group = new THREE.Group();

    // Balloon envelope (big sphere-ish shape from stacked boxes)
    const colors = [0xDD3333, 0xDDAA22, 0xDD3333, 0xDDAA22, 0xDD3333];
    const widths = [2.0, 3.2, 3.8, 3.8, 3.2, 2.0, 1.2];

    for (let i = 0; i < widths.length; i++) {
      const w = widths[i];
      const color = colors[i % colors.length];
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.8, w),
        new THREE.MeshLambertMaterial({ color })
      );
      ring.position.set(0, 6.5 + i * 0.8, 0);
      group.add(ring);
    }

    // Top cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xDDAA22 })
    );
    cap.position.set(0, 12.5, 0);
    group.add(cap);

    // Ropes (4 vertical lines connecting balloon to basket)
    const ropeMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
    const ropePositions = [
      [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]
    ];
    for (const [rx, rz] of ropePositions) {
      const rope = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 5.5, 0.08),
        ropeMat
      );
      rope.position.set(rx, 3.5, rz);
      group.add(rope);
    }

    // Basket
    const basketMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    // Bottom
    const basketBottom = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.15, 1.8),
      basketMat
    );
    basketBottom.position.set(0, 0.5, 0);
    group.add(basketBottom);

    // Basket walls
    const wallGeo = new THREE.BoxGeometry(1.8, 1.0, 0.15);
    const positions = [
      [0, 1.0, 0.825],
      [0, 1.0, -0.825],
    ];
    for (const [wx, wy, wz] of positions) {
      const wall = new THREE.Mesh(wallGeo, basketMat);
      wall.position.set(wx, wy, wz);
      group.add(wall);
    }
    const sideGeo = new THREE.BoxGeometry(0.15, 1.0, 1.8);
    const sidePositions = [
      [0.825, 1.0, 0],
      [-0.825, 1.0, 0],
    ];
    for (const [wx, wy, wz] of sidePositions) {
      const wall = new THREE.Mesh(sideGeo, basketMat);
      wall.position.set(wx, wy, wz);
      group.add(wall);
    }

    // Burner flame (small glowing block)
    const flame = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.4, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xFF6600, emissive: 0xFF4400, emissiveIntensity: 0.5 })
    );
    flame.position.set(0, 1.8, 0);
    group.add(flame);

    // Scale
    group.scale.set(0.6, 0.6, 0.6);

    return group;
  }

  update(input: import("./Vehicle").VehicleInput, dt: number): void {
    super.update(input, dt);

    // Gentle swaying
    this.swayTime += dt;
    this.model.rotation.z = Math.sin(this.swayTime * 0.5) * 0.03;
    this.model.rotation.x = Math.cos(this.swayTime * 0.7) * 0.02;
  }

  getCameraOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, 6, 15);
  }

  getCameraTarget(): THREE.Vector3 {
    return new THREE.Vector3(0, 3, -8);
  }
}
