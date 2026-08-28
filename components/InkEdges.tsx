import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

const INK_LINE_VERTEX_SHADER = `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec2 aCorner;

  uniform vec2 uResolution;
  uniform float uLineWidth;

  void main() {
    vec4 start = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
    vec4 end = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
    vec2 startNdc = start.xy / start.w;
    vec2 endNdc = end.xy / end.w;
    vec2 direction = normalize(endNdc - startNdc);
    vec2 normal = vec2(-direction.y, direction.x);
    vec2 offset = normal * aCorner.x * uLineWidth / uResolution;
    vec4 clipPosition = mix(start, end, aCorner.y);

    clipPosition.xy += offset * clipPosition.w;
    gl_Position = clipPosition;
  }
`

const INK_LINE_FRAGMENT_SHADER = `
  uniform vec3 uLineColor;

  void main() {
    gl_FragColor = vec4(uLineColor, 1.0);
  }
`

export function toInkEdges(source: THREE.BufferGeometry): THREE.EdgesGeometry {
  return new THREE.EdgesGeometry(source, 30)
}

function toThickLineGeometry(edges: THREE.EdgesGeometry): THREE.BufferGeometry {
  const positions = edges.getAttribute('position')
  const segmentCount = positions.count / 2
  const starts = new Float32Array(segmentCount * 4 * 3)
  const ends = new Float32Array(segmentCount * 4 * 3)
  const corners = new Float32Array(segmentCount * 4 * 2)
  const indices = new Uint32Array(segmentCount * 6)

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = new THREE.Vector3().fromBufferAttribute(positions, segment * 2)
    const end = new THREE.Vector3().fromBufferAttribute(positions, segment * 2 + 1)
    const vertexOffset = segment * 4
    const indexOffset = segment * 6

    for (let vertex = 0; vertex < 4; vertex += 1) {
      starts.set(start.toArray(), (vertexOffset + vertex) * 3)
      ends.set(end.toArray(), (vertexOffset + vertex) * 3)
    }

    corners.set([-1, 0, 1, 0, -1, 1, 1, 1], segment * 8)
    indices.set([vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset + 2, vertexOffset + 1, vertexOffset + 3], indexOffset)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3))
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 3))
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}

export function InkEdges({
  edges,
  scale,
  position,
}: {
  edges: THREE.EdgesGeometry
  scale?: [number, number, number]
  position?: [number, number, number]
}) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const geometry = useMemo(() => toThickLineGeometry(edges), [edges])
  const uniforms = useMemo(() => ({
    uResolution: { value: new THREE.Vector2() },
    uLineWidth: { value: 3.6 },
    uLineColor: { value: new THREE.Color('#ffffff') },
  }), [])

  useEffect(() => {
    uniforms.uResolution.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio())
  }, [gl, size.height, size.width, uniforms])

  return (
    <mesh name="ink-outline" geometry={geometry} renderOrder={1} frustumCulled={false} scale={scale} position={position}>
      <shaderMaterial
        vertexShader={INK_LINE_VERTEX_SHADER}
        fragmentShader={INK_LINE_FRAGMENT_SHADER}
        uniforms={uniforms}
        depthWrite={false}
        depthTest
        depthFunc={THREE.LessEqualDepth}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        side={THREE.DoubleSide}
        toneMapped
      />
    </mesh>
  )
}
