import { SVGLoader } from "three/addons/loaders/SVGLoader.js"

export const loadSvg = (svg: string) => {
    const loader = new SVGLoader()
    const {paths} = loader.parse(svg)
    return paths.flatMap(path => path.toShapes(true))
}


