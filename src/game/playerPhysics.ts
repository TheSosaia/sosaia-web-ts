/**
 * Player physics — swept AABB collision detection against voxel grid + gravity.
 *
 * Based on Minecraft's collision model:
 * - Player hitbox: 0.6 wide, 1.8 tall, 0.6 deep
 * - Expand AABB by velocity to find candidate blocks
 * - Resolve collisions axis by axis (Y first, then X, then Z)
 * - Clip velocity against each solid block per axis
 *
 * References:
 * - ClassiCube LocalPlayer.c
 * - Minecraft Entity.java moveEntity()
 */

import * as THREE from "three";
import { VoxelGrid } from "./voxelGrid";
import { getConfig } from "./config";

// Player dimensions (Minecraft standard)
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const HALF_WIDTH = PLAYER_WIDTH / 2;

// Physics constants
const GRAVITY = -20;
const JUMP_VELOCITY = 8;
const MOVE_SPEED = 6;
const SPRINT_MULTIPLIER = 1.5;

interface AABB {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export class PlayerPhysics {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
  private grids: Map<string, { grid: VoxelGrid; offsetX: number; offsetZ: number }>;

  constructor(startX: number, startY: number, startZ: number) {
    this.position = new THREE.Vector3(startX, startY, startZ);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = false;
    this.grids = new Map();
  }

  addGrid(key: string, grid: VoxelGrid, offsetX: number, offsetZ: number): void {
    this.grids.set(key, { grid, offsetX, offsetZ });
  }

  removeGrid(key: string): void {
    this.grids.delete(key);
  }

  getEyePosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + EYE_HEIGHT,
      this.position.z
    );
  }

  jump(): void {
    if (this.onGround) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }
  }

  /** Get player AABB at current position */
  private getAABB(): AABB {
    return {
      minX: this.position.x - HALF_WIDTH,
      minY: this.position.y,
      minZ: this.position.z - HALF_WIDTH,
      maxX: this.position.x + HALF_WIDTH,
      maxY: this.position.y + PLAYER_HEIGHT,
      maxZ: this.position.z + HALF_WIDTH,
    };
  }

  /** Check if a world block position is solid */
  private isSolidAt(bx: number, by: number, bz: number): boolean {
    for (const { grid, offsetX, offsetZ } of this.grids.values()) {
      const lx = bx - offsetX;
      const lz = bz - offsetZ;
      const ly = by - grid.minY;
      if (lx >= 0 && lx < grid.sizeX && lz >= 0 && lz < grid.sizeZ && ly >= 0 && ly < grid.sizeY) {
        if (grid.isSolid(lx, ly, lz)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all solid block AABBs that overlap with an expanded region.
   * Minecraft-style: expand player AABB by velocity, find all solid blocks inside.
   */
  private getCollidableBlocks(aabb: AABB, vx: number, vy: number, vz: number): AABB[] {
    const minX = Math.floor(Math.min(aabb.minX, aabb.minX + vx));
    const minY = Math.floor(Math.min(aabb.minY, aabb.minY + vy));
    const minZ = Math.floor(Math.min(aabb.minZ, aabb.minZ + vz));
    const maxX = Math.floor(Math.max(aabb.maxX, aabb.maxX + vx));
    const maxY = Math.floor(Math.max(aabb.maxY, aabb.maxY + vy));
    const maxZ = Math.floor(Math.max(aabb.maxZ, aabb.maxZ + vz));

    const blocks: AABB[] = [];
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (this.isSolidAt(bx, by, bz)) {
            blocks.push({
              minX: bx, minY: by, minZ: bz,
              maxX: bx + 1, maxY: by + 1, maxZ: bz + 1,
            });
          }
        }
      }
    }
    return blocks;
  }

  /** Clip Y velocity against a block AABB (Minecraft style) */
  private clipY(aabb: AABB, block: AABB, vy: number): number {
    if (aabb.maxX <= block.minX || aabb.minX >= block.maxX) return vy;
    if (aabb.maxZ <= block.minZ || aabb.minZ >= block.maxZ) return vy;

    if (vy > 0 && aabb.maxY <= block.minY) {
      const clip = block.minY - aabb.maxY;
      if (clip < vy) return clip;
    } else if (vy < 0 && aabb.minY >= block.maxY) {
      const clip = block.maxY - aabb.minY;
      if (clip > vy) return clip;
    }
    return vy;
  }

  /** Clip X velocity against a block AABB */
  private clipX(aabb: AABB, block: AABB, vx: number): number {
    if (aabb.maxY <= block.minY || aabb.minY >= block.maxY) return vx;
    if (aabb.maxZ <= block.minZ || aabb.minZ >= block.maxZ) return vx;

    if (vx > 0 && aabb.maxX <= block.minX) {
      const clip = block.minX - aabb.maxX;
      if (clip < vx) return clip;
    } else if (vx < 0 && aabb.minX >= block.maxX) {
      const clip = block.maxX - aabb.minX;
      if (clip > vx) return clip;
    }
    return vx;
  }

  /** Clip Z velocity against a block AABB */
  private clipZ(aabb: AABB, block: AABB, vz: number): number {
    if (aabb.maxX <= block.minX || aabb.minX >= block.maxX) return vz;
    if (aabb.maxY <= block.minY || aabb.minY >= block.maxY) return vz;

    if (vz > 0 && aabb.maxZ <= block.minZ) {
      const clip = block.minZ - aabb.maxZ;
      if (clip < vz) return clip;
    } else if (vz < 0 && aabb.minZ >= block.maxZ) {
      const clip = block.maxZ - aabb.minZ;
      if (clip > vz) return clip;
    }
    return vz;
  }

  /**
   * Update physics for one frame.
   * Uses swept AABB collision resolution — Minecraft's axis-by-axis method.
   */
  update(moveDir: THREE.Vector3, dt: number, sprinting: boolean): void {
    const config = getConfig();
    const speed = MOVE_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);

    // Movement velocity
    let vx = moveDir.x * speed * dt;
    let vz = moveDir.z * speed * dt;

    // Gravity
    if (config.physics.gravity) {
      this.velocity.y += GRAVITY * dt;
    }
    let vy = this.velocity.y * dt;

    if (config.physics.collision) {
      const aabb = this.getAABB();
      const blocks = this.getCollidableBlocks(aabb, vx, vy, vz);

      // Resolve Y first (gravity / jumping)
      for (const block of blocks) {
        vy = this.clipY(aabb, block, vy);
      }
      aabb.minY += vy;
      aabb.maxY += vy;

      // Resolve X
      for (const block of blocks) {
        vx = this.clipX(aabb, block, vx);
      }
      aabb.minX += vx;
      aabb.maxX += vx;

      // Resolve Z
      for (const block of blocks) {
        vz = this.clipZ(aabb, block, vz);
      }

      // Ground detection
      this.onGround = (vy !== this.velocity.y * dt) && this.velocity.y < 0;
      if (vy !== this.velocity.y * dt) {
        this.velocity.y = 0;
      }
    }

    // Apply resolved movement
    this.position.x += vx;
    this.position.y += vy;
    this.position.z += vz;

    // Safety floor
    if (this.position.y < -100) {
      this.position.y = 50;
      this.velocity.y = 0;
    }
  }
}
