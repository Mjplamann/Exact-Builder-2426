import { App } from './app/App';

declare global {
  interface Window {
    __app?: App;
  }
}

function boot() {
  const canvas = document.getElementById('tank') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const app = new App(canvas, ui);
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

try {
  boot();
} catch (err) {
  console.error(err);
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.innerHTML = `<p>Sorry — the aquarium could not start.<br><small>${String(err)}</small></p>`;
}
