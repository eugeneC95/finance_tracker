/**
 * ES module entry — loads core helpers and lazy feature chunks.
 */
import * as core from './core/index.js';

globalThis.ftCore = core;

globalThis.ftLoadImportWizard = async function ftLoadImportWizard() {
  if (globalThis.__ftImportLoaded) return;
  await import('./import-inline.js');
  globalThis.__ftImportLoaded = true;
  if (typeof globalThis.initImportWizard_ === 'function') {
    globalThis.initImportWizard_();
  }
};
