import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "AsanPay";

export const metadata: Metadata = {
  title: `${BRAND_NAME} Agent Portal`,
  description: `${BRAND_NAME} agent dashboard — services, balance & network`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className={`${poppins.className} antialiased`}>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
