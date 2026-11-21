// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Matrix's emoji verification, which the server runs for the device it holds
// on each of the user's Matrix accounts: a request from someone or from the
// user's other clients, the emoji to compare, and how it ended. Read while
// the user has a Matrix conversation: once, and again whenever the user's own
// websocket says one changed. Only while that socket is down is it asked for
// on a timer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  getErrorMessage,
  toast,
  useQueryWithError,
} from '@mochi/web'
import { Check, Smile, X } from 'lucide-react'
import { encryptionApi, type VerificationAction } from '@/api/encryption'
import { USER_KEY } from '@/lib/websocket-manager'
import { useWebsocketManager } from '@/hooks/useWebsocketManager'
import { verificationShown } from '@/features/chats/utils/encryption'

const key = ['encryption', 'verifications'] as const

export function VerificationWatcher({ enabled }: { enabled: boolean }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // The verifications seen under way, and those whose end was said.
  const seen = useRef<Set<string>>(new Set())
  const told = useRef<Set<string>>(new Set())
  const manager = useWebsocketManager()
  // Whether the user's own socket is open, which tells of each change.
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!enabled || !manager) return undefined
    let opened = false
    let lost = false
    const unsubscribe = manager.subscribe(USER_KEY, {
      chatKey: USER_KEY,
      onMessage: (event) => {
        if (event.payload.event === 'verification') {
          void queryClient.invalidateQueries({ queryKey: key })
        }
      },
      onStatusChange: (snapshot) => {
        const ready = snapshot.status === 'ready'
        if (ready) {
          // Open again: what changed while it was down is read once.
          if (lost) void queryClient.invalidateQueries({ queryKey: key })
          opened = true
          lost = false
        } else if (opened) {
          lost = true
        }
        setLive(ready)
      },
    })
    return () => {
      unsubscribe()
      setLive(false)
    }
  }, [enabled, manager, queryClient])
  const { data } = useQueryWithError({
    queryKey: key,
    queryFn: encryptionApi.verifications,
    enabled,
    // Asked again on a timer only while the socket is down: briskly while
    // a verification is under way, slowly otherwise.
    refetchInterval: (query) =>
      live
        ? false
        : (query.state.data ?? []).some(
              (v) => v.phase !== 'done' && v.phase !== 'cancelled'
            )
          ? 5000
          : 30_000,
  })
  const verifications = useMemo(() => data ?? [], [data])
  const shown = verificationShown(verifications, dismissed)

  // How each verification seen under way ended, said once.
  useEffect(() => {
    for (const v of verifications) {
      if (v.phase !== 'done' && v.phase !== 'cancelled') {
        seen.current.add(v.flow)
        continue
      }
      if (!seen.current.has(v.flow) || told.current.has(v.flow)) continue
      if (v.phase === 'done') {
        told.current.add(v.flow)
        toast.success(t`Verified`)
      } else if (v.phase === 'cancelled') {
        told.current.add(v.flow)
        toast.info(
          v.reason === 'm.mismatched_sas'
            ? t`The emoji did not match, so the verification was cancelled`
            : t`The verification was cancelled`
        )
      }
    }
  }, [verifications, t])

  const act = useMutation({
    mutationFn: (action: VerificationAction) =>
      encryptionApi.act(shown!.account, shown!.flow, action),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) =>
      toast.error(getErrorMessage(e, t`The verification could not go on`)),
  })

  if (!shown) return null
  const who = shown.name || shown.person
  const own = !shown.room
  const close = () => {
    setDismissed((current) => new Set(current).add(shown.flow))
    act.mutate('cancel')
  }

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && close()}>
      <ResponsiveDialogContent className='sm:max-w-120'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {own ? t`Verify your device` : t`Verify ${who}`}
          </ResponsiveDialogTitle>
          {shown.phase === 'compare' ? (
            <ResponsiveDialogDescription>
              <Trans>Check that the same emoji appear on the other screen.</Trans>
            </ResponsiveDialogDescription>
          ) : shown.phase === 'requested' && !shown.started ? (
            <ResponsiveDialogDescription>
              {own ? (
                <Trans>Another of your devices wants to verify this one.</Trans>
              ) : (
                <Trans>{who} wants to verify you.</Trans>
              )}
            </ResponsiveDialogDescription>
          ) : (
            <ResponsiveDialogDescription>
              <Trans>Waiting for the other device...</Trans>
            </ResponsiveDialogDescription>
          )}
        </ResponsiveDialogHeader>
        {shown.phase === 'compare' ? (
          <div className='grid grid-cols-4 gap-3 py-2 text-center text-4xl sm:grid-cols-7'>
            {(shown.emoji ?? []).map((emoji, index) => (
              <span key={index} aria-hidden='true'>
                {emoji}
              </span>
            ))}
          </div>
        ) : null}
        <ResponsiveDialogFooter>
          {shown.phase === 'compare' ? (
            <>
              <Button
                variant='outline'
                onClick={() => act.mutate('mismatch')}
                disabled={act.isPending}
                icon={<X className='size-4' />}
              >
                <Trans>They don't match</Trans>
              </Button>
              <Button
                onClick={() => act.mutate('confirm')}
                loading={act.isPending}
                icon={<Check className='size-4' />}
              >
                <Trans>They match</Trans>
              </Button>
            </>
          ) : shown.phase === 'requested' && !shown.started ? (
            <>
              <Button variant='outline' onClick={close} disabled={act.isPending}>
                <Trans>Decline</Trans>
              </Button>
              <Button
                onClick={() => act.mutate('accept')}
                loading={act.isPending}
                icon={<Check className='size-4' />}
              >
                <Trans>Accept</Trans>
              </Button>
            </>
          ) : shown.phase === 'ready' ? (
            <>
              <Button variant='outline' onClick={close} disabled={act.isPending}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                onClick={() => act.mutate('start')}
                loading={act.isPending}
                icon={<Smile className='size-4' />}
              >
                <Trans>Compare emoji</Trans>
              </Button>
            </>
          ) : (
            <Button variant='outline' onClick={close} disabled={act.isPending}>
              <Trans>Cancel</Trans>
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
