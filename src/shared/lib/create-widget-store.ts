import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { persist, type PersistOptions } from "zustand/middleware";

type WidgetStore<T> = UseBoundStore<StoreApi<T>>;
type StoreCache = Map<string, WidgetStore<unknown>>;

const storeCache: StoreCache = new Map();

type CreateWidgetStoreOptions = {
  name: string;
  persist?: boolean;
};

export function createWidgetStore<T extends object>(
  instanceId: string,
  _initialState: T,
  stateCreator: StateCreator<T>,
  options: CreateWidgetStoreOptions
): WidgetStore<T> {
  const cacheKey = `${options.name}-${instanceId}`;

  const cached = storeCache.get(cacheKey);
  if (cached) {
    return cached as WidgetStore<T>;
  }

  const store = options.persist
    ? create<T>()(
        persist(stateCreator, {
          name: cacheKey,
        } as PersistOptions<T>)
      )
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
