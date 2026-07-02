import * as core from './core/index';

declare global {
  interface Window {
    ftCore: typeof core;
    ftLoadImportWizard: () => Promise<void>;
    __ftImportLoaded?: boolean;
    initImportWizard_?: () => void;
  }
}

window.ftCore = core;

window.ftLoadImportWizard = async function ftLoadImportWizard(): Promise<void> {
  if (window.__ftImportLoaded) return;
  // Legacy wizard script is plain JS without TS module typings.
  // @ts-expect-error - runtime import is valid and used by existing app flow.
  await import('./import-inline.js');
  window.__ftImportLoaded = true;
  if (typeof window.initImportWizard_ === 'function') {
    window.initImportWizard_();
  }
};

export {};
