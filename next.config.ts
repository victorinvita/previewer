import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // La interfaz sabe en qué sistema corre (textos "Explorador"/"Finder", icono, ejemplos de rutas).
  env: { PREVIEWER_OS: process.platform },
};

export default nextConfig;
