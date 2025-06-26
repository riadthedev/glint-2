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
import { ArrowLeft, Settings, ChevronUp, ChevronDown, X, Play } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface SvgMeshGroupProps {
  svg: string
  thickness: number
  highQuality?: boolean
  onBuildStatus?: (busy: boolean) => void
}

// Outer group -> centring & uniform scale
// Inner group -> actual meshes; scaled in Z for thickness
const SvgMeshGroup = forwardRef<THREE.Group, SvgMeshGroupProps>(({ svg, thickness, highQuality = false, onBuildStatus }, ref) => {
  const outer = useRef<THREE.Group | null>(null)
  const inner = useRef<THREE.Group | null>(null)
  const shapes = useMemo(() => (svg ? loadSvg(svg) : []), [svg])

  // Expose outer group to parent
  useImperativeHandle(ref, () => outer.current as THREE.Group, [])

  // Build geometry when svg, thickness, or quality changes
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
      gInner.scale.set(1, 1, 1) // No more Z scaling needed

      const meshes: THREE.Mesh[] = []

      shapes.forEach((shape) => {
        if (!shape || typeof (shape as any).getPoints !== "function") return
        const pts = shape.getPoints()
        if (!pts || pts.length < 3) return

        const pointCount = pts.length
        
        // Improved curve segments calculation
        const curveSeg = highQuality 
          ? Math.min(96, Math.max(32, Math.round(pointCount * 0.6)))
          : Math.min(64, Math.max(16, Math.round(pointCount * 0.4)))

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: thickness, // Real depth instead of unit depth
          steps: Math.max(2, Math.round(thickness / 8)), // 1 slice every ~8 units
          curveSegments: curveSeg,
          bevelEnabled: true,
          bevelThickness: 0.03 * thickness, // Proportional to thickness
          bevelSize: 0.03 * thickness, // Proportional to thickness
          bevelSegments: highQuality ? 8 : 6,
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
  }, [shapes, thickness, highQuality])

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
  const [fov, setFov] = useState<number>(40)
  const [rotationDuration, setRotationDuration] = useState<number>(5) // seconds for full 360
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false) // For mobile drawer
  const [highQuality, setHighQuality] = useState<boolean>(false) // Quality toggle
  const groupRef = useRef<THREE.Group | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const [generating, setGenerating] = useState(false)
  const [building, setBuilding] = useState(false)
  
  // Mobile viewport fix
  const [viewportHeight, setViewportHeight] = useState<number>(0)
  const [isMobile, setIsMobile] = useState<boolean>(false)

  const { active: loading } = useProgress()

  // Handle viewport sizing for mobile
  useEffect(() => {
    const updateViewport = () => {
      // Use visualViewport when available (better mobile support)
      const height = window.visualViewport?.height || window.innerHeight
      setViewportHeight(height)
      setIsMobile(window.innerWidth < 1024) // lg breakpoint
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)

    return () => {
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
    }
  }, [])

  // Update camera FOV when fov state changes
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.fov = fov
      cameraRef.current.updateProjectionMatrix()
    }
  }, [fov])

  // Responsive camera settings
  const getCameraConfig = () => {
    const baseDistance = 100
    const baseFov = fov
    
    if (isMobile) {
      // Adjust for mobile - pull camera back and adjust FOV for better framing
      return {
        position: [0, 0, baseDistance * 1.2] as [number, number, number],
        fov: Math.min(baseFov + 10, 75), // Slightly wider FOV for mobile
      }
    }
    
    return {
      position: [0, 0, baseDistance] as [number, number, number],
      fov: baseFov,
    }
  }

  const cameraConfig = getCameraConfig()

  const generateVideo = async () => {
    if (!canvasRef.current || !groupRef.current || generating) return

    // Cache original transform so we can restore after recording
    const originalRot = groupRef.current.rotation.clone()
    const originalPos = groupRef.current.position.clone()

    try {
      setGenerating(true)

      // Switch to high quality for recording
      setHighQuality(true)
      
      // Wait a bit for the high quality rebuild to complete
      await new Promise(resolve => setTimeout(resolve, 500))

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
        videoBitsPerSecond: 80_000_000, // much higher bitrate for near-lossless quality
      })

      const chunks: BlobPart[] = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "video/webm" })

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

          // Switch back to low quality for interaction
          setHighQuality(false)

          // Send webm to /api/get-video for conversion and download mp4
          const formData = new FormData()
          formData.append("file", blob, "logo360.webm")
          
          const res = await fetch("/api/get-video", {
            method: "POST",
            body: formData,
          })
          
          if (!res.ok) throw new Error("Failed to convert video")
          
          const mp4Blob = await res.blob()
          const url = URL.createObjectURL(mp4Blob)
          const a = document.createElement("a")
          a.href = url
          a.download = "logo360.mp4"
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        } catch (err) {
          alert("Video conversion failed. Please try again.")
        } finally {
          setGenerating(false)
        }
      }

      mediaRecorder.start()

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
    } catch (err) {
      setGenerating(false)
      setHighQuality(false)
      alert("Video generation failed. Please try again.")
    }
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

  // Close settings drawer when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsOpen && !(event.target as Element).closest('.settings-panel')) {
        setSettingsOpen(false)
      }
    }

    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [settingsOpen])

  const noSvg = svg === ""

  const SettingsContent = () => (
    <Card className="border-0 lg:border shadow-none lg:shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Settings</CardTitle>
        <CardDescription className="text-sm">Customize the editor</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bg-color" className="text-sm font-medium">Background Color</Label>
          <p className="text-xs text-muted-foreground">
            Change the background color of the canvas here.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-full ring-2 ring-gray-400 cursor-pointer">
                  {/* inner colour circle with gap */}
                  <div
                    className="w-8 h-8 rounded-full"
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
          <Label htmlFor="thickness" className="text-sm font-medium">Thickness: {thicknessPending}</Label>
          <p className="text-xs text-muted-foreground">
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
          <Label htmlFor="fov" className="text-sm font-medium">Field of View: {fov}°</Label>
          <p className="text-xs text-muted-foreground">
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
          <Label htmlFor="rotation" className="text-sm font-medium">Rotation Duration: {rotationDuration}s</Label>
          <p className="text-xs text-muted-foreground">
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

        <Button 
          onClick={generateVideo} 
          disabled={generating} 
          className="w-full text-sm"
          size="sm"
        >
          {generating ? "Generating Video…" : "Generate 360 Video"}
        </Button>
      </CardContent>
    </Card>
  )

  // Calculate dynamic height for mobile
  const containerStyle = {
    height: isMobile && viewportHeight > 0 ? `${viewportHeight}px` : '100vh'
  }

  return (
    <div className="flex flex-col w-screen overflow-hidden" style={containerStyle}>
      {/* Header */}
      <header className="border-b p-3 lg:p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <Button asChild variant="link" size="sm" className="p-0">
            <Link href="/" className="flex items-center space-x-1">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </Button>
          
          <div className="flex items-center space-x-2">
            {/* Mobile video generation button */}
            {!noSvg && (
              <Button
                onClick={generateVideo}
                disabled={generating}
                size="sm"
                className="lg:hidden"
              >
                <Play className="h-4 w-4 mr-2" />
                {generating ? "Generating…" : "Video"}
              </Button>
            )}
            
            {/* Mobile settings toggle */}
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
              {settingsOpen ? <ChevronDown className="h-4 w-4 ml-1" /> : <ChevronUp className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Canvas area - full width on mobile, left side on desktop */}
        <div className="flex-1 relative min-h-0">
          {noSvg ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              <h1 className="text-2xl lg:text-4xl font-bold text-black dark:text-white text-center">
                No SVG Loaded
              </h1>
              <p className="text-black dark:text-gray-300 text-center mt-2">
                Please upload an SVG file first
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/">Go to Upload Page</Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Overlay while generating */}
              {generating && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 pointer-events-none">
                  <span className="text-white animate-pulse text-sm lg:text-base">Generating Video…</span>
                </div>
              )}
              {/* Show loader overlay while drei assets are loading */}
              {(loading || building) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
                  <span className="text-white animate-pulse text-sm lg:text-base">Loading…</span>
                </div>
              )}
              <Canvas
                className="w-full h-full"
                onCreated={({ gl, camera, size }) => {
                  canvasRef.current = gl.domElement
                  rendererRef.current = gl
                  cameraRef.current = camera as THREE.PerspectiveCamera
                  
                  // Enable tone-mapping & sRGB for correct HDR lighting
                  gl.toneMapping = THREE.ACESFilmicToneMapping
                  // @ts-ignore – type may differ depending on three version
                  gl.outputColorSpace = THREE.SRGBColorSpace
                  // Lower exposure so scene isn't overly bright
                  // @ts-ignore
                  gl.toneMappingExposure = 0.8
                  
                  // Set pixel ratio appropriately for device
                  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
                  
                  // Ensure canvas fills container properly
                  gl.setSize(size.width, size.height)
                }}
                camera={{
                  position: cameraConfig.position,
                  fov: cameraConfig.fov,
                  near: 0.1,
                  far: 1000
                }}
                dpr={[1, 2]} // Limit pixel ratio for performance
              >
                <Suspense fallback={null}>
                  {/* Crisp HDRI for chrome reflections */}
                  <Environment preset="warehouse" background={false} blur={0.3} />
                  <color attach="background" args={[bgColor]} />
                  <SvgMeshGroup 
                    svg={svg} 
                    thickness={thickness} 
                    highQuality={highQuality}
                    ref={groupRef} 
                    onBuildStatus={setBuilding} 
                  />
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
                  <OrbitControls 
                    enableDamping 
                    dampingFactor={0.1} 
                    enabled={!generating}
                    touches={{
                      ONE: THREE.TOUCH.ROTATE,
                      TWO: THREE.TOUCH.DOLLY_PAN
                    }}
                    // Better mobile controls
                    rotateSpeed={isMobile ? 0.5 : 1}
                    zoomSpeed={isMobile ? 0.5 : 1}
                    panSpeed={isMobile ? 0.5 : 1}
                    // Prevent over-rotation on mobile
                    minPolarAngle={0}
                    maxPolarAngle={Math.PI}
                  />
                </Suspense>
              </Canvas>
            </>
          )}
        </div>

        {/* Desktop settings panel */}
        <aside className="hidden lg:flex w-full max-w-sm border-l bg-background overflow-auto">
          <div className="p-4 w-full">
            <SettingsContent />
          </div>
        </aside>
      </div>

      {/* Mobile settings drawer */}
      {settingsOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setSettingsOpen(false)}>
          <div 
            className="settings-panel absolute bottom-0 left-0 right-0 bg-background rounded-t-lg max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              {/* Header with drag handle and close button */}
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettingsOpen(false)}
                  className="p-1 h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SettingsContent />
            </div>
          </div>
        </div>
      )}

      {/* global loader for asset progress */}
      <Loader />
    </div>
  )
}