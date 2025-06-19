"use client"
import { createContext, useState, useContext } from "react"

const SVGContext = createContext<{
    svg: string | null
    setSvg: (svg: string) => void
}>({
    svg: null,
    setSvg: () => {}
})
export const useSVGContext = () => useContext(SVGContext)

export const SVGProvider = ({children}: {children: React.ReactNode}) => {
    const [svg, setSvg] = useState<string | null>(null)

    return <SVGContext.Provider value={{svg, setSvg}}>{children}</SVGContext.Provider>
}