/**
 * TileStreamer — chunk-level proximity streaming.
 *
 * Only fetches and meshes chunks near the player.
 * Disposes chunks that are far away.
 */

import * as THREE from "three";
import { ChunkLoader, ChunkManifest } from "./chunkLoader";
import { ChunkData } from "./chunkParser";
import { buildChunkMesh } from "./voxelRenderer";
import { PlayerPhysics } from "./playerPhysics";
import {
  TILE_LAYOUT,
  TILE_SIZE,
  CHUNK_SIZE,
  CHUNKS_PER_TILE,
  tileWorldOrigin,
} from "./tileConfig";

/** How many chunks away from the player to load */
const LOAD_RADIUS = 2;
/** How many chunks away before disposing */
const DISPOSE_RADIUS = 5;

interface MeshedChunk {
  mesh: THREE.Group;
  gridKey: string;
  globalCX: number;
  globalCZ: number;
}

interface TileManifest {
  tileIdx: number;
  loader: ChunkLoader;
  manifest: ChunkManifest;
}

export class TileStreamer {
  private baseURL: string;
  private scene: THREE.Scene | null = null;
  private physics: PlayerPhysics | null = null;

  /** Tile manifests (loaded once, lightweight) */
  private tileManifests: Map<number, TileManifest> = new Map();
  private tileManifestLoading: Set<number> = new Set();

  /** Loaded/meshed chunks keyed by "gx_gz" global chunk coords */
  private meshedChunks: Map<string, MeshedChunk> = new Map();
  /** Chunks currently being fetched */
  private fetchingChunks: Set<string> = new Set();
  /** Chunks fetched but not yet meshed */
  private meshQueue: { chunkData: ChunkData; globalCX: number; globalCZ: number; tileIdx: number }[] = [];

  /** Last known player chunk position */
  private playerCX = -999;
  private playerCZ = -999;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  setScene(scene: THREE.Scene, physics: PlayerPhysics): void {
    this.scene = scene;
    this.physics = physics;
  }

  getSpawnPosition(): { x: number; y: number; z: number } {
    const origin = tileWorldOrigin(0);
    return {
      x: origin.x + TILE_SIZE / 2,
      y: 50,
      z: origin.z + TILE_SIZE / 2,
    };
  }

  /** Call every frame */
  update(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);

    // Only re-evaluate when player moves to a new chunk
    if (cx !== this.playerCX || cz !== this.playerCZ) {
      this.playerCX = cx;
      this.playerCZ = cz;
      console.log(`[TileStreamer] Player in global chunk (${cx}, ${cz})`);
      this.loadNearbyChunks(cx, cz);
      this.disposeDistantChunks(cx, cz);
    }

    // Mesh 1 chunk per frame from queue
    this.processMeshQueue();
  }

  private loadNearbyChunks(cx: number, cz: number): void {
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        const gx = cx + dx;
        const gz = cz + dz;
        const key = `${gx}_${gz}`;

        if (this.meshedChunks.has(key) || this.fetchingChunks.has(key)) continue;

        // Figure out which tile this global chunk belongs to
        const tileCol = Math.floor(gx / CHUNKS_PER_TILE);
        const tileRow = Math.floor(gz / CHUNKS_PER_TILE);
        const tileIdx = TILE_LAYOUT.findIndex((t) => t.col === tileCol && t.row === tileRow);
        if (tileIdx < 0) continue;

        // Local chunk coords within the tile
        const localX = gx - tileCol * CHUNKS_PER_TILE;
        const localZ = gz - tileRow * CHUNKS_PER_TILE;
        if (localX < 0 || localX >= CHUNKS_PER_TILE || localZ < 0 || localZ >= CHUNKS_PER_TILE) continue;

        // Ensure tile manifest is loaded
        if (!this.tileManifests.has(tileIdx) && !this.tileManifestLoading.has(tileIdx)) {
          this.loadTileManifest(tileIdx);
        }

        // If manifest available, fetch the chunk
        const tm = this.tileManifests.get(tileIdx);
        if (tm && tm.manifest.chunks.some((c) => c.x === localX && c.z === localZ)) {
          this.fetchChunk(tileIdx, localX, localZ, gx, gz);
        }
      }
    }
  }

  private async loadTileManifest(tileIdx: number): Promise<void> {
    this.tileManifestLoading.add(tileIdx);
    const tileId = TILE_LAYOUT[tileIdx].id;
    const tileURL = `${this.baseURL}/${tileId}`;
    const loader = new ChunkLoader(tileURL);

    try {
      console.log(`[TileStreamer] Loading manifest for ${tileId}`);
      const manifest = await loader.loadManifest();
      this.tileManifests.set(tileIdx, { tileIdx, loader, manifest });
    } catch (err) {
      console.error(`Failed to load manifest for ${tileId}:`, err);
    } finally {
      this.tileManifestLoading.delete(tileIdx);
    }
  }

  private async fetchChunk(tileIdx: number, localX: number, localZ: number, gx: number, gz: number): Promise<void> {
    const key = `${gx}_${gz}`;
    this.fetchingChunks.add(key);

    const tm = this.tileManifests.get(tileIdx);
    if (!tm) {
      this.fetchingChunks.delete(key);
      return;
    }

    try {
      const chunkData = await tm.loader.loadChunk(localX, localZ);
      if (chunkData) {
        this.meshQueue.push({ chunkData, globalCX: gx, globalCZ: gz, tileIdx });
      }
    } catch (err) {
      console.error(`Failed to fetch chunk ${key}:`, err);
    } finally {
      this.fetchingChunks.delete(key);
    }
  }

  private processMeshQueue(): void {
    if (!this.scene || !this.physics || this.meshQueue.length === 0) return;

    // Sort by distance to player — closest first
    this.meshQueue.sort((a, b) => {
      const da = Math.abs(a.globalCX - this.playerCX) + Math.abs(a.globalCZ - this.playerCZ);
      const db = Math.abs(b.globalCX - this.playerCX) + Math.abs(b.globalCZ - this.playerCZ);
      return da - db;
    });

    // Mesh 1 chunk
    const item = this.meshQueue.shift()!;
    const { chunkData, globalCX, globalCZ, tileIdx } = item;
    const key = `${globalCX}_${globalCZ}`;

    // Skip if already meshed (race condition) or too far now
    if (this.meshedChunks.has(key)) return;
    const dist = Math.max(Math.abs(globalCX - this.playerCX), Math.abs(globalCZ - this.playerCZ));
    if (dist > DISPOSE_RADIUS) return;

    // Cap blocks to keep meshing fast — skip ground-level filler blocks first
    let blocks = chunkData.blocks;
    const MAX_BLOCKS = 200_000;
    if (blocks.length > MAX_BLOCKS) {
      // Keep blocks above ground level (y > 0) and sample the rest
      const important = blocks.filter((b) => b.y > 0);
      if (important.length > MAX_BLOCKS) {
        // Downsample by keeping every Nth block
        const step = Math.ceil(important.length / MAX_BLOCKS);
        blocks = important.filter((_, i) => i % step === 0);
      } else {
        blocks = important;
      }
      console.log(`[TileStreamer] Capped ${chunkData.blocks.length} → ${blocks.length} blocks`);
    }

    const { mesh, grid } = buildChunkMesh(
      blocks,
      globalCX,
      globalCZ,
      CHUNK_SIZE
    );

    const gridKey = `t${tileIdx}_${globalCX}_${globalCZ}`;
    mesh.name = gridKey;
    this.scene.add(mesh);

    this.physics.addGrid(gridKey, grid, globalCX * CHUNK_SIZE, globalCZ * CHUNK_SIZE);

    this.meshedChunks.set(key, { mesh, gridKey, globalCX, globalCZ });
    console.log(`[TileStreamer] Meshed ${key} (${chunkData.blocks.length} blocks, queue: ${this.meshQueue.length})`);
  }

  private disposeDistantChunks(cx: number, cz: number): void {
    for (const [key, chunk] of this.meshedChunks) {
      const dist = Math.max(Math.abs(chunk.globalCX - cx), Math.abs(chunk.globalCZ - cz));
      if (dist > DISPOSE_RADIUS) {
        console.log(`[TileStreamer] Disposing chunk ${key}`);
        this.scene?.remove(chunk.mesh);
        chunk.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        this.physics?.removeGrid(chunk.gridKey);
        this.meshedChunks.delete(key);
      }
    }
  }

  dispose(): void {
    for (const [key, chunk] of this.meshedChunks) {
      this.scene?.remove(chunk.mesh);
      chunk.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.physics?.removeGrid(chunk.gridKey);
    }
    this.meshedChunks.clear();
    this.meshQueue.length = 0;
    this.fetchingChunks.clear();
  }
}
