import "./globals.css";

export const metadata = {
  title: "ระบบ HR",
  description: "ระบบบริหารงานบุคคลภายในองค์กร",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
