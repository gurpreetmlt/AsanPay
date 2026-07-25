import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AdminThemeProvider } from "@/components/theme/AdminThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "AsanPay";

export const metadata: Metadata = {
  title: `${BRAND_NAME} Admin`,
  description: `${BRAND_NAME} admin — users, KYC, transactions & site control`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.className} antialiased`}>
        <ThemeScript />
        <AdminThemeProvider>
          {children}
          <Toaster position="top-center" />
        </AdminThemeProvider>
      </body>
    </html>
  );
}
