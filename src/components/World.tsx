"use client";

import { useEffect, useRef, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ChunkLoader } from "../game/chunkLoader";
import { buildChunkMesh } from "../game/voxelRenderer";
import { PlayerPhysics } from "../game/playerPhysics";
import { initTextures } from "../game/materials";
import { getConfig } from "../game/config";
import { Vehicle, VehicleInput, Airplane, MagicCarpet, HotAirBalloon } from "../game/vehicles";
import { getNetworkClient } from "../game/network";
import { RemotePlayerRenderer } from "../game/remotePlayerRenderer";

const CHUNK_BASE_URL = "/chunks/test-paris";

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
      // Track fresh presses for toggle actions
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
    const loader = new ChunkLoader(CHUNK_BASE_URL);
    const loadedMeshes: THREE.Group[] = [];

    async function loadWorld() {
      if (getConfig().render.textures) {
        await initTextures();
      }

      const manifest = await loader.loadManifest();
      const chunkSize = loader.getChunkSize();

      const centerX = (manifest.chunks.length > 0)
        ? manifest.chunks[0].x * chunkSize + chunkSize / 2
        : 100;
      const centerZ = (manifest.chunks.length > 0)
        ? manifest.chunks[0].z * chunkSize + chunkSize / 2
        : 100;

      const physics = new PlayerPhysics(centerX, 10, centerZ);
      physicsRef.current = physics;

      // Init remote player renderer
      const remoteRenderer = new RemotePlayerRenderer(scene);
      remoteRendererRef.current = remoteRenderer;

      // Connect to multiplayer server (fails gracefully if server is down)
      const serverURL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
      const network = getNetworkClient();
      network.connect(serverURL, "test-paris");

      for (const chunkInfo of manifest.chunks) {
        const chunkData = await loader.loadChunk(chunkInfo.x, chunkInfo.z);
        if (chunkData) {
          const { mesh, grid } = buildChunkMesh(
            chunkData.blocks,
            chunkData.chunkX,
            chunkData.chunkZ,
            chunkSize
          );
          mesh.name = `chunk_${chunkInfo.x}_${chunkInfo.z}`;
          scene.add(mesh);
          loadedMeshes.push(mesh);

          physics.addGrid(
            `${chunkInfo.x}_${chunkInfo.z}`,
            grid,
            chunkData.chunkX * chunkSize,
            chunkData.chunkZ * chunkSize
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
        // Dismount
        const pos = vehicle.dismount(scene);
        vehicle.dispose();
        vehicleRef.current = null;
        physics.position.copy(pos);
        physics.position.y += 2; // spawn above vehicle position
        physics.velocity.set(0, 0, 0);
      } else {
        // Mount new vehicle
        const factory = VEHICLE_REGISTRY[vehicleIndexRef.current];
        const newVehicle = factory();
        const spawnPos = physics.getEyePosition();
        spawnPos.y += 10; // spawn above player
        newVehicle.mount(spawnPos, scene);
        vehicleRef.current = newVehicle;
      }
    }

    // 1/2 keys: switch vehicle type (only while not mounted)
    if (pressed.has("Digit1")) {
      pressed.delete("Digit1");
      vehicleIndexRef.current = 0;
    }
    if (pressed.has("Digit2")) {
      pressed.delete("Digit2");
      vehicleIndexRef.current = 1;
    }
    if (pressed.has("Digit3")) {
      pressed.delete("Digit3");
      vehicleIndexRef.current = 2;
    }

    const vehicle = vehicleRef.current;

    if (vehicle?.mounted) {
      // === Vehicle mode ===
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

      // Third-person camera: smooth follow
      const targetCamPos = vehicle.getWorldCameraPosition();
      const targetLookAt = vehicle.getWorldCameraTarget();

      // Smooth interpolation
      const smoothing = 1 - Math.pow(0.001, dt);
      camera.position.lerp(targetCamPos, smoothing);

      // Look at vehicle target
      const currentTarget = new THREE.Vector3();
      camera.getWorldDirection(currentTarget);
      currentTarget.add(camera.position);
      currentTarget.lerp(targetLookAt, smoothing);
      camera.lookAt(targetLookAt);

    } else {
      // === Walking mode ===
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
        const pos = vehicle?.mounted
          ? vehicle.state.position
          : physics.position;
        const heading = camera.rotation.y;
        const anim = keys.has("KeyW") || keys.has("KeyS") || keys.has("KeyA") || keys.has("KeyD") ? 1 : 0;
        network.sendPosition(pos.x, pos.y, pos.z, heading, anim);
      }
    }

    // Update remote player rendering
    const network = getNetworkClient();
    remoteRendererRef.current?.update(network.getRemotePlayers(), dt);
  });

  return null;
}
