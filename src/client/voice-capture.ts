/** Reuse an asynchronous operation while the same keyed operation is in flight. */
export function reuseInFlightPromise<TKey, TResult>(
  inFlight: { current: { key: TKey; promise: Promise<TResult> } | null },
  key: TKey,
  operation: () => Promise<TResult>
): Promise<TResult> {
  const current = inFlight.current
  if (current !== null && Object.is(current.key, key)) return current.promise
  const promise = operation()
  inFlight.current = { key, promise }
  const clear = () => {
    if (inFlight.current?.promise === promise) inFlight.current = null
  }
  void promise.then(clear, clear)
  return promise
}

/** Check whether a media capture was superseded by a newer start generation. */
export function isSupersededMediaCapture(latestGeneration: number, generation: number): boolean {
  return latestGeneration !== generation
}
