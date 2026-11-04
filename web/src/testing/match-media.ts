type ChangeListener = (event: { matches: boolean }) => void;

/**
 * Simula la preferencia de color del sistema operativo (jsdom no trae matchMedia).
 * Llama a vi.unstubAllGlobals() al terminar cada prueba.
 */
export function mockSystemTheme(prefersLight: boolean) {
  const listeners: ChangeListener[] = [];
  const media = {
    matches: prefersLight,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.push(listener),
  };
  vi.stubGlobal('matchMedia', () => media);
  return {
    change(toLight: boolean) {
      media.matches = toLight;
      listeners.forEach((listener) => listener({ matches: toLight }));
    },
  };
}
