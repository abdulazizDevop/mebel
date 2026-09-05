# /compliance — пакет документов по 152-ФЗ для rooomebel.ru

| Файл | Назначение |
|---|---|
| `compliance-report.md` | **Итоговый аудит**: таблица проверок, что заменено в шаблонных текстах, что должен сделать владелец сам |
| `privacy-policy.md`, `personal-data-consent.md`, `marketing-consent.md`, `cookie-policy.md`, `offer.md`, `delivery-payment.md`, `returns.md`, `requisites.md` | Архивные копии текстов, опубликованных на сайте. Генерируются из `src/legal/documents.ts` командой `npx tsx src/scripts/export-legal.ts` — не редактировать вручную |
| `data-map.md` | Карта данных: что, где, зачем, на каком основании, кому передаётся |
| `data-retention-policy.md` | Сроки хранения и порядок удаления/обезличивания |
| `processors.md` | Сторонние сервисы (ТЗ §24) |
| `rkn-checklist.md` | Уведомление в Роскомнадзор и требования к сайту |
| `data-breach-response.md` | Регламент при инциденте (24 ч / 72 ч) |
| `subject-request-procedure.md` | Как отвечать на запросы пользователей |
| `security-checklist.md` | Аудит безопасности (ТЗ §25–§33) |

Версии документов: `LEGAL_VERSION` в `src/legal/documents.ts` и `DOCUMENT_VERSIONS` в `backend/app/legal.py` (обе — `2026-09-06`). При изменении любого текста поднять обе и перегенерировать архивные копии.

Автотесты (ТЗ §34): `cd backend && .venv/bin/python -m pytest` — файл `backend/tests/test_compliance.py`.
