import { Line, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type MotionValue } from 'motion/react'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { type GLTF } from 'three-stdlib'
import { InkEdges, toInkEdges } from './InkEdges'
import { PIPELINE_LOCAL_CENTERLINE } from './SceneRoute'

const PIPELINE_OUTLINE_RADIUS = 0.49
const PIPELINE_OUTLINE_SEGMENTS = 240

type PipeRoomGLTF = GLTF & {
	nodes: {
		Cube: THREE.Mesh
	}
}

type PipelineRoomProps = {
	positionX: number
	positionY: number
	positionZ: number
	revealProgress: number
	scrollYProgress: MotionValue<number>
}

export function PipelineRoom({
	positionX,
	positionY,
	positionZ,
	revealProgress,
	scrollYProgress,
}: PipelineRoomProps) {
	const { nodes } = useGLTF('/pipe-room2.glb') as unknown as PipeRoomGLTF
	const material = useRef<THREE.MeshStandardMaterial>(null)
	const roomEdges = useMemo(() => toInkEdges(nodes.Cube.geometry), [nodes.Cube.geometry])
	const pipelineOutlineRails = useMemo(() => {
		const centerline = new THREE.CatmullRomCurve3(
			PIPELINE_LOCAL_CENTERLINE.map((point) => new THREE.Vector3(...point)),
			false,
			'centripetal',
			0.5,
		)
		const frames = centerline.computeFrenetFrames(PIPELINE_OUTLINE_SEGMENTS, false)
		const firstRail: THREE.Vector3[] = []
		const secondRail: THREE.Vector3[] = []

		for (let index = 0; index <= PIPELINE_OUTLINE_SEGMENTS; index += 1) {
			const center = centerline.getPoint(index / PIPELINE_OUTLINE_SEGMENTS)
			const contourOffset = frames.binormals[index].clone().multiplyScalar(PIPELINE_OUTLINE_RADIUS)
			firstRail.push(center.clone().add(contourOffset))
			secondRail.push(center.clone().sub(contourOffset))
		}

		return [firstRail, secondRail]
	}, [])

	useFrame(() => {
		if (!material.current) return
		const reveal = THREE.MathUtils.smoothstep(
			scrollYProgress.get(),
			revealProgress - 0.025,
			revealProgress + 0.025,
		)
		material.current.opacity = THREE.MathUtils.lerp(0.035, 0.16, reveal)
	})

	return (
		<group position={[positionX, positionY, positionZ]} dispose={null} >
			<mesh geometry={nodes.Cube.geometry} castShadow receiveShadow>
				<meshStandardMaterial
					ref={material}
					color="#17181c"
					emissive="#000000"
					emissiveIntensity={0}
					metalness={0.02}
					roughness={0.94}
					side={THREE.DoubleSide}
					transparent
					opacity={0.035}
					depthWrite={false}
				/>
			</mesh>
			{/* <InkEdges edges={roomEdges} /> */}
			{/* {pipelineOutlineRails.map((points, index) => (
				<Line
					key={index}
					points={points}
					color="#d9dbe3"
					lineWidth={2.15}
					transparent
					opacity={0.82}
					depthTest
					depthWrite={false}
					toneMapped
				/>
			))} */}
		</group>
	)
}

useGLTF.preload('/pipe-room2.glb')
