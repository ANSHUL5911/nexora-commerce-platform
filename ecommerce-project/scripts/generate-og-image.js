import sharp from 'sharp';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const width = 1200;
const height = 630;

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111111"/>
      <stop offset="50%" stop-color="#161616"/>
      <stop offset="100%" stop-color="#0C0C0C"/>
    </linearGradient>
    <pattern id="archGrid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#222222" stroke-width="0.75" stroke-opacity="0.4"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  <rect width="${width}" height="${height}" fill="url(#archGrid)"/>

  <!-- Outer Architectural Framing Borders -->
  <rect x="48" y="48" width="1104" height="534" fill="none" stroke="#2E2D29" stroke-width="1"/>
  <rect x="56" y="56" width="1088" height="518" fill="none" stroke="#3D3A33" stroke-width="1" stroke-dasharray="6 6"/>

  <!-- Corner registration marks -->
  <path d="M 40 48 L 56 48 M 48 40 L 48 56" stroke="#C5A880" stroke-width="1.5"/>
  <path d="M 1144 48 L 1160 48 M 1152 40 L 1152 56" stroke="#C5A880" stroke-width="1.5"/>
  <path d="M 40 582 L 56 582 M 48 574 L 48 590" stroke="#C5A880" stroke-width="1.5"/>
  <path d="M 1144 582 L 1160 582 M 1152 574 L 1152 590" stroke="#C5A880" stroke-width="1.5"/>

  <!-- Brand Wordmark Header -->
  <text x="88" y="116" font-family="system-ui, sans-serif" font-size="14" font-weight="600" letter-spacing="6" fill="#C5A880">NEXORA ARCHIVE &amp; INDUSTRIAL DESIGN</text>
  <text x="1112" y="116" font-family="monospace" font-size="13" letter-spacing="2" fill="#7A776F" text-anchor="end">REG. SPECIMEN 07.26 // FORM &amp; FUNCTION</text>

  <!-- Divider Rule -->
  <line x1="88" y1="140" x2="1112" y2="140" stroke="#2E2D29" stroke-width="1"/>

  <!-- Main Display Typography -->
  <text x="88" y="240" font-family="Georgia, serif" font-size="58" font-weight="400" fill="#F4F3F0" letter-spacing="-1">Material Before Ornament.</text>
  <text x="88" y="315" font-family="Georgia, serif" font-size="58" font-weight="400" font-style="italic" fill="#C5A880" letter-spacing="-0.5">Form Following Discipline.</text>

  <!-- Editorial Subcopy -->
  <text x="88" y="380" font-family="system-ui, sans-serif" font-size="20" fill="#A29F96">
    Precision mechanical equipment, architectural instruments, and archival design objects
  </text>
  <text x="88" y="412" font-family="system-ui, sans-serif" font-size="20" fill="#A29F96">
    curated with uncompromising craft standards and authentic provenance.
  </text>

  <!-- Archival Specimen Stamp in Right Flank -->
  <g transform="translate(850, 190)">
    <circle cx="130" cy="130" r="105" fill="#161513" stroke="#3D3A33" stroke-width="1.5"/>
    <circle cx="130" cy="130" r="90" fill="none" stroke="#C5A880" stroke-width="1" stroke-dasharray="3 3"/>
    <circle cx="130" cy="130" r="4" fill="#C5A880"/>
    <line x1="130" y1="40" x2="130" y2="70" stroke="#C5A880" stroke-width="1.5"/>
    <line x1="130" y1="190" x2="130" y2="220" stroke="#C5A880" stroke-width="1.5"/>
    <line x1="40" y1="130" x2="70" y2="130" stroke="#C5A880" stroke-width="1.5"/>
    <line x1="190" y1="130" x2="220" y2="130" stroke="#C5A880" stroke-width="1.5"/>
    <text x="130" y="115" font-family="monospace" font-size="11" letter-spacing="3" fill="#C5A880" text-anchor="middle">CURATED SPECIMEN</text>
    <text x="130" y="148" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#F4F3F0" text-anchor="middle">07.26</text>
    <text x="130" y="168" font-family="monospace" font-size="10" letter-spacing="2" fill="#7A776F" text-anchor="middle">TOKYO // BERLIN</text>
  </g>

  <!-- Footer Metadata Bar -->
  <line x1="88" y1="490" x2="1112" y2="490" stroke="#2E2D29" stroke-width="1"/>
  <text x="88" y="530" font-family="monospace" font-size="13" letter-spacing="2" fill="#7A776F">SPECIFICATION: MECHANICAL CHRONOGRAPH ARCHIVE</text>
  <text x="600" y="530" font-family="monospace" font-size="13" letter-spacing="2" fill="#7A776F" text-anchor="middle">CALIBRE NX-100</text>
  <text x="1112" y="530" font-family="monospace" font-size="13" letter-spacing="2" fill="#C5A880" text-anchor="end">NEXORA.DESIGN</text>
</svg>
`;

async function generate() {
  const targetWebp = path.join(__dirname, '..', 'public', 'images', 'products', 'mechanical-chronograph-specimen.webp');
  const targetPng = path.join(__dirname, '..', 'public', 'images', 'products', 'mechanical-chronograph-specimen.png');

  await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(targetWebp);
  await sharp(Buffer.from(svg)).png().toFile(targetPng);
  console.log('Successfully wrote', targetWebp, 'and', targetPng);
}

generate().catch(console.error);
