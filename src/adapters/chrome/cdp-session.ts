export interface ChromeDebuggerLike {
  attach(target: { tabId: number }, protocolVersion: string, callback: () => void): void;
  detach(target: { tabId: number }, callback: () => void): void;
  sendCommand(target: { tabId: number }, method: string, params: unknown, callback: (result?: unknown) => void): void;
}

export interface CdpSession {
  tabId: number;
  ownerId: string;
  send(method: string, params: unknown): Promise<unknown>;
  detach(): Promise<void>;
}

export interface AcquireCdpSessionOptions {
  ownerId: string;
  signal: AbortSignal;
}

export function createCdpSessionManager(debuggerApi: ChromeDebuggerLike) {
  const sessions = new Map<number, CdpSession>();

  async function acquire(tabId: number, options: AcquireCdpSessionOptions): Promise<CdpSession> {
    const existing = sessions.get(tabId);
    if (existing?.ownerId === options.ownerId) return existing;
    if (existing) throw new Error(`cdp_session_owned:${existing.ownerId}`);

    await attach(debuggerApi, tabId);
    const session: CdpSession = {
      tabId,
      ownerId: options.ownerId,
      send: (method, params) => send(debuggerApi, tabId, method, params),
      detach: async () => {
        if (sessions.get(tabId) !== session) return;
        sessions.delete(tabId);
        await detach(debuggerApi, tabId);
      }
    };
    sessions.set(tabId, session);
    options.signal.addEventListener("abort", () => void session.detach(), { once: true });
    return session;
  }

  async function detachAll(): Promise<void> {
    await Promise.all([...sessions.values()].map((session) => session.detach()));
  }

  return { acquire, detachAll };
}

function attach(debuggerApi: ChromeDebuggerLike, tabId: number): Promise<void> {
  return new Promise((resolve) => debuggerApi.attach({ tabId }, "1.3", () => resolve()));
}

function detach(debuggerApi: ChromeDebuggerLike, tabId: number): Promise<void> {
  return new Promise((resolve) => debuggerApi.detach({ tabId }, () => resolve()));
}

function send(debuggerApi: ChromeDebuggerLike, tabId: number, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve) => debuggerApi.sendCommand({ tabId }, method, params, (result) => resolve(result)));
}

export const defaultCdpSessionManager =
  typeof chrome !== "undefined" && chrome.debugger
    ? createCdpSessionManager(chrome.debugger)
    : undefined;
