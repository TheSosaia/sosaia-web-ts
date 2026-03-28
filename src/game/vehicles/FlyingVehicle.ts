/**
 * FlyingVehicle — base class for all airborne vehicles.
 *
 * Handles: pitch, roll, yaw, thrust, drag, lift, minimum altitude.
 * Subclasses define: model, flight parameters, camera offsets.
 *
 * Physics inspired by vibe-jet (Pieter Levels style):
 * - Thrust applies force along vehicle forward direction
 * - Pitch/roll controlled by input
 * - Drag proportional to speed²
 * - Minimum altitude prevents crashing into ground
 */

import * as THREE from "three";
import { Vehicle, VehicleInput } from "./Vehicle";

export interface FlightParams {
  maxSpeed: number;        // max forward speed
  acceleration: number;    // thrust force
  drag: number;            // air resistance coefficient
  pitchSpeed: number;      // radians/sec
  rollSpeed: number;       // radians/sec
  yawSpeed: number;        // radians/sec (auto-yaw from roll)
  rollReturn: number;      // how fast roll returns to 0 when no input
  minAltitude: number;     // minimum Y position
  boostMultiplier: number; // speed multiplier when boosting
  canHover: boolean;       // can stop mid-air (magic carpet) vs stall (airplane)
}

export abstract class FlyingVehicle extends Vehicle {
  protected params: FlightParams;
  private pitch: number = 0;
  private roll: number = 0;
  private yaw: number = 0;

  constructor(id: string, displayName: string, params: FlightParams) {
    super(id, displayName);
    this.params = params;
  }

  update(input: VehicleInput, dt: number): void {
    const p = this.params;

    // Pitch (W/S or up/down)
    if (input.forward) this.pitch -= p.pitchSpeed * dt;
    if (input.backward) this.pitch += p.pitchSpeed * dt;
    // Clamp pitch
    this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch));

    // Roll (A/D)
    if (input.left) this.roll += p.rollSpeed * dt;
    if (input.right) this.roll -= p.rollSpeed * dt;
    // Roll return to center
    if (!input.left && !input.right) {
      this.roll *= (1 - p.rollReturn * dt);
    }
    // Clamp roll
    this.roll = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.roll));

    // Yaw from roll (banking turns)
    this.yaw += this.roll * p.yawSpeed * dt;

    // Apply rotation
    this.state.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");

    // Thrust
    const thrust = input.up ? p.acceleration : (p.canHover ? 0 : p.acceleration * 0.3);
    const boostMul = input.boost ? p.boostMultiplier : 1;

    // Forward direction from rotation
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(this.state.rotation);

    // Apply thrust along forward direction
    this.state.velocity.addScaledVector(forward, thrust * boostMul * dt);

    // Drag
    const speed = this.state.velocity.length();
    if (speed > 0) {
      const dragForce = p.drag * speed * speed;
      const dragDir = this.state.velocity.clone().normalize().multiplyScalar(-dragForce * dt);
      this.state.velocity.add(dragDir);
    }

    // Speed cap
    if (this.state.velocity.length() > p.maxSpeed * boostMul) {
      this.state.velocity.setLength(p.maxSpeed * boostMul);
    }

    this.state.speed = this.state.velocity.length();

    // Descend with shift
    if (input.down) {
      this.state.velocity.y -= 15 * dt;
    }

    // Apply velocity to position
    this.state.position.add(this.state.velocity.clone().multiplyScalar(dt));

    // Minimum altitude
    if (this.state.position.y < p.minAltitude) {
      this.state.position.y = p.minAltitude;
      if (this.state.velocity.y < 0) this.state.velocity.y = 0;
    }

    this.syncModel();
  }
}
