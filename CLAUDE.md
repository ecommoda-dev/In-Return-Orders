<div dir="rtl" style="text-align: right;">

# طابور «في طريق الرجوع» — In-Return Orders (`In-Return-Orders`)

![version](https://img.shields.io/badge/worker-v1.0.0-blue)

**بتعمل إيه:** بترجّع الأوردرات اللي حالتها **`In-Return`** — مرتجعة وفي طريقها
للمخزن و**محدش سجّل لها `Returned`** لسه — في الشحنة الأصلية
(`custom.manual_status`) أو دورة الاستبدال/الاسترجاع (`custom.status_2_r_e`).
**مين بيستخدمها:** الشحن والتحصيل
**الإصدار:** `1.0.0` (`WORKER_VERSION` في `index.js`)

> 🔴 **الريبو ده Worker وبس — مفيش واجهة هنا ومفيش نسخة مستقلة.** الواجهة
> الوحيدة هي **`In-Return-Orders.html`** جوّه `Delivery-COD-Operations-Center`
> (قسم «الحالات الانتقالية»، تحت «تحت التوصيل (Shipped)»).
> ⛔ ممنوع يتضاف `index.html` هنا: نسخة مستقلة معناها مفتاح `localStorage` تاني
> وسر تاني وشاشة دخول تانية.

> 🔴 **قراءة بحتة — صفر كتابة.** مفيش `metafieldsSet` ومفيش `orderCancel` ومفيش
> صف D1، **ومفيش `[[d1_databases]]` في `wrangler.toml` أصلاً**.
> ⛔ أول ما يتضاف أي فعل: الـ binding يترجع (اسمه `DB` **بالحرف**)، و`tool`
> يتسجّل في `ecommoda-constants` §7.1 و`type` في `log-values.json` بتاع الريبو
> **في نفس الـ commit** (Rule 7).

## الروابط

```
الـ Worker : https://in-return-orders-worker.ecommoda-dev.workers.dev
الواجهة    : https://ecommoda-dev.github.io/Delivery-COD-Operations-Center/In-Return-Orders.html
D1         : ❌ الأداة مابتلمسش السجل
مجموعة السر : delivery_cod_ops   ← 🔴 مش سر فريد للأداة دي · ومستقلة عن المخزن
```

## ليه الطابور ده موجود

`ecommoda-order-lifecycle` قاعدة ١٢: **`In-Return` تتعامل زي `Shipped` في العدّ
والفلوس.** لكن طابور «المشحون» اتبنى على `Shipped` **بالحرف** (قرار أحمد
15-09-2026)، والبند «`In-Return` مش في طابور مشحون» فضل مفتوح في `CLAUDE.md`
بتاع الهب. النتيجة: المرتجعات اللي في الطريق كانت **برّه أي طابور** في الهب.
**الحل اللي أحمد اختاره (01-11-2026): طابور مستقل مش توسيع «المشحون»** — فتعريف
«المشحون» وأرقامه ما اتلمسوش.

- ⚠️ الأوردر بيتنقل من «المشحون» لـ«في طريق الرجوع» لما حالته تتغيّر (حدث RTO
  بيكتب `In-Return`) ومابيتعدّش في الاتنين — الطابورين قيمتين منفصلتين.
- ⚠️ `In-Return` بتتكتب من **مصدرين**: `Bosta-Webhook-Status-Receiver` (حدث `RTO`،
  أو `EXCHANGE`/`CUSTOMER_RETURN_PICKUP` بعد الحدث 23) والكتابة اليدوية من
  `Order-Status-Updater`. الطابور مايفرّقش — بيقرا القيمة.

## Endpoints

| `action` | Method | بيعمل إيه |
|---|---|---|
| `get_config` | GET | `WORKER_VERSION` — الواجهة بتقارنه بـ`min` |
| `diag` | GET | فحص ذاتي بلا كتابة — **مصفوفة `[{ ok, label, detail, hint }]`** |
| **`get_in_return_queue`** | GET | أوردرات `In-Return` (الماكينتين) بحقولها الخام — **من `01/04/2026` وطالع** |

> 🔴 **انحراف مقصود ومكتوب:** مفيش `check_employee`/`register_pin`/
> `verify_employee`/`log_logout`/`get_employees`/`get_logs*`/`appId`. الأداة
> مابتكتبش في D1 فمفيش سجل يتفلتر، والدخول بيحصل **مرة واحدة** في `index.html`
> بتاع الهب. نقطة endpoint بلا مستهلك = سطح بلا لازمة.

## 🔴 الاستعلام بيسأل عن الحالة + أرضية التاريخ

```
created_at:>='<بداية 01/04/2026 بتوقيت القاهرة>'     ← الأرضية
  AND metafields.custom.manual_status:'In-Return'    ← الشحنة الأصلية
  AND … أو … status_2_r_e:'In-Return'                ← دورة الاستبدال/الاسترجاع
```

- 🔴 **الأرضية `QUEUE_MIN_CREATED_DAY = '2026-04-01'` نفس قيمة ونفس دالة**
  (`cairoDayStartUtcISO`) `ready-orders-worker` و`shipped-orders-worker` —
  وأي تعديل فيها ينزل على التلاتة في **نفس التمريرة** (درس R1). بتترجع في
  الرد (`minCreatedDay`/`minCreatedAt`) وفي `diag` والواجهة بتكتبها جنب الرقم.
- ⛔ **وممنوع نبعت `created_at:>=2026-04-01` مجرّد** — تفسير التاريخ المجرّد
  مش مضمون، والتاريخ الكامل بـ`Z` بيشيل الغموض.
- 🔴 **مفيش فلتر تشغيلي زيادة** (زون · مندوب · تغليف) — أوردر **بيختفي في
  صمت**. القاعدة: يبان وعليه علامة (قاعدة ١٣ و١٤).
- ⛔ **وممنوع فلتر على ميتافيلد مش قابل للفلترة** — الحقلين المستخدمين
  (`manual_status` · `status_2_r_e`) **مؤكَّدين قابلين للفلترة**.
- ⚠️ **قيمة `In-Return` بشرطة** — بتتكتب بين علامتي تنصيص زي الباقي.
  **ما اتجرّبتش على شوبيفاي حقيقية** (الاستعلام نفسه مطابق في الشكل للطابورين
  التانيين بس بقيمة مختلفة) — أول فتح بعد النشر هو الاختبار الفعلي.

## الحقول الراجعة — عقد مع الواجهة

نفس شكل `shipped-orders-worker` 1.2.0 **بالحرف**: `orderId` (رقمي) · `orderGid` ·
`orderName` · `createdAt` · `cancelledAt` · `fulfillment` · `financial` ·
`customer` · `address1`/`address2` · `city` · `province` · `itemsQty` · `total` ·
`currency` · `zone` · `courier` · `s1` · `s2` · `packedAtS1`/`S2` ·
`packedByS1`/`S2` · `trackingS1`/`S2` · `trackingLegacy`.

- ⚠️ **الشكل عقد**: `ecoShapeRow` و`ecoFlags` و`ecoCod` في `shared/dco-rules.js`
  بيقروا المفاتيح بالاسم. تغيير اسم مفتاح = عمود بيرجع `—` بلا أي خطأ.
- 🔴 `currentTotalPriceSet` مش `totalPriceSet` (قاعدة ٣) · 🔴 `orderId` رقمي ·
  🔴 رقم التتبع **بماكينة الصف** في الواجهة (صف S2 بياخد `…_s2`).
- ⚠️ **`queryCost`** في الرد مصفوفة تفصيل لكل استعلام (`{ op, pages, truncated,
  requested, actualMax }`) — **للقياس بس، صفر اعتماد من الواجهة عليه**.

## 🔴 سلسلة السقوف

```
① الواجهة    CHUNK           = —    ← مفيش دفعة: الأداة عرض بحت
② الـ Worker  MAX_BATCH       = —    ← مفيش endpoint بياخد مصفوفة
③ شوبيفاي     QUEUE_PAGE_SIZE = 40   ← تكلفة، مش عدد
              QUEUE_MAX_PAGES = 20   ← حارس حلقة (٨٠٠ أوردر لكل ماكينة)
```

- **مصدر الحالة (⑪ ⑤): `In-Return` عابرة وبتتراكم لحد `Returned`** — فالسقف
  مشتق من «المشحون» (٢٠) مش «الجاهز» (١٢). ⚠️ **مش مقيس على الحالة دي** —
  حجمها الحقيقي مجهول. لو `truncated: true` ظهرت، ده أول قياس.
- ⛔ **متطلّعش `QUEUE_PAGE_SIZE` من غير قراءة `actualQueryCost`** (في `queryCost`
  أو في `diag`).

## CORS

**Option B — قايمة صارمة** (`https://ecommoda-dev.github.io`). انحراف موثّق عن
Step 3 (أداة قراءة → wildcard): الرد فيه اسم العميل وعنوانه ومبلغ التحصيل،
ومستهلكه واحد معروف. الحماية الفعلية `WORKER_SECRET`.

## التوقيت

`Africa/Cairo` بـ`Intl` (`constants` §13) — مصر رجعت UTC+2 يوم 29-10-2026، وأي
إزاحة ثابتة غلط **بلا شكوى**.

## النشر

> 🔴 **قاعدة النشر:** دمج في `main` = `npx wrangler deploy` = **مفعّل ١٠٠٪،
> ومفيش Promote**. push على فرع = نسخة بس. **إضافة/تدوير سر من الداشبورد**
> = نسخة جديدة مش منشورة → **Promote إلزامي**.
> ⛔ **ممنوع تتكتب هنا أي جملة عن «النسخة النشطة دلوقتي»** — مصدرها Version
> History على كلاودفلير، وأي نسخة منها في ملف بتبوظ مع أول دمج.

### خطوات الإنشاء — ⛔ **لسه ما اتعملتش** (الأداة جديدة)

| # | الخطوة | من غيرها |
|---|---|---|
| ① | إنشاء Worker باسم **`in-return-orders-worker`** بالظبط (قاعدة §5.1: اسم الريبو بلا `-worker`) | الرابط في `ECO_WORKERS.inReturn.url` مايردّش |
| ② | ربط Workers Builds على الريبو ده (`main`) | أي push مابينشرش |
| ③ | **`Build watch paths`: chip لـ`index.js` وchip منفصل لـ`wrangler.toml`** (مش الاتنين في سطر واحد) | **مفيش build أبدًا** بلا أي رسالة |
| ④ | **`WORKER_SECRET` = قيمة مجموعة `delivery_cod_ops`** → **Promote** | كل نداء `401` |
| ⑤ | `CLIENT_ID` + `CLIENT_SECRET` → **Promote** | OAuth بيفشل والطابور بيقع |
| ⑥ | تسجيل الأداة عضو في **`delivery_cod_ops`** في `ecommoda-constants` → `references/secret-groups.md` | إجراء التدوير بيتكسر **بصمت** |

> ⚠️ **الخطوة ⑥ خارج الريبو ده** (مهارة `ecommoda-constants`) — مش اتعملت.
> ⚠️ **ومفيش `tool`/`type` يتسجّل** — الأداة مابتكتبش أي صف.
> ⚠️ **`[vars]` في `wrangler.toml` بس** — ممنوع تضيف أو تعدّل `SHOP_DOMAIN`
> بإيدك في الداشبورد (أول push بيدهسها).
> قبل ①–⑤: الصف في الرئيسية بيقول «تعذّر» والحارس بيسمّي «في طريق الرجوع».

## مسائل مفتوحة

- 🔴 **خطوات النشر ①–⑥ فوق** — الأداة جديدة ومحتاجة إنشاء Worker وأسراره.
- 🟡 **`QUEUE_MAX_PAGES = 20` مش مقيس** على `In-Return` — راجع قسم السقوف.
- 🟡 **`read_all_orders` مش من صلاحيات التطبيق** — شوبيفاي بتخفي أي أوردر أقدم
  من ٦٠ يوم بلا خطأ، والمرتجع القاعد من شهرين هو أول اللي بيختفي. بند في
  `?action=diag`. القرار لأحمد.
- 🟡 **مفيش «منذ إمتى وهو `In-Return`»** — مفيش ميتافيلد لوقت تحوّل الحالة،
  والقاعدة ٩ بتقول المدد من D1 (صف `bosta_webhook_events` في أداة المستقبل
  هو المصدر المحتمل — قراءة عابرة للأدوات محتاجة عقد مكتوب في الطرفين). العمود
  المعروض «الوقت منذ التغليف» واسمه بيقول اللي بيقيسه.
- 🟢 الأداة مابتكتبش في D1 — مفيش قيم `tool`/`type` مطلوب تسجيلها.

## بصمة المهارات

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | **v3.10.0** |
| ecommoda-constants | **v4.4.0** |
| ecommoda-order-lifecycle | **v1.9.0** |
| shopify-graphql-helper | **v2.4.0** |
| ecommoda-html-builder | **v8.6.0** (الواجهة في ريبو الهب — البصمة هنا للتوثيق) |

آخر مطابقة: 01-11-2026 · الـ Worker `1.0.0`

---

آخر تحديث: 01-11-2026 — `1.0.0` (**أول إصدار** — طلب أحمد: طابور «في طريق
الرجوع» بنفس بنية «المشحون» وقيمة `In-Return`. على بصمة v3.10.0: `shopifyGQL`
بـ`costLog` + `queryCost` · `getAccessToken` بـ retry (⑯) · `diag` بمصفوفة
وبندين منفصلين للتكلفة. ما اتجرّبش على شوبيفاي حقيقية.)

آخر تحديث: 01-11-2026 — 12:00

</div>
