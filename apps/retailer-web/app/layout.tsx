import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { GradientDefs } from "@/components/GradientDefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AsanPay Retailer",
  description: "AsanPay retailer dashboard — AEPS, recharge, bill payments and more",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <GradientDefs />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
