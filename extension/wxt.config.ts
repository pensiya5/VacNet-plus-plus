import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  imports: false,
  manifest: ({ browser }) => ({
    name: 'VacNet++',
    description: 'Player controls, verdict presets and local clip history for the VACNet portal.',
    default_locale: 'en',
    permissions: ['storage'],
    host_permissions: ['https://replay-video.valve.net/*', 'https://api.github.com/*'],
    icons: { 128: 'icon.png' },
    // The sandbox page runs user-installed plugin code with 'unsafe-eval'
    // while having no extension APIs. Firefox does not support sandbox pages;
    // the plugin UI reports that gracefully there.
    ...(browser === 'firefox' ? {} : {
      sandbox: { pages: ['sandbox.html'] },
      content_security_policy: {
        sandbox: "sandbox allow-scripts; script-src 'self' 'unsafe-eval'; child-src 'self';",
      },
      web_accessible_resources: [{
        resources: ['sandbox.html'],
        matches: ['https://www.counter-strike.net/*'],
      }],
    }),
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'vacnet-toolkit-local@extensions.invalid',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    } : {}),
  }),
  vite: () => ({
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
  }),
});
