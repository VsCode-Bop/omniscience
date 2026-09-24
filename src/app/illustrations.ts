/**
 * Illustrations vectorielles des modules (cartes de l'accueil, fiches des modules).
 * Tracés faits main, colorés par classes CSS (home.css) : elles suivent le thème et la
 * couleur de la discipline (--cat). Les coordonnées mathématiques (toile d'araignée,
 * loi binomiale, construction optique) sont exactes.
 */

const svg = (body: string) =>
  `<svg viewBox="0 0 320 180" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const GRID = `<path class="i-grid" d="M20 40H300M20 80H300M20 120H300M20 160H300M40 12V172M80 12V172M120 12V172M160 12V172M200 12V172M240 12V172M280 12V172"/>`;

export const ILLUSTRATIONS: Record<string, string> = {
  grapheuse: svg(`
    ${GRID}
    <path class="i-ink" stroke-width="1.5" d="M20 120H296M130 172V16"/>
    <path class="i-ink-fill" d="M300 120l-8-4.5v9zM130 12l-4.5 8h9z"/>
    <path class="i-ink" stroke-width="1.8" opacity=".35" d="M20 100C58 62 94 62 130 100S202 138 240 100 290 64 300 76"/>
    <path class="i-acc" stroke-width="3" d="M26 168C60 40 104 40 130 88S190 150 222 120 268 40 298 16"/>
    <path class="i-ink" stroke-width="1.5" stroke-dasharray="4 5" d="M165 173.4 294 52.5"/>
    <circle class="i-dot" cx="222" cy="120" r="5.5"/>
    <text class="i-math" x="244" y="38" font-size="19" font-style="italic">C<tspan font-size="12" dy="4">f</tspan></text>
  `),

  calculatrice: svg(`
    <rect class="i-ink i-paper" x="98" y="10" width="124" height="160" rx="18" stroke-width="1.6"/>
    <rect class="i-soft" x="111" y="24" width="98" height="52" rx="8"/>
    <text class="i-math" x="120" y="45" font-size="14" font-style="italic">∫ x² dx</text>
    <text class="i-math i-acc-text" x="201" y="67" font-size="16" text-anchor="end" font-style="italic">x³ ∕ 3 + C</text>
    <g class="i-ink" stroke-width="1.3">
      <rect x="112" y="88" width="20" height="15" rx="5"/><rect x="136" y="88" width="20" height="15" rx="5"/><rect x="160" y="88" width="20" height="15" rx="5"/><rect x="184" y="88" width="24" height="15" rx="5"/>
      <rect x="112" y="110" width="20" height="15" rx="5"/><rect x="136" y="110" width="20" height="15" rx="5"/><rect x="160" y="110" width="20" height="15" rx="5"/><rect x="184" y="110" width="24" height="15" rx="5"/>
      <rect x="112" y="132" width="20" height="15" rx="5"/><rect x="136" y="132" width="20" height="15" rx="5"/><rect x="160" y="132" width="20" height="15" rx="5"/>
    </g>
    <rect class="i-acc-fill" x="184" y="132" width="24" height="15" rx="5"/>
    <rect class="i-ink i-paper" x="232" y="44" width="70" height="30" rx="9" stroke-width="1.3"/>
    <text class="i-math" x="267" y="64" font-size="13" text-anchor="middle" font-style="italic">√2 ≈ 1,414</text>
    <rect class="i-ink i-paper" x="20" y="100" width="64" height="30" rx="9" stroke-width="1.3"/>
    <text class="i-math" x="52" y="120" font-size="13" text-anchor="middle" font-style="italic">(a+b)²</text>
  `),

  suites: svg(`
    <path class="i-ink" stroke-width="1.5" d="M30 160H300M40 172V14"/>
    <path class="i-ink" stroke-width="1.4" stroke-dasharray="4 5" d="M40 160 186 14"/>
    <path class="i-acc" stroke-width="3" d="M40 132C90 78 150 52 300 34"/>
    <path class="i-ink" stroke-width="1.5" d="M58 160V114.1H85.9V92.8H107.2V80.7H119.3V75H125V72.6H127.4"/>
    <circle class="i-dot" cx="128.9" cy="70.9" r="5"/>
    <g class="i-acc-fill"><circle cx="58" cy="160" r="3.4"/><circle cx="85.9" cy="160" r="3.4"/><circle cx="107.2" cy="160" r="3.4"/><circle cx="119.3" cy="160" r="3.4"/></g>
    <text class="i-math" x="54" y="176" font-size="11" font-style="italic">u<tspan font-size="8" dy="2">0</tspan></text>
    <text class="i-math" x="82" y="176" font-size="11" font-style="italic">u<tspan font-size="8" dy="2">1</tspan></text>
    <text class="i-math" x="103" y="176" font-size="11" font-style="italic">u<tspan font-size="8" dy="2">2</tspan></text>
    <text class="i-math" x="250" y="30" font-size="15" font-style="italic">y = f(x)</text>
    <text class="i-math i-muted-text" x="178" y="34" font-size="14" font-style="italic">y = x</text>
  `),

  probabilites: svg(`
    <path class="i-ink" stroke-width="1.5" d="M36 156H290"/>
    <path class="i-bars" stroke-width="1.4" d="M52 156v-.4h14v.4M72 156v-4.4h14v4.4M92 156v-20h14v20M112 156v-53.3h14v53.3M132 156v-93.3h14v93.3M152 156v-112h14v112M172 156v-93.3h14v93.3M192 156v-53.3h14v53.3M212 156v-20h14v20M232 156v-4.4h14v4.4M252 156v-.4h14v.4"/>
    <path class="i-ink" stroke-width="1.8" d="M49 155.7L54.5 155.5 60 155.2 65.5 154.6 71 153.7 76.5 152.3 82 150.2 87.5 147.3 93 143.3 98.5 138 104 131.3 109.5 123.1 115 113.5 120.5 102.6 126 91 131.5 79.3 137 68.1 142.5 58.3 148 50.6 153.5 45.7 159 44 164.5 45.7 170 50.6 175.5 58.3 181 68.1 186.5 79.3 192 91 197.5 102.6 203 113.5 208.5 123.1 214 131.3 219.5 138 225 143.3 230.5 147.3 236 150.2 241.5 152.3 247 153.7 252.5 154.6 258 155.2 263.5 155.5 269 155.7"/>
    <rect class="i-ink i-paper" x="30" y="20" width="36" height="36" rx="9" stroke-width="1.5"/>
    <g class="i-ink-fill"><circle cx="40" cy="30" r="2.6"/><circle cx="48" cy="38" r="2.6"/><circle cx="56" cy="46" r="2.6"/></g>
    <text class="i-math" x="228" y="40" font-size="14" font-style="italic">𝓑(10 ; 0,5)</text>
  `),

  arithmetique: svg(`
    <g class="i-ink" stroke-width="1.3">
      <path d="M92 38 62 66M104 38l28 28M55 86 38 112M66 86l14 26M132 86l-10 26M140 86l12 26M34 132l-12 20M42 132l6 20M78 132l-6 20M86 132l8 20"/>
    </g>
    <g class="i-math" font-size="15" text-anchor="middle">
      <text x="98" y="32">360</text><text x="58" y="82">36</text><text x="138" y="82">10</text>
      <text x="37" y="128">4</text><text x="82" y="128">9</text>
    </g>
    <g class="i-prime"><circle cx="120" cy="123" r="10"/><circle cx="154" cy="123" r="10"/><circle cx="20" cy="161" r="10"/><circle cx="49" cy="161" r="10"/><circle cx="70" cy="161" r="10"/><circle cx="97" cy="161" r="10"/></g>
    <g class="i-math i-acc-text" font-size="13" text-anchor="middle">
      <text x="120" y="127.5">2</text><text x="154" y="127.5">5</text><text x="20" y="165.5">2</text><text x="49" y="165.5">2</text><text x="70" y="165.5">3</text><text x="97" y="165.5">3</text>
    </g>
    <text class="i-math" x="186" y="52" font-size="16" font-style="italic">360 = 2³ × 3² × 5</text>
    <path class="i-ink" stroke-width="1.6" d="M204 86h-6v62h6M276 86h6v62h-6"/>
    <g class="i-math" font-size="16" text-anchor="middle"><text x="222" y="110">2</text><text x="256" y="110">−1</text><text x="222" y="138">1</text><text x="256" y="138">3</text></g>
    <text class="i-math i-acc-text" x="240" y="170" font-size="13" text-anchor="middle" font-style="italic">det = 7</text>
  `),

  circuits: svg(`
    <path class="i-ink" stroke-width="2" d="M70 44V84M70 96V140H250V114M250 74V44H174M146 44H70"/>
    <path class="i-ink" stroke-width="2" d="M54 84H86"/>
    <path class="i-ink" stroke-width="5" d="M61 96H79"/>
    <text class="i-math" x="92" y="80" font-size="14">+</text>
    <circle class="i-glow" cx="160" cy="44" r="30" opacity=".18"/>
    <circle class="i-glow" cx="160" cy="44" r="20" opacity=".35"/>
    <circle class="i-ink i-paper" cx="160" cy="44" r="14" stroke-width="2"/>
    <path class="i-ink" stroke-width="1.8" d="M150.1 34.1 169.9 53.9M150.1 53.9 169.9 34.1"/>
    <rect class="i-ink i-paper" x="243" y="74" width="14" height="40" rx="2" stroke-width="2"/>
    <path class="i-conv" stroke-width="2.4" d="M104 37l8 7-8 7M202 37l8 7-8 7M243 128l7 8 7-8"/>
    <g class="i-acc-fill"><circle cx="92" cy="140" r="3.6"/><circle cx="118" cy="140" r="3.6"/><circle cx="144" cy="140" r="3.6"/><circle cx="170" cy="140" r="3.6"/><circle cx="196" cy="140" r="3.6"/><circle cx="222" cy="140" r="3.6"/><circle cx="70" cy="118" r="3.6"/><circle cx="250" cy="58" r="3.6"/></g>
  `),

  optique: svg(`
    <path class="i-ink" stroke-width="1.3" stroke-dasharray="6 5" d="M18 100H302"/>
    <path class="i-lens" stroke-width="1.8" d="M160 26C173 60 173 140 160 174 147 140 147 60 160 26Z"/>
    <path class="i-ink" stroke-width="2.2" d="M80 100V62"/>
    <path class="i-ink-fill" d="M80 57l-5 9h10z"/>
    <path class="i-ray" stroke-width="1.8" d="M80 60H160L264 152.4M80 60 264 152M80 60l35 40 45 51.4H264"/>
    <path class="i-acc" stroke-width="2.4" d="M263 100v46"/>
    <path class="i-acc-fill" d="M263 153l-5-9h10z"/>
    <g class="i-ink" stroke-width="1.5"><path d="M115 95v10M205 95v10"/></g>
    <text class="i-math" x="109" y="120" font-size="13" font-style="italic">F</text>
    <text class="i-math" x="199" y="90" font-size="13" font-style="italic">F′</text>
    <text class="i-math" x="72" y="54" font-size="13" font-style="italic">A</text>
    <text class="i-math i-acc-text" x="270" y="164" font-size="13" font-style="italic">A′</text>
  `),

  mecanique: svg(`
    <path class="i-ink" stroke-width="1.6" d="M20 156H300"/>
    <path class="i-grid" stroke-width="1.2" d="M28 162l-6 6M48 162l-6 6M68 162l-6 6M88 162l-6 6M108 162l-6 6M128 162l-6 6M148 162l-6 6M168 162l-6 6M188 162l-6 6M208 162l-6 6M228 162l-6 6M248 162l-6 6M268 162l-6 6M288 162l-6 6"/>
    <path class="i-ink" stroke-width="1.3" stroke-dasharray="3 5" d="M40 150Q160-90 280 150"/>
    <g class="i-ink i-paper" stroke-width="1.4">
      <circle cx="40" cy="150" r="4.5"/><circle cx="60" cy="113.3" r="4.5"/><circle cx="80" cy="83.3" r="4.5"/><circle cx="100" cy="60" r="4.5"/><circle cx="120" cy="43.3" r="4.5"/><circle cx="140" cy="33.3" r="4.5"/>
      <circle cx="180" cy="33.3" r="4.5"/><circle cx="200" cy="43.3" r="4.5"/><circle cx="220" cy="60" r="4.5"/><circle cx="240" cy="83.3" r="4.5"/><circle cx="260" cy="113.3" r="4.5"/><circle cx="280" cy="150" r="4.5"/>
    </g>
    <circle class="i-dot" cx="160" cy="30" r="6"/>
    <path class="i-acc" stroke-width="2.2" d="M40 150 64 106M100 60l24-20M160 30h28M220 60l24 20"/>
    <path class="i-acc-fill" d="M66.5 101.5l-1.2 9.6-7.4-4zM128.5 36.5l-3.3 9-5.1-6.1zM194 30l-8 4.6v-9.2zM248.5 83.5l-9.6-.9 5.1-6.1z"/>
    <path class="i-ink" stroke-width="1.6" d="M160 36v24"/>
    <path class="i-ink-fill" d="M160 65l-4.2-8h8.4z"/>
    <text class="i-math" x="166" y="60" font-size="13" font-style="italic">P</text>
    <text class="i-math i-acc-text" x="190" y="24" font-size="13" font-style="italic">v</text>
  `),

  fiches: svg(`
    <rect class="i-ink i-paper-2" x="132" y="20" width="128" height="150" rx="12" stroke-width="1.3" opacity=".7"/>
    <rect class="i-ink i-paper" x="100" y="12" width="128" height="156" rx="12" stroke-width="1.5"/>
    <path class="i-acc" stroke-width="3.2" d="M116 32h54"/>
    <path class="i-grid" stroke-width="2.2" d="M116 48h94M116 58h78"/>
    <text class="i-math" x="116" y="84" font-size="13" font-style="italic">f(x) = 3x² − 2x</text>
    <g class="i-ink" stroke-width="1.3"><rect x="116" y="98" width="9" height="9" rx="2.5"/><rect x="116" y="116" width="9" height="9" rx="2.5"/><rect x="116" y="134" width="9" height="9" rx="2.5"/></g>
    <path class="i-acc" stroke-width="1.8" d="M118 102.5l2 2 3.5-4"/>
    <path class="i-grid" stroke-width="2.2" d="M132 102.5h70M132 120.5h58M132 138.5h64"/>
    <rect class="i-chip" x="232" y="132" width="58" height="26" rx="9"/>
    <text class="i-mono i-acc-text" x="261" y="149" font-size="12" text-anchor="middle">.tex</text>
    <rect class="i-chip" x="40" y="40" width="50" height="26" rx="9"/>
    <text class="i-mono i-acc-text" x="65" y="57" font-size="12" text-anchor="middle">.md</text>
  `),
};
