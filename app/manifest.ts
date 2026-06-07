import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Story Reader",
    short_name: "Stories",
    description: "Read scraped stories online and save chapters for offline reading.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#176b5b",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
