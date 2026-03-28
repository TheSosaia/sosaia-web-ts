/**
 * VoxelRenderer — high-level API for building chunk meshes.
 * Routes to greedy mesher or face-culled mesher based on config.
 */

import * as THREE from "three";
import { Block } from "./chunkParser";
import { VoxelGrid } from "./voxelGrid";
import { buildChunkMeshCulled } from "./voxelMesher";
import { buildChunkMeshGreedy } from "./greedyMesher";
import { getConfig } from "./config";

/**
 * Build a Three.js Group from an array of blocks.
 * Returns the mesh and the voxel grid (used for physics collision).
 */
export function buildChunkMesh(
  blocks: Block[],
  chunkWorldX: number,
  chunkWorldZ: number,
  chunkSize: number
): { mesh: THREE.Group; grid: VoxelGrid } {
  // Find Y bounds
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of blocks) {
    if (b.y < minY) minY = b.y;
    if (b.y > maxY) maxY = b.y;
  }
  if (minY === Infinity) {
    minY = 0;
    maxY = 0;
  }

  // Build voxel grid
  const grid = new VoxelGrid(chunkSize, chunkSize, minY, maxY);
  grid.populate(blocks);

  const worldOffsetX = chunkWorldX * chunkSize;
  const worldOffsetZ = chunkWorldZ * chunkSize;

  const config = getConfig();
  let mesh: THREE.Group;

  if (config.render.greedyMeshing) {
    mesh = buildChunkMeshGreedy(grid, worldOffsetX, worldOffsetZ);
  } else {
    mesh = buildChunkMeshCulled(grid, worldOffsetX, worldOffsetZ);
  }

  return { mesh, grid };
}
