/**
 * MagicCarpet — slow, hoverable flying vehicle.
 * Can stop mid-air. Good for sightseeing.
 */

import * as THREE from "three";
import { FlyingVehicle } from "./FlyingVehicle";

export class MagicCarpet extends FlyingVehicle {
  private hoverTime: number = 0;

  constructor() {
    super("magic_carpet", "Magic Carpet", {
      maxSpeed: 25,
      acceleration: 15,
      drag: 0.08,
      pitchSpeed: 0.8,
      rollSpeed: 1.2,
      yawSpeed: 1.5,
      rollReturn: 5.0,
      minAltitude: 3,
      boostMultiplier: 1.5,
      canHover: true,
    });
  }

  buildModel(): THREE.Group {
    const group = new THREE.Group();

    // Carpet — flat rectangular shape with colorful pattern
    const carpetGeo = new THREE.BoxGeometry(2.5, 0.1, 3.5);
    const carpetMat = new THREE.MeshLambertMaterial({ color: 0x8B2252 });
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    group.add(carpet);

    // Carpet border
    const borderMat = new THREE.MeshLambertMaterial({ color: 0xDAA520 });

    // Front/back borders
    const frontBorder = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.2), borderMat);
    frontBorder.position.set(0, 0.01, -1.65);
    group.add(frontBorder);

    const backBorder = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.2), borderMat);
    backBorder.position.set(0, 0.01, 1.65);
    group.add(backBorder);

    // Side borders
    const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 3.5), borderMat);
    leftBorder.position.set(-1.15, 0.01, 0);
    group.add(leftBorder);

    const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 3.5), borderMat);
    rightBorder.position.set(1.15, 0.01, 0);
    group.add(rightBorder);

    // Center diamond pattern
    const diamondMat = new THREE.MeshLambertMaterial({ color: 0x1E90FF });
    const diamond = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), diamondMat);
    diamond.rotation.y = Math.PI / 4;
    diamond.position.set(0, 0.01, 0);
    group.add(diamond);

    // Sitting figure (simple voxel person)
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xDEB887 });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x4169E1 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), shirtMat);
    body.position.set(0, 0.5, 0.3);
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.set(0, 1.15, 0.3);
    group.add(head);

    return group;
  }

  update(input: import("./Vehicle").VehicleInput, dt: number): void {
    super.update(input, dt);

    // Gentle hovering bob
    this.hoverTime += dt;
    this.model.position.y += Math.sin(this.hoverTime * 2) * 0.003;
  }

  getCameraOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, 4, 10);
  }

  getCameraTarget(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -8);
  }
}
