import { ProviderBusy } from "./Provider"

// One call to the provider at a time, spaced out: its allowance is counted for
// the whole account, whoever asks.

export class QueueFull extends Error {}

export type ProviderQueue = {
  // The end of the last call that was let in
  tail: Promise<unknown>
  waiting: number
  lastCallAt: number
}

export type QueueSettings = Readonly<{
  minIntervalMs: number
  maxWaiting: number
  retries: number
  // Replaceable in tests
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}>

export const emptyQueue = (): ProviderQueue => ({
  tail: Promise.resolve(),
  waiting: 0,
  lastCallAt: 0,
})

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs a call to the provider once the ones before it are done. A call the
 * provider asks to delay is tried again, without losing its place.
 *
 * @param onWait told how many calls are ahead, when there are some
 */
export async function enqueue<T>(
  queue: ProviderQueue,
  settings: QueueSettings,
  call: () => Promise<T>,
  onWait?: (ahead: number) => void,
): Promise<T> {
  if (queue.waiting >= settings.maxWaiting) {
    throw new QueueFull("Too many questions are waiting")
  }

  const sleep = settings.sleep ?? pause
  const now = settings.now ?? Date.now
  const ahead = queue.waiting

  queue.waiting += 1
  if (ahead > 0) {
    onWait?.(ahead)
  }

  const attempt = async (left: number): Promise<T> => {
    const rest = queue.lastCallAt + settings.minIntervalMs - now()

    if (rest > 0) {
      await sleep(rest)
    }
    queue.lastCallAt = now()

    try {
      return await call()
    } catch (error) {
      if (error instanceof ProviderBusy && left > 0) {
        await sleep(error.retryAfterMs)

        return attempt(left - 1)
      }
      throw error
    }
  }

  const turn = queue.tail.then(() => attempt(settings.retries))

  queue.tail = turn.then(
    () => undefined,
    () => undefined,
  )

  return turn.finally(() => {
    queue.waiting -= 1
  })
}
