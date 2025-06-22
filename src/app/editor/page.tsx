"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls, Environment } from "@react-three/drei"
import * as THREE from "three"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
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

/**
 * Turns an SVG string into a centred, uniformly‑scaled mesh group and flips it
 * upright (SVG Y‑axis is down, Three.js Y‑axis is up).
 */
const SvgMeshGroup = forwardRef<THREE.Group, { svg: string; thickness: number }>(({ svg, thickness }, ref) => {
  const group = useRef<THREE.Group | null>(null)
  const shapes = useMemo(() => (svg ? loadSvg(svg) : []), [svg])

  // Expose the inner group to parent via ref
  useImperativeHandle(ref, () => group.current as THREE.Group, [])

  useEffect(() => {
    if (!group.current) return
    group.current.clear()

    // Reset group transformations
    group.current.scale.set(1, 1, 1)
    group.current.rotation.set(0, 0, 0)
    group.current.position.set(0, 0, 0)

    // ── Build meshes ────────────────────────────────────────────────────────
    const meshes: THREE.Mesh[] = []
    shapes.forEach((shape) => {
      if (!shape || typeof (shape as any).getPoints !== "function") return
      const pts = shape.getPoints()
      if (!pts || pts.length < 3) return

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        steps: Math.max(128, thickness * 4),          // very dense depth subdivision
        curveSegments: 64,                           // smoother outline curves
        bevelEnabled: true,                          // slight bevel softens edge seams
        bevelThickness: Math.max(0.5, thickness * 0.02),
        bevelSize: Math.max(0.5, thickness * 0.02),
        bevelSegments: 8,
        bevelOffset: 0,
      }) as THREE.ExtrudeGeometry

      // Recompute normals to ensure smooth shading across the new segments
      geometry.computeVertexNormals()

      if (geometry.attributes.position.count === 0) {
        geometry.dispose()
        return
      }
      const material = new THREE.MeshPhysicalMaterial({
        color: 0x9aa0a7,      // base tinted chrome
        metalness: 1.0,
        roughness: 0.12,      // sharper reflections but still slightly brushed
        reflectivity: 1.0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
        envMapIntensity: 1.4, // stronger reflections for chrome front
      })

      const mesh = new THREE.Mesh(geometry, material)
      meshes.push(mesh)
      group.current!.add(mesh)
    })

    // ── Center all geometries at origin BEFORE any transformations ─────────
    if (meshes.length > 0) {
      // Calculate combined bounding box of all geometries
      const combinedBox = new THREE.Box3()
      meshes.forEach(mesh => {
        mesh.geometry.computeBoundingBox()
        if (mesh.geometry.boundingBox) {
          combinedBox.union(mesh.geometry.boundingBox)
        }
      })

      if (!combinedBox.isEmpty()) {
        const center = combinedBox.getCenter(new THREE.Vector3())
        
        // Translate each mesh geometry so the combined center is at origin
        meshes.forEach(mesh => {
          mesh.geometry.translate(-center.x, -center.y, -center.z)
        })

        // Calculate scale after centering
        const size = combinedBox.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = maxDim > 0 && Number.isFinite(maxDim) ? 50 / maxDim : 1
        group.current!.scale.setScalar(scale)
      }
    }

    // ── Flip the group upright (rotate 180° around X) ───────────────────────
    group.current.rotation.x = Math.PI
  }, [shapes, thickness])

  return <group ref={group} />
})

export default function EditorPage() {
  // Read uploaded SVG on mount (client‑side only)
  const [svg, setSvg] = useState<string>("")
  const [bgColor, setBgColor] = useState<string>("#000000")
  const [thickness, setThickness] = useState<number>(30)
  const [fov, setFov] = useState<number>(30)
  const groupRef = useRef<THREE.Group | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const [generating, setGenerating] = useState(false)


  // Update camera FOV when fov state changes
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.fov = fov
      cameraRef.current.updateProjectionMatrix()
    }
  }, [fov])

  const generateVideo = () => {
    if (!canvasRef.current || !groupRef.current || generating) return

    // Reset rotation - since geometry is already centered, we don't need to recenter
    groupRef.current.rotation.set(Math.PI, 0, 0)
    groupRef.current.position.set(0, 0, 0)

    // Keep background opaque for video
    if (rendererRef.current) {
      rendererRef.current.setClearAlpha(1)
    }

    // Capture canvas stream
    const stream = canvasRef.current.captureStream(60) // 60 FPS
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
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

      // Restore clear alpha
      if (rendererRef.current) {
        rendererRef.current.setClearAlpha(1)
      }
    }

    mediaRecorder.start()
    setGenerating(true)

    const duration = 5000 // ms (5 s)
    let start: number | null = null

    const animate = (time: number) => {
      if (!start) start = time
      const elapsed = time - (start ?? 0)
      const progress = Math.min(elapsed / duration, 1)

      if (groupRef.current) {
        // Only rotate around Y axis - X stays at Math.PI to keep it upright
        groupRef.current.rotation.y = progress * Math.PI * 2
      }

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        mediaRecorder.stop()
      }
    }

    requestAnimationFrame(animate)
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSvg(localStorage.getItem("uploadedSvg") ?? "")
    }
  }, [])
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
                {/* Crisp HDRI for chrome reflections */}
                <Environment preset="warehouse" background={false} blur={0.3} />
                <color attach="background" args={[bgColor]} />
                <SvgMeshGroup svg={svg} thickness={thickness} ref={groupRef} />
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
                <Label htmlFor="thickness">Thickness: {thickness}</Label>
                <p className="text-sm text-muted-foreground">
                  Adjust the depth/thickness of the 3D extrusion from 1 to 120.
                </p>
                <Input
                  id="thickness"
                  type="range"
                  min="1"
                  max="120"
                  value={thickness}
                  onChange={(e) => setThickness(Number(e.target.value))}
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

              <Button onClick={generateVideo} disabled={generating} className="w-full">
                {generating ? "Generating…" : "Generate 360 Video"}
              </Button>

            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}