// Identificador corto para elementos que viven en este navegador.
export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
