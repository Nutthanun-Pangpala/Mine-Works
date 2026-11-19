import "./globals.css";

export const metadata = {
  title: "Mine Works HR",
  description: "ระบบบริหารงานบุคคล",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
