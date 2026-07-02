// Next.js App Router expects AsyncLocalStorage to exist as a global. When you
// run a custom server, any `next/*` import (e.g. next/headers) can load Next's
// App Router internals before Next sets that global — throwing
// "Invariant: AsyncLocalStorage accessed in runtime where it is not available".
// Importing this module FIRST (before any next import) installs the global.
import { AsyncLocalStorage } from "node:async_hooks";

const g = globalThis as unknown as { AsyncLocalStorage?: unknown };
if (!g.AsyncLocalStorage) g.AsyncLocalStorage = AsyncLocalStorage;

export {};
