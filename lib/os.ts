/**
 * Sistema operativo para la interfaz. Se fija al compilar (next.config.ts), y como cada equipo
 * compila su propia copia, siempre coincide con el sistema donde corre la app.
 */
export const IS_MAC_UI = process.env.PREVIEWER_OS === "darwin";
/** Nombre del gestor de archivos: "Explorador" en Windows, "Finder" en Mac. */
export const FILE_MANAGER = IS_MAC_UI ? "Finder" : "Explorador";
/** Ejemplo de ruta para los textos de ayuda. */
export const EXAMPLE_PATH = IS_MAC_UI ? "/Volumes/Empresa/Proyectos/Cliente" : "C:\\Volumes\\Empresa\\Proyectos\\Cliente";
