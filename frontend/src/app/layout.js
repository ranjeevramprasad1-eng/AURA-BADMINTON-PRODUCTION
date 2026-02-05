import { Geist, Geist_Mono, Koulen } from "next/font/google";
import "@/styles/globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from "@/contexts/QueryProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const koulen = Koulen({
  variable: "--font-koulen",
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  title: "AURA - Tournament Management",
  description: "Tournament management application",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.className} ${geistMono.variable} ${koulen.variable} antialiased overscroll-none`}
      >
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster position="top-center" />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
