import { buildApp } from "./app.js";

const app = await buildApp({
  logger: true,
  // Render sets RENDER_EXTERNAL_URL to the service's own HTTPS origin.
  publicOrigin: process.env.PUBLIC_ORIGIN ?? process.env.RENDER_EXTERNAL_URL,
});
try {
  await app.listen({
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3001),
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close();
  });
