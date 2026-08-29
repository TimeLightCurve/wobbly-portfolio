'use client'

import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type MotionValue } from 'motion/react'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { MOBILE_BREAKPOINT } from './CanvasViewport'
import {
	MAIN_ROOM_CAMERA_DISTANCE,
	SPHERE_PATH,
	type SceneRoute,
} from './SceneRoute'

const MOBILE_FOV = 80
export const DESKTOP_FOV_MAX = 60
const DESKTOP_FOV_MIN = 40
const FLIGHT_MOBILE_FOV = 68
const FLIGHT_DESKTOP_FOV = 48
const DESKTOP_BREAKPOINT = 1024
const WIDE_DESKTOP_BREAKPOINT = 1920
const FLIGHT_CAMERA_DISTANCE = 5.8
const FLIGHT_CAMERA_HEIGHT = 1.05
const FLIGHT_LOOK_AHEAD_DISTANCE = 4.2
const CHASE_POSITION_RESPONSE = 1.15
const CHASE_FOCUS_RESPONSE = 3.6
const REVERSE_POSITION_RESPONSE = 9
const REVERSE_FOCUS_RESPONSE = 8
const REVERSE_EXTRA_DISTANCE = 1.25
const REVERSE_LOOK_AHEAD_DISTANCE = 1.2
const REVERSE_DETECTION_SCALE = 52
const CHASE_MINIMUM_BEHIND_DISTANCE = 4.8

function getResponsiveFov(viewportWidth: number) {
	if (viewportWidth <= MOBILE_BREAKPOINT) return MOBILE_FOV

	if (viewportWidth < DESKTOP_BREAKPOINT) {
		const tabletProgress = (viewportWidth - MOBILE_BREAKPOINT) / (DESKTOP_BREAKPOINT - MOBILE_BREAKPOINT)
		return THREE.MathUtils.lerp(MOBILE_FOV, DESKTOP_FOV_MAX, tabletProgress)
	}

	const desktopProgress = THREE.MathUtils.clamp(
		(viewportWidth - DESKTOP_BREAKPOINT) / (WIDE_DESKTOP_BREAKPOINT - DESKTOP_BREAKPOINT),
		0,
		1,
	)
	return THREE.MathUtils.lerp(DESKTOP_FOV_MAX, DESKTOP_FOV_MIN, desktopProgress)
}

export function ResponsiveCameraFov({
	scrollYProgress,
	route,
}: {
	scrollYProgress: MotionValue<number>
	route: SceneRoute
}) {
	useFrame(({ camera, size }, delta) => {
		if (!(camera instanceof THREE.PerspectiveCamera)) return

		const flightTracking = THREE.MathUtils.smoothstep(
			scrollYProgress.get(),
			route.pipelineExitProgress,
			route.flightStartProgress,
		)
		const flightFov = size.width <= MOBILE_BREAKPOINT ? FLIGHT_MOBILE_FOV : FLIGHT_DESKTOP_FOV
		const targetFov = THREE.MathUtils.lerp(getResponsiveFov(size.width), flightFov, flightTracking)
		const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 8, delta)
		if (Math.abs(camera.fov - nextFov) < 0.001) return

		camera.fov = nextFov
		camera.updateProjectionMatrix()
	})

	return null
}

export function SceneCamera({
	scrollYProgress,
	route,
	mobilePerformance,
	pathCarrierRef,
}: {
	scrollYProgress: MotionValue<number>
	route: SceneRoute
	mobilePerformance: boolean
	pathCarrierRef: RefObject<THREE.Group>
}) {
	const cameraControls = useRef<CameraControlsImpl>(null)
	const chaseActive = useRef(false)
	const hasRouteSample = useRef(false)
	const reverseStrength = useRef(0)
	const routePointRef = useRef(new THREE.Vector3())
	const routeTangentRef = useRef(new THREE.Vector3())
	const horizontalTangentRef = useRef(new THREE.Vector3())
	const chaseDirectionRef = useRef(new THREE.Vector3(0, 0, -1))
	const previousRoutePointRef = useRef(new THREE.Vector3())
	const routeMovementRef = useRef(new THREE.Vector3())
	const cameraOffsetRef = useRef(new THREE.Vector3())
	const baseCameraPositionRef = useRef(new THREE.Vector3())
	const baseFocusPointRef = useRef(new THREE.Vector3())
	const chaseCameraTargetRef = useRef(new THREE.Vector3())
	const chaseFocusTargetRef = useRef(new THREE.Vector3())
	const trailingCameraPositionRef = useRef(new THREE.Vector3())
	const trailingFocusPointRef = useRef(new THREE.Vector3())
	const finalCameraPositionRef = useRef(new THREE.Vector3())
	const finalFocusPointRef = useRef(new THREE.Vector3())
	const targetCameraUpRef = useRef(new THREE.Vector3(0, 1, 0))

	useFrame((state, delta) => {
		const routePoint = routePointRef.current
		const routeTangent = routeTangentRef.current
		const horizontalTangent = horizontalTangentRef.current
		const chaseDirection = chaseDirectionRef.current
		const previousRoutePoint = previousRoutePointRef.current
		const routeMovement = routeMovementRef.current
		const cameraOffset = cameraOffsetRef.current
		const baseCameraPosition = baseCameraPositionRef.current
		const baseFocusPoint = baseFocusPointRef.current
		const chaseCameraTarget = chaseCameraTargetRef.current
		const chaseFocusTarget = chaseFocusTargetRef.current
		const trailingCameraPosition = trailingCameraPositionRef.current
		const trailingFocusPoint = trailingFocusPointRef.current
		const finalCameraPosition = finalCameraPositionRef.current
		const finalFocusPoint = finalFocusPointRef.current
		const targetCameraUp = targetCameraUpRef.current
		const scrollProgress = scrollYProgress.get()
		const pointerOffsetX = mobilePerformance ? 0 : state.pointer.x * 0.18
		const pointerOffsetY = mobilePerformance ? 0 : state.pointer.y * 0.2
		if (pathCarrierRef.current) {
			pathCarrierRef.current.getWorldPosition(routePoint)
		} else {
			route.curve.getPointAt(scrollProgress, routePoint)
		}

		const pipelineTracking = THREE.MathUtils.smoothstep(
			scrollProgress,
			route.lastColumnProgress,
			route.pipelineStartProgress,
		)
		const trackingStrength = pipelineTracking * 0.92
		const trackedX = THREE.MathUtils.lerp(SPHERE_PATH.startX, routePoint.x, trackingStrength)
		const trackedZ = THREE.MathUtils.lerp(SPHERE_PATH.z, routePoint.z, trackingStrength)
		const focusX = THREE.MathUtils.lerp(trackedX, routePoint.x, pipelineTracking)
		const focusZ = THREE.MathUtils.lerp(trackedZ, routePoint.z, pipelineTracking)
		const cameraDistance = THREE.MathUtils.lerp(MAIN_ROOM_CAMERA_DISTANCE, 4.8, pipelineTracking)
		const flightTracking = THREE.MathUtils.smoothstep(
			scrollProgress,
			route.pipelineExitProgress,
			route.flightStartProgress,
		)

		route.curve.getTangentAt(
			THREE.MathUtils.clamp(scrollProgress + 0.25 / route.length, 0, 1),
			routeTangent,
		).normalize()
		horizontalTangent.set(routeTangent.x, 0, routeTangent.z)
		if (horizontalTangent.lengthSq() > 0.0001) {
			horizontalTangent.normalize()
			chaseDirection.lerp(
				horizontalTangent,
				1 - Math.exp(-6 * delta),
			).normalize()
		}
		let reverseTarget = 0
		if (hasRouteSample.current) {
			routeMovement.copy(routePoint).sub(previousRoutePoint)
			const signedMovement = routeMovement.dot(routeTangent)
			reverseTarget = THREE.MathUtils.clamp(-signedMovement * REVERSE_DETECTION_SCALE, 0, 1)
		} else {
			hasRouteSample.current = true
		}
		previousRoutePoint.copy(routePoint)
		reverseStrength.current = THREE.MathUtils.damp(
			reverseStrength.current,
			reverseTarget,
			reverseTarget > reverseStrength.current ? 10 : 3.5,
			delta,
		)
		const reverseTracking = reverseStrength.current
		const chaseDistance = FLIGHT_CAMERA_DISTANCE + reverseTracking * REVERSE_EXTRA_DISTANCE
		const lookAheadDistance = THREE.MathUtils.lerp(
			FLIGHT_LOOK_AHEAD_DISTANCE,
			REVERSE_LOOK_AHEAD_DISTANCE,
			reverseTracking,
		)
		baseCameraPosition.set(
			trackedX + pointerOffsetX,
			routePoint.y + pointerOffsetY,
			trackedZ + cameraDistance,
		)
		baseFocusPoint.set(
			focusX + pointerOffsetX * 0.35,
			routePoint.y + pointerOffsetY * 0.35,
			focusZ,
		)
		chaseCameraTarget
			.copy(routePoint)
			.addScaledVector(chaseDirection, -chaseDistance)
		chaseCameraTarget.y += FLIGHT_CAMERA_HEIGHT
		chaseFocusTarget
			.copy(routePoint)
			.addScaledVector(chaseDirection, lookAheadDistance)
		chaseFocusTarget.y += 0.08

		if (flightTracking <= 0.001) {
			chaseActive.current = false
			trailingCameraPosition.copy(chaseCameraTarget)
			trailingFocusPoint.copy(chaseFocusTarget)
		} else {
			if (!chaseActive.current) {
				chaseActive.current = true
				trailingCameraPosition.copy(chaseCameraTarget)
				trailingFocusPoint.copy(chaseFocusTarget)
			}
			trailingCameraPosition.lerp(
				chaseCameraTarget,
				1 - Math.exp(-THREE.MathUtils.lerp(
					CHASE_POSITION_RESPONSE,
					REVERSE_POSITION_RESPONSE,
					reverseTracking,
				) * delta),
			)
			trailingFocusPoint.lerp(
				chaseFocusTarget,
				1 - Math.exp(-THREE.MathUtils.lerp(
					CHASE_FOCUS_RESPONSE,
					REVERSE_FOCUS_RESPONSE,
					reverseTracking,
				) * delta),
			)
		}

		finalCameraPosition.lerpVectors(baseCameraPosition, trailingCameraPosition, flightTracking)
		finalFocusPoint.lerpVectors(baseFocusPoint, trailingFocusPoint, flightTracking)
		if (flightTracking > 0.001) {
			cameraOffset.copy(finalCameraPosition).sub(routePoint)
			const behindDistance = -cameraOffset.dot(chaseDirection)
			if (behindDistance < CHASE_MINIMUM_BEHIND_DISTANCE) {
				finalCameraPosition.addScaledVector(
					chaseDirection,
					-(CHASE_MINIMUM_BEHIND_DISTANCE - behindDistance) * flightTracking,
				)
			}
		}
		const bankAngle = THREE.MathUtils.clamp(-chaseDirection.x * 0.34, -0.2, 0.2) * flightTracking
		targetCameraUp.set(0, 1, 0).applyAxisAngle(chaseDirection, bankAngle)
		state.camera.up.lerp(targetCameraUp, 1 - Math.exp(-3 * delta)).normalize()

		cameraControls.current?.setLookAt(
			finalCameraPosition.x,
			finalCameraPosition.y,
			finalCameraPosition.z,
			finalFocusPoint.x,
			finalFocusPoint.y,
			finalFocusPoint.z,
			true,
		)
	})

	return <CameraControls ref={cameraControls} enabled={false} />
}
