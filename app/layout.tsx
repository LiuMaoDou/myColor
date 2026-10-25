import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "色集 Color Atlas · 你的颜色工作台",
  description: "收藏、整理与复用每一次颜色灵感。支持单色、色板和配色网站。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <a href="#main-content" className="skip-link">
          跳转到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
