/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Permite rodar módulos "server-only" (que importam o banco) fora do Next, nos scripts de teste/varredura local.
 * Uso: require("./_server-only.cjs") antes do `await import("../src/lib/...")`.
 */
const Module = require("node:module");
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};
