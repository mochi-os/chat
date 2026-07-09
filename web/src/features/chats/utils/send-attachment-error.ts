// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { extractStatus, getErrorMessage } from '@mochi/web'

export interface SendAttachmentErrorMessages {
  fallback: string
  tooLargeForServer: string
  networkMaybeTooLarge: string
  serverFileTooLarge: string
  storageLimitExceeded: string
}

export function isAttachmentPayloadTooLargeError(error: unknown): boolean {
  return extractStatus(error) === 413
}

export function getSendAttachmentErrorMessage(
  error: unknown,
  messages: SendAttachmentErrorMessages
): string {
  const status = extractStatus(error)
  if (status === 413) {
    return messages.tooLargeForServer
  }

  const message = getErrorMessage(error, messages.fallback)
  if (message === 'Network Error') {
    return messages.networkMaybeTooLarge
  }
  if (message.toLowerCase().includes('file too large')) {
    return messages.serverFileTooLarge
  }
  if (message.toLowerCase().includes('storage limit exceeded')) {
    return messages.storageLimitExceeded
  }

  return message
}
