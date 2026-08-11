import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AdminThemeProvider } from "@/components/theme/AdminThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
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
          <Toaster
            position="top-center"
            toastOptions={{
              className: "admin-toast",
              style: {
                background: "var(--admin-card)",
                color: "var(--admin-text)",
                border: "1px solid var(--admin-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
              },
              success: {
                iconTheme: { primary: "#12B76A", secondary: "#fff" },
              },
              error: {
                iconTheme: { primary: "#DC2626", secondary: "#fff" },
              },
            }}
          />
        </AdminThemeProvider>
      </body>
    </html>
  );
}
