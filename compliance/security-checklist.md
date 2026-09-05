# Чек-лист безопасности (ТЗ §25–§30) — rooomebel.ru

Дата аудита: 06.09.2026. Статусы: ✅ PASS · ⚠️ MANUAL ACTION (нужно действие владельца/на сервере) · 🔴 FAIL.

| Проверка | Статус | Доказательство (файл / строка) | Остаточный риск / что сделать |
|---|---|---|---|
| HTTPS / TLS | ✅ | certbot на host-nginx (`deploy/nginx-host.conf`, комментарии); сайт открывается по https://rooomebel.ru | ⚠️ раз в квартал проверять автопродление: `certbot renew --dry-run` |
| HSTS | ✅ (после деплоя) | `deploy/nginx-host.conf`: `Strict-Transport-Security max-age=15552000; includeSubDomains` | Через месяц поднять до 31536000 + preload. Применить: скопировать файл в `/etc/nginx/sites-enabled/mebel`, `nginx -t && systemctl reload nginx` (certbot-строки не трогать) |
| CSP | ⚠️ | `deploy/nginx.conf`: `Content-Security-Policy-Report-Only` (Метрика + S3 разрешены) | Неделю смотреть DevTools → Console на нарушения, затем переименовать заголовок в `Content-Security-Policy` |
| X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy | ✅ | `deploy/nginx.conf` (server + /assets/ + /static/), `backend/app/main.py::security_headers` | — |
| CORS | ✅ | `backend/app/main.py`: `allow_origins=settings.cors_origin_list` (список из `.env`, не `*`) | ⚠️ проверить, что `CORS_ORIGINS=https://rooomebel.ru,https://www.rooomebel.ru` на сервере |
| CSRF | ✅ | аутентификация — Bearer JWT в заголовке, cookie-сессий нет → классический CSRF неприменим; `form-action 'self'` в CSP | — |
| XSS | ✅ | React экранирует вывод; `dangerouslySetInnerHTML` в `src/` не используется; тексты чата выводятся как текст; CSP report-only | — |
| SQL-инъекции | ✅ | только SQLAlchemy ORM/параметризованные запросы; `ilike` с параметром (`products.py:73`) | — |
| IDOR | ✅ | `orders.py`: `GET /orders/me` фильтр по `customer_id`; `send_chat_as_customer` проверяет владельца; гостевые endpoints только для непривязанных заказов (`_guest_order`); `consents.py`: только свои строки. Тесты 12–13 | — |
| Session fixation / expiration | ✅ | JWT stateless, `JWT_EXPIRE_MINUTES=720` (12 ч), выдаётся заново при входе; смена `JWT_SECRET` инвалидирует все | ⚠️ при инциденте — сменить `JWT_SECRET` |
| Secure / HttpOnly / SameSite cookie | ✅ n/a | сервер не выставляет cookie; JWT хранится в `localStorage` (стандарт для SPA без SSR) | риск XSS-кражи токена снижен CSP и отсутствием сторонних скриптов до согласия |
| Rate limiting / brute-force | ✅ | `slowapi`: login 10/мин, register 5/мин, delete 5/мин, consents 30/мин, аудио 20/мин (`customers.py`, `auth.py`, `consents.py`, `uploads.py`) | ⚠️ ключ — X-Forwarded-For от nginx; не выставлять `api` наружу напрямую |
| Password reset | ✅ n/a | функции «восстановить пароль» нет (нет e-mail у покупателей); восстановление — через владельца вручную после идентификации | при добавлении e-mail — реализовать одноразовые ссылки с TTL |
| Перечисление пользователей (enumeration) | ⚠️ | регистрация возвращает 409 «имя занято» (нужно для UX); логин — единый ответ 401 | приемлемо; rate limit 5/мин ограничивает перебор |
| Хеширование паролей | ✅ | `backend/app/security.py`: `CryptContext(schemes=["bcrypt"])`, cost по умолчанию 12; тест 15 | bcrypt — современный аналог Argon2id, допустимо по ТЗ |
| Пароли в логах/аналитике | ✅ | логи не печатают тела запросов; аналитика не получает пароли (`trackEvent` только тип события) | — |
| Токены в логах | ✅ | `main.py::_RedactTokensFilter` (uvicorn), `access_log off` для `/ws/` в обоих nginx | ⚠️ применить host-nginx конфиг на сервере |
| API authentication / authorization | ✅ | `deps.py`: `require_section`, `require_role`, `CurrentCustomer` с проверкой `kind`; тест 14 | — |
| Доступ к админ-панели | ✅ | роли `admin / manager / viewer` + разделы; покупательский JWT (`kind=customer`) не проходит `get_current_user` | ⚠️ владелец: сменить bootstrap-пароль администратора, если ещё «admin/admin» |
| Загрузка файлов | ✅ | `storage.py`: белый список MIME, лимит 10 МБ, UUID-имена, аудио перекодируется ffmpeg (`-t`, `-fs`, timeout), только собственные URL принимаются в чат (`is_own_storage_url`) | — |
| Зависимости | ⚠️ | `backend/requirements.txt` с пином версий; `package-lock.json` | владелец/разработчик: `npm audit`, `pip list --outdated` раз в квартал |
| `.env` / секреты | ✅ | `.env` в `.gitignore`; в git только `*.example`; история чиста (тест 20); фронтенд получает только `VITE_*` (тест 19) | ⚠️ на сервере `chmod 600 /opt/mebel/.env` |
| API-ключи | ✅ | S3-ключи, VAPID, JWT — только в `.env` на сервере | ⚠️ ротация раз в год |
| История Git | ✅ | `git log --all -- .env backend/.env` пуст | — |
| Логи сервера | ⚠️ | docker json-logs без ограничения размера; nginx-логи по умолчанию | владелец: в `docker-compose.yml` добавить `logging: {driver: json-file, options: {max-size: "50m", max-file: "5"}}`; `logrotate` для nginx — 14 дней |
| Резервные копии (ТЗ §30) | 🔴 | не настроены | владелец: включить снимки VPS в панели TimeWeb (РФ) или cron `pg_dump` → шифрование (`age`/`gpg`) → S3 TimeWeb; хранить 30 дней; ограничить доступ ключом владельца; раз в квартал проверять восстановление |
| Локализация БД / бэкапов | ✅ / ⚠️ | БД и S3 — TimeWeb, РФ (data-map.md) | бэкапы после настройки — тоже только в РФ |
| Яндекс.Метрика (ТЗ §31) | ✅ | `src/analytics/metrika.ts`: загрузка только при `analytics=true`; Webvisor выкл.; cookie `_ym_*` появляются только после согласия; `/cookies` и `/privacy` описывают это | ⚠️ счётчик включается переменной `VITE_METRIKA_ID` при сборке (сейчас не задан) |
| Реклама без согласия (ТЗ §32) | ✅ | `customers.marketing_allowed` по умолчанию false; отдельный чекбокс; отзыв → false (`consents.py::withdraw`); тесты 4, 17 | владелец: перед любой рассылкой брать список только с `marketing_allowed = true` |
| Мобильные экраны (ТЗ §33) | ✅ | тексты `break-words`, чекбокс `items-start`, баннер cookie над нижней навигацией с safe-area, модалка `max-h-[90dvh] overflow-y-auto` | ⚠️ визуальная проверка на iPhone/Android после деплоя |
