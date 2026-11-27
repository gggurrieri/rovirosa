import type { Metadata, Viewport } from "next";
import { RegistrarApp } from "@/components/RegistrarApp";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker",
  description: "Viajes y cobros de transporte de autos",
  applicationName: "Tracker",
  // En el iPhone, "Agregar a inicio" la abre a pantalla completa con este nombre.
  appleWebApp: { capable: true, title: "Tracker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0369a1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="min-h-full bg-slate-100 text-slate-900">
        {children}
        <RegistrarApp />
      </body>
    </html>
  );
}
