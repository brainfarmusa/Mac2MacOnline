const host = "www.mac2maconline.com";
const key = "53d87cf12919b1896ec0e76d72113d8a";
const keyLocation = `https://${host}/${key}.txt`;
const sitemapUrl = `https://${host}/sitemap.xml`;

const sitemapResponse = await fetch(sitemapUrl);
if (!sitemapResponse.ok) {
  throw new Error(`Unable to read sitemap: ${sitemapResponse.status}`);
}

const sitemap = await sitemapResponse.text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
  match[1].replaceAll("&amp;", "&"),
);

if (urlList.length === 0) {
  throw new Error("No URLs found in sitemap");
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
});

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow rejected the submission: ${response.status} ${await response.text()}`);
}

console.log(`Submitted ${urlList.length} URLs to IndexNow (HTTP ${response.status}).`);
