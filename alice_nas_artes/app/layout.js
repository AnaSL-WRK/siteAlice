// This is the root layout for the application
import localFont from 'next/font/local';

import Header from "./components/header";
import Footer from "./components/footer";

export const metadata = {
  title: "Alice nas Artes",
  description: "Pinturas e Fotografias feitas e tiradas pela Alice Loureiro",
};

const font = localFont({ src: './segoeuithis.ttf' })

export default function RootLayout({ children }) {
  return (
    <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" />
        </head>

        <body className={font.className}>
          <Header />
          <main>{children}</main>
          <Footer />
      </body>
    </html>
  );
}
