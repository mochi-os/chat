// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/** Build a lightweight placeholder waveform (0..1) before real peaks load. */
export function placeholderPeaks(count = 40, seed = 7): number[] {
  const peaks: number[] = []
  let s = seed >>> 0
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    const noise = (s % 1000) / 1000
    const envelope = 0.35 + 0.65 * Math.sin((i / count) * Math.PI)
    peaks.push(Math.min(1, Math.max(0.12, noise * 0.55 + envelope * 0.45)))
  }
  return peaks
}

/**
 * Decode an audio source and downsample to peak amplitudes (0..1).
 * Returns placeholderPeaks on failure.
 */
export async function extractAudioPeaks(
  source: string | Blob | ArrayBuffer,
  barCount = 48
): Promise<number[]> {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return placeholderPeaks(barCount)
  }

  let arrayBuffer: ArrayBuffer
  try {
    if (typeof source === 'string') {
      const res = await fetch(source)
      if (!res.ok) return placeholderPeaks(barCount)
      arrayBuffer = await res.arrayBuffer()
    } else if (source instanceof Blob) {
      arrayBuffer = await source.arrayBuffer()
    } else {
      arrayBuffer = source
    }
  } catch {
    return placeholderPeaks(barCount)
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) return placeholderPeaks(barCount)

  const ctx = new AudioCtx()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const channel = audioBuffer.getChannelData(0)
    const blockSize = Math.max(1, Math.floor(channel.length / barCount))
    const peaks: number[] = []
    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize
      const end = Math.min(channel.length, start + blockSize)
      let max = 0
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j])
        if (v > max) max = v
      }
      peaks.push(max)
    }
    const peakMax = Math.max(...peaks, 0.01)
    return peaks.map((p) => Math.min(1, Math.max(0.08, p / peakMax)))
  } catch {
    return placeholderPeaks(barCount)
  } finally {
    void ctx.close().catch(() => {})
  }
}

/** Attach AnalyserNode to a MediaStream; returns stop() cleanup. */
export function attachStreamAnalyser(
  stream: MediaStream,
  onLevel: (level: number) => void
): () => void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return () => {}
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) return () => {}

  let stopped = false
  let raf = 0
  const ctx = new AudioCtx()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.7
  source.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)

  const tick = () => {
    if (stopped) return
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    onLevel(Math.min(1, rms * 3.2))
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    try {
      source.disconnect()
      analyser.disconnect()
    } catch {
      /* ignore */
    }
    void ctx.close().catch(() => {})
  }
}

/** Rolling buffer of live levels for the recording waveform. */
export function pushLiveLevel(
  buffer: number[],
  level: number,
  maxBars = 32
): number[] {
  // Soften spikes so the live bars feel smooth rather than noisy.
  const softened = Math.min(1, Math.max(0.08, Math.pow(level, 0.75)))
  const next = buffer.length >= maxBars ? buffer.slice(1) : buffer.slice()
  // Ease toward the new sample so height changes animate more smoothly.
  const prev = next.length > 0 ? next[next.length - 1] : softened
  next.push(prev * 0.35 + softened * 0.65)
  return next
}
