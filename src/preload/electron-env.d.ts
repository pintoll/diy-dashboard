interface ElectronAPI {
  showNotification: (payload: { title: string; body: string }) => Promise<void>;
  isNotificationSupported: () => Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
