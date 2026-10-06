import { App } from './app/App';
import { CloudSave } from './app/cloudSave';
import { openLibrary } from './app/openLibrary';

declare global {
  interface Window {
    __app?: App;
  }
}

async function boot() {
  const canvas = document.getElementById('tank') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  // Inside a claude.ai viewer, merge the person's cloud-saved tanks first (resolves at once elsewhere).
  const cloud = await CloudSave.connect();
  const { library, tank } = await openLibrary(cloud);
  const app = new App(canvas, ui, { cloud, library, tank });
  window.__app = app;
  app.start();
  // Dev harnesses: ?gallery (species lineup for visual QA).
  const params = new URLSearchParams(location.search);
  if (params.has('gallery')) {
    import('./render/fish/gallery').then((m) => m.runGallery(app, params.get('gallery') ?? '')).catch(console.error);
  }
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    setTimeout(() => bootEl.classList.add('done'), 300);
    setTimeout(() => bootEl.remove(), 1800);
  }
}

boot().catch((err) => {
  console.error(err);
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    // textContent, not innerHTML: the error text is not markup.
    const p = document.createElement('p');
    const small = document.createElement('small');
    small.textContent = String(err);
    p.append('Sorry — the aquarium could not start.', document.createElement('br'), small);
    bootEl.replaceChildren(p);
  }
});
