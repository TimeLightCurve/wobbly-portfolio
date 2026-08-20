'use client'

import { useFrame } from '@react-three/fiber'
import type { MotionValue } from 'motion/react'
import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type PointerAudioRig = {
	context: AudioContext
	master: GainNode
	noiseBuffer: AudioBuffer
	slowMotionBuffer: AudioBuffer
	activeSources: Set<AudioScheduledSourceNode>
	lastTriggerTime: number
	lastSlowMotionTime: number
}

export type PointerAudioSettings = {
	masterVolume: number
	centerThreshold: number
	centerRearm: number
	triggerCooldown: number
	pointerVelocityThreshold: number
	pointerVelocityScale: number
	scrollVelocityThreshold: number
	scrollVelocityScale: number
	baseDuration: number
	centerDurationStretch: number
	velocityDurationStretch: number
	basePitch: number
	pitchSweep: number
	baseCutoff: number
	centerCutoffStretch: number
	velocityCutoffStretch: number
	baseResonance: number
	resonanceStretch: number
	acidLevel: number
	noiseLevel: number
	distortion: number
	attack: number
	proximityCurve: number
	stereoWidth: number
	randomness: number
	pitchRandomness: number
	durationRandomness: number
	filterRandomness: number
	timbreRandomness: number
	slowMotionCooldown: number
	slowMotionDuration: number
	slowMotionVelocityStretch: number
	slowMotionPitch: number
	slowMotionPitchDrop: number
	slowMotionCutoff: number
	slowMotionCutoffStretch: number
	slowMotionResonance: number
	slowMotionRumbleLevel: number
	slowMotionNoiseLevel: number
	slowMotionImpactLevel: number
	slowMotionOutput: number
}

type GestureSource = 'pointer' | 'scroll'

type GestureVoice = {
	proximity: number
	velocity: number
	direction: number
	pan: number
	source: GestureSource
}

function createDistortionCurve(amount: number) {
	const sampleCount = 2048
	const curve = new Float32Array(sampleCount)

	for (let index = 0; index < sampleCount; index += 1) {
		const value = index * 2 / (sampleCount - 1) - 1
		curve[index] = ((3 + amount) * value * 20 * Math.PI / 180) /
			(Math.PI + amount * Math.abs(value))
	}

	return curve
}

function createGestureNoise(context: AudioContext) {
	const duration = 10
	const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate)
	const samples = buffer.getChannelData(0)
	let brown = 0

	for (let index = 0; index < samples.length; index += 1) {
		const white = Math.random() * 2 - 1
		brown = (brown + white * 0.025) / 1.025
		samples[index] = white * 0.68 + brown * 2.4
	}

	return buffer
}

function createSlowMotionRumble(context: AudioContext) {
	const duration = 10
	const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate)
	const samples = buffer.getChannelData(0)
	let brown = 0
	let deepRumble = 0

	for (let index = 0; index < samples.length; index += 1) {
		const white = Math.random() * 2 - 1
		brown = brown * 0.985 + white * 0.015
		deepRumble = deepRumble * 0.998 + brown * 0.002
		samples[index] = THREE.MathUtils.clamp(brown * 3.2 + deepRumble * 7.5, -1, 1)
	}

	return buffer
}

export function createPointerAudioRig(): PointerAudioRig {
	const context = new AudioContext()
	const master = context.createGain()
	const compressor = context.createDynamicsCompressor()

	master.gain.value = 0
	compressor.threshold.value = -12
	compressor.knee.value = 10
	compressor.ratio.value = 3
	compressor.attack.value = 0.008
	compressor.release.value = 0.12
	master.connect(compressor).connect(context.destination)

	return {
		context,
		master,
		noiseBuffer: createGestureNoise(context),
		slowMotionBuffer: createSlowMotionRumble(context),
		activeSources: new Set(),
		lastTriggerTime: Number.NEGATIVE_INFINITY,
		lastSlowMotionTime: Number.NEGATIVE_INFINITY,
	}
}

export function setPointerAudioMuted(rig: PointerAudioRig, muted: boolean) {
	const now = rig.context.currentTime
	rig.master.gain.cancelScheduledValues(now)
	rig.master.gain.setValueAtTime(rig.master.gain.value, now)
	rig.master.gain.linearRampToValueAtTime(muted ? 0 : 0.18, now + (muted ? 0.12 : 0.35))
}

export function disposePointerAudioRig(rig: PointerAudioRig) {
	setPointerAudioMuted(rig, true)
	for (const source of rig.activeSources) {
		try {
			source.stop()
		} catch {
			// The source may already have ended.
		}
	}
	rig.activeSources.clear()
	void rig.context.close()
}

function triggerGestureVoice(
	rig: PointerAudioRig,
	gesture: GestureVoice,
	settings: PointerAudioSettings,
) {
	const now = rig.context.currentTime
	if (now - rig.lastTriggerTime < settings.triggerCooldown) return
	rig.lastTriggerTime = now

	const proximity = Math.pow(THREE.MathUtils.clamp(gesture.proximity, 0, 1), settings.proximityCurve)
	const velocity = THREE.MathUtils.clamp(gesture.velocity, 0, 1)
	const randomness = THREE.MathUtils.clamp(settings.randomness, 0, 1)
	const randomSigned = () => Math.random() * 2 - 1
	const musicalIntervals = [-12, -7, -5, -3, 0, 3, 5, 7, 12]
	const availableIntervals = musicalIntervals.filter((interval) => Math.abs(interval) <= settings.pitchRandomness)
	const durationVariation = 1 + randomSigned() * settings.durationRandomness * randomness
	const pitchVariation = Math.random() < randomness && availableIntervals.length > 0
		? availableIntervals[Math.floor(Math.random() * availableIntervals.length)]
		: 0
	const filterVariation = Math.pow(2, randomSigned() * settings.filterRandomness * randomness)
	const timbreVariation = THREE.MathUtils.clamp(settings.timbreRandomness * randomness, 0, 1)
	const amplitudeVariation = 1 + randomSigned() * 0.18 * randomness
	const sweepDirection = Math.random() < randomness * 0.24 ? -gesture.direction : gesture.direction
	const intensity = THREE.MathUtils.clamp((0.28 + proximity * 0.46 + velocity * 0.34) * amplitudeVariation, 0.08, 1.15)
	const duration = THREE.MathUtils.clamp(
		(settings.baseDuration + proximity * settings.centerDurationStretch + velocity * settings.velocityDurationStretch) * durationVariation,
		0.08,
		8.5,
	)
	const attack = Math.min(settings.attack, duration * 0.2)
	const frequency = THREE.MathUtils.clamp(
		settings.basePitch * (1 + proximity * 0.22) * Math.pow(2, pitchVariation / 12),
		24,
		620,
	)
	const bendSemitones = settings.pitchSweep * (0.2 + velocity * 0.8)
	const bendRatio = Math.pow(2, bendSemitones / 12)
	const targetFrequency = THREE.MathUtils.clamp(
		sweepDirection >= 0 ? frequency * bendRatio : frequency / bendRatio,
		20,
		1400,
	)
	const maximumFilterFrequency = Math.min(18000, rig.context.sampleRate * 0.45)
	const filterPeak = THREE.MathUtils.clamp(
		(settings.baseCutoff + proximity * settings.centerCutoffStretch + velocity * settings.velocityCutoffStretch) * filterVariation,
		60,
		maximumFilterFrequency,
	)
	const resonance = THREE.MathUtils.clamp(
		(settings.baseResonance + (proximity * 0.7 + velocity * 0.3) * settings.resonanceStretch) * (1 + randomSigned() * 0.16 * randomness),
		0.1,
		28,
	)
	const filterPeakTime = duration * THREE.MathUtils.lerp(0.07, 0.3, Math.random() * timbreVariation)
	const oscillatorBRatios = [1, 1.5, 2, 3] as const
	const oscillatorBRatio = Math.random() < timbreVariation * 0.48
		? oscillatorBRatios[Math.floor(Math.random() * oscillatorBRatios.length)]
		: 2
	const oscillatorATypes: OscillatorType[] = ['sawtooth', 'sawtooth', 'triangle']
	const oscillatorBTypes: OscillatorType[] = ['square', 'square', 'sawtooth', 'triangle']
	const startTime = now + 0.006
	const endTime = startTime + duration

	const oscillatorA = rig.context.createOscillator()
	const oscillatorB = rig.context.createOscillator()
	const oscillatorBLevel = rig.context.createGain()
	const oscillatorMix = rig.context.createGain()
	const acidFilter = rig.context.createBiquadFilter()
	const distortion = rig.context.createWaveShaper()
	const acidEnvelope = rig.context.createGain()
	const noise = rig.context.createBufferSource()
	const noiseFilter = rig.context.createBiquadFilter()
	const noiseEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()

	oscillatorA.type = Math.random() < timbreVariation
		? oscillatorATypes[Math.floor(Math.random() * oscillatorATypes.length)]
		: 'sawtooth'
	oscillatorB.type = Math.random() < timbreVariation
		? oscillatorBTypes[Math.floor(Math.random() * oscillatorBTypes.length)]
		: 'square'
	oscillatorB.detune.value = (gesture.source === 'scroll' ? 11 : 7) + randomSigned() * 34 * timbreVariation
	oscillatorBLevel.gain.value = THREE.MathUtils.clamp(0.24 + velocity * 0.18 + randomSigned() * 0.1 * timbreVariation, 0.08, 0.5)
	oscillatorMix.gain.value = 0.34 * (1 + randomSigned() * 0.14 * randomness)

	for (const [oscillator, multiplier] of [[oscillatorA, 1], [oscillatorB, oscillatorBRatio]] as const) {
		oscillator.frequency.setValueAtTime(frequency * multiplier, startTime)
		oscillator.frequency.exponentialRampToValueAtTime(targetFrequency * multiplier, startTime + duration * 0.42)
		oscillator.frequency.exponentialRampToValueAtTime(
			Math.max(frequency * multiplier * 0.86, 20),
			endTime,
		)
	}

	acidFilter.type = 'lowpass'
	acidFilter.Q.value = resonance
	acidFilter.frequency.setValueAtTime(Math.max(settings.baseCutoff * 0.7, 40), startTime)
	acidFilter.frequency.exponentialRampToValueAtTime(filterPeak, startTime + Math.max(attack * 1.2, filterPeakTime))
	acidFilter.frequency.exponentialRampToValueAtTime(Math.max(settings.baseCutoff * 0.55, 35), endTime)
	distortion.curve = createDistortionCurve(settings.distortion * (0.65 + velocity * 0.55) * (1 + randomSigned() * 0.24 * randomness))
	distortion.oversample = '4x'
	acidEnvelope.gain.setValueAtTime(0.0001, startTime)
	acidEnvelope.gain.exponentialRampToValueAtTime(Math.max(settings.acidLevel * intensity, 0.0001), startTime + attack)
	acidEnvelope.gain.setTargetAtTime(
		Math.max(settings.acidLevel * intensity * 0.42, 0.0001),
		startTime + attack,
		Math.max(duration * 0.18, 0.02),
	)
	acidEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)

	noise.buffer = rig.noiseBuffer
	noise.loop = true
	noise.playbackRate.value = THREE.MathUtils.clamp(
		(0.72 + velocity * 1.45) * (1 + randomSigned() * 0.42 * randomness),
		0.25,
		3.5,
	)
	noiseFilter.type = Math.random() < timbreVariation * 0.22 ? 'highpass' : 'bandpass'
	noiseFilter.Q.value = Math.max(0.7, resonance * 0.52)
	noiseFilter.frequency.setValueAtTime(Math.max(settings.baseCutoff * 1.2, 80), startTime)
	noiseFilter.frequency.exponentialRampToValueAtTime(
		THREE.MathUtils.clamp(filterPeak * (sweepDirection >= 0 ? 1.1 : 0.62), 80, maximumFilterFrequency),
		startTime + filterPeakTime * THREE.MathUtils.lerp(0.7, 1.35, Math.random() * randomness),
	)
	noiseFilter.frequency.exponentialRampToValueAtTime(Math.max(settings.baseCutoff * 0.9, 60), endTime)
	noiseEnvelope.gain.setValueAtTime(0.0001, startTime)
	noiseEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.noiseLevel * intensity * (0.42 + velocity * 0.58), 0.0001),
		startTime + Math.max(attack * 0.7, 0.003),
	)
	noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)
	panner.pan.value = THREE.MathUtils.clamp(
		(gesture.pan + randomSigned() * 0.24 * randomness) * settings.stereoWidth,
		-1,
		1,
	)

	oscillatorA.connect(oscillatorMix)
	oscillatorB.connect(oscillatorBLevel).connect(oscillatorMix)
	oscillatorMix.connect(acidFilter).connect(distortion).connect(acidEnvelope).connect(panner)
	noise.connect(noiseFilter).connect(noiseEnvelope).connect(panner)
	panner.connect(rig.master)

	const sources: AudioScheduledSourceNode[] = [oscillatorA, oscillatorB, noise]
	for (const source of sources) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}

	oscillatorA.addEventListener('ended', () => {
		for (const node of [oscillatorA, oscillatorB, oscillatorBLevel, oscillatorMix, acidFilter, distortion, acidEnvelope, noise, noiseFilter, noiseEnvelope, panner]) {
			node.disconnect()
		}
	}, { once: true })

	const noiseOffset = Math.random() * Math.max(rig.noiseBuffer.duration - duration, 0)
	oscillatorA.start(startTime)
	oscillatorB.start(startTime)
	noise.start(startTime, noiseOffset)
	oscillatorA.stop(endTime + 0.02)
	oscillatorB.stop(endTime + 0.02)
	noise.stop(endTime + 0.02)
}

type SlowMotionGesture = {
	velocity: number
	direction: number
	pan: number
}

function triggerSlowMotionVoice(
	rig: PointerAudioRig,
	gesture: SlowMotionGesture,
	settings: PointerAudioSettings,
) {
	const now = rig.context.currentTime
	const velocity = THREE.MathUtils.clamp(gesture.velocity, 0, 1)
	const effectiveCooldown = THREE.MathUtils.lerp(0.14, settings.slowMotionCooldown, velocity)
	if (now - rig.lastSlowMotionTime < effectiveCooldown) return
	rig.lastSlowMotionTime = now

	const variation = THREE.MathUtils.clamp(settings.randomness * 0.32, 0, 0.35)
	const randomSigned = () => Math.random() * 2 - 1
	const motionStrength = Math.pow(velocity, 1.65)
	const minimumDuration = Math.max(settings.slowMotionDuration * 0.08, 0.14)
	const maximumDuration = settings.slowMotionDuration + settings.slowMotionVelocityStretch
	const duration = THREE.MathUtils.clamp(
		THREE.MathUtils.lerp(minimumDuration, maximumDuration, motionStrength) * (1 + randomSigned() * variation * 0.08),
		0.14,
		7.5,
	)
	const startTime = now + 0.006
	const endTime = startTime + duration
	const slowPoint = startTime + duration * THREE.MathUtils.lerp(0.38, 0.62, motionStrength)
	const startPitch = THREE.MathUtils.clamp(
		settings.slowMotionPitch * (1 + velocity * 0.24) * (1 + randomSigned() * variation * 0.35),
		18,
		100,
	)
	const effectivePitchDrop = settings.slowMotionPitchDrop * THREE.MathUtils.lerp(0.12, 1, motionStrength)
	const pitchDrop = Math.pow(2, -effectivePitchDrop / 12)
	const endPitch = Math.max(startPitch * pitchDrop, 16)
	const filterPeak = THREE.MathUtils.clamp(
		(settings.slowMotionCutoff + velocity * settings.slowMotionCutoffStretch) * (1 + randomSigned() * variation),
		45,
		2600,
	)
	const attack = Math.min(0.12 + (1 - velocity) * 0.14, duration * 0.2)

	const sub = rig.context.createOscillator()
	const body = rig.context.createOscillator()
	const impact = rig.context.createOscillator()
	const fmModulator = rig.context.createOscillator()
	const fmDepth = rig.context.createGain()
	const subLevel = rig.context.createGain()
	const bodyLevel = rig.context.createGain()
	const impactEnvelope = rig.context.createGain()
	const bodyDrive = rig.context.createWaveShaper()
	const rumbleFilter = rig.context.createBiquadFilter()
	const rumbleEnvelope = rig.context.createGain()
	const noise = rig.context.createBufferSource()
	const noiseHighpass = rig.context.createBiquadFilter()
	const noiseFilter = rig.context.createBiquadFilter()
	const noiseEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()
	const slowMotionOutput = rig.context.createGain()

	sub.type = 'sine'
	sub.frequency.setValueAtTime(startPitch * 1.8, startTime)
	sub.frequency.exponentialRampToValueAtTime(Math.max(endPitch, 17), slowPoint)
	sub.frequency.exponentialRampToValueAtTime(startPitch * 1.6, endTime)
	subLevel.gain.value = 0.72

	body.type = 'sawtooth'
	body.detune.value = randomSigned() * 7
	body.frequency.setValueAtTime(startPitch * 4.4, startTime)
	body.frequency.exponentialRampToValueAtTime(Math.max(endPitch * 2.5, 42), slowPoint)
	body.frequency.exponentialRampToValueAtTime(startPitch * 4.1, endTime)
	bodyLevel.gain.value = 0.34 + velocity * 0.12
	bodyDrive.curve = createDistortionCurve(72 + velocity * 95)
	bodyDrive.oversample = '4x'

	fmModulator.type = 'sine'
	fmModulator.frequency.setValueAtTime(24 + velocity * 20, startTime)
	fmModulator.frequency.exponentialRampToValueAtTime(THREE.MathUtils.lerp(13, 3.2, motionStrength), slowPoint)
	fmModulator.frequency.exponentialRampToValueAtTime(20 + velocity * 16, endTime)
	fmDepth.gain.setValueAtTime(42 + velocity * 72, startTime)
	fmDepth.gain.exponentialRampToValueAtTime(10 + motionStrength * 34, slowPoint)
	fmDepth.gain.exponentialRampToValueAtTime(28 + velocity * 35, endTime)

	impact.type = 'sine'
	impact.frequency.setValueAtTime(105 + velocity * 115, startTime)
	impact.frequency.exponentialRampToValueAtTime(28, startTime + Math.min(duration * 0.34, 1.25))
	impactEnvelope.gain.setValueAtTime(0.0001, startTime)
	impactEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionImpactLevel * (0.7 + velocity * 0.3), 0.0001),
		startTime + 0.012,
	)
	impactEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(duration * 0.42, 1.5))

	rumbleFilter.type = 'lowpass'
	rumbleFilter.Q.value = settings.slowMotionResonance
	rumbleFilter.frequency.setValueAtTime(filterPeak, startTime)
	rumbleFilter.frequency.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionCutoff * THREE.MathUtils.lerp(0.9, 0.32, motionStrength), 38),
		slowPoint,
	)
	rumbleFilter.frequency.exponentialRampToValueAtTime(filterPeak * 0.88, endTime)
	rumbleEnvelope.gain.setValueAtTime(0.0001, startTime)
	rumbleEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionRumbleLevel * (0.62 + velocity * 0.38), 0.0001),
		startTime + attack,
	)
	rumbleEnvelope.gain.setTargetAtTime(
		Math.max(settings.slowMotionRumbleLevel * 0.48, 0.0001),
		startTime + attack,
		duration * 0.3,
	)
	rumbleEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)

	noise.buffer = rig.slowMotionBuffer
	noise.loop = true
	noise.playbackRate.setValueAtTime(0.92 + velocity * 0.16, startTime)
	noise.playbackRate.exponentialRampToValueAtTime(THREE.MathUtils.lerp(0.72, 0.16, motionStrength), slowPoint)
	noise.playbackRate.exponentialRampToValueAtTime(0.9 + velocity * 0.12, endTime)
	noiseHighpass.type = 'highpass'
	noiseHighpass.frequency.value = 24
	noiseFilter.type = 'bandpass'
	noiseFilter.Q.value = Math.max(1.2, settings.slowMotionResonance * 0.44)
	noiseFilter.frequency.setValueAtTime(Math.min(filterPeak * 0.55, 520), startTime)
	noiseFilter.frequency.exponentialRampToValueAtTime(
		THREE.MathUtils.lerp(190, 62, motionStrength),
		slowPoint,
	)
	noiseFilter.frequency.exponentialRampToValueAtTime(Math.min(filterPeak * 0.48, 460), endTime)
	noiseEnvelope.gain.setValueAtTime(0.0001, startTime)
	noiseEnvelope.gain.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionNoiseLevel * (0.55 + velocity * 0.45), 0.0001),
		startTime + attack * 1.35,
	)
	noiseEnvelope.gain.setTargetAtTime(
		Math.max(settings.slowMotionNoiseLevel * 0.35, 0.0001),
		startTime + duration * 0.28,
		duration * 0.22,
	)
	noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, endTime)

	panner.pan.value = THREE.MathUtils.clamp(
		gesture.pan * settings.stereoWidth + gesture.direction * 0.08,
		-1,
		1,
	)
	slowMotionOutput.gain.value = settings.slowMotionOutput

	sub.connect(subLevel).connect(rumbleFilter)
	body.connect(bodyLevel).connect(bodyDrive).connect(rumbleFilter)
	fmModulator.connect(fmDepth).connect(body.frequency)
	rumbleFilter.connect(rumbleEnvelope).connect(panner)
	impact.connect(impactEnvelope).connect(panner)
	noise.connect(noiseHighpass).connect(noiseFilter).connect(noiseEnvelope).connect(panner)
	panner.connect(slowMotionOutput).connect(rig.master)

	const sources: AudioScheduledSourceNode[] = [sub, body, impact, fmModulator, noise]
	for (const source of sources) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}

	sub.addEventListener('ended', () => {
		for (const node of [sub, body, impact, fmModulator, fmDepth, subLevel, bodyLevel, impactEnvelope, bodyDrive, rumbleFilter, rumbleEnvelope, noise, noiseHighpass, noiseFilter, noiseEnvelope, panner, slowMotionOutput]) {
			node.disconnect()
		}
	}, { once: true })

	const noiseOffset = Math.random() * Math.max(rig.slowMotionBuffer.duration - duration, 0)
	sub.start(startTime)
	body.start(startTime)
	impact.start(startTime)
	fmModulator.start(startTime)
	noise.start(startTime, noiseOffset)
	impact.stop(startTime + Math.min(duration * 0.44, 1.55))
	sub.stop(endTime + 0.02)
	body.stop(endTime + 0.02)
	fmModulator.stop(endTime + 0.02)
	noise.stop(endTime + 0.02)
}

export function triggerColumnSlowMotion(
	rig: PointerAudioRig,
	settings: PointerAudioSettings,
	velocity: number,
	direction: number,
) {
	if (rig.context.state === 'closed') return
	if (rig.context.state === 'suspended') void rig.context.resume()
	triggerSlowMotionVoice(rig, {
		velocity,
		direction,
		pan: direction * 0.22,
	}, settings)
}

export function PointerAudioModulator({
	rigRef,
	settings,
	enabled,
	scrollProgress,
}: {
	rigRef: MutableRefObject<PointerAudioRig | null>
	settings: PointerAudioSettings
	enabled: boolean
	scrollProgress: MotionValue<number>
}) {
	const previousPointer = useRef(new THREE.Vector2())
	const previousProximity = useRef(0)
	const previousScroll = useRef(scrollProgress.get())
	const hasPointerSample = useRef(false)
	const pointerArmed = useRef(false)
	const pointerCapture = useRef(false)
	const capturedProximity = useRef(0)
	const capturedVelocity = useRef(0)
	const capturedDirection = useRef(1)
	const scrollArmed = useRef(true)
	const wheelStrength = useRef(0)
	const wheelDirection = useRef(-1)
	const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const lastWheelEventTime = useRef(Number.NEGATIVE_INFINITY)

	useEffect(() => {
		const handleWheel = (event: WheelEvent) => {
			if (!enabled) return
			const target = event.target
			if (target instanceof Element && target.closest('aside')) return
			const unitMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? window.innerHeight
					: 1
			const pixelDelta = Math.abs(event.deltaY) * unitMultiplier
			const impulseStrength = 1 - Math.exp(-pixelDelta * settings.scrollVelocityScale / 1400)
			wheelStrength.current = 1 - (1 - wheelStrength.current) * (1 - impulseStrength)
			wheelDirection.current = event.deltaY >= 0 ? -1 : 1
			lastWheelEventTime.current = performance.now()

			if (wheelTimer.current) clearTimeout(wheelTimer.current)
			wheelTimer.current = setTimeout(() => {
				const rawStrength = wheelStrength.current
				wheelStrength.current = 0
				wheelTimer.current = null
				if (rawStrength < 0.015) return
				const strength = Math.pow(rawStrength, 1 + settings.scrollVelocityThreshold * 1.5)

				const rig = rigRef.current
				if (!rig || rig.context.state === 'closed') return
				if (rig.context.state === 'suspended') void rig.context.resume()
				triggerSlowMotionVoice(rig, {
					velocity: strength,
					direction: wheelDirection.current,
					pan: 0,
				}, settings)
			}, 90)
		}

		window.addEventListener('wheel', handleWheel, { passive: true })
		return () => {
			window.removeEventListener('wheel', handleWheel)
			if (wheelTimer.current) clearTimeout(wheelTimer.current)
		}
	}, [enabled, rigRef, settings])

	useFrame((state, delta) => {
		const pointerX = THREE.MathUtils.clamp(state.pointer.x, -1, 1)
		const pointerY = THREE.MathUtils.clamp(state.pointer.y, -1, 1)
		const currentPointer = new THREE.Vector2(pointerX, pointerY)
		const frameDuration = Math.max(delta, 1 / 240)
		const distance = Math.hypot(pointerX, pointerY)
		const proximity = 1 - THREE.MathUtils.clamp(distance / Math.SQRT2, 0, 1)
		const rawPointerVelocity = hasPointerSample.current
			? currentPointer.distanceTo(previousPointer.current) / frameDuration
			: 0
		const pointerVelocity = 1 - Math.exp(-rawPointerVelocity * settings.pointerVelocityScale)
		const inwardMotion = proximity - previousProximity.current
		const currentScroll = scrollProgress.get()
		const scrollDelta = currentScroll - previousScroll.current
		const rawScrollVelocity = Math.abs(scrollDelta) / frameDuration
		const scrollVelocity = 1 - Math.exp(-rawScrollVelocity * settings.scrollVelocityScale)

		const rearmThreshold = Math.min(settings.centerRearm, settings.centerThreshold - 0.03)
		if (proximity <= rearmThreshold) {
			pointerArmed.current = true
			pointerCapture.current = false
		}
		if (scrollVelocity <= 0.015) scrollArmed.current = true

		const rig = rigRef.current
		if (rig && rig.context.state === 'running') {
			const now = rig.context.currentTime
			rig.master.gain.setTargetAtTime(enabled ? settings.masterVolume : 0, now, 0.035)

			if (enabled && pointerArmed.current && proximity >= settings.centerThreshold && inwardMotion > 0) {
				pointerArmed.current = false
				pointerCapture.current = true
				capturedProximity.current = proximity
				capturedVelocity.current = pointerVelocity
				capturedDirection.current = pointerY <= previousPointer.current.y ? 1 : -1
			}

			if (enabled && pointerCapture.current) {
				capturedProximity.current = Math.max(capturedProximity.current, proximity)
				if (pointerVelocity > capturedVelocity.current) {
					capturedVelocity.current = pointerVelocity
					capturedDirection.current = pointerY <= previousPointer.current.y ? 1 : -1
				}

				if (inwardMotion <= 0 || proximity >= 0.985) {
					if (capturedVelocity.current >= settings.pointerVelocityThreshold) {
						triggerGestureVoice(rig, {
							proximity: capturedProximity.current,
							velocity: capturedVelocity.current,
							direction: capturedDirection.current,
							pan: pointerX,
							source: 'pointer',
						}, settings)
					}
					pointerCapture.current = false
				}
			}

			const hasRecentWheelInput = performance.now() - lastWheelEventTime.current < 180
			if (enabled && !hasRecentWheelInput && scrollArmed.current && scrollVelocity >= 0.025) {
				const scrollStrength = Math.pow(scrollVelocity, 1 + settings.scrollVelocityThreshold * 1.5)
				triggerSlowMotionVoice(rig, {
					velocity: scrollStrength,
					direction: scrollDelta >= 0 ? -1 : 1,
					pan: pointerX,
				}, settings)
				scrollArmed.current = false
			}
		} else if (!enabled) {
			pointerCapture.current = false
		}

		previousPointer.current.copy(currentPointer)
		previousProximity.current = proximity
		previousScroll.current = currentScroll
		hasPointerSample.current = true
	})

	return null
}
