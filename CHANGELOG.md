# سجل التغييرات — PayFairEU

جميع التغييرات الموثّقة لهذا المستودع تُسجّل بالعربية مع التاريخ والإصدار:

## [0.5.0] - 2026-11-24 — Public MIT Open-Source Release (`v0.5.0`)
- ترقية [`package.json`](package.json) إلى **`0.5.0`** وإضافة رخصة [`LICENSE`](LICENSE) (`MIT`) وسير عمل [`GitHub Actions CI`](.github/workflows/ci.yml) ولقطات الواجهة الست في [`docs/screenshots/`](docs/screenshots/) ومعرض الصور في [`README.md`](README.md).
- تجهيز التصدير النظيف إلى مستودع GitHub العام `https://github.com/manea/payfaireu` عبر بوابة الخصوصية `export-public-github.sh` (`EXPORT_CLEAN_OK`).

## [0.4.0] - 2026-11-24
- إطلاق **المرحلة 4 (`v0.4.0`)**: اختبارات المتصفح الحقيقي (`Playwright E2E` على `:4212`) والمراجعة البصرية وحزمة النشر الصفرية `$0`:
  - ترقية [`package.json`](package.json) إلى `0.4.0` وإضافة `"test:e2e": "playwright test"` وتحديث [`tsconfig.json`](tsconfig.json) وإعداد [`playwright.config.ts`](playwright.config.ts) (`:4212`, `google-chrome`).
  - كتابة [`tests/e2e/payfaireu.spec.ts`](tests/e2e/payfaireu.spec.ts) (**`3/3 passed`** خلال `8.4s` عبر مقاسَي `1280×800` و`390×844` بوضعَي `EN LTR / Equity Parchment` و`AR RTL / Boardroom Slate`) شاملةً فحص محفّز المادة 10 وتبريرات الفئات، واختبار مهلة `2026-12-31 -> 2027-02-28` وحارس `GDPR < 3` ومقتطف HTML للمادة 5، ومدقق `CSV`، والختم `PAYF-YYYY-0001`، وتنزيل `UTF-8 BOM CSV`، ومسار `/r/:code` بصفر أخطاء وتجاوز عرض.
  - مراجعة 6 لقطات Chrome حية بصرياً وتصحيح عزل التواريخ الأجنبية في العربية داخل [`src/lib/i18n.ts`](src/lib/i18n.ts) (`(2027-06-07)` دون عكس الأقواس) وإزالة الحد الأدنى الثابت لعرض رسوم `SVG` داخل [`PayFairGapCharts.tsx`](src/components/PayFairGapCharts.tsx) لمنع أي اقتصاص للأرقام على شاشة الجوال `390×844`.

## [0.3.0] - 2026-11-24
- إطلاق **المرحلة 3 (`v0.3.0`)**: الواجهة التفاعلية ثنائية اللغة (`React 19`, `EN LTR / AR RTL`) بمظهري **Equity Parchment** (النهاري) و**Boardroom Slate** (الداكن):
  - بناء [`vite.config.ts`](vite.config.ts) (`:4212`), [`index.html`](index.html), [`public/favicon.svg`](public/favicon.svg), [`src/index.css`](src/index.css) (مع تنسيق `A4 portrait` وعزل الأرقام `num-tabular`)، و[`src/lib/{basePath,i18n,api}.ts`](src/lib/api.ts) للعمل المزدوج (`SQLite WAL` أو `$0 localStorage`).
  - بناء الرسوم البيانية التفاعلية **`SVG`** في [`PayFairGapCharts.tsx`](src/components/PayFairGapCharts.tsx) (توزيع الشرائح `Q1–Q4` بالمنشأة + فجوات الفئات مقابل عتبة المادة 10 `+/- 5%`)، ومحرر القوى العاملة وتبريرات المادة 10 في [`EmployerAndPayGapPanel.tsx`](src/components/EmployerAndPayGapPanel.tsx)، ومدقق إعلانات المادة 5 ومولّد HTML الآمن من XSS وساعة شهرين للمادة 7 وحارس `<3` في [`JobAdAndArt7Panel.tsx`](src/components/JobAdAndArt7Panel.tsx)، ومستورد دفعات `CSV` في [`BatchPayrollCsvPanel.tsx`](src/components/BatchPayrollCsvPanel.tsx)، وعارض التقرير التنفيذي `A4` والمشاركة `/r/:slugOrCode` في [`DossierPreviewAndPrint.tsx`](src/components/DossierPreviewAndPrint.tsx) و[`src/App.tsx`](src/App.tsx).
  - اجتياز `tsc --noEmit` (`0`), **`Vitest` (`8/8 passed` خلال `343ms`)**، `vite build` (`2148 modules` خلال `601ms`)، وفحص SPA الحي (`UI_SMOKE_OK 0.3.0 /payfaireu ROOT=200 SPA=200 FAV=200 JS=200 BASE_INJECT=true`, `PORT_4211_FREE`).

## [0.2.0] - 2026-11-24
- إطلاق **المرحلة 2 (`v0.2.0`)**: الخادم الاختياري **`Node 22 + node:sqlite (WAL)`** على المنفذ `:4211` (`BASE_PATH=/payfaireu`):
  - قاعدة [`server/db.mjs`](server/db.mjs) بوضع `SQLite WAL` وترقيم ذري **`PAYF-YYYY-0001`** عبر `BEGIN IMMEDIATE` وبصمة `SHA-256` متطابقة مع [`src/core/dossierDigest.ts`](src/core/dossierDigest.ts)، وحراسة المنع `409 DOSSIER_LOCKED / ALREADY_LOCKED`، وملفات أصحاب العمل `employer_profiles`، وسجل الأحداث `dossier_events`.
  - خادم [`server/app.mjs`](server/app.mjs) و[`server/index.mjs`](server/index.mjs) بمخارج REST الكاملة: `/api/health`, `/api/presets`, `/api/classify-tier`, `/api/audit-job-ad`, `/api/art7-clock`, `/api/batch-payroll`, `/api/assess-payfaireu`, `/api/profiles`, `/api/dossiers`, `/api/dossiers/:id/{duplicate,finalize,lock,dossier.md,art10-notice.md,job-ad-snippet.html,export.csv,summary}`, والمشاركة العامة `/api/public/reports/:slugOrCode`، وحقن `window.__PAYFAIREU_BASE__` مع حدود `413` للحجم و`429` لمعدل الكتابة.
  - إضافة [`tests/unit/payfaireuServer.test.ts`](tests/unit/payfaireuServer.test.ts) واجتياز `tsc --noEmit` (`0`)، و**`8/8`** `Vitest` (`1.27s`)، والفحص الحي على `:4211` (`SMOKE_OK 0.2.0`, `PORT_4211_FREE`).

## [0.1.0] - 2026-11-24
- إطلاق **المرحلة 1 (`v0.1.0`)**: المواصفة المعمارية ونواة التحليل الإحصائي الصفرية لتوجيه شفافية الأجور الأوروبي **`Directive (EU) 2023/970`** (`src/core/`):
  - تصنيف جدول التبليغ حسب حجم المنشأة وفق **المادة 9** (`>=250` سنوياً من `2027-06-07`، و`150–249` كل 3 سنوات من `2027-06-07`، و`100–149` كل 3 سنوات من `2031-06-07`، و`<100` طوعي أوروبياً) مع موعد التحويل الوطني **`2026-06-07`**.
  - حساب مؤشرات **المادة 9(1)** السبعة بعد التطبيع إلى المكافئ بدوام كامل `FTE`: فجوة المتوسط والوسيط للأجر الإجمالي والمتغيّر، نسب المستلمين للمتغيّر، الشرائح الرُبعية `Q1`–`Q4`، وتحليل فجوات كل فئة وظيفية بين الأجر الأساسي والمتغيّر.
  - تطبيق محفّز **التقييم المشترك للأجور (`Art. 10`)** ذي الشروط التراكمية الثلاثة (`|gap| >= 5.0%` + غياب التبرير الموضوعي + عدم المعالجة خلال `6` أشهر) مع تنبيه حماية الخصوصية (`< 3` موظفين في الخلية).
  - مدقق إعلانات الوظائف **المادة 5** (الإفصاح عن النطاق وحظر سؤال الراتب السابق وعزل العبارات التمييزية وتوليد مقتطف HTML محمي من XSS)، وحاسبة **شهرين** للمادة **7**، ومحلل دفعات الرواتب `CSV` وتصدير `BOM CSV` محمي وختم `SHA-256`.
