/**
 * Renders the on-site legal documents (src/legal/documents.ts) to Markdown in
 * /compliance so the archived copies can never drift from what users see.
 *
 *   npx tsx src/scripts/export-legal.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGAL_SLUGS, LEGAL_VERSION, legalDocuments, type LegalBlock, type LegalDocument, type LegalSlug } from '../legal/documents';

const FILES: Record<LegalSlug, string> = {
  requisites: 'requisites.md',
  privacy: 'privacy-policy.md',
  'personal-data-consent': 'personal-data-consent.md',
  cookies: 'cookie-policy.md',
  'marketing-consent': 'marketing-consent.md',
  offer: 'offer.md',
  'delivery-payment': 'delivery-payment.md',
  returns: 'returns.md',
};

function renderBlock(b: LegalBlock): string {
  switch (b.t) {
    case 'h':
      return `## ${b.text}\n`;
    case 'p':
      return b.strong ? `**${b.text}**\n` : `${b.text}\n`;
    case 'ul':
      return b.items.map((i) => `- ${i}`).join('\n') + '\n';
    case 'kv':
      return b.rows.map((r) => `- **${r.label}:** ${r.href ? `[${r.value}](${r.href})` : r.value}`).join('\n') + '\n';
    case 'link':
      return `[${b.label}](${b.href})\n`;
    case 'cookie-settings':
      return '_Настройки cookie доступны в интерфейсе сайта: кнопка «Настройки cookie» в футере и на странице /cookies._\n';
    default:
      return '';
  }
}

function render(doc: LegalDocument): string {
  const head = [
    `# ${doc.title}`,
    '',
    `> Опубликовано: https://rooomebel.ru${doc.path} · версия документа: ${LEGAL_VERSION}`,
    '> Файл сгенерирован из `src/legal/documents.ts` (`npx tsx src/scripts/export-legal.ts`) — не редактировать вручную.',
    '',
  ];
  if (doc.versionLabel) head.push(`_${doc.versionLabel}_`, '');
  return head.concat(doc.blocks.map(renderBlock)).join('\n');
}

const outDir = resolve(process.cwd(), 'compliance');
mkdirSync(outDir, { recursive: true });
for (const slug of LEGAL_SLUGS) {
  const file = resolve(outDir, FILES[slug]);
  writeFileSync(file, render(legalDocuments[slug]), 'utf-8');
  console.log(`✓ ${FILES[slug]}`);
}
