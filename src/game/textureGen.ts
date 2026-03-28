/**
 * Procedural 16x16 pixel texture generator with 4 variants per material.
 *
 * Each material gets a 64x16 texture atlas (4 variants side by side).
 * Variants:
 *   0: standard
 *   1: aged/darker (old, weathered)
 *   2: warm shift (sun-bleached or newer)
 *   3: stained/mossy (moisture, wear)
 *
 * The mesher selects variant per-block using a position hash → UV offset.
 */

const TEX_SIZE = 16;
export const VARIANT_COUNT = 4;
export const ATLAS_WIDTH = TEX_SIZE * VARIANT_COUNT; // 64px wide

type RGBA = [number, number, number, number];

/** Create a single-variant canvas (16x16) */
function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Create atlas canvas (64x16) for 4 variants */
function createAtlasCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Set a single pixel */
function setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, g: number, b: number, a = 255) {
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(x, y, 1, 1);
}

/** Fill entire canvas with a color */
function fill(ctx: CanvasRenderingContext2D, r: number, g: number, b: number) {
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
}

/** Simple seeded random for deterministic textures */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff);
  };
}

/** Add noise variation to a base color */
function noisy(
  ctx: CanvasRenderingContext2D,
  baseR: number, baseG: number, baseB: number,
  variance: number, seed: number
) {
  const rng = seededRandom(seed);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = (rng() - 0.5) * variance * 2;
      setPixel(ctx, x, y,
        Math.max(0, Math.min(255, baseR + v)),
        Math.max(0, Math.min(255, baseG + v)),
        Math.max(0, Math.min(255, baseB + v))
      );
    }
  }
}

/** Draw horizontal brick pattern */
function brickPattern(ctx: CanvasRenderingContext2D, brickR: number, brickG: number, brickB: number, mortarR: number, mortarG: number, mortarB: number, seed: number) {
  const rng = seededRandom(seed);
  // Fill with brick
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = (rng() - 0.5) * 20;
      setPixel(ctx, x, y, brickR + v, brickG + v, brickB + v);
    }
  }
  // Horizontal mortar lines
  for (let x = 0; x < TEX_SIZE; x++) {
    setPixel(ctx, x, 0, mortarR, mortarG, mortarB);
    setPixel(ctx, x, 8, mortarR, mortarG, mortarB);
  }
  // Vertical mortar lines (offset every other row)
  for (let y = 1; y < 8; y++) {
    setPixel(ctx, 0, y, mortarR, mortarG, mortarB);
    setPixel(ctx, 8, y, mortarR, mortarG, mortarB);
  }
  for (let y = 9; y < 16; y++) {
    setPixel(ctx, 4, y, mortarR, mortarG, mortarB);
    setPixel(ctx, 12, y, mortarR, mortarG, mortarB);
  }
}

/** Draw wood grain pattern */
function woodPattern(ctx: CanvasRenderingContext2D, baseR: number, baseG: number, baseB: number, grainR: number, grainG: number, grainB: number, seed: number) {
  const rng = seededRandom(seed);
  noisy(ctx, baseR, baseG, baseB, 10, seed);
  // Vertical grain lines
  for (let x = 0; x < TEX_SIZE; x++) {
    if (rng() > 0.7) {
      for (let y = 0; y < TEX_SIZE; y++) {
        if (rng() > 0.3) {
          setPixel(ctx, x, y, grainR + (rng() - 0.5) * 15, grainG + (rng() - 0.5) * 15, grainB + (rng() - 0.5) * 15);
        }
      }
    }
  }
}

/** Draw stone brick pattern */
function stoneBrickPattern(ctx: CanvasRenderingContext2D, stoneR: number, stoneG: number, stoneB: number, seed: number) {
  const rng = seededRandom(seed);
  noisy(ctx, stoneR, stoneG, stoneB, 15, seed);
  // Grid lines
  const mortarR = stoneR - 30, mortarG = stoneG - 30, mortarB = stoneB - 30;
  for (let x = 0; x < TEX_SIZE; x++) {
    setPixel(ctx, x, 0, mortarR, mortarG, mortarB);
    setPixel(ctx, x, 8, mortarR, mortarG, mortarB);
  }
  for (let y = 0; y < TEX_SIZE; y++) {
    const offset = (y < 8) ? 0 : 4;
    setPixel(ctx, offset, y, mortarR, mortarG, mortarB);
    setPixel(ctx, offset + 8, y, mortarR, mortarG, mortarB);
  }
}

/**
 * Apply a variant color shift to an existing canvas.
 * Reads all pixels, shifts RGB, writes back.
 */
function applyVariantShift(
  ctx: CanvasRenderingContext2D,
  variant: number,
  seed: number
): void {
  const imageData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  const data = imageData.data;
  const rng = seededRandom(seed + variant * 1000);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    switch (variant) {
      case 1: // Aged/darker — reduce brightness, slight yellow shift
        r = Math.max(0, r * 0.82 + 5);
        g = Math.max(0, g * 0.80 + 3);
        b = Math.max(0, b * 0.75);
        break;
      case 2: // Warm/newer — slight orange shift, brighter
        r = Math.min(255, r * 1.08 + 8);
        g = Math.min(255, g * 1.02);
        b = Math.max(0, b * 0.92);
        break;
      case 3: // Stained/mossy — green tint in random patches
        if (rng() > 0.6) {
          r = Math.max(0, r * 0.7);
          g = Math.min(255, g * 0.9 + 15);
          b = Math.max(0, b * 0.7);
        } else {
          // General grime
          r = Math.max(0, r * 0.88);
          g = Math.max(0, g * 0.86);
          b = Math.max(0, b * 0.82);
        }
        break;
    }

    // Add per-pixel noise for organic feel
    const noise = (rng() - 0.5) * 6;
    data[i] = Math.max(0, Math.min(255, r + noise));
    data[i + 1] = Math.max(0, Math.min(255, g + noise));
    data[i + 2] = Math.max(0, Math.min(255, b + noise));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Generate a 64x16 texture atlas with 4 variants for a material ID.
 * Variant 0: standard, 1: aged, 2: warm, 3: mossy/stained
 */
export function generateTextureAtlas(materialId: number): HTMLCanvasElement {
  const { canvas: atlas, ctx: atlasCtx } = createAtlasCanvas();

  for (let v = 0; v < VARIANT_COUNT; v++) {
    // Generate base texture for this variant (different seed)
    const singleCanvas = generateTexture(materialId, v);
    // Draw into atlas at the correct horizontal offset
    atlasCtx.drawImage(singleCanvas, v * TEX_SIZE, 0);
  }

  return atlas;
}

/** Generate single 16x16 texture canvas for a material ID + variant */
export function generateTexture(materialId: number, variant: number = 0): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas();

  switch (materialId) {
    // Terrain
    case 1: // grass
      noisy(ctx, 91, 140, 62, 20, 1);
      // Darker bottom half (dirt side)
      for (let x = 0; x < TEX_SIZE; x++) {
        for (let y = 12; y < TEX_SIZE; y++) {
          setPixel(ctx, x, y, 139, 105, 20);
        }
      }
      break;
    case 2: // dirt
      noisy(ctx, 139, 105, 20, 15, 2);
      break;
    case 3: // sand
      noisy(ctx, 212, 194, 120, 12, 3);
      break;
    case 4: // stone
      noisy(ctx, 127, 127, 127, 20, 4);
      break;
    case 5: // gravel
      noisy(ctx, 158, 158, 158, 25, 5);
      break;
    case 6: // water
      noisy(ctx, 48, 100, 180, 10, 6);
      break;
    case 7: // snow
      noisy(ctx, 240, 240, 240, 8, 7);
      break;
    case 8: // mud
      noisy(ctx, 92, 74, 58, 12, 8);
      break;
    case 9: // farmland
      noisy(ctx, 122, 92, 46, 15, 9);
      break;

    // Roads
    case 10: // asphalt
      noisy(ctx, 44, 44, 44, 8, 10);
      break;
    case 11: // concrete_light
      noisy(ctx, 176, 176, 176, 10, 11);
      break;
    case 12: // cobblestone
      stoneBrickPattern(ctx, 107, 107, 107, 12);
      break;
    case 13: // dirt_path
      noisy(ctx, 160, 128, 80, 12, 13);
      break;
    case 14: // brick_road
      brickPattern(ctx, 139, 69, 19, 100, 80, 60, 14);
      break;
    case 15: // stone_slab
      noisy(ctx, 128, 128, 128, 10, 15);
      break;

    // Building walls
    case 20: // brick_red
      brickPattern(ctx, 160, 82, 45, 140, 135, 130, 20);
      break;
    case 21: // brick_dark
      brickPattern(ctx, 92, 51, 23, 70, 65, 60, 21);
      break;
    case 22: // stone_bricks
      stoneBrickPattern(ctx, 107, 107, 107, 22);
      break;
    case 23: // concrete_white
      noisy(ctx, 232, 232, 232, 6, 23);
      break;
    case 24: // concrete_gray
      noisy(ctx, 144, 144, 144, 8, 24);
      break;
    case 25: // concrete_dark
      noisy(ctx, 80, 80, 80, 8, 25);
      break;
    case 26: // sandstone
      noisy(ctx, 212, 184, 150, 12, 26);
      break;
    case 27: // sandstone_smooth
      noisy(ctx, 224, 205, 168, 6, 27);
      break;
    case 28: // quartz
      noisy(ctx, 236, 228, 212, 5, 28);
      break;
    case 29: // wood_oak
      woodPattern(ctx, 184, 148, 95, 155, 120, 70, 29);
      break;
    case 30: // wood_dark
      woodPattern(ctx, 74, 55, 40, 55, 38, 25, 30);
      break;
    case 31: // wood_spruce
      woodPattern(ctx, 122, 96, 64, 100, 75, 45, 31);
      break;
    case 32: // wood_birch
      woodPattern(ctx, 200, 192, 140, 180, 170, 120, 32);
      break;
    case 33: // wood_acacia
      woodPattern(ctx, 168, 92, 50, 140, 70, 35, 33);
      break;
    case 34: // andesite
      noisy(ctx, 138, 138, 138, 15, 34);
      break;
    case 35: // granite
      noisy(ctx, 158, 126, 106, 15, 35);
      break;
    case 36: // diorite
      noisy(ctx, 192, 192, 192, 15, 36);
      break;
    case 37: // deepslate
      noisy(ctx, 58, 58, 58, 10, 37);
      break;
    case 38: // blackstone
      noisy(ctx, 42, 42, 42, 8, 38);
      break;
    case 39: // terracotta
      noisy(ctx, 192, 112, 64, 12, 39);
      break;
    case 40: // terracotta_white
      noisy(ctx, 212, 196, 176, 8, 40);
      break;
    case 41: // terracotta_brown
      noisy(ctx, 122, 92, 64, 10, 41);
      break;
    case 42: // terracotta_gray
      noisy(ctx, 138, 138, 128, 10, 42);
      break;
    case 43: // terracotta_light_blue
      noisy(ctx, 122, 158, 176, 10, 43);
      break;
    case 44: // concrete_brown
      noisy(ctx, 107, 66, 38, 8, 44);
      break;
    case 45: // mud_bricks
      brickPattern(ctx, 139, 115, 85, 120, 100, 75, 45);
      break;
    case 46: // nether_brick
      brickPattern(ctx, 60, 20, 20, 40, 15, 15, 46);
      break;
    case 47: // prismarine
      noisy(ctx, 92, 158, 138, 15, 47);
      break;
    case 48: // iron_block
      noisy(ctx, 192, 192, 192, 5, 48);
      break;
    case 49: // concrete_orange
      noisy(ctx, 208, 112, 32, 8, 49);
      break;

    // Roofs
    case 50: // roof_stone_brick
      stoneBrickPattern(ctx, 90, 90, 90, 50);
      break;
    case 51: // roof_brick
      brickPattern(ctx, 139, 58, 42, 110, 90, 80, 51);
      break;
    case 52: // roof_dark
      noisy(ctx, 42, 42, 42, 8, 52);
      break;
    case 53: // roof_sandstone
      noisy(ctx, 196, 168, 120, 10, 53);
      break;
    case 54: // roof_wood
      woodPattern(ctx, 107, 78, 46, 85, 60, 35, 54);
      break;
    case 55: // roof_quartz
      noisy(ctx, 212, 204, 184, 5, 55);
      break;
    case 56: // roof_flat_white
      noisy(ctx, 208, 208, 208, 6, 56);
      break;
    case 57: // roof_flat_gray
      noisy(ctx, 120, 120, 120, 8, 57);
      break;

    // Glass — semi-transparent with slight color
    case 70: // glass_clear
      fill(ctx, 200, 232, 255); ctx.globalAlpha = 0.3; fill(ctx, 255, 255, 255); ctx.globalAlpha = 1;
      // Highlight lines
      setPixel(ctx, 0, 0, 255, 255, 255);
      setPixel(ctx, 1, 0, 220, 240, 255);
      setPixel(ctx, 0, 1, 220, 240, 255);
      break;
    case 71: noisy(ctx, 224, 232, 240, 5, 71); break; // glass_white
    case 72: noisy(ctx, 128, 136, 144, 5, 72); break; // glass_gray
    case 73: noisy(ctx, 160, 168, 176, 5, 73); break; // glass_light_gray
    case 74: noisy(ctx, 139, 115, 85, 5, 74); break;  // glass_brown
    case 75: noisy(ctx, 68, 136, 204, 5, 75); break;  // glass_blue
    case 76: noisy(ctx, 64, 136, 152, 5, 76); break;  // glass_cyan
    case 77: noisy(ctx, 96, 96, 104, 5, 77); break;   // glass_tinted
    case 78: noisy(ctx, 192, 216, 232, 5, 78); break;  // glass_pane

    // Details
    case 80: woodPattern(ctx, 139, 105, 20, 115, 85, 15, 80); break; // door_oak
    case 81: woodPattern(ctx, 58, 40, 16, 42, 28, 10, 81); break;    // door_dark
    case 82: woodPattern(ctx, 92, 64, 32, 75, 50, 22, 82); break;    // door_spruce
    case 83: woodPattern(ctx, 184, 148, 95, 155, 120, 70, 83); break; // fence
    case 84: noisy(ctx, 107, 107, 107, 10, 84); break; // rail
    case 85: woodPattern(ctx, 184, 148, 95, 155, 120, 70, 85); break; // ladder
    case 86: noisy(ctx, 138, 138, 138, 5, 86); break;  // iron_bars
    case 87: stoneBrickPattern(ctx, 107, 107, 107, 87); break; // wall_stone
    case 88: brickPattern(ctx, 139, 69, 19, 100, 80, 60, 88); break; // wall_brick
    case 89: noisy(ctx, 122, 122, 122, 20, 89); break; // wall_cobble

    // Nature — logs
    case 90: // log_oak
      woodPattern(ctx, 107, 78, 46, 85, 60, 35, 90);
      break;
    case 91: woodPattern(ctx, 58, 40, 16, 42, 28, 10, 91); break; // log_dark_oak
    case 92: // log_birch
      noisy(ctx, 212, 204, 160, 8, 92);
      // Black spots
      { const rng = seededRandom(920);
        for (let i = 0; i < 8; i++) {
          setPixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 40, 35, 30);
        }
      }
      break;
    case 93: woodPattern(ctx, 74, 48, 32, 55, 35, 20, 93); break;  // log_spruce
    case 94: noisy(ctx, 107, 107, 107, 10, 94); break; // log_acacia
    case 95: woodPattern(ctx, 92, 64, 32, 75, 50, 22, 95); break;  // log_jungle

    // Nature — leaves
    case 96: noisy(ctx, 58, 120, 40, 25, 96); break;  // leaves_oak
    case 97: noisy(ctx, 42, 92, 24, 20, 97); break;   // leaves_dark_oak
    case 98: noisy(ctx, 92, 144, 64, 20, 98); break;  // leaves_birch
    case 99: noisy(ctx, 26, 74, 16, 15, 99); break;   // leaves_spruce

    // Interior
    case 100: // bookshelf
      woodPattern(ctx, 184, 148, 95, 155, 120, 70, 100);
      // Book spines
      for (let y = 2; y < 7; y++) {
        for (let x = 1; x < 15; x += 3) {
          const colors = [[180, 40, 40], [40, 40, 180], [40, 120, 40], [180, 180, 40]];
          const c = colors[Math.floor(x / 3) % colors.length];
          setPixel(ctx, x, y, c[0], c[1], c[2]);
          setPixel(ctx, x + 1, y, c[0] - 20, c[1] - 20, c[2] - 20);
        }
      }
      for (let y = 9; y < 14; y++) {
        for (let x = 2; x < 14; x += 3) {
          const colors = [[120, 40, 40], [40, 40, 120], [100, 60, 20]];
          const c = colors[Math.floor(x / 3) % colors.length];
          setPixel(ctx, x, y, c[0], c[1], c[2]);
          setPixel(ctx, x + 1, y, c[0] - 20, c[1] - 20, c[2] - 20);
        }
      }
      break;
    case 101: noisy(ctx, 184, 148, 95, 15, 101); break; // crafting_table
    case 102: noisy(ctx, 107, 107, 107, 10, 102); break; // furnace
    case 103: noisy(ctx, 232, 232, 232, 4, 103); break;  // carpet_white
    case 104: noisy(ctx, 176, 32, 32, 8, 104); break;    // carpet_red
    case 105: noisy(ctx, 176, 32, 32, 10, 105); break;   // bed
    case 106: woodPattern(ctx, 139, 105, 20, 115, 85, 15, 106); break; // chest
    case 107: woodPattern(ctx, 107, 78, 46, 85, 60, 35, 107); break;   // barrel

    // Misc
    case 110: noisy(ctx, 26, 26, 26, 5, 110); break;  // bedrock
    case 111: noisy(ctx, 232, 208, 80, 10, 111); break; // glowstone
    case 112: // flower_red
      fill(ctx, 91, 140, 62);
      setPixel(ctx, 7, 4, 208, 48, 48); setPixel(ctx, 8, 4, 208, 48, 48);
      setPixel(ctx, 6, 5, 208, 48, 48); setPixel(ctx, 9, 5, 208, 48, 48);
      setPixel(ctx, 7, 5, 240, 60, 60); setPixel(ctx, 8, 5, 240, 60, 60);
      setPixel(ctx, 7, 6, 208, 48, 48); setPixel(ctx, 8, 6, 208, 48, 48);
      // stem
      setPixel(ctx, 7, 7, 60, 100, 30); setPixel(ctx, 7, 8, 60, 100, 30);
      setPixel(ctx, 7, 9, 60, 100, 30);
      break;
    case 113: // flower_yellow
      fill(ctx, 91, 140, 62);
      setPixel(ctx, 7, 4, 240, 220, 50); setPixel(ctx, 8, 4, 240, 220, 50);
      setPixel(ctx, 7, 5, 240, 220, 50); setPixel(ctx, 8, 5, 240, 220, 50);
      setPixel(ctx, 7, 7, 60, 100, 30); setPixel(ctx, 7, 8, 60, 100, 30);
      break;
    case 114: // flower_blue
      fill(ctx, 91, 140, 62);
      setPixel(ctx, 7, 4, 60, 80, 220); setPixel(ctx, 8, 4, 60, 80, 220);
      setPixel(ctx, 7, 5, 60, 80, 220); setPixel(ctx, 8, 5, 60, 80, 220);
      setPixel(ctx, 7, 7, 60, 100, 30); setPixel(ctx, 7, 8, 60, 100, 30);
      break;
    case 115: noisy(ctx, 74, 136, 48, 20, 115); break;   // short_grass
    case 116: noisy(ctx, 58, 112, 32, 20, 116); break;   // tall_grass
    case 117: noisy(ctx, 107, 92, 58, 15, 117); break;   // dead_bush
    case 118: noisy(ctx, 160, 216, 240, 8, 118); break;  // ice
    case 119: noisy(ctx, 128, 184, 216, 8, 119); break;  // packed_ice
    case 120: noisy(ctx, 107, 92, 58, 15, 120); break;   // coarse_dirt
    case 121: noisy(ctx, 92, 74, 32, 12, 121); break;    // podzol
    case 122: noisy(ctx, 200, 176, 64, 10, 122); break;  // hay_bale
    case 123: noisy(ctx, 184, 160, 96, 10, 123); break;  // scaffolding
    case 124: noisy(ctx, 200, 200, 200, 8, 124); break;  // cobweb
    case 125: noisy(ctx, 74, 120, 40, 15, 125); break;   // moss
    case 126: noisy(ctx, 42, 104, 24, 20, 126); break;   // leaves_jungle
    case 127: noisy(ctx, 92, 136, 48, 18, 127); break;   // leaves_acacia
    case 128: noisy(ctx, 58, 104, 32, 18, 128); break;   // fern
    case 129: noisy(ctx, 200, 200, 80, 10, 129); break;  // sponge
    case 130: noisy(ctx, 144, 144, 160, 10, 130); break; // clay
    case 131: woodPattern(ctx, 107, 78, 46, 85, 60, 35, 131); break; // sign

    default:
      // Magenta checkerboard for unmapped materials
      for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
          const checker = (x + y) % 2 === 0;
          setPixel(ctx, x, y, checker ? 255 : 0, 0, checker ? 0 : 255);
        }
      }
      break;
  }

  // Apply variant color shift (variant 0 = no shift)
  if (variant > 0) {
    applyVariantShift(ctx, variant, materialId * 100 + variant);
  }

  return canvas;
}
