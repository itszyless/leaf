/**
 * Reuploads Discord-hosted attachments to Catbox.moe for permanent URLs.
 * Works with discord.com, discordapp.com, discordapp.net, and media.discordapp.net.
 * 
 * @param {string} url - The original image URL.
 * @returns {Promise<string>} Permanent Catbox URL or the original URL if failed.
 */

const fetch = globalThis.fetch;
const FormData = require('form-data');

async function makePermanent(url) {
  if (
    typeof url !== 'string' ||
    !/\bdiscord(app)?\.(com|net)\b/i.test(url)
  ) {
    return url;
  }

  // strip query params (Discord adds ?ex=..., ?width=..., etc)
  try {
    const parsed = new URL(url);
    url = `${parsed.origin}${parsed.pathname}`;
  } catch (_) {}

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!res.ok) {
      console.warn(`⚠️ Discord fetch failed (${res.status}) for: ${url}`);
      return url;
    }

    const buffer = await res.buffer();

    // derive file name with fallback extension
    let filename = url.split('/').pop() || 'file';
    if (!/\.[a-z]{3,4}$/i.test(filename)) {
      const contentType = res.headers.get('content-type') || '';
      const ext =
        contentType.includes('jpeg') ? '.jpg' :
        contentType.includes('png') ? '.png' :
        contentType.includes('gif') ? '.gif' :
        contentType.includes('webp') ? '.webp' : '.png';
      filename += ext;
    }

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, filename);

    const uploadRes = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: form,
    });

    const text = (await uploadRes.text()).trim();
    if (!text.startsWith('https://')) {
      console.warn(`⚠️ Catbox upload failed for: ${url} → ${text}`);
      return url;
    }

    console.log(`✅ Uploaded to Catbox: ${text}`);
    return text;
  } catch (err) {
    console.error(`❌ makePermanent() error for ${url}:`, err.message);
    return url;
  }
}

module.exports = { makePermanent };
