import {
  PLUGIN_HOST_ORIGIN,
  PLUGIN_WIRE_CHANNEL,
  HostWireMessageSchema,
  type SandboxWireMessage,
} from '../../src/features/plugins/plugin-wire.port';
import { PluginSandboxRuntime } from '../../src/features/plugins/sandbox-runtime.service';

/**
 * MV3 sandbox page: executes user plugin code with `unsafe-eval` while having
 * no extension APIs. It only talks to the content-script host over postMessage
 * and ignores everything that did not come from the portal page origin.
 */
const main = (): void => {
  if (window.parent === window) return; // Never run when opened directly.
  const post = (message: SandboxWireMessage): void => {
    // The sandbox has an opaque origin, so the host target origin is '*'.
    window.parent.postMessage({ channel: PLUGIN_WIRE_CHANNEL, message }, '*');
  };
  const runtime = new PluginSandboxRuntime({ post });
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== PLUGIN_HOST_ORIGIN) return;
    const data = event.data as Record<string, unknown> | null | undefined;
    if (!data || typeof data !== 'object' || data.channel !== PLUGIN_WIRE_CHANNEL) return;
    const parsed = HostWireMessageSchema.safeParse(data.message);
    if (parsed.success) runtime.handleHostMessage(parsed.data);
  });
  post({ kind: 'ready' });
};

main();
