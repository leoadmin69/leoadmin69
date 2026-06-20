'use client'

import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

function RacketModel() {
  return (
    <group>
      {/* Manche (Handle) */}
      <mesh position={[0, -1.5, 0]}>
        <cylinderGeometry args={[0.08, 0.06, 1.2, 16]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Cadre (Frame) */}
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.5, 0.05, 16, 100]} />
        <meshStandardMaterial color="#00d4ff" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Cordes (Strings) */}
      <lineSegments position={[0, 0.2, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={20}
            array={new Float32Array(Array.from({ length: 60 }, (_, i) => {
              const angle = (i / 20) * Math.PI * 2
              return i % 3 === 0 ? Math.cos(angle) * 0.45 : (i % 3 === 1 ? Math.sin(angle) * 0.45 : 0)
            }))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ffd700" linewidth={2} />
      </lineSegments>

      {/* Logo plate-forme */}
      <mesh position={[0, 0.2, 0.51]}>
        <planeGeometry args={[0.4, 0.4]} />
        <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

export default function Racket3D() {
  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-accent/30">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 2]} />
        <OrbitControls autoRotate autoRotateSpeed={4} />

        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 5]} intensity={1} />
        <pointLight position={[-5, -5, 5]} intensity={0.5} color="#00d4ff" />

        <RacketModel />

        <environment preset="city" />
      </Canvas>
    </div>
  )
}
