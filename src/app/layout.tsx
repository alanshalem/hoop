import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Narrow } from "next/font/google";
import { DialogHost } from "@/presentation/organisms/DialogHost/DialogHost";
import { SessionProvider } from "@/presentation/session/SessionProvider";
import { THEME_INIT_SCRIPT } from "@/presentation/molecules/ThemeToggle/theme";
import { TourHost } from "@/presentation/tour/TourHost";
import "./globals.css";

// Variable fonts: every weight in one file. Wired into --font-sans / --font-display in globals.css.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HoopOS",
    template: "%s | HoopOS",
  },
  description:
    "HoopOS · CAMG: el sistema de básquet del Club Atlético Monte Grande. Divisiones, planteles, partidos y estadísticas FIBA en vivo desde la tablet.",
  applicationName: "HoopOS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0A",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before hydration, hence suppressHydrationWarning.
    <html
      lang="es"
      className={`${archivo.variable} ${archivoNarrow.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        {/* usePathname suspends on dynamic routes under cacheComponents; the session UI renders nothing until then. */}
        <Suspense fallback={null}>
          <SessionProvider />
        </Suspense>
        <TourHost />
        <DialogHost />
      </body>
    </html>
  );
}
