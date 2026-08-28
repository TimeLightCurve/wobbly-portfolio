import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type MotionValue } from 'motion/react'
import { useRef } from 'react'
import * as THREE from 'three'
import { type GLTF } from 'three-stdlib'

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
	const previousOpacity = useRef(Number.NaN)

	useFrame(() => {
		if (!material.current) return
		const reveal = THREE.MathUtils.smoothstep(
			scrollYProgress.get(),
			revealProgress - 0.025,
				revealProgress + 0.025,
		)
		const opacity = THREE.MathUtils.lerp(0.035, 0.16, reveal)
		if (Math.abs(opacity - previousOpacity.current) < 0.0001) return
		previousOpacity.current = opacity
		material.current.opacity = opacity
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
		</group>
	)
}

useGLTF.preload('/pipe-room2.glb')
