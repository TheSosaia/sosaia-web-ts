/**
 * ChunkLoader — fetches chunk .bin files from CDN and caches them.
 */

import { ChunkData, parseChunk } from "./chunkParser";

export interface ChunkManifest {
  city: string;
  bbox: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  };
  chunk_size_meters: number;
  chunks: {
    x: number;
    z: number;
    file: string;
    block_count: number;
    size_bytes: number;
  }[];
  total_blocks: number;
}

export class ChunkLoader {
  private baseURL: string;
  private manifest: ChunkManifest | null = null;
  private cache = new Map<string, ChunkData>();
  private loading = new Set<string>();

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  /** Load the city manifest */
  async loadManifest(): Promise<ChunkManifest> {
    const res = await fetch(`${this.baseURL}/manifest.json`);
    if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
    this.manifest = await res.json();
    return this.manifest!;
  }

  /** Get chunk size in meters */
  getChunkSize(): number {
    return this.manifest?.chunk_size_meters ?? 200;
  }

  /** Get a chunk key string */
  private key(x: number, z: number): string {
    return `${x}_${z}`;
  }

  /** Check if a chunk exists in the manifest */
  hasChunk(x: number, z: number): boolean {
    if (!this.manifest) return false;
    return this.manifest.chunks.some((c) => c.x === x && c.z === z);
  }

  /** Load a chunk by grid coordinates */
  async loadChunk(x: number, z: number): Promise<ChunkData | null> {
    const k = this.key(x, z);

    // Return cached
    if (this.cache.has(k)) return this.cache.get(k)!;

    // Already loading
    if (this.loading.has(k)) return null;

    // Check if chunk exists
    if (!this.hasChunk(x, z)) return null;

    this.loading.add(k);

    try {
      const res = await fetch(`${this.baseURL}/${k}.bin`);
      if (!res.ok) return null;

      const buffer = await res.arrayBuffer();
      const chunk = parseChunk(buffer);
      this.cache.set(k, chunk);
      return chunk;
    } catch (err) {
      console.error(`Failed to load chunk ${k}:`, err);
      return null;
    } finally {
      this.loading.delete(k);
    }
  }

  /** Check if a chunk is cached */
  isCached(x: number, z: number): boolean {
    return this.cache.has(this.key(x, z));
  }

  /** Get available chunk coordinates from manifest */
  getAvailableChunks(): { x: number; z: number }[] {
    if (!this.manifest) return [];
    return this.manifest.chunks.map((c) => ({ x: c.x, z: c.z }));
  }
}
