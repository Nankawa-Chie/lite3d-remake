import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import useGameStore from '../../stores/gameStore';
import CameraController from '../Camera/CameraController';
import ManukaPlayer from '../Player/ManukaPlayer';
import MazeGenerator from './maze/MazeGenerator';
import Ghost from './maze/Ghost';

// MVP Haunted Maze Scene
export default function HauntedMazeScene({ playerRef, physicsDebugSettings, renderingSettings }) {
  const groupRef = useRef();

  // Hide minimap and GameUI via current App logic (only shown in 'game'), but ensure store minimap disabled on mount
  const minimapSettings = useGameStore((s)=> s.settings.minimap);
  const setMinimapSettings = useGameStore((s)=> s.setMinimapSettings);
  const setCurrentScene = useGameStore((s)=> s.setCurrentScene);

  // Maze settings from original HTML (31x31 typical odd grid)
  const gridW = 31, gridH = 31;
  const cellSize = 4.0;

  const [mazeGen] = useState(()=> new MazeGenerator(gridW, gridH));
  const maze = useMemo(()=> mazeGen.generate(), [mazeGen]);
  const startCell = useMemo(()=> mazeGen.getStartPosition(), [mazeGen]);
  const exitCell = useMemo(()=> mazeGen.getExitPosition(), [mazeGen]);

  // Status
  const [health, setHealth] = useState(100);
  const [battery, setBattery] = useState(100);
  const [flashOn, setFlashOn] = useState(true);

  // Ghosts
  const ghostsRef = useRef([]);

  // Player spawn
  useEffect(()=>{
    // Track whether minimap was originally enabled so we can restore it accordingly on unmount
    const minimapWasEnabled = minimapSettings.enabled;
    // disable minimap while in maze
    if (minimapSettings.enabled) setMinimapSettings({ ...minimapSettings, enabled: false });
    // reset player state on enter to avoid physics residue from previous scene
    try {
      if (playerRef?.current?.resetState) playerRef.current.resetState();
      if (playerRef?.current?.setPosition) playerRef.current.setPosition([startCell.x*cellSize, 0.5, startCell.y*cellSize]);
      // double-reset next frame to avoid residual velocities on mount
      requestAnimationFrame(()=>{
        try {
          if (playerRef?.current?.resetState) playerRef.current.resetState();
          if (playerRef?.current?.setPosition) playerRef.current.setPosition([startCell.x*cellSize, 0.5, startCell.y*cellSize]);
        } catch (e) {}
      });
    } catch (e) { console.warn('player reset on maze enter failed', e); }
    return ()=> {
      // Restore minimap only if it was enabled before entering the maze
      if (minimapWasEnabled) {
        setMinimapSettings({ ...minimapSettings, enabled: true });
      }
    };
  }, []);

  // Build ghosts once
  useEffect(()=>{
    const g1 = new Ghost(exitCell.x-5, exitCell.y-5, cellSize, mazeGen, 'patrol');
    const g2 = new Ghost(Math.floor(gridW/2), Math.floor(gridH/2), cellSize, mazeGen, 'hunter');
    ghostsRef.current = [g1, g2];
  }, [mazeGen]);

  // Attach keyboard for flashlight toggle and restart
  useEffect(()=>{
    const onKey = (e)=>{
      if (e.code === 'KeyF') setFlashOn(v=>!v);
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, []);

  // Flashlight light object
  const flashLight = useRef();

  // Per-frame update
  useFrame((state, delta)=>{
    const d = Math.min(0.05, delta);
    // Battery drain
    if (flashOn) setBattery(b=> Math.max(0, b - d*2.5)); else setBattery(b=> Math.min(100, b + d*5));

    // Update flashlight to camera position/direction
    const cam = state.camera;
    if (flashLight.current) {
      flashLight.current.position.copy(cam.position);
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      flashLight.current.target.position.copy(cam.position.clone().add(dir.multiplyScalar(5)));
      flashLight.current.intensity = flashOn && battery>1 ? 4.2 : 0.0;
      flashLight.current.angle = 0.35;
      flashLight.current.penumbra = 0.5;
      flashLight.current.distance = 20;
    }

    // Ghost updates
    const playerPos = new THREE.Vector3(...(playerRef.current?.position || [startCell.x*cellSize, 0, startCell.y*cellSize]));
    for (const g of ghostsRef.current) {
      const res = g.update(d, playerPos);
      if (res === 'attack') {
        setHealth(h=> Math.max(0, h-10));
      }
    }

    // Check exit
    const cx = Math.round(playerPos.x / cellSize);
    const cy = Math.round(playerPos.z / cellSize);
    if (mazeGen.isExit(cx, cy)) {
      // simple win: return to main scene for now
      setCurrentScene('game');
    }
  });

  // Maze Wall instances
  const wallBoxes = useMemo(()=>{
    const boxes = [];
    for (let x=0;x<gridW;x++){
      for (let y=0;y<gridH;y++){
        if (maze[x][y] === 1) {
          boxes.push([x*cellSize, 1, y*cellSize]);
        }
      }
    }
    return boxes;
  }, [maze]);

  // Player spawn position
  const spawnPos = useMemo(()=> [startCell.x*cellSize, 0.01, startCell.y*cellSize], [startCell]);

  // Add/remove ghost visuals to R3F scene graph
  useEffect(()=>{
    const group = groupRef.current;
    if (!group) return;
    ghostsRef.current.forEach(g=> group.add(g.mesh) || group.add(g.light));
    return ()=> ghostsRef.current.forEach(g=> group.remove(g.mesh) || group.remove(g.light));
  }, []);

  return (
    <group ref={groupRef}>

      {/* Environment: brighter ambient for debugging */}
      <ambientLight intensity={0.9} />
      <hemisphereLight intensity={0.6} groundColor={0x222222} />

      {/* Flashlight spot */}
      <spotLight ref={flashLight} args={[0xffffff, 4.2, 20, 0.35, 0.5]} castShadow>
        <object3D ref={(o)=>{ if (flashLight.current) flashLight.current.target = o; }} />
      </spotLight>

      {/* Ground plane with collider */}
      <RigidBody type="fixed" colliders={false}>
        <mesh receiveShadow position={[ (gridW*cellSize)/2 - cellSize, -0.01, (gridH*cellSize)/2 - cellSize ]}>
          <boxGeometry args={[gridW*cellSize, 0.02, gridH*cellSize]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <CuboidCollider args={[gridW*cellSize/2, 0.05, gridH*cellSize/2]} position={[ (gridW*cellSize)/2 - cellSize, -0.05, (gridH*cellSize)/2 - cellSize ]} />
      </RigidBody>

      {/* Walls */}
      {wallBoxes.map((p, idx)=> (
        <RigidBody key={idx} type="fixed">
          <mesh castShadow receiveShadow position={p}>
            <boxGeometry args={[cellSize, 2, cellSize]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </RigidBody>
      ))}

      {/* Exit indicator */}
      <mesh position={[exitCell.x*cellSize, 0.01, exitCell.y*cellSize]}>
        <boxGeometry args={[cellSize*0.6, 0.02, cellSize*0.6]} />
        <meshStandardMaterial color="#2ecc71" emissive="#2ecc71" emissiveIntensity={0.8} />
      </mesh>

      {/* Camera + Player: force first-person via CameraController behavior; reuse Manuka */}
      <CameraController playerRef={playerRef} />
      <ManukaPlayer ref={playerRef} position={spawnPos} />
    </group>
  );
}
