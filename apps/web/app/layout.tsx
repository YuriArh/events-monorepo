import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import "./globals.css";
import { SiteHeader } from "./components/site-header";
import { serverRequest } from "./lib/api.server";
import { meQuery } from "./lib/queries";
import { getServerQueryClient } from "./lib/query-client.server";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Events",
  description: "Create and manage your events",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page needs `me` (header, ownership); fetch it once, here, into the cache.
  const queryClient = getServerQueryClient();
  await queryClient.prefetchQuery(meQuery(serverRequest));

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <Providers>
          <HydrationBoundary state={dehydrate(queryClient)}>
            <SiteHeader />
            {children}
          </HydrationBoundary>
        </Providers>
      </body>
    </html>
  );
}
