import { defineContentScript } from 'wxt/utils/define-content-script';
import '../src/features/valve-interop/components/welcome-interface.css';
import '../src/features/valve-interop/components/invite-interface.css';

export default defineContentScript({
  matches: [
    'https://www.counter-strike.net/vacnet',
    'https://www.counter-strike.net/vacnet/',
    'https://www.counter-strike.net/vacnet?*',
    'https://www.counter-strike.net/vacnet/?*',
    'https://www.counter-strike.net/vacnet/createinvite',
    'https://www.counter-strike.net/vacnet/createinvite/',
    'https://www.counter-strike.net/vacnet/createinvite?*',
    'https://www.counter-strike.net/vacnet/createinvite/?*',
  ],
  world: 'ISOLATED',
  runAt: 'document_start',
  main() {},
});
