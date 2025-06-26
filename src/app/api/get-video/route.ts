import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    // Forward to backend
    const backendRes = await fetch("https://expressjs-production-ff50.up.railway.app/convert", {
      method: "POST",
      body: (() => {
        const fd = new FormData()
        fd.append("file", file, file.name)
        return fd
      })(),
    })

    if (!backendRes.ok) {
      return NextResponse.json({ error: "Backend conversion failed" }, { status: 500 })
    }

    // Stream the mp4 back to the client
    const headers = new Headers(backendRes.headers)
    headers.set("Content-Disposition", "attachment; filename=logo360.mp4")
    headers.set("Content-Type", "video/mp4")
    return new NextResponse(backendRes.body, {
      status: 200,
      headers,
    })
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
} 