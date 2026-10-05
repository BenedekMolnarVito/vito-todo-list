/**
 * Stub for @capacitor/app used in non-Android environments (unit tests,
 * CI, browser dev builds). The real plugin is loaded from node_modules in
 * the Android WebView via the Capacitor runtime.
 */
export const App = {
  addListener: async (
    _event: string,
    _callback: (...args: unknown[]) => void
  ): Promise<{ remove: () => void }> => {
    return { remove: () => undefined };
  },
  removeAllListeners: async (): Promise<void> => undefined,
};
