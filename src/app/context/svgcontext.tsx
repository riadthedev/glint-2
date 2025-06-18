"use client"
import { createContext, useState, useContext } from "react"

const SvgContext = createContext<{
    svg: string | null
    setSvg: (svg: string) => void
}>({
    svg: null,
    setSvg: () => {}
})
export const useSvgContext = () => useContext(SvgContext)

export const SvgProvider = ({children}: {children: React.ReactNode}) => {
    const [svg, setSvg] = useState<string | null>(null)

    return <SvgContext.Provider value={{svg, setSvg}}>{children}</SvgContext.Provider>
}