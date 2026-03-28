/**
 * Vehicle base class.
 *
 * Manages: model, mount/dismount, skin, camera offset.
 * Subclasses implement movement physics.
 *
 * Design: completely decoupled from player/world.
 * Delete the vehicles/ folder → game reverts to walking, zero breakage.
 */

import * as THREE from "three";

export interface VehicleInput {
  forward: boolean;   // W
  backward: boolean;  // S
  left: boolean;      // A
  right: boolean;     // D
  up: boolean;        // Space
  down: boolean;      // Shift
  boost: boolean;     // E
}

export interface VehicleState {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  speed: number;
}

export abstract class Vehicle {
  readonly id: string;
  readonly displayName: string;

  model: THREE.Group;
  state: VehicleState;
  mounted: boolean = false;

  constructor(id: string, displayName: string) {
    this.id = id;
    this.displayName = displayName;
    this.model = new THREE.Group();
    this.state = {
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(0, 0, 0, "YXZ"),
      velocity: new THREE.Vector3(),
      speed: 0,
    };
  }

  /** Build the 3D model. Called once. */
  abstract buildModel(): THREE.Group;

  /** Update physics for one frame. */
  abstract update(input: VehicleInput, dt: number): void;

  /** Camera position relative to vehicle (third person). */
  abstract getCameraOffset(): THREE.Vector3;

  /** Camera look-at target relative to vehicle. */
  abstract getCameraTarget(): THREE.Vector3;

  /** Mount the vehicle at a position. */
  mount(position: THREE.Vector3, scene: THREE.Scene): void {
    this.state.position.copy(position);
    this.state.velocity.set(0, 0, 0);
    this.state.speed = 0;
    this.model = this.buildModel();
    scene.add(this.model);
    this.mounted = true;
    this.syncModel();
  }

  /** Dismount and remove from scene. Returns last position. */
  dismount(scene: THREE.Scene): THREE.Vector3 {
    const pos = this.state.position.clone();
    scene.remove(this.model);
    this.mounted = false;
    return pos;
  }

  /** Sync Three.js model transform to physics state. */
  syncModel(): void {
    this.model.position.copy(this.state.position);
    this.model.rotation.copy(this.state.rotation);
  }

  /** Get world-space camera position. */
  getWorldCameraPosition(): THREE.Vector3 {
    const offset = this.getCameraOffset();
    const pos = offset.clone();
    pos.applyEuler(this.state.rotation);
    pos.add(this.state.position);
    return pos;
  }

  /** Get world-space camera target. */
  getWorldCameraTarget(): THREE.Vector3 {
    const target = this.getCameraTarget();
    const pos = target.clone();
    pos.applyEuler(this.state.rotation);
    pos.add(this.state.position);
    return pos;
  }

  /** Cleanup resources. */
  dispose(): void {
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
