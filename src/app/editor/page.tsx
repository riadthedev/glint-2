"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { loadSvg } from "@/lib/svg"

/**
 * Turns an SVG string into a centred, uniformly‑scaled mesh group and flips it
 * upright (SVG Y‑axis is down, Three.js Y‑axis is up).
 */
function SvgMeshGroup({ svg }: { svg: string }) {
  const group = useRef<THREE.Group | null>(null)
  const shapes = useMemo(() => (svg ? loadSvg(svg) : []), [svg])

  useEffect(() => {
    if (!group.current) return
    group.current.clear()

    // ── Build meshes ────────────────────────────────────────────────────────
    shapes.forEach((shape) => {
      if (!shape || typeof (shape as any).getPoints !== "function") return
      const pts = shape.getPoints()
      if (!pts || pts.length < 3) return

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 5,
        bevelEnabled: false,
        steps: 1,
      })
      if (geometry.attributes.position.count === 0) {
        geometry.dispose()
        return
      }
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
      )
      group.current!.add(mesh)
    })

    // ── Flip the group upright (rotate 180° around X) ───────────────────────
    group.current.rotation.x = Math.PI

    // ── First bounding‑box pass (after rotation) ────────────────────────────
    group.current.updateMatrixWorld(true)
    let box = new THREE.Box3().setFromObject(group.current)
    if (box.isEmpty()) return

    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = maxDim > 0 && Number.isFinite(maxDim) ? 50 / maxDim : 1
    group.current.scale.setScalar(scale)

    // ── Second pass: recalc box after scaling, then translate to origin ─────
    group.current.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(group.current)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    group.current.position.set(-center.x, -center.y, -center.z)
  }, [shapes])

  return <group ref={group} />
}

export default function EditorPage() {
  // Read uploaded SVG on mount (client‑side only)
  const [svg, setSvg] = useState<string>("")
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSvg(localStorage.getItem("uploadedSvg") ?? "")
    }
  }, [])
  const noSvg = svg === ""

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
