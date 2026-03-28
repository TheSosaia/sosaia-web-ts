/**
 * Parses Sosaia binary chunk files (.bin)
 *
 * Format:
 *   Header (14 bytes):
 *     magic:     u32 LE = 0x534F5341 ("SOSA")
 *     version:   u16 LE = 1
 *     chunk_x:   i32 LE
 *     chunk_z:   i32 LE
 *   Block count: u32 LE
 *   Block data (6 bytes per block):
 *     local_x:     u8
 *     local_z:     u8
 *     y:           i16 LE
 *     material_id: u16 LE
 */

export interface Block {
  localX: number;
  localZ: number;
  y: number;
  materialId: number;
}

export interface ChunkData {
  chunkX: number;
  chunkZ: number;
  blocks: Block[];
}

const MAGIC = 0x534f5341; // "SOSA"

export function parseChunk(buffer: ArrayBuffer): ChunkData {
  const view = new DataView(buffer);

  // Validate magic
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(`Invalid chunk magic: 0x${magic.toString(16)}`);
  }

  const version = view.getUint16(4, true);
  if (version !== 1) {
    throw new Error(`Unsupported chunk version: ${version}`);
  }

  const chunkX = view.getInt32(6, true);
  const chunkZ = view.getInt32(10, true);
  const blockCount = view.getUint32(14, true);

  const blocks: Block[] = new Array(blockCount);
  const headerSize = 18; // 4 + 2 + 4 + 4 + 4

  for (let i = 0; i < blockCount; i++) {
    const offset = headerSize + i * 6;
    blocks[i] = {
      localX: view.getUint8(offset),
      localZ: view.getUint8(offset + 1),
      y: view.getInt16(offset + 2, true),
      materialId: view.getUint16(offset + 4, true),
    };
  }

  return { chunkX, chunkZ, blocks };
}
