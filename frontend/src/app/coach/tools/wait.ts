/** Polls {@code done} every {@code everyMs} until it is true or {@code timeoutMs} passed; resolves to whether it became true. */
export function pollUntil(done: () => boolean, timeoutMs: number, everyMs = 200): Promise<boolean> {
  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (done()) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(check, everyMs);
      }
    };
    check();
  });
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
