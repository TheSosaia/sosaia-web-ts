"use client";

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PlayerPhysics } from "../game/playerPhysics";
import { initTextures } from "../game/materials";
import { getConfig } from "../game/config";
import { Vehicle, VehicleInput, Airplane, MagicCarpet, HotAirBalloon } from "../game/vehicles";
import { getNetworkClient } from "../game/network";
import { RemotePlayerRenderer } from "../game/remotePlayerRenderer";
import { loadMeshManifest, loadMeshChunkLOD } from "../game/meshLoader";
import { ChunkLoader } from "../game/chunkLoader";
import { VoxelGrid } from "../game/voxelGrid";

const MESH_BASE_URL = "/meshes/test-nyc";
const CHUNK_BASE_URL = "/chunks/test-nyc";

// Available vehicles — add new ones here
const VEHICLE_REGISTRY: (() => Vehicle)[] = [
  () => new Airplane(),
  () => new MagicCarpet(),
  () => new HotAirBalloon(),
];

export function World() {
  const { scene, camera } = useThree();
  const physicsRef = useRef<PlayerPhysics | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const vehicleRef = useRef<Vehicle | null>(null);
  const vehicleIndexRef = useRef(0);
  const keyPressedRef = useRef<Set<string>>(new Set());
  const remoteRendererRef = useRef<RemotePlayerRenderer | null>(null);
  const sendTickRef = useRef(0);

  // Key handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (!keyPressedRef.current.has(e.code)) {
        keyPressedRef.current.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      keyPressedRef.current.delete(e.code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Load world
  useEffect(() => {
    const loadedMeshes: THREE.Object3D[] = [];

    async function loadWorld() {
      if (getConfig().render.textures) {
        await initTextures();
      }

      const manifest = await loadMeshManifest(MESH_BASE_URL);
      const chunkSize = manifest.chunk_size_meters;

      // Spawn at center of first chunk
      const firstChunk = manifest.chunks[0];
      const centerX = firstChunk ? firstChunk.x * chunkSize + chunkSize / 2 : 100;
      const centerZ = firstChunk ? firstChunk.z * chunkSize + chunkSize / 2 : 100;

      const physics = new PlayerPhysics(centerX, 50, centerZ);
      physicsRef.current = physics;

      // Init remote player renderer
      const remoteRenderer = new RemotePlayerRenderer(scene);
      remoteRendererRef.current = remoteRenderer;

      // Connect to multiplayer server (fails gracefully if server is down)
      const serverURL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
      const network = getNetworkClient();
      network.connect(serverURL, manifest.city);

      // Load precomputed meshes (with LOD) for rendering + raw blocks for physics
      const blockLoader = new ChunkLoader(CHUNK_BASE_URL);
      await blockLoader.loadManifest();

      for (const chunkInfo of manifest.chunks) {
        // Mesh for rendering with LOD (instant — just buffer upload)
        const t0 = performance.now();
        const lod = await loadMeshChunkLOD(MESH_BASE_URL, chunkInfo.file);
        const t1 = performance.now();
        console.log(`[MeshLoader] ${chunkInfo.file} LOD loaded in ${(t1 - t0).toFixed(0)}ms`);

        lod.name = `mesh_${chunkInfo.x}_${chunkInfo.z}`;
        scene.add(lod);
        loadedMeshes.push(lod);

        // Blocks for physics collision
        const chunkData = await blockLoader.loadChunk(chunkInfo.x, chunkInfo.z);
        if (chunkData) {
          let minY = Infinity, maxY = -Infinity;
          for (const b of chunkData.blocks) {
            if (b.y < minY) minY = b.y;
            if (b.y > maxY) maxY = b.y;
          }
          if (minY === Infinity) { minY = 0; maxY = 0; }
          const grid = new VoxelGrid(chunkSize, chunkSize, minY, maxY);
          grid.populate(chunkData.blocks);
          physics.addGrid(
            `${chunkInfo.x}_${chunkInfo.z}`,
            grid,
            chunkInfo.x * chunkSize,
            chunkInfo.z * chunkSize
          );
        }
      }
    }

    loadWorld();

    return () => {
      if (vehicleRef.current?.mounted) {
        vehicleRef.current.dismount(scene);
        vehicleRef.current.dispose();
      }
      remoteRendererRef.current?.dispose();
      getNetworkClient().disconnect();
      for (const mesh of loadedMeshes) {
        scene.remove(mesh);
        mesh.traverse((child) => {
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
    };
  }, [scene]);

  // Game loop
  useFrame((_, delta) => {
    const physics = physicsRef.current;
    if (!physics) return;

    const dt = Math.min(delta, 0.1);
    const keys = keysRef.current;
    const pressed = keyPressedRef.current;

    // V key: toggle vehicle mount/dismount
    if (pressed.has("KeyV")) {
      pressed.delete("KeyV");
      const vehicle = vehicleRef.current;
      if (vehicle?.mounted) {
        const pos = vehicle.dismount(scene);
        vehicle.dispose();
        vehicleRef.current = null;
        physics.position.copy(pos);
        physics.position.y += 2;
        physics.velocity.set(0, 0, 0);
      } else {
        const factory = VEHICLE_REGISTRY[vehicleIndexRef.current];
        const newVehicle = factory();
        const spawnPos = physics.getEyePosition();
        spawnPos.y += 10;
        newVehicle.mount(spawnPos, scene);
        vehicleRef.current = newVehicle;
      }
    }

    // 1/2/3 keys: switch vehicle type
    if (pressed.has("Digit1")) { pressed.delete("Digit1"); vehicleIndexRef.current = 0; }
    if (pressed.has("Digit2")) { pressed.delete("Digit2"); vehicleIndexRef.current = 1; }
    if (pressed.has("Digit3")) { pressed.delete("Digit3"); vehicleIndexRef.current = 2; }

    const vehicle = vehicleRef.current;

    if (vehicle?.mounted) {
      const input: VehicleInput = {
        forward: keys.has("KeyW") || keys.has("ArrowUp"),
        backward: keys.has("KeyS") || keys.has("ArrowDown"),
        left: keys.has("KeyA") || keys.has("ArrowLeft"),
        right: keys.has("KeyD") || keys.has("ArrowRight"),
        up: keys.has("Space"),
        down: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        boost: keys.has("KeyE"),
      };

      vehicle.update(input, dt);

      const targetCamPos = vehicle.getWorldCameraPosition();
      const targetLookAt = vehicle.getWorldCameraTarget();
      const smoothing = 1 - Math.pow(0.001, dt);
      camera.position.lerp(targetCamPos, smoothing);
      camera.lookAt(targetLookAt);

    } else {
      const moveDir = new THREE.Vector3(0, 0, 0);
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (keys.has("KeyW") || keys.has("ArrowUp")) moveDir.add(forward);
      if (keys.has("KeyS") || keys.has("ArrowDown")) moveDir.sub(forward);
      if (keys.has("KeyD") || keys.has("ArrowRight")) moveDir.add(right);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) moveDir.sub(right);

      if (moveDir.lengthSq() > 0) moveDir.normalize();
      if (keys.has("Space")) physics.jump();

      const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
      physics.update(moveDir, dt, sprinting);

      const eye = physics.getEyePosition();
      camera.position.set(eye.x, eye.y, eye.z);
    }

    // Send position to server (throttled to ~5 Hz)
    sendTickRef.current += dt;
    if (sendTickRef.current >= 0.2) {
      sendTickRef.current = 0;
      const network = getNetworkClient();
      if (network.isConnected()) {
        const pos = vehicle?.mounted ? vehicle.state.position : physics.position;
        const heading = camera.rotation.y;
        const anim = keys.has("KeyW") || keys.has("KeyS") || keys.has("KeyA") || keys.has("KeyD") ? 1 : 0;
        network.sendPosition(pos.x, pos.y, pos.z, heading, anim);
      }
    }

    const network = getNetworkClient();
    remoteRendererRef.current?.update(network.getRemotePlayers(), dt);
  });

  return null;
}
