"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls, Environment, useProgress, Loader } from "@react-three/drei"
import * as THREE from "three"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useTransition,
  Suspense,
} from "react"
import Link from "next/link"
import { loadSvg } from "@/lib/svg"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { ArrowLeft } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface SvgMeshGroupProps {
  svg: string
  thickness: number // live depth scale
  onBuildStatus?: (busy: boolean) => void
}

// Outer group -> centring & uniform scale
// Inner group -> actual meshes; scaled in Z for thickness
const SvgMeshGroup = forwardRef<THREE.Group, SvgMeshGroupProps>(({ svg, thickness, onBuildStatus }, ref) => {
  const outer = useRef<THREE.Group | null>(null)
  const inner = useRef<THREE.Group | null>(null)
  const shapes = useMemo(() => (svg ? loadSvg(svg) : []), [svg])

  // Expose outer group to parent
  useImperativeHandle(ref, () => outer.current as THREE.Group, [])

  // Build geometry once when svg changes
  useEffect(() => {
    if (!outer.current || !inner.current) return

    // Mark busy and let React paint loader before heavy work
    onBuildStatus?.(true)

    Promise.resolve().then(() => {
      const gOuter = outer.current!
      const gInner = inner.current!

      gInner.clear()

      // Reset transforms
      gOuter.scale.set(1, 1, 1)
      gOuter.rotation.set(0, 0, 0)
      gOuter.position.set(0, 0, 0)
      gInner.scale.set(1, 1, thickness) // initial z scale

      const meshes: THREE.Mesh[] = []

      shapes.forEach((shape) => {
        if (!shape || typeof (shape as any).getPoints !== "function") return
        const pts = shape.getPoints()
        if (!pts || pts.length < 3) return

        const pointCount = pts.length
        const curveSeg = pointCount < 150 ? 48 : pointCount < 400 ? 32 : 16

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 1, // unit depth, we'll scale later
          steps: 1,
          curveSegments: curveSeg,
          bevelEnabled: true,
          bevelThickness: 0.5,
          bevelSize: 0.5,
          bevelSegments: 4,
          bevelOffset: 0,
        }) as THREE.ExtrudeGeometry

        geometry.computeVertexNormals()

        if (geometry.attributes.position.count === 0) {
          geometry.dispose()
          return
        }

        const material = new THREE.MeshPhysicalMaterial({
          color: 0x9aa0a7,
          metalness: 1.0,
          roughness: 0.12,
          reflectivity: 1.0,
          clearcoat: 0.6,
          clearcoatRoughness: 0.1,
          side: THREE.DoubleSide,
          envMapIntensity: 1.4,
        })

        const mesh = new THREE.Mesh(geometry, material)
        meshes.push(mesh)
        gInner.add(mesh)
      })

      // Center group
      if (meshes.length > 0) {
        const combinedBox = new THREE.Box3()
        meshes.forEach((m) => {
          m.geometry.computeBoundingBox()
          if (m.geometry.boundingBox) combinedBox.union(m.geometry.boundingBox)
        })

        if (!combinedBox.isEmpty()) {
          const center = combinedBox.getCenter(new THREE.Vector3())
          meshes.forEach((m) => m.geometry.translate(-center.x, -center.y, -center.z))

          const size = combinedBox.getSize(new THREE.Vector3())
          const scale = 50 / Math.max(size.x, size.y, size.z)
          gOuter.scale.setScalar(scale)
        }
      }

      gOuter.rotation.x = Math.PI

      onBuildStatus?.(false)
    })
  }, [shapes])

  // Live thickness scale update
  useEffect(() => {
    if (inner.current) {
      inner.current.scale.z = thickness
    }
  }, [thickness])

  return (
    <group ref={outer}>
      <group ref={inner} />
    </group>
  )
})

export default function EditorPage() {
  // Read uploaded SVG on mount (client‑side only)
  const [svg, setSvg] = useState<string>("")
  const [bgColor, setBgColor] = useState<string>("#000000")
  // Slider live value
  const [thicknessPending, setThicknessPending] = useState<number>(30)
  const [thickness, setThickness] = useState<number>(30)
  // Transition keeps heavy geometry rebuild low-priority so slider stays fluid
  const [, startTransition] = useTransition()
  const [fov, setFov] = useState<number>(30)
  const [rotationDuration, setRotationDuration] = useState<number>(5) // seconds for full 360
  const groupRef = useRef<THREE.Group | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const [generating, setGenerating] = useState(false)
  const [building, setBuilding] = useState(false)

  const { active: loading } = useProgress()

  // Update camera FOV when fov state changes
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.fov = fov
      cameraRef.current.updateProjectionMatrix()
    }
  }, [fov])

  const generateVideo = () => {
    if (!canvasRef.current || !groupRef.current || generating) return

    // Cache original transform so we can restore after recording
    const originalRot = groupRef.current.rotation.clone()
    const originalPos = groupRef.current.position.clone()

    // Ensure we start exactly at current orientation (no snap)
    const startRotY = groupRef.current.rotation.y

    // Keep background opaque for video
    if (rendererRef.current) {
      rendererRef.current.setClearAlpha(1)
    }

    // ---- Temporary quality upscale -----------------------------
    const renderer = rendererRef.current!
    const origPixelRatio = renderer.getPixelRatio()
    // Keep native pixel ratio during capture for consistent fps
    const fps = 24 // lower FPS to reduce dropped frames
    const stream = canvasRef.current.captureStream(fps) // match fps to frame counter
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecision: 40_000_000, // much higher bitrate for near-lossless quality
    })

    const chunks: BlobPart[] = []
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "logo360.webm"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setGenerating(false)

      // Restore renderer settings
      if (rendererRef.current) {
        rendererRef.current.setClearAlpha(1)
        rendererRef.current.setPixelRatio(origPixelRatio)
      }

      // Restore model transform
      if (groupRef.current) {
        groupRef.current.rotation.copy(originalRot)
        groupRef.current.position.copy(originalPos)
      }
    }

    mediaRecorder.start()
    setGenerating(true)

    // Drive animation with elapsed time instead of frame counter
    const startTime = performance.now() // ms

    renderer.setAnimationLoop((t) => {
      const elapsed = (t - startTime) / 1000 // seconds
      const progress = Math.min(elapsed / rotationDuration, 1)
      
      if (groupRef.current) {
        groupRef.current.rotation.y = startRotY + progress * Math.PI * 2
      }

      if (elapsed >= rotationDuration + 1) { // +1 s flush buffer
        renderer.setAnimationLoop(null)
        mediaRecorder.stop()
      }
    })
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSvg(localStorage.getItem("uploadedSvg") ?? "")
    }
  }, [])

  // Set building true whenever inputs that affect geometry change
  useEffect(() => {
    if (svg) setBuilding(true)
  }, [svg])

  const noSvg = svg === ""

  return (
    <div className="flex flex-col h-screen w-screen">
      {/* Header */}
      <header className="border-b p-4">
        <Button asChild variant="link" size="sm">
          <Link href="/" className="flex items-center space-x-1">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>
        </Button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column – Canvas */}
        <div className="flex-1 relative">
          {noSvg ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <h1 className="text-4xl font-bold text-black dark:text-white">
                No SVG Loaded
              </h1>
              <p className="text-black dark:text-gray-300">
                Please upload an SVG file first
              </p>
              <Button asChild className="mt-4">
                <Link href="/">Go to Upload Page</Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Overlay while generating */}
              {generating && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 pointer-events-none">
                  <span className="text-white animate-pulse">Generating&nbsp;Video…</span>
                </div>
              )}
              {/* Show loader overlay while drei assets are loading */}
              {(loading || building) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
                  <span className="text-white animate-pulse">Loading…</span>
                </div>
              )}
              <Canvas
                className="w-full h-full"
                onCreated={({ gl, camera }) => {
                  canvasRef.current = gl.domElement
                  rendererRef.current = gl
                  cameraRef.current = camera as THREE.PerspectiveCamera
                  // Enable tone-mapping & sRGB for correct HDR lighting
                  gl.toneMapping = THREE.ACESFilmicToneMapping
                  // "outputEncoding" was renamed in newer Three.js — use outputColorSpace when available
                  // @ts-ignore – type may differ depending on three version
                  gl.outputColorSpace = THREE.SRGBColorSpace
                  // Lower exposure so scene isn't overly bright
                  // @ts-ignore
                  gl.toneMappingExposure = 0.8
                }}
                camera={{ position: [0, 0, 100], fov: fov, near: 0.1, far: 1000 }}
              >
                <Suspense fallback={null}>
                  {/* Crisp HDRI for chrome reflections */}
                  <Environment preset="warehouse" background={false} blur={0.3} />
                  <color attach="background" args={[bgColor]} />
                  <SvgMeshGroup svg={svg} thickness={thicknessPending} ref={groupRef} onBuildStatus={setBuilding} />
                  <ambientLight intensity={0.25} />
                  {/* soft sky/ground light to lift dark sides */}
                  <hemisphereLight args={[0xffffff, 0x444444, 0.6]} />
                  {/* key, rim and fill lights */}
                  <directionalLight position={[10, 10, 5]} intensity={1.0} />
                  <directionalLight position={[-10, -10, -5]} intensity={0.5} />
                  <directionalLight position={[0, -10, 10]} intensity={0.6} />
                  {/* front fill light reduced to tame brightness */}
                  <directionalLight position={[0, 0, 100]} intensity={0.15} />
                  {/* side fill lights to illuminate the logo when viewed edge-on */}
                  <directionalLight position={[100, 0, 0]} intensity={1.0} />
                  <directionalLight position={[-100, 0, 0]} intensity={1.0} />
                  <OrbitControls enableDamping dampingFactor={0.1} enabled={!generating} />
                </Suspense>
              </Canvas>
            </>
          )}
        </div>

        {/* Right column – Settings */}
        <aside className="w-full max-w-sm border-l bg-background overflow-auto p-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Customize the editor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bg-color">Background Color</Label>
                <p className="text-sm text-muted-foreground">
                  Change the background color of the canvas here.
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-full ring-2 ring-gray-400 cursor-pointer">
                        {/* inner colour circle with gap */}
                        <div
                          className="w-10 h-10 rounded-full"
                          style={{ backgroundColor: bgColor }}
                        />
                        {/* transparent input overlays the whole ring */}
                        <Input
                          id="bg-color"
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select canvas background color</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="thickness">Thickness: {thicknessPending}</Label>
                <p className="text-sm text-muted-foreground">
                  Adjust the depth/thickness of the 3D extrusion from 1 to 120.
                </p>
                <Input
                  id="thickness"
                  type="range"
                  min="1"
                  max="120"
                  value={thicknessPending}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setThicknessPending(val)
                    startTransition(() => setThickness(val))
                  }}
                  className="cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fov">Field of View: {fov}°</Label>
                <p className="text-sm text-muted-foreground">
                  Control the camera's field of view angle from 30° to 120°.
                </p>
                <Input
                  id="fov"
                  type="range"
                  min="30"
                  max="120"
                  value={fov}
                  onChange={(e) => setFov(Number(e.target.value))}
                  className="cursor-pointer"
                />
              </div>

              {/* Rotation duration */}
              <div className="space-y-2">
                <Label htmlFor="rotation">Rotation Duration: {rotationDuration}s</Label>
                <p className="text-sm text-muted-foreground">
                  Time it takes to complete one full 360° turn in the exported video (2-20&nbsp;s).
                </p>
                <Input
                  id="rotation"
                  type="range"
                  min="2"
                  max="20"
                  value={rotationDuration}
                  onChange={(e) => setRotationDuration(Number(e.target.value))}
                  className="cursor-pointer"
                />
              </div>

              <Button onClick={generateVideo} disabled={generating} className="w-full">
                {generating ? "Generating…" : "Generate 360 Video"}
              </Button>

            </CardContent>
          </Card>
        </aside>
      </div>

      {/* global loader for asset progress */}
      <Loader />
    </div>
  )
}