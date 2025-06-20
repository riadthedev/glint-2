"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { loadSvg } from "@/lib/svg"

/**
 * Responsible for turning an SVG string into a centred, scaled mesh group.
 */
function SvgMeshGroup({ svg }: { svg: string }) {
  const group = useRef<THREE.Group | null>(null)

  // Convert raw SVG → THREE.Shape[]
  const shapes = useMemo(() => (svg ? loadSvg(svg) : []), [svg])

  /**
   * Build meshes, then auto‑centre and scale the group once per SVG change.
   */
  useEffect(() => {
    if (!group.current) return

    // Clear any previous meshes
    group.current.clear()

    shapes.forEach((shape) => {
      if (!shape || typeof (shape as any).getPoints !== "function") return
      const points = shape.getPoints()
      if (!points || points.length < 3) return

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 5,
        bevelEnabled: false,
        steps: 1,
        bevelSegments: 1,
      })

      if (geometry.attributes.position.count === 0) {
        geometry.dispose()
        return
      }

      const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geometry, material)
      group.current!.add(mesh)
    })

    // Auto‑centre & fit to view
    const box = new THREE.Box3().setFromObject(group.current)
    if (box.isEmpty()) return

    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    group.current.position.sub(center)

    const maxSize = Math.max(size.x, size.y, size.z)
    if (maxSize > 0 && Number.isFinite(maxSize)) {
      const scale = 50 / maxSize
      group.current.scale.setScalar(scale)
    }
  }, [shapes])

  return <group ref={group} />
}

export default function EditorPage() {
  // Grab the uploaded SVG (if any) once on mount
  const svg = useMemo(() => localStorage.getItem("uploadedSvg") ?? "", [])
  const noSvg = !svg

  return (
    <div className="h-screen w-screen">
      {noSvg ? (
        <div className="flex flex-col items-center justify-center h-full">
          <h1 className="text-4xl font-bold text-black">No SVG Loaded</h1>
          <p className="text-black">Please upload an SVG file first</p>
          <Link
            href="/"
            className="mt-4 px-4 py-2 bg-blue-500 text-black rounded-md hover:bg-blue-600"
          >
            Go to Upload Page
          </Link>
        </div>
      ) : (
        <Canvas
          camera={{ position: [0, 0, 100], fov: 75, near: 0.1, far: 1000 }}
          className="h-screen w-screen"
        >
          <SvgMeshGroup svg={svg} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />
          <OrbitControls enableDamping dampingFactor={0.1} />
          <axesHelper args={[20]} />
        </Canvas>
      )}
    </div>
  )
}
