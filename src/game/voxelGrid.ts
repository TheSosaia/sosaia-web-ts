/**
 * VoxelGrid — 3D grid that stores material IDs for fast neighbor lookups.
 * Used by the mesher for face culling and AO computation.
 *
 * Based on ClassiCube's approach: store blocks in a flat array indexed by (x, y, z).
 */

import { Block } from "./chunkParser";

export class VoxelGrid {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly minY: number;
  private data: Uint16Array;

  constructor(sizeX: number, sizeZ: number, minY: number, maxY: number) {
    this.sizeX = sizeX;
    this.sizeZ = sizeZ;
    this.minY = minY;
    this.sizeY = maxY - minY + 1;
    this.data = new Uint16Array(this.sizeX * this.sizeY * this.sizeZ);
  }

  /** Populate grid from block array */
  populate(blocks: Block[]): void {
    for (const b of blocks) {
      if (b.materialId === 0) continue;
      const y = b.y - this.minY;
      if (y < 0 || y >= this.sizeY) continue;
      if (b.localX < 0 || b.localX >= this.sizeX) continue;
      if (b.localZ < 0 || b.localZ >= this.sizeZ) continue;
      this.data[this.index(b.localX, y, b.localZ)] = b.materialId;
    }
  }

  /** Get material at local coordinates. Returns 0 (air) if out of bounds. */
  get(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.sizeX) return 0;
    if (y < 0 || y >= this.sizeY) return 0;
    if (z < 0 || z >= this.sizeZ) return 0;
    return this.data[this.index(x, y, z)];
  }

  /** Check if a block is solid (non-air, non-transparent) */
  isSolid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== 0;
  }

  /** Check if a block is opaque (solid and not transparent) */
  isOpaque(x: number, y: number, z: number): boolean {
    const mat = this.get(x, y, z);
    // Transparent materials: water (6), glass (70-78)
    if (mat === 0) return false;
    if (mat === 6) return false;
    if (mat >= 70 && mat <= 78) return false;
    return true;
  }

  private index(x: number, y: number, z: number): number {
    return y * this.sizeX * this.sizeZ + z * this.sizeX + x;
  }
}
