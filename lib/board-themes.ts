export type BoardThemeId =
  | 'green'
  | 'brown'
  | 'walnut'
  | 'blue'
  | 'icy_sea'
  | 'slate'
  | 'marble'
  | 'purple'
  | 'red'
  | 'bubblegum'
  | 'emerald'
  | 'sand';

export type PieceSetId = 'neo' | 'classic' | 'wood' | 'icy' | 'alpha' | 'metal';

export type SoundProfileId =
  | 'neo'
  | 'classic'
  | 'alpha'
  | 'wood'
  | 'icy'
  | 'metal'
  | 'marble'
  | 'glass'
  | 'sand';

export const SOUND_PROFILE_LABELS: Record<SoundProfileId, { it: string; en: string }> = {
  neo: { it: 'Torneo Classic', en: 'Tournament Classic' },
  classic: { it: 'Legno Staunton', en: 'Staunton Wood' },
  alpha: { it: 'Club Rapido', en: 'Club Blitz' },
  wood: { it: 'Legno Intagliato', en: 'Carved Wood' },
  icy: { it: 'Ghiaccio & Cristallo', en: 'Ice & Crystal' },
  metal: { it: 'Metallo & Acciaio', en: 'Metal & Steel' },
  marble: { it: 'Marmo & Pietra', en: 'Marble & Stone' },
  glass: { it: 'Vetro Lucido', en: 'Polished Glass' },
  sand: { it: 'Pietra & Sabbia', en: 'Sandstone' },
};

export interface BoardThemeDef {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
  highlightLight: string;
  highlightDark: string;
  soundProfile: SoundProfileId;
  /** Optional subtle surface texture applied via CSS background-image */
  lightTexture?: string;
  darkTexture?: string;
}

export interface PieceSetDef {
  id: PieceSetId;
  name: string;
  soundProfile: SoundProfileId;
  whiteFill: string;
  whiteFillAlt: string;
  whiteStroke: string;
  whiteDetail: string;
  blackFill: string;
  blackFillAlt: string;
  blackStroke: string;
  blackDetail: string;
  strokeWidth: number;
  detailedInnerLines: boolean;
}

export const CHESS_BOARD_THEMES: BoardThemeDef[] = [
  {
    id: 'green',
    name: 'Green',
    light: '#EEEED2',
    dark: '#769656',
    highlightLight: '#F5F682',
    highlightDark: '#BACA44',
    soundProfile: 'neo',
  },
  {
    id: 'brown',
    name: 'Brown',
    light: '#F0D9B5',
    dark: '#B58863',
    highlightLight: '#F7EC74',
    highlightDark: '#DAC34B',
    soundProfile: 'wood',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    light: '#D7B48E',
    dark: '#8B5E3C',
    highlightLight: '#EAD16F',
    highlightDark: '#BA943E',
    soundProfile: 'wood',
    lightTexture:
      'repeating-linear-gradient(12deg, rgba(110,66,30,0.04) 0px, rgba(110,66,30,0.04) 2px, transparent 2px, transparent 9px)',
    darkTexture:
      'repeating-linear-gradient(12deg, rgba(38,18,6,0.08) 0px, rgba(38,18,6,0.08) 2px, transparent 2px, transparent 9px)',
  },
  {
    id: 'blue',
    name: 'Blue',
    light: '#EAE9D2',
    dark: '#4B7399',
    highlightLight: '#F5F682',
    highlightDark: '#8DA968',
    soundProfile: 'neo',
  },
  {
    id: 'icy_sea',
    name: 'Icy Sea',
    light: '#EDF2F7',
    dark: '#7094B5',
    highlightLight: '#CBE6FF',
    highlightDark: '#599AD1',
    soundProfile: 'icy',
  },
  {
    id: 'slate',
    name: 'Dark Slate',
    light: '#B4B7BA',
    dark: '#64676A',
    highlightLight: '#DCE384',
    highlightDark: '#959F52',
    soundProfile: 'metal',
  },
  {
    id: 'marble',
    name: 'Marble',
    light: '#F0F0F0',
    dark: '#8C9298',
    highlightLight: '#F4F580',
    highlightDark: '#B7BC58',
    soundProfile: 'marble',
    lightTexture:
      'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(200,206,212,0.22) 50%, rgba(255,255,255,0.35) 100%)',
    darkTexture:
      'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(45,52,58,0.14) 55%, rgba(255,255,255,0.08) 100%)',
  },
  {
    id: 'purple',
    name: 'Purple',
    light: '#EFEFEF',
    dark: '#8877B7',
    highlightLight: '#F6F18D',
    highlightDark: '#B799CF',
    soundProfile: 'glass',
  },
  {
    id: 'red',
    name: 'Red',
    light: '#F3DFD6',
    dark: '#AD534B',
    highlightLight: '#F6E37E',
    highlightDark: '#CA8C47',
    soundProfile: 'classic',
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    light: '#F5E2EB',
    dark: '#D179A0',
    highlightLight: '#F7EE89',
    highlightDark: '#E3A96A',
    soundProfile: 'glass',
  },
  {
    id: 'emerald',
    name: 'Dash',
    light: '#E6EDE6',
    dark: '#4E7E63',
    highlightLight: '#DCE876',
    highlightDark: '#82AE54',
    soundProfile: 'alpha',
  },
  {
    id: 'sand',
    name: 'Sand',
    light: '#E3D4B7',
    dark: '#B3946B',
    highlightLight: '#F1DF79',
    highlightDark: '#C8AC4E',
    soundProfile: 'sand',
    lightTexture:
      'radial-gradient(rgba(120,90,45,0.05) 1px, transparent 1px)',
    darkTexture:
      'radial-gradient(rgba(45,30,10,0.07) 1px, transparent 1px)',
  },
];

export const CHESS_PIECE_SETS: PieceSetDef[] = [
  {
    id: 'neo',
    name: 'Neo',
    soundProfile: 'neo',
    whiteFill: '#F9F9F7',
    whiteFillAlt: '#DCDCD6',
    whiteStroke: '#2E2B28',
    whiteDetail: '#5A5651',
    blackFill: '#494542',
    blackFillAlt: '#262321',
    blackStroke: '#141210',
    blackDetail: '#D7D4CE',
    strokeWidth: 1.45,
    detailedInnerLines: false,
  },
  {
    id: 'classic',
    name: 'Classic',
    soundProfile: 'classic',
    whiteFill: '#FBF8F1',
    whiteFillAlt: '#EAE3D2',
    whiteStroke: '#1E232A',
    whiteDetail: '#1E232A',
    blackFill: '#242930',
    blackFillAlt: '#15181D',
    blackStroke: '#11151A',
    blackDetail: '#E2E8F0',
    strokeWidth: 1.55,
    detailedInnerLines: true,
  },
  {
    id: 'alpha',
    name: 'Alpha',
    soundProfile: 'alpha',
    whiteFill: '#FFFFFF',
    whiteFillAlt: '#EBEBEB',
    whiteStroke: '#171717',
    whiteDetail: '#171717',
    blackFill: '#1D1D1D',
    blackFillAlt: '#111111',
    blackStroke: '#0A0A0A',
    blackDetail: '#F0F0F0',
    strokeWidth: 1.85,
    detailedInnerLines: true,
  },
  {
    id: 'wood',
    name: 'Wood',
    soundProfile: 'wood',
    whiteFill: '#F3D7A8',
    whiteFillAlt: '#CFA168',
    whiteStroke: '#5C3718',
    whiteDetail: '#7A4C25',
    blackFill: '#8B4F28',
    blackFillAlt: '#562D13',
    blackStroke: '#2A1306',
    blackDetail: '#E2B486',
    strokeWidth: 1.55,
    detailedInnerLines: true,
  },
  {
    id: 'icy',
    name: 'Icy',
    soundProfile: 'icy',
    whiteFill: '#F3FAFF',
    whiteFillAlt: '#C8E4FB',
    whiteStroke: '#285780',
    whiteDetail: '#3E79AB',
    blackFill: '#2E6291',
    blackFillAlt: '#173A5C',
    blackStroke: '#0D2238',
    blackDetail: '#BAE0FF',
    strokeWidth: 1.5,
    detailedInnerLines: true,
  },
  {
    id: 'metal',
    name: 'Metal',
    soundProfile: 'metal',
    whiteFill: '#F1F4F7',
    whiteFillAlt: '#BCC5CE',
    whiteStroke: '#2A3138',
    whiteDetail: '#49535E',
    blackFill: '#4D5660',
    blackFillAlt: '#2B3239',
    blackStroke: '#161A1F',
    blackDetail: '#DCE3EA',
    strokeWidth: 1.5,
    detailedInnerLines: true,
  },
];

export function getBoardTheme(id?: BoardThemeId | string | null): BoardThemeDef {
  return CHESS_BOARD_THEMES.find((t) => t.id === id) || CHESS_BOARD_THEMES[0];
}

export function getPieceSet(id?: PieceSetId | string | null): PieceSetDef {
  return CHESS_PIECE_SETS.find((p) => p.id === id) || CHESS_PIECE_SETS[0];
}

export function getSoundProfile(id?: SoundProfileId | string | null): SoundProfileId {
  if (id && id in SOUND_PROFILE_LABELS) {
    return id as SoundProfileId;
  }
  return 'neo';
}
