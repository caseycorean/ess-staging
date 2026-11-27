// Specifications recovered for reference vehicles whose records lack them (25 Nov, Claude).
// Each entry: [value, evidence, sourceTitle, url, note] — same shape as catalog fields. Promote to the
// vehicle-reference JSON after QA; until then the resolver reads them from here.
const henry = ['The Henry Ford, 1965 Pontiac Tempest LeMans GTO hardtop', 'https://www.thehenryford.org/collections/explore/artifact/135999'];
const oldride = ['Oldride, 1965 GTO specifications (chassis data)', 'https://www.oldride.com/library/1965_pontiac_gto.html'];
const mueller = ['Mike Mueller, The Complete Book of Ford Mustang (1993 LX V8 coupe)', 'https://fliphtml5.com/zfxcf/kmgt/The_Complete_Book_of_Ford_Mustang_Every_Model_Since_1964_%C2%BD/169/'];
const sx68 = ['Supercar X archive, 1968 Camaro Z/28 (related year)', 'https://web.archive.org/web/20040405085558/http://supercarx.com:80/articles/specifications/z28.htm'];
const carlife65 = ['Car Life 1965 GTO Tri-Power test, as reported by Conceptcarz', 'https://Conceptcarz.com/view/vehicle/z752/news.aspx'];

export const recovered = {
  'pontiac-gto-1st-gen--1965-tri-power-389-m4-hardtop': {
    weight: [3478, 'published', ...henry, 'Museum and factory shipping weight for the GTO hardtop; curb with fluids is higher.'],
    wheelbase: [115, 'published', ...henry], frontTrack: [58, 'published', ...oldride], rearTrack: [58, 'published', ...oldride],
    finalDrive: [4.11, 'independent_test', ...carlife65, 'Test car: close-ratio four-speed and 4.11 limited-slip. Factory ratios 2.56–4.33 were offered.'],
    test60: [5.8, 'independent_test', ...carlife65], testEt: [14.5, 'independent_test', ...carlife65], testTrap: [100, 'independent_test', ...carlife65],
  },
  'ford-mustang-fox--1993-lx-ssp-5.0-m5-notchback': {
    weight: [3035, 'published', ...mueller], wheelbase: [100.5, 'published', ...mueller],
    frontTrack: [56.6, 'published', ...mueller], rearTrack: [57, 'published', ...mueller],
  },
  'chevrolet-camaro-1st-gen--1969-z28-302-m4-3.73-sport-coupe': {
    weight: [3279, 'historical', ...sx68, '1968 Z/28 curb weight from the owner archive; 1969 trim differs. Range 3,250–3,455 lb across sources.'],
    front: [.58, 'historical', ...sx68],
  },
};
