/**
 * Airplane — fast flying vehicle with banking turns.
 * Built from voxel blocks (no external model needed).
 */

import * as THREE from "three";
import { FlyingVehicle } from "./FlyingVehicle";

export class Airplane extends FlyingVehicle {
  constructor() {
    super("airplane", "Airplane", {
      maxSpeed: 60,
      acceleration: 25,
      drag: 0.02,
      pitchSpeed: 1.2,
      rollSpeed: 2.0,
      yawSpeed: 0.8,
      rollReturn: 3.0,
      minAltitude: 5,
      boostMultiplier: 2.0,
      canHover: false,
    });
  }

  buildModel(): THREE.Group {
    const group = new THREE.Group();
    const mat = {
      body: new THREE.MeshLambertMaterial({ color: 0xcccccc }),
      wing: new THREE.MeshLambertMaterial({ color: 0xaaaaaa }),
      tail: new THREE.MeshLambertMaterial({ color: 0xbb2222 }),
      window: new THREE.MeshLambertMaterial({ color: 0x4488cc, transparent: true, opacity: 0.7 }),
      engine: new THREE.MeshLambertMaterial({ color: 0x333333 }),
    };

    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

    // Fuselage (body)
    const fuselage = new THREE.Mesh(box(1.2, 1, 5), mat.body);
    group.add(fuselage);

    // Cockpit window
    const cockpit = new THREE.Mesh(box(1.0, 0.5, 0.8), mat.window);
    cockpit.position.set(0, 0.5, -1.8);
    group.add(cockpit);

    // Wings
    const leftWing = new THREE.Mesh(box(5, 0.15, 1.5), mat.wing);
    leftWing.position.set(-2.5, -0.1, 0);
    group.add(leftWing);

    const rightWing = new THREE.Mesh(box(5, 0.15, 1.5), mat.wing);
    rightWing.position.set(2.5, -0.1, 0);
    group.add(rightWing);

    // Tail fin (vertical)
    const tailFin = new THREE.Mesh(box(0.15, 1.5, 1), mat.tail);
    tailFin.position.set(0, 0.8, 2.2);
    group.add(tailFin);

    // Tail wings (horizontal)
    const tailWingL = new THREE.Mesh(box(2, 0.1, 0.8), mat.tail);
    tailWingL.position.set(-1, 0.1, 2.2);
    group.add(tailWingL);

    const tailWingR = new THREE.Mesh(box(2, 0.1, 0.8), mat.tail);
    tailWingR.position.set(1, 0.1, 2.2);
    group.add(tailWingR);

    // Engines under wings
    const engineL = new THREE.Mesh(box(0.6, 0.6, 1.2), mat.engine);
    engineL.position.set(-2, -0.5, 0);
    group.add(engineL);

    const engineR = new THREE.Mesh(box(0.6, 0.6, 1.2), mat.engine);
    engineR.position.set(2, -0.5, 0);
    group.add(engineR);

    // Scale down to reasonable size
    group.scale.set(0.8, 0.8, 0.8);

    return group;
  }

  getCameraOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, 3, 12); // behind and above
  }

  getCameraTarget(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -10); // look ahead
  }
}
