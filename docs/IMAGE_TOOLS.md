# Image tools

All 16 `/image` subcommands appear automatically in the website command catalog. The original palette command is unchanged. New tools: background-remove, sticker, collage, crop, resize, compress, convert, outline, duotone, gradient-map, polaroid, ascii, extract-text, redact and compare.

Run `npm ci`, then `npm run setup:images` to prepare the background-removal model. Start the bot and website with `npm start`. No paid image API or GPU is required. The model also downloads automatically on first use. English, German, French and Spanish OCR data are installed through npm. Image processing stays on the bot host; Discord receives the uploaded input and result. Model downloads do not send user images to the model host.

## Free and Plus

Every tool has a free mode. Most outputs are capped at 1536px for free users and 3072px for Plus. Collages support 4/9 images, ASCII supports 100/200 columns, gradient maps support 2/5 stops, redaction supports 5/20 regions. English OCR is free; other supplied languages require Plus. The configured `Owner_ID` automatically receives Plus access without payment or an expiring entitlement.

All inputs must be Discord attachments, at most 10 MB each and 25 million decoded pixels. Results must fit the interaction upload limit, capped at 10 MB. Animated images use the first frame. ASCII image dimensions follow the column/row limits instead of the general output cap. Two image jobs can run at once, with one per user; busy requests can be retried.

## Examples

- `/image gradient-map colours:#14213d,#fca311` with an attached image.
- `/image resize width:1000 height:1000 keep-aspect:true` fits inside the box without stretching.
- `/image redact regions:20,40,300,80;20,140,300,80` covers two rectangles. Coordinates refer to original pixels after EXIF orientation, before resizing. Masks are permanently composited into the returned file; the original Discord upload still exists. Always inspect the result before sharing.
- `/image compare mode:difference` returns absolute pixel differences after fitting both images into equal panels. This is not an identity or authenticity check.
- `/image convert format:jpeg colour:#ffffff` replaces transparency with white.

Cutouts and OCR can be imperfect. A clear foreground subject helps background removal, and large upright text helps OCR. Compression reports actual sizes and explicitly says when the result is not smaller. Returned images omit original metadata. The Plus catalog shows both exclusive commands and free commands with Plus upgrades.
