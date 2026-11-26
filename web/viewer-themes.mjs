// Colour themes for the interactive schematic/PCB viewers only; the portal's
// own styling and the KiCad-exported SVG/PDF drawings are not affected.
//
// "KiCad-style" approximates KiCad's default light schematic colours and its
// classic dark PCB editor colours. "Witch Hazel" is KiCanvas's built-in dark
// theme (null = keep the colours KiCanvas loaded with).

const kicadSchematic = {
  background: '#f5f4ef', sheet_background: '#f5f4ef', worksheet: '#840000', grid: '#848484', grid_axes: '#000084',
  wire: '#009600', junction: '#009600', bus: '#000084', bus_junction: '#000084', no_connect: '#0000c2',
  component_outline: '#840000', component_body: '#ffffc2', pin: '#840000', pin_name: '#006464', pin_number: '#a90000',
  reference: '#006464', value: '#006464', fields: '#840084', hidden: '#5e5e5e', note: '#0000c2', aux_items: '#000000',
  label_local: '#0f0f0f', label_global: '#840000', label_hier: '#7e5300', netclass_flag: '#0f0f0f', rule_area: '#840000',
  sheet: '#840000', sheet_fields: '#840084', sheet_filename: '#72411f', sheet_label: '#7e5300', sheet_name: '#006464',
  anchor: '#0000ff', brightened: '#ff00ff', cursor: '#0f0f0f', erc_error: '#ff0000cc', erc_warning: '#ff9900cc', shadow: '#ff9dbecc',
};

const kicadBoard = {
  background: '#001023', grid: '#848484', grid_axes: '#0000c2', anchor: '#ff2626', aux_items: '#ffffff', cursor: '#ffffff',
  copper: { f: '#c83434', b: '#4d7fc4', in1: '#7fc87f', in2: '#ce7d2c', in3: '#4fcbcb', in4: '#db628b' },
  f_silks: '#f2eda1', b_silks: '#e8b2a7', f_mask: '#d864ff66', b_mask: '#02ffee66', f_paste: '#b4a09ae6', b_paste: '#00c2c2e6',
  f_fab: '#afafaf', b_fab: '#585d84', f_crtyd: '#ff26e2', b_crtyd: '#26e9ff', f_adhes: '#843184', b_adhes: '#0000ff',
  edge_cuts: '#d0d2cd', margin: '#ff26e2', dwgs_user: '#c2c2c2', cmts_user: '#5994dc', eco1_user: '#b4dbd2', eco2_user: '#d8c852',
  pad_through_hole: '#e3b72e', pad_plated_hole: '#c2c200', non_plated_hole: '#1a1f2f', via_through: '#ececec',
  via_blind_buried: '#bb9761', via_micro: '#0081ff', via_hole: '#e3b72e', ratsnest: '#f5f5f5cc', no_connect: '#0000ff',
  worksheet: '#c8262680', footprint_text_invisible: '#848484',
};

export const PALETTES = {
  kicad: { label: 'KiCad-style (light schematic)', schematic: kicadSchematic, board: kicadBoard, highlight: '#ff00cc' },
  witchhazel: { label: 'Witch Hazel (dark)', schematic: null, board: null, highlight: '#fff781' },
};

/** "#rrggbb" or "#rrggbbaa" → [r, g, b, a] in 0..1. */
export function parseColour(hex) {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!match) throw new Error(`Invalid colour: ${hex}`);
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, match[2] ? parseInt(match[2], 16) / 255 : 1];
}

const isColour = value => value && typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value;

/** Copy of every colour in a KiCanvas theme object, nested groups included. */
export function snapshotTheme(theme) {
  const copy = {};
  for (const [key, value] of Object.entries(theme)) {
    if (isColour(value)) copy[key] = [value.r, value.g, value.b, value.a];
    else if (value && typeof value === 'object') copy[key] = snapshotTheme(value);
  }
  return copy;
}

/**
 * Set colours in place on a KiCanvas theme object. Values may be hex strings,
 * [r,g,b,a] arrays or nested groups (e.g. copper layers). Keys the theme does
 * not have are ignored, so a palette cannot add unknown properties.
 */
export function applyPalette(theme, palette) {
  for (const [key, value] of Object.entries(palette)) {
    if (!(key in theme)) continue;
    if (typeof value === 'string' || Array.isArray(value)) {
      const [r, g, b, a] = typeof value === 'string' ? parseColour(value) : value;
      const current = theme[key];
      if (isColour(current)) theme[key] = new current.constructor(r, g, b, a);
    } else if (value && typeof value === 'object' && theme[key] && typeof theme[key] === 'object') {
      applyPalette(theme[key], value);
    }
  }
}
