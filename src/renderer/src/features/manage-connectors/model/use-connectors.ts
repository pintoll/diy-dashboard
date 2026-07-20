import { useCallback, useEffect, useState } from "react";

// Thin state wrapper over the connector IPC surface. Connectors are edited from
// several places (this dialog, the dyd CLI, connectors.json by hand), so the
// list is always re-read from the main process rather than kept in a store that
// could drift from the file.

export type ConnectorsController = {
  connectors: ConnectorDefinition[];
  credentials: CredentialMeta[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (connector: unknown) => Promise<ConnectorDefinition>;
  patch: (id: string, patch: unknown) => Promise<ConnectorDefinition>;
  remove: (id: string) => Promise<void>;
  test: (connector: unknown) => Promise<ConnectorTestResult>;
  setCredential: (
    name: string,
    secret: string,
    allowedHost: string
  ) => Promise<void>;
  removeCredential: (name: string) => Promise<void>;
};

function messageOf(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // IPC rejections arrive prefixed with the channel's internal frame; the tail
  // after the last colon is the message the main process actually threw.
  const match = /Error invoking remote method '[^']+': (?:Error: )?(.*)/s.exec(
    err.message
  );
  return match ? match[1] : err.message;
}

export function useConnectors(active: boolean): ConnectorsController {
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [credentials, setCredentials] = useState<CredentialMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const api = window.marketAPI;
    if (!api) {
      setError("marketAPI bridge unavailable");
      return;
    }
    setLoading(true);
    try {
      const [nextConnectors, nextCredentials] = await Promise.all([
        api.connectors.list(),
        api.credentials.list(),
      ]);
      setConnectors(nextConnectors);
      setCredentials(nextCredentials);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void reload();
  }, [active, reload]);

  const require = useCallback(() => {
    const api = window.marketAPI;
    if (!api) throw new Error("marketAPI bridge unavailable");
    return api;
  }, []);

  // Mutations deliberately do not catch: callers render the failure next to the
  // control that caused it, which is more useful than a section-wide banner.
  const save = useCallback(
    async (connector: unknown) => {
      const saved = await require().connectors.upsert(connector);
      await reload();
      return saved;
    },
    [require, reload]
  );

  const patch = useCallback(
    async (id: string, body: unknown) => {
      const saved = await require().connectors.patch(id, body);
      await reload();
      return saved;
    },
    [require, reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await require().connectors.remove(id);
      await reload();
    },
    [require, reload]
  );

  const test = useCallback(
    (connector: unknown) => require().connectors.test(connector),
    [require]
  );

  const setCredential = useCallback(
    async (name: string, secret: string, allowedHost: string) => {
      await require().credentials.set(name, secret, allowedHost);
      await reload();
    },
    [require, reload]
  );

  const removeCredential = useCallback(
    async (name: string) => {
      await require().credentials.remove(name);
      await reload();
    },
    [require, reload]
  );

  return {
    connectors,
    credentials,
    loading,
    error,
    reload,
    save,
    patch,
    remove,
    test,
    setCredential,
    removeCredential,
  };
}

export { messageOf as connectorErrorMessage };
