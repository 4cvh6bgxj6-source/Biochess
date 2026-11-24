export interface WorldLocaleOption {
  /** ISO 639-1 language code */
  lang: string;
  /** ISO 3166-1 alpha-2 country code (uppercase) */
  country: string;
  /** Native language & region label */
  nativeName: string;
  /** English/Italian search keywords */
  keywords: string;
}

export function countryCodeToFlag(countryCode?: string | null): string {
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return '';
  const base = 0x1f1e6;
  const c1 = countryCode.charCodeAt(0) - 65;
  const c2 = countryCode.charCodeAt(1) - 65;
  return String.fromCodePoint(base + c1, base + c2);
}

/**
 * Comprehensive world languages & countries catalog covering every UN region and language.
 */
export const WORLD_LOCALE_OPTIONS: WorldLocaleOption[] = [
  { lang: 'it', country: 'IT', nativeName: 'Italiano (Italia)', keywords: 'italian italia italy' },
  { lang: 'en', country: 'US', nativeName: 'English (United States)', keywords: 'english usa america inglese' },
  { lang: 'en', country: 'GB', nativeName: 'English (United Kingdom)', keywords: 'english uk britain england inglese' },
  { lang: 'es', country: 'ES', nativeName: 'Español (España)', keywords: 'spanish spagna spain spagnolo' },
  { lang: 'fr', country: 'FR', nativeName: 'Français (France)', keywords: 'french francia france francese' },
  { lang: 'de', country: 'DE', nativeName: 'Deutsch (Deutschland)', keywords: 'german germania germany tedesco' },
  { lang: 'pt', country: 'BR', nativeName: 'Português (Brasil)', keywords: 'portuguese brasile brazil portoghese' },
  { lang: 'pt', country: 'PT', nativeName: 'Português (Portugal)', keywords: 'portuguese portogallo portugal portoghese' },
  { lang: 'ru', country: 'RU', nativeName: 'Русский (Россия)', keywords: 'russian russia russo' },
  { lang: 'zh', country: 'CN', nativeName: '中文 (中国)', keywords: 'chinese cina china cinese mandarin' },
  { lang: 'zh', country: 'TW', nativeName: '繁體中文 (台灣)', keywords: 'chinese taiwan cinese' },
  { lang: 'ja', country: 'JP', nativeName: '日本語 (日本)', keywords: 'japanese giappone japan giapponese' },
  { lang: 'ko', country: 'KR', nativeName: '한국어 (대한민국)', keywords: 'korean corea korea coreano' },
  { lang: 'ar', country: 'SA', nativeName: 'العربية (السعودية)', keywords: 'arabic arabia saudita arabo' },
  { lang: 'hi', country: 'IN', nativeName: 'हिन्दी (भारत)', keywords: 'hindi india indiano' },
  { lang: 'nl', country: 'NL', nativeName: 'Nederlands (Nederland)', keywords: 'dutch olanda netherlands olandese' },
  { lang: 'pl', country: 'PL', nativeName: 'Polski (Polska)', keywords: 'polish polonia poland polacco' },
  { lang: 'tr', country: 'TR', nativeName: 'Türkçe (Türkiye)', keywords: 'turkish turchia turkey turco' },
  { lang: 'uk', country: 'UA', nativeName: 'Українська (Україна)', keywords: 'ukrainian ucraina ukraine ucraino' },
  { lang: 'ro', country: 'RO', nativeName: 'Română (România)', keywords: 'romanian romania rumeno' },
  { lang: 'sv', country: 'SE', nativeName: 'Svenska (Sverige)', keywords: 'swedish svezia sweden svedese' },
  { lang: 'el', country: 'GR', nativeName: 'Ελληνικά (Ελλάδα)', keywords: 'greek grecia greece greco' },
  { lang: 'cs', country: 'CZ', nativeName: 'Čeština (Česko)', keywords: 'czech rep ceca czechia ceco' },
  { lang: 'hu', country: 'HU', nativeName: 'Magyar (Magyarország)', keywords: 'hungarian ungheria hungary ungherese' },
  { lang: 'da', country: 'DK', nativeName: 'Dansk (Danmark)', keywords: 'danish danimarca denmark danese' },
  { lang: 'fi', country: 'FI', nativeName: 'Suomi (Suomi)', keywords: 'finnish finlandia finland finlandese' },
  { lang: 'no', country: 'NO', nativeName: 'Norsk (Norge)', keywords: 'norwegian norvegia norway norvegese' },
  { lang: 'he', country: 'IL', nativeName: 'עברית (ישראל)', keywords: 'hebrew israele israel ebraico' },
  { lang: 'th', country: 'TH', nativeName: 'ไทย (ประเทศไทย)', keywords: 'thai thailandia thailand tailandese' },
  { lang: 'vi', country: 'VN', nativeName: 'Tiếng Việt (Việt Nam)', keywords: 'vietnamese vietnam vietnamita' },
  { lang: 'id', country: 'ID', nativeName: 'Bahasa Indonesia (Indonesia)', keywords: 'indonesian indonesia indonesiano' },
  { lang: 'ms', country: 'MY', nativeName: 'Bahasa Melayu (Malaysia)', keywords: 'malay malesia malaysia malese' },
  { lang: 'tl', country: 'PH', nativeName: 'Filipino (Pilipinas)', keywords: 'filipino tagalog filippine philippines' },
  { lang: 'bn', country: 'BD', nativeName: 'বাংলা (বাংলাদেশ)', keywords: 'bengali bangladesh' },
  { lang: 'ur', country: 'PK', nativeName: 'اردو (پاکستان)', keywords: 'urdu pakistan' },
  { lang: 'fa', country: 'IR', nativeName: 'فارسی (ایران)', keywords: 'persian farsi iran persiano' },
  { lang: 'af', country: 'ZA', nativeName: 'Afrikaans / English (South Africa)', keywords: 'south africa sudafrica' },
  { lang: 'sq', country: 'AL', nativeName: 'Shqip (Shqipëria)', keywords: 'albanian albania albanese' },
  { lang: 'am', country: 'ET', nativeName: 'አማርኛ (ኢትዮጵያ)', keywords: 'amharic ethiopia etiopia' },
  { lang: 'hy', country: 'AM', nativeName: 'Հայերեն (Հայաստան)', keywords: 'armenian armenia armeno' },
  { lang: 'az', country: 'AZ', nativeName: 'Azərbaycan (Azərbaycan)', keywords: 'azerbaijani azerbaigian' },
  { lang: 'be', country: 'BY', nativeName: 'Беларуская (Беларусь)', keywords: 'belarusian bielorussia belarus' },
  { lang: 'bs', country: 'BA', nativeName: 'Bosanski (Bosna i Hercegovina)', keywords: 'bosnian bosnia' },
  { lang: 'bg', country: 'BG', nativeName: 'Български (България)', keywords: 'bulgarian bulgaria bulgaro' },
  { lang: 'my', country: 'MM', nativeName: 'မြန်မာ (မြန်မာ)', keywords: 'burmese myanmar birmania' },
  { lang: 'km', country: 'KH', nativeName: 'ខ្មែរ (កម្ពុជា)', keywords: 'khmer cambodia cambogia' },
  { lang: 'ca', country: 'AD', nativeName: 'Català (Andorra)', keywords: 'catalan andorra' },
  { lang: 'hr', country: 'HR', nativeName: 'Hrvatski (Hrvatska)', keywords: 'croatian croazia croatia croato' },
  { lang: 'et', country: 'EE', nativeName: 'Eesti (Eesti)', keywords: 'estonian estonia estone' },
  { lang: 'ka', country: 'GE', nativeName: 'ქართული (საქართველო)', keywords: 'georgian georgia georgiano' },
  { lang: 'is', country: 'IS', nativeName: 'Íslenska (Ísland)', keywords: 'icelandic islanda iceland islandese' },
  { lang: 'ga', country: 'IE', nativeName: 'Gaeilge / English (Éire)', keywords: 'irish irlanda ireland irlandese' },
  { lang: 'kk', country: 'KZ', nativeName: 'Қазақша (Қазақстан)', keywords: 'kazakh kazakistan kazakhstan' },
  { lang: 'ky', country: 'KG', nativeName: 'Кыргызча (Кыргызстан)', keywords: 'kyrgyz kirghizistan' },
  { lang: 'lo', country: 'LA', nativeName: 'ລາວ (ລາວ)', keywords: 'lao laos' },
  { lang: 'lv', country: 'LV', nativeName: 'Latviešu (Latvija)', keywords: 'latvian lettonia latvia lettone' },
  { lang: 'lt', country: 'LT', nativeName: 'Lietuvių (Lietuva)', keywords: 'lithuanian lituania lithuania lituano' },
  { lang: 'lb', country: 'LU', nativeName: 'Lëtzebuergesch (Lëtzebuerg)', keywords: 'luxembourg lussemburgo' },
  { lang: 'mk', country: 'MK', nativeName: 'Македонски (Северна Македонија)', keywords: 'macedonian macedonia' },
  { lang: 'mg', country: 'MG', nativeName: 'Malagasy (Madagasikara)', keywords: 'malagasy madagascar' },
  { lang: 'mt', country: 'MT', nativeName: 'Malti (Malta)', keywords: 'maltese malta' },
  { lang: 'mn', country: 'MN', nativeName: 'Монгол (Монгол)', keywords: 'mongolian mongolia' },
  { lang: 'ne', country: 'NP', nativeName: 'नेपाली (नेपाल)', keywords: 'nepali nepal' },
  { lang: 'ps', country: 'AF', nativeName: 'پښتو (افغانستان)', keywords: 'pashto afghanistan' },
  { lang: 'sr', country: 'RS', nativeName: 'Српски (Србија)', keywords: 'serbian serbia serbo' },
  { lang: 'si', country: 'LK', nativeName: 'සිංහල (ශ්‍රී ලංකාව)', keywords: 'sinhala sri lanka' },
  { lang: 'sk', country: 'SK', nativeName: 'Slovenčina (Slovensko)', keywords: 'slovak slovacchia slovakia slovacco' },
  { lang: 'sl', country: 'SI', nativeName: 'Slovenščina (Slovenija)', keywords: 'slovenian slovenia sloveno' },
  { lang: 'so', country: 'SO', nativeName: 'Soomaali (Soomaaliya)', keywords: 'somali somalia' },
  { lang: 'sw', country: 'KE', nativeName: 'Kiswahili (Kenya)', keywords: 'swahili kenya' },
  { lang: 'sw', country: 'TZ', nativeName: 'Kiswahili (Tanzania)', keywords: 'swahili tanzania' },
  { lang: 'tg', country: 'TJ', nativeName: 'Тоҷикӣ (Тоҷикистон)', keywords: 'tajik tagikistan' },
  { lang: 'tk', country: 'TM', nativeName: 'Türkmençe (Türkmenistan)', keywords: 'turkmen turkmenistan' },
  { lang: 'uz', country: 'UZ', nativeName: 'Oʻzbekcha (Oʻzbekiston)', keywords: 'uzbek uzbekistan' },
  { lang: 'cy', country: 'CY', nativeName: 'Ελληνικά / Türkçe (Κύπρος)', keywords: 'cyprus cipro' },
  { lang: 'de', country: 'AT', nativeName: 'Deutsch (Österreich)', keywords: 'austria tedesco austrian' },
  { lang: 'de', country: 'CH', nativeName: 'Deutsch / Français / Italiano (Schweiz)', keywords: 'switzerland svizzera swiss' },
  { lang: 'fr', country: 'BE', nativeName: 'Français / Nederlands (Belgique)', keywords: 'belgium belgio belgian' },
  { lang: 'en', country: 'CA', nativeName: 'English / Français (Canada)', keywords: 'canada canadese' },
  { lang: 'en', country: 'AU', nativeName: 'English (Australia)', keywords: 'australia australian' },
  { lang: 'en', country: 'NZ', nativeName: 'English (New Zealand)', keywords: 'new zealand nuova zelanda' },
  { lang: 'es', country: 'AR', nativeName: 'Español (Argentina)', keywords: 'argentina' },
  { lang: 'es', country: 'MX', nativeName: 'Español (México)', keywords: 'mexico messico' },
  { lang: 'es', country: 'CO', nativeName: 'Español (Colombia)', keywords: 'colombia' },
  { lang: 'es', country: 'CL', nativeName: 'Español (Chile)', keywords: 'chile cile' },
  { lang: 'es', country: 'PE', nativeName: 'Español (Perú)', keywords: 'peru' },
  { lang: 'es', country: 'VE', nativeName: 'Español (Venezuela)', keywords: 'venezuela' },
  { lang: 'es', country: 'EC', nativeName: 'Español (Ecuador)', keywords: 'ecuador' },
  { lang: 'es', country: 'UY', nativeName: 'Español (Uruguay)', keywords: 'uruguay' },
  { lang: 'es', country: 'PY', nativeName: 'Español (Paraguay)', keywords: 'paraguay' },
  { lang: 'es', country: 'BO', nativeName: 'Español (Bolivia)', keywords: 'bolivia' },
  { lang: 'es', country: 'CU', nativeName: 'Español (Cuba)', keywords: 'cuba' },
  { lang: 'es', country: 'DO', nativeName: 'Español (República Dominicana)', keywords: 'dominican republic repubblica dominicana' },
  { lang: 'es', country: 'CR', nativeName: 'Español (Costa Rica)', keywords: 'costa rica' },
  { lang: 'es', country: 'PA', nativeName: 'Español (Panamá)', keywords: 'panama' },
  { lang: 'es', country: 'GT', nativeName: 'Español (Guatemala)', keywords: 'guatemala' },
  { lang: 'es', country: 'HN', nativeName: 'Español (Honduras)', keywords: 'honduras' },
  { lang: 'es', country: 'SV', nativeName: 'Español (El Salvador)', keywords: 'el salvador' },
  { lang: 'es', country: 'NI', nativeName: 'Español (Nicaragua)', keywords: 'nicaragua' },
  { lang: 'ar', country: 'EG', nativeName: 'العربية (مصر)', keywords: 'egypt egitto arabic' },
  { lang: 'ar', country: 'MA', nativeName: 'العربية (المغرب)', keywords: 'morocco marocco arabic' },
  { lang: 'ar', country: 'DZ', nativeName: 'العربية (الجزائر)', keywords: 'algeria algeria arabic' },
  { lang: 'ar', country: 'TN', nativeName: 'العربية (تونس)', keywords: 'tunisia tunisia arabic' },
  { lang: 'ar', country: 'AE', nativeName: 'العربية (الإمارات)', keywords: 'uae emirates emirati arabic' },
  { lang: 'ar', country: 'QA', nativeName: 'العربية (قطر)', keywords: 'qatar arabic' },
  { lang: 'ar', country: 'KW', nativeName: 'العربية (الكويت)', keywords: 'kuwait arabic' },
  { lang: 'ar', country: 'JO', nativeName: 'العربية (الأردن)', keywords: 'jordan giordania arabic' },
  { lang: 'ar', country: 'LB', nativeName: 'العربية (لبنان)', keywords: 'lebanon libano arabic' },
  { lang: 'ar', country: 'IQ', nativeName: 'العربية (العراق)', keywords: 'iraq arabic' },
  { lang: 'en', country: 'NG', nativeName: 'English (Nigeria)', keywords: 'nigeria' },
  { lang: 'en', country: 'GH', nativeName: 'English (Ghana)', keywords: 'ghana' },
  { lang: 'fr', country: 'SN', nativeName: 'Français (Sénégal)', keywords: 'senegal' },
  { lang: 'fr', country: 'CI', nativeName: 'Français (Côte d’Ivoire)', keywords: 'ivory coast costa avorio' },
  { lang: 'fr', country: 'CM', nativeName: 'Français / English (Cameroun)', keywords: 'cameroon camerun' },
  { lang: 'pt', country: 'AO', nativeName: 'Português (Angola)', keywords: 'angola' },
  { lang: 'pt', country: 'MZ', nativeName: 'Português (Moçambique)', keywords: 'mozambique mozambico' },
  { lang: 'en', country: 'SG', nativeName: 'English / 中文 (Singapore)', keywords: 'singapore' },
  { lang: 'zh', country: 'HK', nativeName: '繁體中文 / English (香港)', keywords: 'hong kong' },
  { lang: 'en', country: 'JM', nativeName: 'English (Jamaica)', keywords: 'jamaica giamaica' },
  { lang: 'sm', country: 'WS', nativeName: 'Gagana Sāmoa (Sāmoa)', keywords: 'samoa' },
  { lang: 'mi', country: 'FJ', nativeName: 'English / Fijian (Fiji)', keywords: 'fiji' },
  { lang: 'dv', country: 'MV', nativeName: 'ދިވެހި (Maldive)', keywords: 'maldives maldive' },
  { lang: 'dz', country: 'BT', nativeName: 'རྫོང་ཁ (Bhutan)', keywords: 'bhutan' },
  { lang: 'ti', country: 'ER', nativeName: 'ትግርኛ (Eritrea)', keywords: 'eritrea' },
  { lang: 'rw', country: 'RW', nativeName: 'Kinyarwanda (Rwanda)', keywords: 'rwanda ruanda' },
  { lang: 'rn', country: 'BI', nativeName: 'Kirundi (Burundi)', keywords: 'burundi' },
  { lang: 'ln', country: 'CD', nativeName: 'Français / Lingála (RD Congo)', keywords: 'congo drc' },
  { lang: 'mg', country: 'MU', nativeName: 'English / Français (Mauritius)', keywords: 'mauritius' },
  { lang: 'sn', country: 'ZW', nativeName: 'Shona / English (Zimbabwe)', keywords: 'zimbabwe' },
  { lang: 'ny', country: 'MW', nativeName: 'Chichewa / English (Malawi)', keywords: 'malawi' },
  { lang: 'st', country: 'LS', nativeName: 'Sesotho (Lesotho)', keywords: 'lesotho' },
  { lang: 'tn', country: 'BW', nativeName: 'Setswana (Botswana)', keywords: 'botswana' },
  { lang: 'en', country: 'NA', nativeName: 'English (Namibia)', keywords: 'namibia' },
  { lang: 'en', country: 'UG', nativeName: 'English (Uganda)', keywords: 'uganda' },
  { lang: 'en', country: 'ZM', nativeName: 'English (Zambia)', keywords: 'zambia' },
  { lang: 'fr', country: 'ML', nativeName: 'Français (Mali)', keywords: 'mali' },
  { lang: 'fr', country: 'NE', nativeName: 'Français (Niger)', keywords: 'niger' },
  { lang: 'fr', country: 'BF', nativeName: 'Français (Burkina Faso)', keywords: 'burkina faso' },
  { lang: 'fr', country: 'TG', nativeName: 'Français (Togo)', keywords: 'togo' },
  { lang: 'fr', country: 'BJ', nativeName: 'Français (Bénin)', keywords: 'benin' },
  { lang: 'fr', country: 'GA', nativeName: 'Français (Gabon)', keywords: 'gabon' },
  { lang: 'fr', country: 'GN', nativeName: 'Français (Guinée)', keywords: 'guinea' },
  { lang: 'fr', country: 'HT', nativeName: 'Kreyòl / Français (Haïti)', keywords: 'haiti' },
  { lang: 'ar', country: 'OM', nativeName: 'العربية (عُمان)', keywords: 'oman' },
  { lang: 'ar', country: 'BH', nativeName: 'العربية (البحرين)', keywords: 'bahrain' },
  { lang: 'ar', country: 'YE', nativeName: 'العربية (اليمن)', keywords: 'yemen' },
  { lang: 'ar', country: 'LY', nativeName: 'العربية (ليبيا)', keywords: 'libya libia' },
  { lang: 'ar', country: 'SD', nativeName: 'العربية (السودان)', keywords: 'sudan' },
  { lang: 'ar', country: 'SY', nativeName: 'العربية (سوريا)', keywords: 'syria siria' },
  { lang: 'ar', country: 'PS', nativeName: 'العربية (فلسطين)', keywords: 'palestine palestina' },
  { lang: 'ro', country: 'MD', nativeName: 'Română (Moldova)', keywords: 'moldova' },
  { lang: 'it', country: 'SM', nativeName: 'Italiano (San Marino)', keywords: 'san marino' },
  { lang: 'it', country: 'VA', nativeName: 'Italiano / Latino (Città del Vaticano)', keywords: 'vatican vaticano' },
  { lang: 'fr', country: 'MC', nativeName: 'Français (Monaco)', keywords: 'monaco' },
  { lang: 'de', country: 'LI', nativeName: 'Deutsch (Liechtenstein)', keywords: 'liechtenstein' },
  { lang: 'sr', country: 'ME', nativeName: 'Crnogorski (Crna Gora)', keywords: 'montenegro' },
  { lang: 'sq', country: 'XK', nativeName: 'Shqip (Kosova)', keywords: 'kosovo' },
  { lang: 'ko', country: 'KP', nativeName: '조선어 (조선)', keywords: 'north korea corea del nord' },
  { lang: 'ms', country: 'BN', nativeName: 'Bahasa Melayu (Brunei)', keywords: 'brunei' },
  { lang: 'pt', country: 'TL', nativeName: 'Português / Tetum (Timor-Leste)', keywords: 'timor leste' },
  { lang: 'pt', country: 'CV', nativeName: 'Português (Cabo Verde)', keywords: 'cape verde capo verde' },
  { lang: 'en', country: 'BS', nativeName: 'English (Bahamas)', keywords: 'bahamas' },
  { lang: 'en', country: 'BB', nativeName: 'English (Barbados)', keywords: 'barbados' },
  { lang: 'en', country: 'TT', nativeName: 'English (Trinidad and Tobago)', keywords: 'trinidad tobago' },
  { lang: 'en', country: 'BZ', nativeName: 'English (Belize)', keywords: 'belize' },
  { lang: 'en', country: 'GY', nativeName: 'English (Guyana)', keywords: 'guyana' },
  { lang: 'nl', country: 'SR', nativeName: 'Nederlands (Suriname)', keywords: 'suriname' },
  { lang: 'en', country: 'PG', nativeName: 'English / Tok Pisin (Papua New Guinea)', keywords: 'papua new guinea' },
];

export function findLocaleOption(lang?: string, country?: string): WorldLocaleOption {
  if (lang && country) {
    const exact = WORLD_LOCALE_OPTIONS.find(
      (o) => o.lang === lang && o.country === country
    );
    if (exact) return exact;
  }
  if (country) {
    const byCountry = WORLD_LOCALE_OPTIONS.find((o) => o.country === country);
    if (byCountry) return byCountry;
  }
  if (lang) {
    const byLang = WORLD_LOCALE_OPTIONS.find((o) => o.lang === lang);
    if (byLang) return byLang;
  }
  return WORLD_LOCALE_OPTIONS[0];
}
