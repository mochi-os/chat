// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// The encryption of conversations on Matrix and XMPP accounts, whose devices
// the server holds: the account's device, the people's devices and the
// user's word on them, Matrix's emoji verification, and its recovery key.

import { createAppClient } from '@mochi/web'

const client = createAppClient({ appName: 'chat' })

export type Trust = 'verified' | 'distrusted' | 'undecided'

export interface EncryptionStatus {
  network: 'matrix' | 'xmpp'
  address: string
  device: string
  // Matrix: the device's fingerprint, whether the account has cross-signing
  // keys, whether this device is verified, and whether a recovery key and a
  // key backup are set up.
  fingerprint?: string
  signing?: boolean
  verified?: boolean
  recovery?: boolean
  backup?: boolean
  // XMPP: the device's fingerprint in each version of OMEMO.
  fingerprints?: { version: string; fingerprint: string }[]
}

export interface EncryptionPerson {
  id: string
  name: string
}

export interface EncryptionOverview {
  account: string
  status: EncryptionStatus
  people: EncryptionPerson[]
}

export interface EncryptionDevice {
  id: string
  name?: string
  version?: string
  fingerprint: string
  // Matrix: whether the device is verified. XMPP: the user's word on it.
  verified?: boolean
  trust?: Trust
  own: boolean
}

export type VerificationPhase =
  | 'requested'
  | 'ready'
  | 'compare'
  | 'done'
  | 'cancelled'

export interface Verification {
  account: string
  flow: string
  person: string
  name: string
  device: string
  room?: string
  phase: VerificationPhase
  started: boolean
  emoji?: string[]
  reason?: string
  updated: number
}

export type VerificationAction =
  | 'accept'
  | 'start'
  | 'confirm'
  | 'mismatch'
  | 'cancel'

export const encryptionApi = {
  overview: (chatId: string) =>
    client
      .get<{ data: EncryptionOverview }>(`/${chatId}/-/encryption`)
      .then((res) => res.data),

  devices: (chatId: string, person: string) =>
    client
      .get<{ data: { devices: EncryptionDevice[] } }>(
        `/${chatId}/-/encryption/devices`,
        { params: { person } }
      )
      .then((res) => res.data.devices),

  trust: (chatId: string, person: string, device: string, trust: Trust) =>
    client
      .post<{ data: Record<string, never> }>(`/${chatId}/-/encryption/trust`, {
        person,
        device,
        trust,
      })
      .then(() => undefined),

  verify: (chatId: string, person: string) =>
    client
      .post<{ data: Verification }>(`/${chatId}/-/encryption/verify`, {
        person,
      })
      .then((res) => res.data),

  setup: (chatId: string, password?: string) =>
    client
      .post<{ data: { recovery?: string; password?: boolean } }>(
        `/${chatId}/-/encryption/setup`,
        password ? { password } : {}
      )
      .then((res) => res.data),

  recover: (chatId: string, key: string) =>
    client
      .post<{ data: { restored: number } }>(`/${chatId}/-/encryption/recover`, {
        key,
      })
      .then((res) => res.data),

  verifications: () =>
    client
      .get<{ data: { verifications: Verification[] } }>(
        '/-/encryption/verifications'
      )
      .then((res) => res.data.verifications),

  act: (account: string, flow: string, action: VerificationAction) =>
    client
      .post<{ data: Record<string, never> }>('/-/encryption/act', {
        account,
        flow,
        action,
      })
      .then(() => undefined),
}
