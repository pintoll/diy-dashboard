import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import {
  persist,
  createJSONStorage,
  type PersistOptions,
} from "zustand/middleware";

type WidgetStore<T> = UseBoundStore<StoreApi<T>>;
type StoreCache = Map<string, WidgetStore<unknown>>;

const storeCache: StoreCache = new Map();

type CreateWidgetStoreOptions<T> = {
  name: string;
  persist?: boolean;
  version?: number;
  migrate?: (persistedState: unknown, version: number) => T;
  // Persist only a subset of state. Useful to drop transient fields (loading /
  // error flags) so a status flip does not rewrite the whole snapshot payload.
  partialize?: (state: T) => Partial<T>;
  // Trailing-debounce persist writes by this many ms. For stores whose changes
  // are frequent but whose persisted payload is large, this collapses a burst
  // of set() calls into a single localStorage write off the interaction path.
  debounceWriteMs?: number;
};

export function createWidgetStore<T extends object>(
  instanceId: string,
  _initialState: T,
  stateCreator: StateCreator<T>,
  options: CreateWidgetStoreOptions<T>
): WidgetStore<T> {
  const cacheKey = `${options.name}-${instanceId}`;

  const cached = storeCache.get(cacheKey);
  if (cached) {
    return cached as WidgetStore<T>;
  }

  const persistOptions: PersistOptions<T> = {
    name: cacheKey,
  };

  if (options.version !== undefined) {
    persistOptions.version = options.version;
  }

  if (options.migrate) {
    persistOptions.migrate = options.migrate;
  }

  if (options.partialize) {
    // The partial is merged over the initial state on rehydrate, so returning a
    // subset is safe; the cast bridges Partial<T> to persist's PersistedState.
    persistOptions.partialize =
      options.partialize as unknown as NonNullable<PersistOptions<T>["partialize"]>;
  }

  if (options.debounceWriteMs !== undefined) {
    const ms = options.debounceWriteMs;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    persistOptions.storage = createJSONStorage<T>(() => ({
      getItem: (name) => localStorage.getItem(name),
      setItem: (name, value) => {
        const pending = timers.get(name);
        if (pending) clearTimeout(pending);
        timers.set(
          name,
          setTimeout(() => {
            timers.delete(name);
            localStorage.setItem(name, value);
          }, ms)
        );
      },
      removeItem: (name) => {
        const pending = timers.get(name);
        if (pending) {
          clearTimeout(pending);
          timers.delete(name);
        }
        localStorage.removeItem(name);
      },
    }));
  }

  const store = options.persist
    ? create<T>()(persist(stateCreator, persistOptions))
    : create<T>()(stateCreator);

  storeCache.set(cacheKey, store as WidgetStore<unknown>);
  return store;
}

export function clearWidgetStore(name: string, instanceId: string) {
  const cacheKey = `${name}-${instanceId}`;
  storeCache.delete(cacheKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- safe: guarded runtime check for SSR
  const g = globalThis as any;
  if (g.localStorage) g.localStorage.removeItem(cacheKey);
}
