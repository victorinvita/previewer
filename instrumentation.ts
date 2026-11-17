// Al arrancar el servidor, retoma los trabajos "Generar todo" que quedaron pendientes.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumeJobs } = await import("./lib/jobs");
    await resumeJobs();
  }
}
