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

// Peaks per URL, so a voice note scrolled out of view and back is not fetched
// and decoded again (up to 16MB each). Keyed by URL only: a Blob or ArrayBuffer
// has no stable identity.
const peakCache = new Map<string, number[]>()

// One in-flight decode per URL. Several players showing the same note - or one
// remounting while its first decode is still running - would otherwise each
// open an AudioContext for the same bytes, and browsers cap how many may be
// open at once.
const peaksInFlight = new Map<string, Promise<number[]>>()

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

  // barCount is part of the identity: the same audio downsampled to a
  // different number of bars is a different answer.
  const cacheKey = typeof source === 'string' ? `${barCount}:${source}` : null
  if (cacheKey) {
    const cached = peakCache.get(cacheKey)
    if (cached) return cached
    const pending = peaksInFlight.get(cacheKey)
    if (pending) return pending
  }

  const work = decodePeaks(source, barCount)
  if (cacheKey) {
    peaksInFlight.set(cacheKey, work)
    void work
      .then((peaks) => {
        // A placeholder is what failure returns, and caching it would make the
        // failure permanent for the session.
        if (!isPlaceholder(peaks)) peakCache.set(cacheKey, peaks)
      })
      .finally(() => peaksInFlight.delete(cacheKey))
  }
  return work
}

// Marks the peaks a failure produced, so they are never cached as an answer.
const placeholders = new WeakSet<number[]>()

function isPlaceholder(peaks: number[]): boolean {
  return placeholders.has(peaks)
}

function failed(barCount: number): number[] {
  const peaks = placeholderPeaks(barCount)
  placeholders.add(peaks)
  return peaks
}

async function decodePeaks(
  source: string | Blob | ArrayBuffer,
  barCount: number
): Promise<number[]> {
  // decodeAudioData DETACHES the buffer it is given. Bytes we fetched or read
  // ourselves are ours to hand over; an ArrayBuffer the caller passed is not,
  // so only that case is copied. Copying unconditionally, as this did, doubled
  // peak memory for every note.
  let decodable: ArrayBuffer
  try {
    if (typeof source === 'string') {
      const res = await fetch(source)
      if (!res.ok) return failed(barCount)
      decodable = await res.arrayBuffer()
    } else if (source instanceof Blob) {
      decodable = await source.arrayBuffer()
    } else {
      decodable = source.slice(0)
    }
  } catch {
    return failed(barCount)
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) return failed(barCount)

  const ctx = new AudioCtx()
  try {
    const audioBuffer = await ctx.decodeAudioData(decodable)
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
    return failed(barCount)
  } finally {
    void ctx.close().catch(() => {})
  }
}

