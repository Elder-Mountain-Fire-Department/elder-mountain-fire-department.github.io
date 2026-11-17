import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";

export default function (eleventyConfig) {
  // Every <img> pointing at a local file is resized at build time into
  // 800 / 1600 px WebP and JPEG, with lazy loading. Upload phone photos as-is.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp", "jpeg"],
    widths: [800, 1600],
    htmlOptions: {
      imgAttributes: { loading: "lazy", decoding: "async" },
    },
  });

  eleventyConfig.addPassthroughCopy({
    "src/fonts": "fonts",
    "src/js": "js",
    "src/img/brand": "img/brand",
    "src/favicon.ico": "favicon.ico",
    "src/apple-touch-icon.png": "apple-touch-icon.png",
    "src/site.webmanifest": "site.webmanifest",
  });
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: { input: "src", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
