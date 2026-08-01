import { createApp, effectScope, type App as VueApp } from "vue";
import App from "./App.vue";
import { APERTURE_KEY, createAperture, type ApertureOptions } from "./composables/useAperture";
import "./assets/index.css";

/**
 * Builds the app around an Aperture instance.
 *
 * The instance is created at the app level rather than inside `App.vue` so the
 * entry point owns the decision of where folders come from — real disk in
 * `main.ts`, an in-memory folder in the e2e harness — and `App.vue` is the same
 * component either way.
 */
export function createApertureApp(options: ApertureOptions = {}): VueApp {
  const app = createApp(App);

  // The store outlives every component, so give its watchers a scope of their
  // own instead of leaving them attached to nothing.
  const scope = effectScope(true);
  const aperture = scope.run(() => createAperture(options))!;
  app.provide(APERTURE_KEY, aperture);

  const unmount = app.unmount.bind(app);
  app.unmount = () => {
    scope.stop();
    unmount();
  };

  return app;
}
