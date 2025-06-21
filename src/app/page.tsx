"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Alert,AlertTitle } from "@/components/ui/alert"
import { ChevronDown, Upload, Sparkles, AlertCircleIcon} from "lucide-react"
import { useSVGContext } from "@/app/context/svgcontext"
import { useRouter } from "next/navigation"

export default function LandingPage() {
  const [dragActive, setDragActive] = useState(false)
  const router = useRouter()
  const [errorAlert, setErrorAlert] = useState<string | null>(null)
  const {setSvg} = useSVGContext()

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (e.dataTransfer.files[0].type !== "image/svg+xml") {
        setErrorAlert("Please upload a valid SVG file")
        return
      }
      const file = e.dataTransfer.files[0]
      const reader = new FileReader()
      reader.onload = (fileReadEvent) =>{
       const svgContent = fileReadEvent.target?.result as string
       localStorage.setItem("uploadedSvg", svgContent)
       setSvg(svgContent)
       router.push("/editor")
       setErrorAlert(null)
       console.log("success fully uploaded svg")

      }
      reader.onerror = () => {
        setErrorAlert("Error reading SVG file please try again")
      }
      setErrorAlert(null)
      reader.readAsText(file)
    }
  }
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (e.target.files[0].type !== "image/svg+xml") {
        setErrorAlert("Please upload a valid SVG file")
        return
      }
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = (fileReadEvent) =>{
       const svgContent = fileReadEvent.target?.result as string
       localStorage.setItem("uploadedSvg", svgContent)
       setSvg(svgContent)
       router.push("/editor")
       setErrorAlert(null)
       console.log("success fully uploaded svg")
      }
      reader.onerror = () => {
        setErrorAlert("Error reading SVG file please try again")
      }
      setErrorAlert(null)
      reader.readAsText(file)
    }
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">glint</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              <Link href="#" className="text-gray-700 hover:text-gray-900 font-medium">
                Gallery
              </Link>
              <div className="flex items-center space-x-1 text-gray-700 hover:text-gray-900 font-medium cursor-pointer">
                <span>Features</span>
                <ChevronDown className="w-4 h-4" />
              </div>
              <div className="flex items-center space-x-1 text-gray-700 hover:text-gray-900 font-medium cursor-pointer">
                <span>For Business</span>
                <ChevronDown className="w-4 h-4" />
              </div>
              <Link href="#" className="text-gray-700 hover:text-gray-900 font-medium">
                API
              </Link>
              <Link href="#" className="text-gray-700 hover:text-gray-900 font-medium">
                Pricing
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <Link href="#" className="text-gray-700 hover:text-gray-900 font-medium">
                Log in
              </Link>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
                Sign up
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="relative">
            <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 aspect-[4/3]">
              <video
                src="/360Logo.webm"
                autoPlay
                loop
                muted
                playsInline
                width={500}
                height={400}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Right Side - Content and Upload */}
          <div className="space-y-8">
            {/* Hero Text */}
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Transform Your Logo to{" "}
                <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">3D</span>
              </h1>
              <div className="flex items-center space-x-2">
                <span className="text-xl text-gray-600">100% Automatically and</span>
                <span className="bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-xl font-semibold">Free</span>
              </div>
            </div>

            {/* Upload Area */}
            <div className="relative">
              {errorAlert && (
            <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>{errorAlert}</AlertTitle>
      </Alert>)}
            <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                  dragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="space-y-4">
                  <Button
                    className="bg-blue-600 hover:bg-blue-900 text-white px-8 py-3 rounded-xl text-lg font-semibold"
                    onClick={() => document.getElementById("file-upload")?.click()}
                    type="button"
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    Upload SVG
                  </Button>
                  <input type="file" id="file-upload" accept=".svg" onChange={handleFileUpload} className="hidden" />
                  <p className="text-gray-500">
                    or drop an SVG file, <br />
                    <span className="text-blue-600 cursor-pointer hover:underline">paste SVG code or URL</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Sample Logos */}
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-gray-500 mb-2">No SVG?</p>
                <p className="text-gray-600 font-medium">Try one of these:</p>
              </div>
              <div className="flex justify-center space-x-4">
                {[1, 2, 3, 4].map((i) => (
                  <button
                    key={i}
                    className="w-16 h-16 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center border-2 border-transparent hover:border-blue-300"
                  >
                    <Image
                      src={`/placeholder.svg?height=40&width=40&text=Logo${i}`}
                      alt={`Sample logo ${i}`}
                      width={40}
                      height={40}
                      className="w-8 h-8"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Terms */}
            <p className="text-xs text-gray-500 text-center">
              By uploading an SVG or URL you agree to our{" "}
              <Link href="#" className="text-blue-600 hover:underline">
                Terms of Service
              </Link>
              . To learn more about how Glint handles your data, check our{" "}
              <Link href="#" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
