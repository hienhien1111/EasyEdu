import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EasyEdu — Hệ thống Quản lý Trung tâm Dạy học",
  description:
    "Nền tảng quản lý trung tâm dạy học toàn diện: lớp học, thời khóa biểu, điểm danh, học phí và lương giáo viên",
  keywords: ["easyedu", "quản lý trung tâm", "học sinh", "giáo viên"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
