import * as THREE from 'three'
import {
	COLUMN_SPACING,
	COLUMN_SYSTEM_OFFSET_Y,
	FIRST_COLUMN_CENTER_Y,
} from './Room'

export const SPHERE_PATH = {
	startX: 0,
	z: -1.41,
	startY: 0.2,
}

const PIPELINE_INLET_LOCAL_X = 2
const PIPELINE_INLET_LOCAL_Y = 4.05
const PIPELINE_INLET_LOCAL_Z = -5.29
export const PIPELINE_INLET_Z = -1.45
export const PIPELINE_ROOM_OFFSET_X = 3.2
export const PIPELINE_ROOM_OFFSET_Y = -4
const PIPELINE_MODEL_POSITION_X = PIPELINE_ROOM_OFFSET_X - PIPELINE_INLET_LOCAL_X
const PIPELINE_MODEL_POSITION_Z = PIPELINE_INLET_Z - PIPELINE_INLET_LOCAL_Z
const PIPELINE_GAP_AFTER_LAST_COLUMN = 2.45
export const PIPELINE_SPHERE_SCALE = 0.12
export const FLIGHT_SPHERE_SCALE = 0.2
const FLIGHT_DISTANCE = 32
const FLIGHT_CONTROL_POINT_COUNT = 11
const ROUTE_PROGRESS_SAMPLES = 1800
export const MAIN_ROOM_CAMERA_DISTANCE = 6.4
const PIPELINE_APPROACH_Z = 2.1
export const DESKTOP_SCROLL_VH_PER_ROUTE_UNIT = 18
export const MOBILE_SCROLL_VH_PER_ROUTE_UNIT = 11

export const PIPELINE_LOCAL_CENTERLINE: ReadonlyArray<readonly [number, number, number]> = [
	[2, 4.05, -5.29],
	[2, 3.18, -5.29],
	[2, 2.65, -5.29],
	[2, 2.36, -5.22],
	[2, 2.1, -4.98],
	[2, 1.94, -4.6],
	[2, 1.94, -3.02],
	[1.9, 1.94, -2.72],
	[1.66, 1.94, -2.46],
	[1.3, 1.94, -2.28],
	[0.9, 1.94, -2.28],
	[0.56, 1.82, -2.28],
	[0.3, 1.56, -2.28],
	[0.2, 1.25, -2.28],
	[0.2, -0.48, -2.28],
	[0.34, -0.8, -2.28],
	[0.65, -1.1, -2.28],
	[4.86, -1.15, -2.28],
	[5.16, -1.15, -2.4],
	[5.4, -1.15, -2.65],
	[5.53, -1.15, -2.95],
	[5.53, -1.15, -4.3],
	[5.53, -1.15, -5.8],
	[5.53, -1.15, -7],
	[5.53, -1.15, -9.8],
]

export type SceneRoute = {
	curve: THREE.CatmullRomCurve3
	snapProgress: number[]
	columnProgress: number[]
	pipelinePositionX: number
	pipelinePositionY: number
	pipelinePositionZ: number
	pipelineInletY: number
	pipelineStartProgress: number
	pipelineExitProgress: number
	pipelineRevealProgress: number
	flightStartProgress: number
	flightEndProgress: number
	flightStatementProgress: number[]
	lastColumnProgress: number
	length: number
}

function createSeededRandom(seed: number) {
	let state = seed >>> 0
	return () => {
		state += 0x6D2B79F5
		let value = state
		value = Math.imul(value ^ (value >>> 15), value | 1)
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296
	}
}

function findClosestRouteProgress(curve: THREE.Curve<THREE.Vector3>, target: THREE.Vector3) {
	const sample = new THREE.Vector3()
	let closestProgress = 0
	let closestDistanceSquared = Number.POSITIVE_INFINITY

	for (let index = 0; index <= ROUTE_PROGRESS_SAMPLES; index += 1) {
		const progress = index / ROUTE_PROGRESS_SAMPLES
		curve.getPointAt(progress, sample)
		const distanceSquared = sample.distanceToSquared(target)
		if (distanceSquared >= closestDistanceSquared) continue
		closestDistanceSquared = distanceSquared
		closestProgress = progress
	}

	return closestProgress
}

export function createSceneRoute(columnCount: number): SceneRoute {
	const columnPoints = Array.from({ length: columnCount }, (_, columnIndex) => new THREE.Vector3(
		SPHERE_PATH.startX,
		COLUMN_SYSTEM_OFFSET_Y + FIRST_COLUMN_CENTER_Y - columnIndex * COLUMN_SPACING,
		SPHERE_PATH.z,
	))
	const columnRoutePoints = columnPoints
	const lastColumn = columnPoints[columnPoints.length - 1]
	const pipelineInletY = lastColumn.y - PIPELINE_GAP_AFTER_LAST_COLUMN + PIPELINE_ROOM_OFFSET_Y
	const pipelinePositionY = pipelineInletY - PIPELINE_INLET_LOCAL_Y
	const pipePoint = (x: number, y: number, z: number) => new THREE.Vector3(
		PIPELINE_MODEL_POSITION_X + x,
		pipelinePositionY + y,
		PIPELINE_MODEL_POSITION_Z + z,
	)
	const pipelinePoints = PIPELINE_LOCAL_CENTERLINE.map(([x, y, z]) => pipePoint(x, y, z))
	const pipeExit = pipelinePoints[pipelinePoints.length - 1]
	const flightRandom = createSeededRandom(0xA51D5EED + columnCount)
	let lateralDrift = 0
	let verticalDrift = 0
	const flightTurnPoints = [
		new THREE.Vector3(pipeExit.x, pipeExit.y - 0.24, pipeExit.z),
		new THREE.Vector3(pipeExit.x + 0.04, pipeExit.y - 0.5, pipeExit.z - 0.18),
		new THREE.Vector3(pipeExit.x + 0.12, pipeExit.y - 0.7, pipeExit.z - 0.72),
	]
	const flightCruiseY = pipeExit.y - 0.78
	const organicFlightPoints = Array.from({ length: FLIGHT_CONTROL_POINT_COUNT }, (_, pointIndex) => {
		const progress = (pointIndex + 1) / FLIGHT_CONTROL_POINT_COUNT
		lateralDrift = THREE.MathUtils.lerp(lateralDrift, flightRandom() * 2 - 1, 0.46)
		verticalDrift = THREE.MathUtils.lerp(verticalDrift, flightRandom() * 2 - 1, 0.38)
		const lateralWave = Math.sin(progress * Math.PI * 3.4 + 0.65) * 0.48
		const verticalWave = Math.sin(progress * Math.PI * 4.2 + 1.1) * 0.24

		return new THREE.Vector3(
			pipeExit.x + lateralDrift * 1.75 + lateralWave,
			flightCruiseY + verticalDrift * 0.78 + verticalWave,
			pipeExit.z - 0.72 - FLIGHT_DISTANCE * progress,
		)
	})
	const flightPoints = [...flightTurnPoints, ...organicFlightPoints]
	const points = [
		new THREE.Vector3(SPHERE_PATH.startX, SPHERE_PATH.startY, SPHERE_PATH.z),
		new THREE.Vector3(SPHERE_PATH.startX, -0.55, SPHERE_PATH.z),
		new THREE.Vector3(SPHERE_PATH.startX, -1.35, SPHERE_PATH.z),
		new THREE.Vector3(SPHERE_PATH.startX, -1.95, SPHERE_PATH.z),
		...columnRoutePoints,
		new THREE.Vector3(0, lastColumn.y - 0.9, PIPELINE_APPROACH_Z),
		new THREE.Vector3(
			PIPELINE_ROOM_OFFSET_X * 0.34,
			THREE.MathUtils.lerp(lastColumn.y, pipelineInletY, 0.45),
			PIPELINE_APPROACH_Z,
		),
		new THREE.Vector3(
			PIPELINE_ROOM_OFFSET_X * 0.78,
			THREE.MathUtils.lerp(lastColumn.y, pipelineInletY, 0.73),
			THREE.MathUtils.lerp(SPHERE_PATH.z, PIPELINE_INLET_Z, 0.73),
		),
		new THREE.Vector3(PIPELINE_ROOM_OFFSET_X, pipelineInletY + 0.55, PIPELINE_INLET_Z),
		...pipelinePoints,
		...flightPoints,
	]
	const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
	curve.arcLengthDivisions = ROUTE_PROGRESS_SAMPLES
	curve.updateArcLengths()

	const pipelineStops = [
		pipelinePoints[0],
		pipelinePoints[6],
		pipelinePoints[14],
		pipelinePoints[20],
		pipelinePoints[pipelinePoints.length - 1],
	]
	const columnProgress = columnPoints.map((point) => findClosestRouteProgress(curve, point))
	const pipelineProgress = pipelineStops.map((point) => findClosestRouteProgress(curve, point))
	const pipelineStartProgress = pipelineProgress[0]
	const pipelineExitProgress = pipelineProgress[pipelineProgress.length - 1]
	const flightStartProgress = findClosestRouteProgress(curve, flightTurnPoints[flightTurnPoints.length - 1])
	const flightStatementProgress = [
		organicFlightPoints[2],
		organicFlightPoints[5],
		organicFlightPoints[8],
	].map((point) => findClosestRouteProgress(curve, point))
	const flightEndProgress = findClosestRouteProgress(
		curve,
		organicFlightPoints[organicFlightPoints.length - 1],
	)
	const flightSnapProgress = [...flightStatementProgress, flightEndProgress]

	return {
		curve,
		snapProgress: [0, ...columnProgress, ...pipelineProgress, ...flightSnapProgress],
		columnProgress,
		pipelinePositionX: PIPELINE_MODEL_POSITION_X,
		pipelinePositionY,
		pipelinePositionZ: PIPELINE_MODEL_POSITION_Z,
		pipelineInletY,
		pipelineStartProgress,
		pipelineExitProgress,
		pipelineRevealProgress: THREE.MathUtils.lerp(
			columnProgress[columnProgress.length - 1],
			pipelineStartProgress,
			0.72,
		),
		flightStartProgress,
		flightEndProgress,
		flightStatementProgress,
		lastColumnProgress: columnProgress[columnProgress.length - 1],
		length: curve.getLength(),
	}
}
