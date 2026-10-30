import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DialogHost } from "@/presentation/organisms/DialogHost/DialogHost";
import { THEME_INIT_SCRIPT } from "@/presentation/molecules/ThemeToggle/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HoopOS",
    template: "%s | HoopOS",
  },
  description:
    "Sistema integral para clubes de básquet: divisiones, planteles, partidos y estadísticas FIBA en vivo desde la tablet.",
  applicationName: "HoopOS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0F17",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before hydration, hence suppressHydrationWarning.
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
