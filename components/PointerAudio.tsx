'use client'

import { useFrame } from '@react-three/fiber'
import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type SlowMotionGestureOwner = 'touch' | 'wheel'

type ActiveSlowMotionVoice = {
	owner: SlowMotionGestureOwner
	sub: OscillatorNode
	body: OscillatorNode
	noise: AudioBufferSourceNode
	rumbleFilter: BiquadFilterNode
	noiseFilter: BiquadFilterNode
	rumbleEnvelope: GainNode
	noiseEnvelope: GainNode
	panner: StereoPannerNode
	output: GainNode
	basePitch: number
	pitchDropScale: number
	cutoffScale: number
	playbackFloor: number
	rumbleScale: number
	noiseScale: number
	stopped: boolean
}

export type PointerAudioRig = {
	context: AudioContext
	master: GainNode
	noiseBuffer: AudioBuffer
	slowMotionBuffer: AudioBuffer
	mobilePerformance: boolean
	activeSources: Set<AudioScheduledSourceNode>
	lastTriggerTime: number
	lastSlowMotionTime: number
	activeSlowMotionVoice: ActiveSlowMotionVoice | null
	muted: boolean
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

function createGestureNoise(context: AudioContext, duration: number) {
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

function createSlowMotionRumble(context: AudioContext, duration: number) {
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

export function createPointerAudioRig(mobilePerformance = false): PointerAudioRig {
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

	const noiseDuration = mobilePerformance ? 1 : 10

	return {
		context,
		master,
		noiseBuffer: createGestureNoise(context, noiseDuration),
		slowMotionBuffer: createSlowMotionRumble(context, noiseDuration),
		mobilePerformance,
		activeSources: new Set(),
		lastTriggerTime: Number.NEGATIVE_INFINITY,
		lastSlowMotionTime: Number.NEGATIVE_INFINITY,
		activeSlowMotionVoice: null,
		muted: true,
	}
}

export function setPointerAudioMuted(rig: PointerAudioRig, muted: boolean) {
	rig.muted = muted
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
	distortion.oversample = rig.mobilePerformance ? 'none' : '4x'
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

function updateHeldSlowMotionVoice(
	rig: PointerAudioRig,
	gesture: SlowMotionGesture,
	settings: PointerAudioSettings,
) {
	const voice = rig.activeSlowMotionVoice
	if (!voice || voice.stopped) return

	const now = rig.context.currentTime
	const velocity = THREE.MathUtils.clamp(gesture.velocity, 0, 1)
	const motionStrength = Math.pow(velocity, 1.25)
	const pitchDrop = Math.pow(
		2,
		-(settings.slowMotionPitchDrop * voice.pitchDropScale * THREE.MathUtils.lerp(0.12, 1, motionStrength)) / 12,
	)
	const response = THREE.MathUtils.lerp(0.055, 0.018, motionStrength)
	const maximumFilterFrequency = Math.min(1400, rig.context.sampleRate * 0.42)
	const cutoff = THREE.MathUtils.clamp(
		(settings.slowMotionCutoff + velocity * settings.slowMotionCutoffStretch) * voice.cutoffScale,
		40,
		maximumFilterFrequency,
	)

	voice.sub.frequency.setTargetAtTime(Math.max(voice.basePitch * 0.82 * pitchDrop, 18), now, response)
	voice.body.frequency.setTargetAtTime(Math.max(voice.basePitch * 2.15 * pitchDrop, 44), now, response)
	voice.noise.playbackRate.setTargetAtTime(THREE.MathUtils.lerp(0.72, voice.playbackFloor, motionStrength), now, response)
	voice.rumbleFilter.frequency.setTargetAtTime(cutoff, now, response * 1.2)
	voice.rumbleFilter.Q.setTargetAtTime(0.7 + settings.slowMotionResonance * 0.04, now, 0.025)
	voice.noiseFilter.frequency.setTargetAtTime(
		THREE.MathUtils.lerp(THREE.MathUtils.clamp(cutoff * 0.9, 360, 780), 140, motionStrength),
		now,
		response * 1.4,
	)
	voice.rumbleEnvelope.gain.setTargetAtTime(
		Math.max(settings.slowMotionRumbleLevel * voice.rumbleScale * (0.55 + velocity * 0.45), 0.0001),
		now,
		0.025,
	)
	voice.noiseEnvelope.gain.setTargetAtTime(
		Math.max(settings.slowMotionNoiseLevel * voice.noiseScale * (0.48 + velocity * 0.52), 0.0001),
		now,
		0.032,
	)
	voice.panner.pan.setTargetAtTime(
		THREE.MathUtils.clamp(gesture.pan * settings.stereoWidth + gesture.direction * 0.06, -1, 1),
		now,
		0.035,
	)
	voice.output.gain.setTargetAtTime(settings.slowMotionOutput, now, 0.02)
}

function releaseHeldSlowMotionVoice(rig: PointerAudioRig, owner: SlowMotionGestureOwner) {
	const voice = rig.activeSlowMotionVoice
	if (!voice || voice.owner !== owner || voice.stopped) return

	voice.stopped = true
	rig.activeSlowMotionVoice = null
	const now = rig.context.currentTime
	const releaseEnd = now + 0.34

	for (const envelope of [voice.rumbleEnvelope, voice.noiseEnvelope]) {
		envelope.gain.cancelScheduledValues(now)
		envelope.gain.setValueAtTime(Math.max(envelope.gain.value, 0.0001), now)
		envelope.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)
	}
	voice.sub.frequency.setTargetAtTime(voice.basePitch * 0.82, now, 0.065)
	voice.body.frequency.setTargetAtTime(voice.basePitch * 2.15, now, 0.065)
	voice.noise.playbackRate.setTargetAtTime(0.82, now, 0.06)

	for (const source of [voice.sub, voice.body, voice.noise]) {
		try {
			source.stop(releaseEnd + 0.04)
		} catch {
			// The source may already have ended.
		}
	}
}

function beginHeldSlowMotionVoice(
	rig: PointerAudioRig,
	owner: SlowMotionGestureOwner,
	gesture: SlowMotionGesture,
	settings: PointerAudioSettings,
) {
	if (rig.context.state === 'closed' || rig.muted) return
	if (rig.context.state === 'suspended') void rig.context.resume()

	const currentVoice = rig.activeSlowMotionVoice
	if (currentVoice && !currentVoice.stopped) {
		if (currentVoice.owner === owner) updateHeldSlowMotionVoice(rig, gesture, settings)
		return
	}

	const now = rig.context.currentTime
	const startTime = now + 0.004
	const randomSigned = () => Math.random() * 2 - 1
	const variation = THREE.MathUtils.clamp(settings.randomness, 0, 1)
	const pitchVariation = randomSigned() * 3.5 * variation
	const pitchDropScale = 1 + randomSigned() * 0.2 * variation
	const cutoffScale = 1 + randomSigned() * 0.32 * variation
	const playbackFloor = THREE.MathUtils.clamp(0.16 + randomSigned() * 0.06 * variation, 0.1, 0.22)
	const rumbleScale = 1 + randomSigned() * 0.24 * variation
	const noiseScale = 1 + randomSigned() * 0.3 * variation
	const basePitch = THREE.MathUtils.clamp(
		settings.slowMotionPitch * Math.pow(2, pitchVariation / 12),
		18,
		100,
	)
	const sub = rig.context.createOscillator()
	const body = rig.context.createOscillator()
	const noise = rig.context.createBufferSource()
	const subLevel = rig.context.createGain()
	const bodyLevel = rig.context.createGain()
	const rumbleFilter = rig.context.createBiquadFilter()
	const noiseHighpass = rig.context.createBiquadFilter()
	const noiseFilter = rig.context.createBiquadFilter()
	const rumbleEnvelope = rig.context.createGain()
	const noiseEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()
	const output = rig.context.createGain()

	sub.type = 'sine'
	sub.frequency.value = basePitch * 0.82
	subLevel.gain.value = 0.34
	body.type = 'triangle'
	body.frequency.value = basePitch * 2.15
	body.detune.value = randomSigned() * 8 * variation
	bodyLevel.gain.value = 0.22
	noise.buffer = rig.slowMotionBuffer
	noise.loop = true
	noise.playbackRate.value = 0.72
	rumbleFilter.type = 'lowpass'
	rumbleFilter.frequency.value = settings.slowMotionCutoff
	rumbleFilter.Q.value = 0.7 + settings.slowMotionResonance * 0.04
	noiseHighpass.type = 'highpass'
	noiseHighpass.frequency.value = 38
	noiseFilter.type = 'lowpass'
	noiseFilter.frequency.value = THREE.MathUtils.clamp(settings.slowMotionCutoff * 2.2, 360, 780)
	noiseFilter.Q.value = 0.8
	rumbleEnvelope.gain.setValueAtTime(0.0001, now)
	noiseEnvelope.gain.setValueAtTime(0.0001, now)
	panner.pan.value = THREE.MathUtils.clamp(gesture.pan * settings.stereoWidth, -1, 1)
	output.gain.value = settings.slowMotionOutput

	sub.connect(subLevel).connect(rumbleFilter)
	body.connect(bodyLevel).connect(rumbleFilter)
	rumbleFilter.connect(rumbleEnvelope).connect(panner)
	noise.connect(noiseHighpass).connect(noiseFilter).connect(noiseEnvelope).connect(panner)
	panner.connect(output).connect(rig.master)

	const voice: ActiveSlowMotionVoice = {
		owner,
		sub,
		body,
		noise,
		rumbleFilter,
		noiseFilter,
		rumbleEnvelope,
		noiseEnvelope,
		panner,
		output,
		basePitch,
		pitchDropScale,
		cutoffScale,
		playbackFloor,
		rumbleScale,
		noiseScale,
		stopped: false,
	}
	rig.activeSlowMotionVoice = voice

	for (const source of [sub, body, noise]) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}
	sub.addEventListener('ended', () => {
		for (const node of [sub, body, noise, subLevel, bodyLevel, rumbleFilter, noiseHighpass, noiseFilter, rumbleEnvelope, noiseEnvelope, panner, output]) {
			node.disconnect()
		}
	}, { once: true })

	const noiseOffset = Math.random() * rig.slowMotionBuffer.duration
	sub.start(startTime)
	body.start(startTime)
	noise.start(startTime, noiseOffset)
	updateHeldSlowMotionVoice(rig, gesture, settings)
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
	const impact = rig.mobilePerformance ? null : rig.context.createOscillator()
	const fmModulator = rig.mobilePerformance ? null : rig.context.createOscillator()
	const fmDepth = rig.mobilePerformance ? null : rig.context.createGain()
	const subLevel = rig.context.createGain()
	const bodyLevel = rig.context.createGain()
	const impactEnvelope = rig.mobilePerformance ? null : rig.context.createGain()
	const bodyDrive = rig.mobilePerformance ? null : rig.context.createWaveShaper()
	const rumbleFilter = rig.context.createBiquadFilter()
	const rumbleEnvelope = rig.context.createGain()
	const noise = rig.context.createBufferSource()
	const noiseHighpass = rig.context.createBiquadFilter()
	const noiseFilter = rig.context.createBiquadFilter()
	const noiseEnvelope = rig.context.createGain()
	const panner = rig.context.createStereoPanner()
	const slowMotionOutput = rig.context.createGain()

	sub.type = 'sine'
	sub.frequency.setValueAtTime(startPitch * 0.9, startTime)
	sub.frequency.exponentialRampToValueAtTime(Math.max(endPitch * 0.76, 18), slowPoint)
	sub.frequency.exponentialRampToValueAtTime(startPitch * 0.86, endTime)
	subLevel.gain.value = 0.34

	body.type = 'triangle'
	body.detune.value = randomSigned() * 7
	body.frequency.setValueAtTime(startPitch * 2.2, startTime)
	body.frequency.exponentialRampToValueAtTime(Math.max(endPitch * 1.55, 44), slowPoint)
	body.frequency.exponentialRampToValueAtTime(startPitch * 2.05, endTime)
	bodyLevel.gain.value = 0.2 + velocity * 0.03
	if (bodyDrive) {
		bodyDrive.curve = createDistortionCurve(18 + velocity * 28)
		bodyDrive.oversample = '4x'
	}

	if (fmModulator && fmDepth) {
		fmModulator.type = 'sine'
		fmModulator.frequency.setValueAtTime(24 + velocity * 20, startTime)
		fmModulator.frequency.exponentialRampToValueAtTime(THREE.MathUtils.lerp(13, 3.2, motionStrength), slowPoint)
		fmModulator.frequency.exponentialRampToValueAtTime(20 + velocity * 16, endTime)
		fmDepth.gain.setValueAtTime(12 + velocity * 22, startTime)
		fmDepth.gain.exponentialRampToValueAtTime(5 + motionStrength * 12, slowPoint)
		fmDepth.gain.exponentialRampToValueAtTime(9 + velocity * 16, endTime)
	}

	if (impact && impactEnvelope) {
		impact.type = 'sine'
		impact.frequency.setValueAtTime(105 + velocity * 115, startTime)
		impact.frequency.exponentialRampToValueAtTime(28, startTime + Math.min(duration * 0.34, 1.25))
		impactEnvelope.gain.setValueAtTime(0.0001, startTime)
		impactEnvelope.gain.exponentialRampToValueAtTime(
			Math.max(settings.slowMotionImpactLevel * (0.7 + velocity * 0.3), 0.0001),
			startTime + 0.012,
		)
		impactEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(duration * 0.42, 1.5))
	}

	rumbleFilter.type = 'lowpass'
	rumbleFilter.Q.value = 0.7 + settings.slowMotionResonance * 0.04
	rumbleFilter.frequency.setValueAtTime(filterPeak, startTime)
	rumbleFilter.frequency.exponentialRampToValueAtTime(
		Math.max(settings.slowMotionCutoff * THREE.MathUtils.lerp(1, 0.7, motionStrength), 95),
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
	noise.playbackRate.setValueAtTime(0.74 + velocity * 0.08, startTime)
	noise.playbackRate.exponentialRampToValueAtTime(THREE.MathUtils.lerp(0.48, 0.14, motionStrength), slowPoint)
	noise.playbackRate.exponentialRampToValueAtTime(0.82 + velocity * 0.05, endTime)
	noiseHighpass.type = 'highpass'
	noiseHighpass.frequency.value = 38
	noiseFilter.type = 'lowpass'
	noiseFilter.Q.value = 0.8
	noiseFilter.frequency.setValueAtTime(THREE.MathUtils.clamp(filterPeak * 0.75, 360, 900), startTime)
	noiseFilter.frequency.exponentialRampToValueAtTime(
		THREE.MathUtils.lerp(300, 140, motionStrength),
		slowPoint,
	)
	noiseFilter.frequency.exponentialRampToValueAtTime(THREE.MathUtils.clamp(filterPeak * 0.58, 300, 760), endTime)
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
	if (bodyDrive) {
		body.connect(bodyLevel).connect(bodyDrive).connect(rumbleFilter)
	} else {
		body.connect(bodyLevel).connect(rumbleFilter)
	}
	if (fmModulator && fmDepth) fmModulator.connect(fmDepth).connect(body.frequency)
	rumbleFilter.connect(rumbleEnvelope).connect(panner)
	if (impact && impactEnvelope) impact.connect(impactEnvelope).connect(panner)
	noise.connect(noiseHighpass).connect(noiseFilter).connect(noiseEnvelope).connect(panner)
	panner.connect(slowMotionOutput).connect(rig.master)

	const sources: AudioScheduledSourceNode[] = [sub, body, noise]
	if (impact) sources.push(impact)
	if (fmModulator) sources.push(fmModulator)
	for (const source of sources) {
		rig.activeSources.add(source)
		source.addEventListener('ended', () => rig.activeSources.delete(source), { once: true })
	}

	sub.addEventListener('ended', () => {
		const nodes: AudioNode[] = [sub, body, subLevel, bodyLevel, rumbleFilter, rumbleEnvelope, noise, noiseHighpass, noiseFilter, noiseEnvelope, panner, slowMotionOutput]
		if (impact) nodes.push(impact)
		if (fmModulator) nodes.push(fmModulator)
		if (fmDepth) nodes.push(fmDepth)
		if (impactEnvelope) nodes.push(impactEnvelope)
		if (bodyDrive) nodes.push(bodyDrive)
		for (const node of nodes) {
			node.disconnect()
		}
	}, { once: true })

	const noiseOffset = Math.random() * rig.slowMotionBuffer.duration
	sub.start(startTime)
	body.start(startTime)
	impact?.start(startTime)
	fmModulator?.start(startTime)
	noise.start(startTime, noiseOffset)
	impact?.stop(startTime + Math.min(duration * 0.44, 1.55))
	sub.stop(endTime + 0.02)
	body.stop(endTime + 0.02)
	fmModulator?.stop(endTime + 0.02)
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
}: {
	rigRef: MutableRefObject<PointerAudioRig | null>
	settings: PointerAudioSettings
	enabled: boolean
}) {
	const previousPointer = useRef(new THREE.Vector2())
	const previousProximity = useRef(0)
	const hasPointerSample = useRef(false)
	const pointerArmed = useRef(false)
	const pointerCapture = useRef(false)
	const capturedProximity = useRef(0)
	const capturedVelocity = useRef(0)
	const capturedDirection = useRef(1)
	const wheelStrength = useRef(0)
	const wheelDirection = useRef(-1)
	const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const activeTouchId = useRef<number | null>(null)
	const previousTouchX = useRef(0)
	const previousTouchY = useRef(0)
	const previousTouchTime = useRef(0)

	useEffect(() => {
		const cleanupRig = rigRef.current
		const canStartSlowMotion = () => {
			const rig = rigRef.current
			return rig && rig.context.state !== 'closed' && !rig.muted ? rig : null
		}
		const isControlTarget = (target: EventTarget | null) =>
			target instanceof Element && Boolean(target.closest('aside, [data-audio-toggle]'))

		const handleWheel = (event: WheelEvent) => {
			if (isControlTarget(event.target)) return
			const rig = canStartSlowMotion()
			if (!rig) return
			const unitMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? window.innerHeight
					: 1
			const pixelDelta = Math.abs(event.deltaY) * unitMultiplier
			const impulseStrength = 1 - Math.exp(-pixelDelta * settings.scrollVelocityScale / 1400)
			wheelStrength.current = Math.max(impulseStrength, wheelStrength.current * 0.72)
			wheelDirection.current = event.deltaY >= 0 ? -1 : 1
			const strength = Math.pow(wheelStrength.current, 1 + settings.scrollVelocityThreshold * 1.5)
			const gesture = {
				velocity: strength,
				direction: wheelDirection.current,
				pan: 0,
			}

			if (rig.activeSlowMotionVoice?.owner === 'wheel') {
				updateHeldSlowMotionVoice(rig, gesture, settings)
			} else {
				beginHeldSlowMotionVoice(rig, 'wheel', gesture, settings)
			}

			if (wheelTimer.current) clearTimeout(wheelTimer.current)
			wheelTimer.current = setTimeout(() => {
				wheelStrength.current = 0
				wheelTimer.current = null
				releaseHeldSlowMotionVoice(rig, 'wheel')
			}, 140)
		}

		const handleTouchStart = (event: TouchEvent) => {
			if (activeTouchId.current !== null || isControlTarget(event.target)) return
			const touch = event.changedTouches[0]
			if (!touch) return

			activeTouchId.current = touch.identifier
			previousTouchX.current = touch.clientX
			previousTouchY.current = touch.clientY
			previousTouchTime.current = event.timeStamp
			const rig = canStartSlowMotion()
			if (!rig) return
			beginHeldSlowMotionVoice(rig, 'touch', {
				velocity: 0.12,
				direction: -1,
				pan: THREE.MathUtils.clamp(touch.clientX / window.innerWidth * 2 - 1, -1, 1),
			}, settings)
		}

		const handleTouchMove = (event: TouchEvent) => {
			if (activeTouchId.current === null) return
			const touch = Array.from(event.touches).find(({ identifier }) => identifier === activeTouchId.current)
			if (!touch) return

			const elapsed = Math.max(event.timeStamp - previousTouchTime.current, 1)
			const deltaX = touch.clientX - previousTouchX.current
			const deltaY = touch.clientY - previousTouchY.current
			const pixelsPerMillisecond = Math.hypot(deltaX, deltaY) / elapsed
			const velocity = 1 - Math.exp(-pixelsPerMillisecond * settings.scrollVelocityScale / 55)
			const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX
			const rig = canStartSlowMotion()
			if (rig) {
				updateHeldSlowMotionVoice(rig, {
					velocity,
					direction: dominantDelta >= 0 ? -1 : 1,
					pan: THREE.MathUtils.clamp(touch.clientX / window.innerWidth * 2 - 1, -1, 1),
				}, settings)
			}

			previousTouchX.current = touch.clientX
			previousTouchY.current = touch.clientY
			previousTouchTime.current = event.timeStamp
		}

		const handleTouchEnd = (event: TouchEvent) => {
			if (activeTouchId.current === null) return
			const ended = Array.from(event.changedTouches).some(({ identifier }) => identifier === activeTouchId.current)
			if (!ended) return

			activeTouchId.current = null
			const rig = rigRef.current
			if (rig) releaseHeldSlowMotionVoice(rig, 'touch')
		}

		window.addEventListener('wheel', handleWheel, { passive: true })
		window.addEventListener('touchstart', handleTouchStart, { passive: true })
		window.addEventListener('touchmove', handleTouchMove, { passive: true })
		window.addEventListener('touchend', handleTouchEnd, { passive: true })
		window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
		return () => {
			window.removeEventListener('wheel', handleWheel)
			window.removeEventListener('touchstart', handleTouchStart)
			window.removeEventListener('touchmove', handleTouchMove)
			window.removeEventListener('touchend', handleTouchEnd)
			window.removeEventListener('touchcancel', handleTouchEnd)
			if (wheelTimer.current) clearTimeout(wheelTimer.current)
			if (cleanupRig) {
				releaseHeldSlowMotionVoice(cleanupRig, 'wheel')
				releaseHeldSlowMotionVoice(cleanupRig, 'touch')
			}
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
		const rearmThreshold = Math.min(settings.centerRearm, settings.centerThreshold - 0.03)
		if (proximity <= rearmThreshold) {
			pointerArmed.current = true
			pointerCapture.current = false
		}
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
		} else if (!enabled) {
			pointerCapture.current = false
		}

		previousPointer.current.copy(currentPointer)
		previousProximity.current = proximity
		hasPointerSample.current = true
	})

	return null
}
