import type { Metadata } from "next";
import { AdminThemeProvider } from "@/components/theme/AdminThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { AppToaster } from "@/components/ui/AppToaster";
import "./globals.css";

// Do not use next/font/google here: Coolify/EC2 Docker builds often cannot reach
// Google Fonts during "Collecting page data", which fails deploy with exit 255.

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "AsanPay";

export const metadata: Metadata = {
  title: `${BRAND_NAME} Admin`,
  description: `${BRAND_NAME} admin — users, KYC, transactions & site control`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeScript />
        <AdminThemeProvider>
          {children}
          <AppToaster />
        </AdminThemeProvider>
      </body>
    </html>
  );
}
