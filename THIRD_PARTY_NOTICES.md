# Third-party notes

Image tools use Sharp (Apache-2.0), ONNX Runtime (MIT), and Tesseract.js (Apache-2.0), together with the installed Tesseract language-data packages. Package distributions include their license files. Background removal downloads the lightweight U²-Net model from the [rembg release](https://github.com/danielgatis/rembg/releases/tag/v0.0.0); the [U²-Net project](https://github.com/xuebinqin/U-2-Net) is Apache-2.0 licensed. Model preprocessing follows the published rembg U2netp session (MIT). The model is checksum-verified and cached under ignored `data/image-models/`, not committed here. No image-service subscription is required.

Dependencies have their own licenses, available in their installed package metadata. This repository does not change those terms.

The extracted project includes SF Pro, Helvetica and gg sans font files. These are third-party fonts, not original leaf work. Their presence in an old project is not evidence of a redistribution license. Operators must review the applicable font terms or replace them with appropriately licensed alternatives before redistribution or hosting.

Discord-related badges, service icons and generated platform-style graphics reference their respective brands. The website loads Font Awesome and Flaticon styles from external CDNs; those services retain their own licenses and attribution requirements. Game, media and AI APIs have separate usage and data terms.

The Leaf banner and other image files came from the supplied project. No new ownership claims are made for third-party assets. No project-wide license grant is introduced by these notes.
