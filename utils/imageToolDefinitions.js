const tools = [
  ['background-remove', 'Remove the background and return a transparent PNG'],
  ['sticker', 'Create a transparent sticker with a coloured outline'],
  ['collage', 'Arrange attachments in a grid with spacing and a background'],
  ['crop', 'Crop an image to a square, portrait, story, landscape or banner'],
  ['resize', 'Resize an image, optionally preserving its aspect ratio'],
  ['compress', 'Compress an image and show the before and after file sizes'],
  ['convert', 'Convert an image to PNG, JPEG or WebP'],
  ['outline', 'Turn an image into a black-on-white line drawing'],
  ['duotone', 'Recolour an image using two HEX colours'],
  ['gradient-map', 'Map image brightness to a custom colour gradient'],
  ['polaroid', 'Add a Polaroid-style frame and an optional caption'],
  ['ascii', 'Turn an image into ASCII art as text or an image'],
  ['extract-text', 'Extract copyable text from an image using local OCR'],
  ['redact', 'Cover selected pixel regions with solid opaque rectangles'],
  ['compare', 'Compare two images side by side or show their pixel differences'],
];
const benefits = Object.fromEntries(tools.map(([name]) => [name, 'Up to 3072px output instead of 1536px.']));
Object.assign(benefits, { palette: 'Up to 30 colours instead of 15.', collage: 'Up to 9 images instead of 4; up to 3072px output.',
  ascii: 'Up to 200 columns instead of 100.', 'gradient-map': 'Up to 5 colour stops instead of 2.',
  'extract-text': 'German, French and Spanish OCR in addition to English.', redact: 'Up to 20 regions instead of 5; up to 3072px output.' });
function addTools(builder) {
  const string = (s, name, description, choices, required = false) => s.addStringOption(o => {
    o.setName(name).setDescription(description).setRequired(required).setMaxLength(name === 'regions' ? 800 : 200);
    if (choices) o.addChoices(...choices.map(value => ({ name: value, value })));
    return o;
  });
  const integer = (s, name, description, min, max, required = false) => s.addIntegerOption(o => o.setName(name).setDescription(description).setMinValue(min).setMaxValue(max).setRequired(required));
  for (const [name, description] of tools) builder.addSubcommand(s => {
    s.setName(name).setDescription(description);
    const attachment = (key, required) => s.addAttachmentOption(o => o.setName(key).setDescription('Image attachment, up to 10 MB; animated images use the first frame').setRequired(required));
    attachment(name === 'collage' ? 'image1' : 'image', true);
    if (name === 'compare' || name === 'collage') attachment('image2', true);
    if (name === 'resize') integer(s, 'width', 'Width in pixels: free up to 1536, Plus up to 3072', 1, 3072, true);
    if (name === 'redact') string(s, 'regions', 'Oriented original pixels: x,y,width,height; x,y,width,height', null, true);
    if (name === 'convert') string(s, 'format', 'Output format; JPEG flattens transparency', ['png', 'jpeg', 'webp'], true);
    if (name === 'gradient-map') string(s, 'colours', 'HEX stops separated by commas: #000000,#ffffff (free 2 / Plus 5)', null, true);
    if (name === 'duotone') { string(s, 'shadows', 'Dark colour, e.g. #14213d', null, true); string(s, 'highlights', 'Light colour, e.g. #fca311', null, true); }
    if (name === 'collage') { for (let i = 3; i <= 9; i++) attachment(`image${i}`, false); integer(s, 'columns', 'Grid columns (default 2)', 1, 3); integer(s, 'spacing', 'Spacing in pixels (default 16)', 0, 100); }
    if (name === 'crop') { string(s, 'preset', 'Crop proportions (default square)', ['square', 'portrait', 'story', 'landscape', 'banner']); string(s, 'position', 'Area to retain (default centre)', ['centre', 'north', 'south', 'east', 'west']); }
    if (name === 'resize') { integer(s, 'height', 'Optional height; otherwise inferred from aspect ratio', 1, 3072); s.addBooleanOption(o => o.setName('keep-aspect').setDescription('Fit within dimensions without stretching (default true)')); }
    if (name === 'compress') { integer(s, 'quality', 'Quality from 10 to 95 (default 70)', 10, 95); string(s, 'format', 'Compression format (default WebP)', ['webp', 'jpeg']); }
    if (['collage', 'convert', 'sticker'].includes(name)) string(s, 'colour', 'Background or sticker outline HEX colour (default #ffffff)');
    if (name === 'sticker') integer(s, 'border', 'Outline width in pixels (default 12)', 1, 40);
    if (name === 'outline') integer(s, 'strength', 'Edge sensitivity (default 50)', 1, 100);
    if (name === 'polaroid') string(s, 'caption', 'Optional frame caption (up to 80 characters)');
    if (name === 'ascii') { integer(s, 'columns', 'Text width: free up to 100 / Plus up to 200 (default 80)', 20, 200); string(s, 'output', 'Download text or a rendered image (default text)', ['text', 'image']); }
    if (name === 'extract-text') string(s, 'language', 'English is free; Plus also includes German, French and Spanish', ['eng', 'deu', 'fra', 'spa']);
    if (name === 'compare') string(s, 'mode', 'Comparison mode (default side-by-side)', ['side-by-side', 'difference']);
    return s;
  });
  return builder;
}
module.exports = { tools, benefits, addTools };
