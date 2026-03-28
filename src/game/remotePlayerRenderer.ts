/**
 * Renders remote players as simple voxel characters.
 * Each player = colored cube body + head + nameplate.
 */

import * as THREE from "three";
import { RemotePlayer } from "./network";

// Player colors — assigned by hashing userId
const PLAYER_COLORS = [
  0x4488CC, 0xCC4444, 0x44CC44, 0xCCCC44,
  0xCC44CC, 0x44CCCC, 0xFF8844, 0x8844FF,
];

function hashColor(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length];
}

interface PlayerMesh {
  group: THREE.Group;
  targetPos: THREE.Vector3;
  targetHeading: number;
}

export class RemotePlayerRenderer {
  private scene: THREE.Scene;
  private players = new Map<string, PlayerMesh>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Update remote player positions. Call every frame. */
  update(remotePlayers: Map<string, RemotePlayer>, dt: number): void {
    const now = Date.now();
    const activeIds = new Set<string>();

    for (const [id, player] of remotePlayers) {
      activeIds.add(id);

      // Remove stale players (no update for 10 seconds)
      if (now - player.lastUpdate > 10000) {
        this.removePlayer(id);
        continue;
      }

      let mesh = this.players.get(id);
      if (!mesh) {
        mesh = this.createPlayerMesh(id, player);
        this.players.set(id, mesh);
        this.scene.add(mesh.group);
      }

      // Update target position for interpolation
      mesh.targetPos.set(player.x, player.y, player.z);
      mesh.targetHeading = player.heading;

      // Smooth interpolation
      const smoothing = 1 - Math.pow(0.001, dt);
      mesh.group.position.lerp(mesh.targetPos, smoothing);
      mesh.group.rotation.y += (mesh.targetHeading - mesh.group.rotation.y) * smoothing;

      // Walking animation (bob)
      if (player.animation > 0) {
        mesh.group.position.y += Math.sin(now * 0.01) * 0.05;
      }
    }

    // Remove players that are no longer in the list
    for (const [id] of this.players) {
      if (!activeIds.has(id)) {
        this.removePlayer(id);
      }
    }
  }

  private createPlayerMesh(id: string, player: RemotePlayer): PlayerMesh {
    const group = new THREE.Group();
    const color = hashColor(id);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xDEB887 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), bodyMat);
    body.position.y = 0.85;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.55;
    group.add(head);

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333355 });
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.3), legMat);
    leftLeg.position.set(-0.15, 0.25, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.3), legMat);
    rightLeg.position.set(0.15, 0.25, 0);
    group.add(rightLeg);

    // Nameplate
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "white";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(player.displayName, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.2;
    sprite.scale.set(2, 0.5, 1);
    group.add(sprite);

    group.position.set(player.x, player.y, player.z);

    return {
      group,
      targetPos: new THREE.Vector3(player.x, player.y, player.z),
      targetHeading: player.heading,
    };
  }

  private removePlayer(id: string): void {
    const mesh = this.players.get(id);
    if (mesh) {
      this.scene.remove(mesh.group);
      this.players.delete(id);
    }
  }

  /** Cleanup all player meshes */
  dispose(): void {
    for (const [id] of this.players) {
      this.removePlayer(id);
    }
  }
}
