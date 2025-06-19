import { SVGLoader } from "three/addons/loaders/SVGLoader.js"
import {useMemo} from "react"

export const loadSvg = (svg: string) => {
    const loader = new SVGLoader()
    const shapes=useMemo(()=>{  
    const {paths} = loader.parse(svg)

    return paths.flatMap(path => path.toShapes(true))
},[svg])

return shapes
}


