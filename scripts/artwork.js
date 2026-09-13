import { writeFileSync } from 'node:fs';
const wrap = (bg, shapes) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer></filter><pattern id="lines" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M0 22L22 0" stroke="#fff" stroke-opacity=".11"/></pattern></defs><rect width="800" height="520" fill="${bg}"/>${shapes}<rect width="800" height="520" filter="url(#grain)" opacity=".8"/></svg>`;
const art = {
  clay: [
    '#dcb9a2',
    `<circle cx="622" cy="104" r="130" fill="#eacdb5"/><path d="M0 375Q300 325 800 388V520H0Z" fill="#b78164"/><ellipse cx="382" cy="419" rx="227" ry="30" fill="#8e594b" opacity=".3"/><path d="M207 220Q215 420 390 426Q565 422 572 220Z" fill="#b2674d"/><ellipse cx="390" cy="220" rx="183" ry="62" fill="#e8ba92"/><ellipse cx="390" cy="222" rx="150" ry="44" fill="#8f4939"/><path d="M240 275Q392 330 539 275M254 323Q392 377 523 323M277 366Q393 408 501 365" fill="none" stroke="#c5835e" stroke-width="9"/><path d="M94 351L161 187L187 198L122 362Z" fill="#f5dbc0"/><path d="M616 397L654 269L672 273L640 404Z" fill="#493d32"/><circle cx="114" cy="100" r="37" fill="none" stroke="#f7e4c6" stroke-width="3"/>`,
  ],
  coffee: [
    '#c5cbb5',
    `<path d="M0 344L800 290V520H0Z" fill="#8d9a79"/><ellipse cx="413" cy="420" rx="215" ry="39" fill="#52634e" opacity=".25"/><ellipse cx="383" cy="409" rx="177" ry="44" fill="#e2e3c8"/><path d="M515 240C670 210 639 390 521 351" fill="none" stroke="#f4eedb" stroke-width="32"/><path d="M238 236L262 359Q277 405 385 405Q494 406 515 357L534 236Z" fill="#f6efdc"/><ellipse cx="386" cy="236" rx="148" ry="48" fill="#e1d3b4"/><ellipse cx="386" cy="237" rx="122" ry="33" fill="#694837"/><path d="M386 235c-65-55-72 16 0 22 68-8 62-78 0-22" fill="#e8d4a7"/><path d="M360 155C312 120 394 112 360 76M425 150C380 121 467 110 432 62" fill="none" stroke="#edf0da" stroke-width="9" stroke-linecap="round"/><path d="M66 427L127 175L191 191L122 440Z" fill="#dde2c8"/><path d="M675 45L747 45L747 161L675 161Z" fill="url(#lines)"/>`,
  ],
  wellbeing: [
    '#e5cd94',
    `<circle cx="598" cy="125" r="69" fill="#f9e8b4"/><path d="M0 320Q120 210 320 330Q540 205 800 313V520H0Z" fill="#a9af7e"/><path d="M0 410Q390 320 800 420V520H0Z" fill="#697f62"/><ellipse cx="402" cy="442" rx="166" ry="20" fill="#425d4c"/><path d="M342 273Q398 250 456 275L475 371H325Z" fill="#ece4ce"/><circle cx="400" cy="219" r="44" fill="#ae704f"/><path d="M358 213Q343 151 406 164Q455 155 445 221Q419 169 358 213" fill="#343e30"/><path d="M351 309L279 367L303 389L376 337M447 309L521 367L497 389L425 337" fill="#ae704f"/><path d="M331 365Q227 410 298 430L399 400L497 430Q570 413 471 365Z" fill="#bc7452"/><path d="M94 456V281M93 363Q30 352 38 299Q94 300 94 363M95 332Q156 311 147 267Q96 276 95 332" fill="#395a45" stroke="#395a45" stroke-width="7"/>`,
  ],
  photography: [
    '#aab9c5',
    `<circle cx="646" cy="100" r="65" fill="#e8d8b2"/><path d="M0 141L143 104L143 424H0Z" fill="#7c909b"/><path d="M658 212L800 160V520H658Z" fill="#718897"/><path d="M0 419L800 358V520H0Z" fill="#627887"/><path d="M310 180Q399 15 524 181" fill="none" stroke="#39484a" stroke-width="18"/><rect x="180" y="185" width="424" height="242" rx="31" fill="#344446"/><path d="M299 185L322 147H467L491 185" fill="#344446"/><rect x="205" y="210" width="62" height="35" rx="7" fill="#bdc9c2"/><circle cx="397" cy="308" r="94" fill="#c9d2c9"/><circle cx="397" cy="308" r="76" fill="#526765"/><circle cx="397" cy="308" r="55" fill="#283c3e"/><circle cx="378" cy="289" r="20" fill="#809d9f"/><path d="M61 176h31m-31 41h31m-31 41h31M704 258h36m-36 45h36" stroke="#c4d0ce" stroke-width="12"/>`,
  ],
  garden: [
    '#bdc8a0',
    `<circle cx="162" cy="115" r="81" fill="#e3dfb6"/><path d="M0 405Q400 360 800 420V520H0Z" fill="#92a17a"/><ellipse cx="411" cy="452" rx="162" ry="26" fill="#5c7751" opacity=".35"/><path d="M304 307L335 449Q410 477 482 449L515 307Z" fill="#b76d4e"/><path d="M297 302H520V338H297Z" fill="#ce8963"/><ellipse cx="408" cy="301" rx="112" ry="28" fill="#e0a47d"/><ellipse cx="408" cy="299" rx="91" ry="18" fill="#6a5139"/><path d="M409 298V114M410 241L316 192M410 201L499 139" stroke="#426544" stroke-width="9" fill="none"/><path d="M408 187Q317 188 326 104Q411 96 408 187M410 238Q502 246 516 171Q428 154 410 238M350 211Q265 211 265 150Q331 138 350 211M411 143Q475 113 449 55Q382 73 411 143" fill="#4d7650"/><path d="M653 457V234M654 336Q603 322 608 278Q663 281 654 336M654 285Q710 275 710 222Q656 224 654 285" fill="#769363" stroke="#769363" stroke-width="7"/>`,
  ],
};
for (const [name, [bg, shapes]] of Object.entries(art))
  writeFileSync(`public/assets/${name}.svg`, wrap(bg, shapes));
