import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { persist, type PersistOptions } from "zustand/middleware";

type WidgetStore<T> = UseBoundStore<StoreApi<T>>;
type StoreCache = Map<string, WidgetStore<unknown>>;

const storeCache: StoreCache = new Map();

type CreateWidgetStoreOptions<T> = {
  name: string;
  persist?: boolean;
  version?: number;
  migrate?: (persistedState: unknown, version: number) => T;
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
