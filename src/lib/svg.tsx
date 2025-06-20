import { SVGLoader } from "three/addons/loaders/SVGLoader.js"

export const loadSvg = (svg: string) => {
    try {
        const loader = new SVGLoader()
        const {paths} = loader.parse(svg)
        const shapes = paths.flatMap(path => path.toShapes(true))
        console.log('Loaded shapes:', shapes.length)
        return shapes
    } catch (error) {
        console.error('Error loading SVG:', error)
        return []
    }
}


