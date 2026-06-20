'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export default function TennisRacket3D() {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.008;
      groupRef.current.rotation.x = Math.sin(Date.now() * 0.001) * 0.3;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Handle */}
      <mesh position={[0, -3, 0]}>
        <capsuleGeometry args={[0.3, 2, 4, 8]} />
        <meshStandardMaterial color="#8B4513" metalness={0.3} roughness={0.4} />
      </mesh>

      {/* Frame - Racket head */}
      <mesh position={[0, 1.5, 0]}>
        <torusGeometry args={[2.5, 0.25, 16, 100]} />
        <meshStandardMaterial color="#FFD700" metalness={0.6} roughness={0.2} />
      </mesh>

      {/* Strings - warp */}
      {Array.from({ length: 13 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const x = Math.cos(angle) * 2;
        const z = Math.sin(angle) * 2;
        return (
          <mesh key={`string-${i}`} position={[x / 2, 1.5, z / 2]}>
            <boxGeometry args={[0.05, 3.5, 0.05]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        );
      })}

      {/* Weft strings */}
      {Array.from({ length: 11 }).map((_, i) => {
        const offset = -1.8 + (i / 10) * 3.6;
        return (
          <mesh key={`weft-${i}`} position={[offset, 1.5, 0]}>
            <boxGeometry args={[0.05, 0.05, 4.5]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        );
      })}

      {/* Decorative ring at the neck */}
      <mesh position={[0, -0.5, 0]}>
        <torusGeometry args={[0.6, 0.15, 16, 100]} />
        <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.1} />
      </mesh>

      {/* Glow effect */}
      <mesh position={[0, 1.5, 0]}>
        <torusGeometry args={[2.7, 0.3, 16, 100]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}
