// ══════════════════════════════════════════════════════════════
// §HEADER
// Worker: in-return-orders-worker — EcomModa
// Tool:   طابور «في طريق الرجوع» (In-Return Orders)
//
// skills: worker-builder v3.10.0 · constants v4.4.0 · order-lifecycle v1.9.0
//         · shopify-graphql-helper v2.4.0 · html-builder v8.6.0 — 01-11-2026
//
// 🔴 الأداة دي **مالهاش واجهة مستقلة** — الواجهة الوحيدة هي `In-Return-Orders.html`
//    جوّه `Delivery-COD-Operations-Center`. الريبو ده Worker وبس، بنفس سابقة
//    `Ready-Orders` و`Shipped-Orders` بالحرف (قرار ٨: أداة = Worker + ريبو).
//
// 🔴 **قراءة بحتة — صفر كتابة.** مفيش `metafieldsSet` ومفيش `orderCancel`
//    ومفيش صف D1، **ومفيش `[[d1_databases]]` في `wrangler.toml` أصلاً**.
//    ⛔ أول ما يتضاف أي فعل: الـ binding يترجع (اسمه `DB` **بالحرف**)، و`tool`
//       يتسجّل في `ecommoda-constants` §7.1، و`type` في `log-values.json` بتاع
//       الريبو **في نفس الـ commit** (Rule 7) — مش بعده.
//    ⚠️ ولأنها مابتكتبش، مفيش `get_logs*` ومفيش `get_employees` ومفيش `appId`:
//       نقطة endpoint بلا مستهلك = سطح بلا لازمة (نفس قرار الطابورين التانيين).
//
// 🔴 **بتجيب الحالة خام — والاشتقاق كله في الواجهة، في مكان واحد.**
//    الاستعلام بيسأل عن `In-Return` في الماكينتين وبس؛ الماكينة والتنبيهات
//    والتقسيمة والمبلغ المستحق بيتحسبوا في `shared/dco-rules.js` §QUEUE-RULES.
//    ⛔ ممنوع أي قاعدة اشتقاق تتكتب هنا **وفي الواجهة** مع بعض (درس R1).
//
// 🔴 **ليه الطابور ده موجود:** `ecommoda-order-lifecycle` قاعدة ١٢ بتقول
//    `In-Return` تتعامل زي `Shipped` في العدّ والفلوس، لكن طابور «المشحون»
//    اتبنى على `Shipped` بالحرف (قرار أحمد 15-09-2026) فالمرتجعات اللي في
//    الطريق **كانت برّه أي طابور في الهب**. الطابور ده بيقفل الفجوة من غير ما
//    يلمس تعريف «المشحون» ولا أرقامه.
// ⚠️ و`In-Return` بتتكتب من **مصدرين**: Worker `Bosta-Webhook-Status-Receiver`
//    (حدث RTO · أو EXCHANGE/CUSTOMER_RETURN_PICKUP بعد الحدث 23) وكتابة يدوية
//    من `Order-Status-Updater`. الطابور مايفرّقش — بيقرا القيمة.
// ══════════════════════════════════════════════════════════════
const WORKER_VERSION = '1.0.0';
const TOOL_LABEL     = 'in_return_orders';   // للتعريف في `diag` بس — **مش** قيمة `tool` في D1

// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// ══════════════════════════════════════════════════════════════

// ─── §CONSTANTS::status — تُنسخ حرفيًا (worker-builder Step 5B) ───
// فرق حرف واحد = فلتر بيرجّع صفر صف **من غير أي خطأ**.
// `Confirmed + Edit` بمسافات حوالين الـ`+` · `WhatsApp-CANCELLED` كابيتال ·
// `In-Return` بشرطة وI وR كابيتال.
const S1_STATUS = {
  NEW_ORDER: 'New Order', CONFIRMED: 'Confirmed',
  WA_CONFIRMED: 'WhatsApp-Confirmed', WA_CANCELLED: 'WhatsApp-CANCELLED',
  CONFIRMED_EDIT: 'Confirmed + Edit', PENDING_EDIT: 'Pending Edit',
  READY: 'Ready', SHIPPED: 'Shipped', IN_RETURN: 'In-Return',
  DELIVERED: 'Delivered', RETURNED: 'Returned', CANCELLED: 'Cancelled',
};
const S2_STATUS = {
  CONFIRMED_RETURN: 'Confirmed + RETURN', CONFIRMED_EXCHANGE: 'Confirmed + EXCHANGE',
  READY: 'Ready', SHIPPED: 'Shipped', IN_RETURN: 'In-Return', RETURNED: 'Returned',
};

// ─── §CONSTANTS::caps — سلسلة السقوف التلاتة (worker-builder ⑪) ───
// ① الواجهة    CHUNK           = —    ← مفيش دفعة: الأداة **عرض بحت**
// ② الـ Worker  MAX_BATCH       = —    ← مفيش endpoint بياخد مصفوفة عناصر
// ③ شوبيفاي     QUEUE_PAGE_SIZE = 40   ← **تكلفة، مش عدد**
//
// 🔴 **ليه ٤٠:** نفس شكل الاستعلام بالحرف بتاع `shipped-orders-worker` (١١
//    ميتافيلد + حقلين سكالر)، والقياس الحيّ الوحيد لشكل قريب منه هو
//    `package-transfer-to-office` (٥٠ نود × ١٠ ميتافيلد، 15-09-2026، بلا
//    `MAX_COST_EXCEEDED`). الاستعلام اللي تكلفته أعلى من السقف **بيترفض
//    بالكامل** مش بيتقص — فالنزول عن ٥٠ آمن بالتعريف والطلوع محتاج قياس.
// ⛔ متطلّعهاش من غير ما تقرا `actualQueryCost` فعليًا — ورد الـ endpoint
//    و`?action=diag` بيعرضوه (`queryCost`) عشان القياس مايبقاش تخمين.
const QUEUE_PAGE_SIZE = 40;

// حارس حلقة **مش سقف بيانات** — لو اتضرب، الرد بيقول `truncated: true`
// والواجهة بتطلّع بانر أصفر منفصل عن بانر الفشل.
// 🔴 **مصدر الحالة (⑪ ⑤):** `In-Return` حالة **عابرة بتتراكم لحد ما حد يسجّل
//    `Returned`** — نفس طبيعة `Shipped` مش `Ready`. فالرقم اتشتق من طابور
//    «المشحون» (٢٠ صفحة) مش من «الجاهز» (١٢). ⚠️ **ومش مقيس على الحالة دي
//    نفسها** — حجمها الحقيقي لسه مجهول؛ أول فتح بعد النشر هو القياس، وبند
//    الاقتطاع (`truncated`) هو اللي هيقول لو الرقم صغير.
//    ٤٠ × ٢٠ = ٨٠٠ أوردر لكل ماكينة.
// ⚠️ والاقتطاع لو حصل **بيتقال ببانر منفصل** — طابور مقطوع في صمت معناه
//    مرتجعات في الطريق محدش شايفها.
const QUEUE_MAX_PAGES = 20;

// ─── §CONSTANTS::floor — 🔴 أرضية تاريخ الطابور (قرار أحمد 17-09-2026) ───
//
// 🔴 **الطابور بيبدأ من أوردرات `01/04/2026` وطالع** — واللي أقدم من كده
//    **مابيتجابش من شوبيفاي أصلاً**. **نفس القيمة ونفس الدالة بالحرف في
//    `ready-orders-worker` و`shipped-orders-worker`** — أرضيات مختلفة في
//    طوابير على نفس الشاشة بتخلّي الأرقام بتتقري بقواعد مختلفة.
// ⚠️ **ودي فلترة زيادة في الاستعلام** — والقاعدة «الاستعلام بيسأل عن الحالة
//    وبس» اتكتبت ضد فلتر **تشغيلي** (زون · مندوب · تغليف) يخلّي أوردر شغّال
//    **يختفي في صمت**. الأرضية نوع تاني: قرار أحمد إن اللي قبل التاريخ ده
//    **مش شغل المحطة** أصلاً.
// 🔴 **والاستبعاد مُعلَن مش صامت** — الأرضية بترجع في **رد الـ endpoint نفسه**
//    (`minCreatedAt` · `minCreatedDay`)، والواجهة بتكتبها فوق الطابور،
//    و`?action=diag` بيعرضها.
// ⛔ **وأي تعديل هنا ينزل على الطابورين التانيين في نفس التمريرة** (درس R1).
const QUEUE_MIN_CREATED_DAY = '2026-04-01';

const SHOPIFY_API_VERSION = '2026-01';   // `ecommoda-constants` §1 — صريح دايمًا

// ══════════════════════════════════════════════════════════════
// §CORS — Option B (قايمة صارمة)
// ══════════════════════════════════════════════════════════════
//
// ⚠️ **انحراف موثّق عن `ecommoda-worker-builder` Step 3.** القاعدة بتقول
//    أداة قراءة-فقط → Option A (wildcard). الأداة دي قراءة بحتة فعلاً،
//    **ومع ذلك على Option B** — والسبب مش الكتابة: الرد بيحمل **اسم العميل
//    وعنوانه ومحافظته ومبلغ التحصيل** لكل أوردر، ومستهلكه **واحد معروف**
//    (الهب)، فالقايمة الصارمة تكلفتها صفر ومكسبها حقيقي.
// ⚠️ الحماية الفعلية لسه `WORKER_SECRET` — الـ CORS بيحمي متصفح، مش سيرفر.
const ALLOWED_ORIGINS = ['https://ecommoda-dev.github.io'];
function getCORS(request) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// ══════════════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════════════
function json(data, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  Object.assign(headers, request ? getCORS(request) : { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] });
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── §HELPERS::time — توقيت القاهرة **يتحسب** مايتكتبش ثابت ───
// (`ecommoda-constants` §13 — نفس الدوال بالحرف في الـ Worker وفي الواجهة)
// ⚠️ مصر رجعت UTC+2 يوم 29-10-2026 — أي إزاحة مكتوبة ثابت بتبقى غلط
//    **من غير ما الأداة تشتكي**، وده بالظبط سبب القاعدة دي.
const CAIRO_TZ = 'Africa/Cairo';
const _cairoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function cairoParts(d) {
  const o = {};
  for (const p of _cairoFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';   // حارس: بعض المحركات بترجّع 24
  return o;
}
function cairoDate() { const p = cairoParts(new Date()); return `${p.year}-${p.month}-${p.day}`; }

// ─── §HELPERS::time::cairoDayStartUtcISO ───
// 🔴 **بتحوّل «يوم بتوقيت القاهرة» للحظة UTC اللي بيبدأ عندها** —
//    `2026-04-01` بتوقيت القاهرة = `2026-03-31T22:00:00Z` (والإزاحة
//    **محسوبة** من `Intl`، مش مكتوبة ثابت).
// ⛔ **وممنوع نبعت `created_at:>=2026-04-01` كده على طول**: تفسير التاريخ
//    المجرّد عند شوبيفاي **مش مضمون** إنه بتوقيت المتجر، ولو اتفسّر UTC،
//    أوردرات أول ساعات يوم `01/04` بتوقيت القاهرة **بتقع بره الأرضية** وبتختفي
//    — يوم ناقص بضع ساعات، **بلا أي رسالة**.
// ⚠️ والدورتين مقصودتين: الأولى بتجيب الإزاحة عند لحظة تقريبية، والتانية
//    بتصحّحها لو اللحظة دي وقعت على الجهة التانية من تحويل التوقيت الصيفي.
// ⚠️ **ونفس الدالة بالحرف في `ready-orders-worker` و`shipped-orders-worker`.**
function cairoDayStartUtcISO(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const wanted = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0);
  let ts = wanted;
  for (let i = 0; i < 2; i++) {
    const p = cairoParts(new Date(ts));
    const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    ts = wanted - (asIfUtc - ts);
  }
  return new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ─── §HELPERS::assertEnv ───
// ⚠️ **مفيش `DB` في القايمة** — الأداة مابتلمسش D1 خالص. لو اتضاف فعل يومًا،
//    الـ binding بيترجع هنا وفي `wrangler.toml` **مع بعض**.
const ENV_REQUIRED = { shopify: ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET'] };
function assertEnv(env, ...groups) {
  const missing = [];
  for (const g of groups) {
    for (const key of (ENV_REQUIRED[g] || [])) {
      if (env[key] === undefined || env[key] === null || String(env[key]).trim() === '') missing.push(key);
    }
  }
  if (missing.length) {
    throw new Error(
      `متغيرات ناقصة في الـ Worker: ${missing.join('، ')} — ضِفها من ` +
      `Dashboard → Settings → Variables ثم **Promote** النسخة. (شغّل ?action=diag)`
    );
  }
}

// ─── §HELPERS::secretFingerprint — بصمة قصيرة لسر المجموعة ───
// (`ecommoda-constants` → `references/secret-groups.md`)
// الطول لوحده **مش كافي** لإثبات إن أعضاء المجموعة شايلين نفس القيمة — سرّين
// مختلفين بنفس الطول شكلهم واحد. البصمة بتكشف الحالتين اللي بيوقّعوا الناس:
// ① عضو لسه على السر القديم ② السر اتضاف والـ Promote ما اتعملش.
// ⛔ ٨ خانات hex من SHA-256 — **مش** قابلة لاسترجاع القيمة.
async function secretFingerprint(secret) {
  if (!secret) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(buf)].slice(0, 4)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════

// ─── §SHOPIFY::getAccessToken — ⑯ ② بانضباط `shopifyGQL` ───
// التوكن مشترك بين كل Workers الستاك (نفس الـ Custom App) — والهب بيفتح
// الطوابير بالتوازي، فالفشل العابر لازم يتعافى بدل ما يتحوّل لفشل جماعي.
// ⚠️ `OAUTH_MAX_ATTEMPTS` اسم مقصود — وصفة الجرد `W-oauth-no-retry` بتدوّر
//    عليه بالاسم (و`MAX_ATTEMPTS` بتاعة `shopifyGQL` تحت كانت هتخلّي الفحص
//    يعدّي غلط).
const OAUTH_MAX_ATTEMPTS = 3;

async function getAccessToken(env) {
  let lastErr = null;
  for (let attempt = 1; attempt <= OAUTH_MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(
        `https://${env.SHOP_DOMAIN}/admin/oauth/access_token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     env.CLIENT_ID,
            client_secret: env.CLIENT_SECRET,
            grant_type:    'client_credentials',
          }),
        }
      );
      if (!resp.ok) {
        const retriable = resp.status === 429 || resp.status >= 500;
        lastErr = new Error(`OAuth failed: ${resp.status}`);
        if (retriable && attempt < OAUTH_MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
        throw lastErr;
      }
      const data = await resp.json();
      if (!data.access_token) throw new Error('OAuth: No access_token in response');
      return data.access_token;
    } catch (e) {
      lastErr = e;
      if (attempt < OAUTH_MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }
  }
  throw lastErr || new Error('OAuth: unknown failure');
}

// ─── §SHOPIFY::shopifyGQL — العقد الإلزامي، النسخة القانونية (shopify-graphql-helper v2.4.0) ───
// أي فشل بيترمي: ① شبكة ② HTTP status ③ رد مش JSON ④ data.errors ⑤ data فاضية.
// ⚠️ ④ هو الخطير: استعلام بيترفض على مستوى الحقل بيرجّع
//    {"errors":[…],"data":null} — وكود بيقرا `data.orders` بس بيقرا ده
//    **طابور فاضي** بدل خطأ.
// ⑥ التكلفة رقمين: `throttleStatus` (الرصيد المتبقي) و`actualQueryCost`
//    (النداء ده كلّف قد إيه) — والاتنين بيتعرضوا في `diag` (⑮).
let _lastThrottle = null, _lastQueryCost = null;
async function shopifyGQL(env, token, query, variables = {}, opName = 'shopify', costLog = null) {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body:    JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: شوبيفاي ردّت HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(' | ')}` +
        (codes.length ? ` [${codes.join(',')}]` : '')
      );
      if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: رد شوبيفاي بدون data — ${text.slice(0, 180)}`);

    if (data.extensions?.cost) {
      const c = data.extensions.cost;
      if (c.throttleStatus) _lastThrottle = c.throttleStatus;
      _lastQueryCost = { op: opName, requested: c.requestedQueryCost ?? null, actual: c.actualQueryCost ?? null };
      if (costLog) costLog.push({ op: opName, requested: c.requestedQueryCost ?? null, actual: c.actualQueryCost ?? null });
    }
    return data;
  }
  throw lastErr || new Error(`${opName}: فشل غير معروف`);
}

// ══════════════════════════════════════════════════════════════
// §QUEUE — طابور «في طريق الرجوع»
// ══════════════════════════════════════════════════════════════
//
// 🔴 **الاستعلام بيسأل عن الحالة + أرضية التاريخ وبس.** مفيش أي شرط
//    تشغيلي تاني في الـ `query` — لا زون ولا مندوب ولا تغليف. السبب مش
//    تبسيط:
//    ① الأداة **عرض بحت** ومالهاش بوابة كتابة تحمي حد من حاجة.
//    ② الفلترة الزيادة في الاستعلام معناها أوردر **بيختفي في صمت** —
//       والموظف بيسأل «الأوردر ده فين؟» ومفيش إجابة. القاعدة هنا:
//       **يبان وعليه علامة**، مش يختفي (قاعدة ١٣ و١٤ في `order-lifecycle`).
// ⚠️ **والأرضية (`created_at`) استثناء مُعلَن بقرار أحمد 17-09-2026** (الشرح
//    عند `QUEUE_MIN_CREATED_DAY` فوق).
//
// ⚠️ **وممنوع فلتر على ميتافيلد مش قابل للفلترة.** `package_whereabouts_s1`
//    مثلاً بيتجاهَل **في صمت** ويرجّع المتجر كله (١٠٬٠٠٠ صف — مقيس
//    15-09-2026). الحقول المستخدمة في الفلتر هنا اتنين بس وهما **مؤكَّدين
//    قابلين للفلترة**: `custom.manual_status` و`custom.status_2_r_e`
//    (`ecommoda-constants` §1 — ٥/٥ مستهلكة).
//    ⚠️ **وقيمة `In-Return` (بشرطة) محتاجة تنصيص** — الاستعلام بيتبني
//    بعلامات تنصيص حوالين القيمة زي الطابورين التانيين. ⛔ **ما اتجرّبش على
//    شوبيفاي حقيقية** — أول فتح بعد النشر هو الاختبار الفعلي، و`diag` بيقول
//    لو الرد رجع بصفوف غلط.
const ORDER_FIELDS = `
  id
  legacyResourceId
  name
  createdAt
  cancelledAt
  displayFulfillmentStatus
  displayFinancialStatus
  currentSubtotalLineItemsQuantity
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  shippingAddress { name address1 address2 city province }
  zone:    metafield(namespace: "custom", key: "zone") { value }
  courier: metafield(namespace: "custom", key: "courier") { value }
  s1:      metafield(namespace: "custom", key: "manual_status") { value }
  s2:      metafield(namespace: "custom", key: "status_2_r_e") { value }
  p1:      metafield(namespace: "custom", key: "s1_packing_date_time") { value }
  p2:      metafield(namespace: "custom", key: "s2_packing_date_time") { value }
  pb1:     metafield(namespace: "custom", key: "s1_packed_by") { value }
  pb2:     metafield(namespace: "custom", key: "s2_packed_by") { value }
  tr1:     metafield(namespace: "custom", key: "bosta_tracking_number_s1") { value }
  tr2:     metafield(namespace: "custom", key: "bosta_tracking_number_s2") { value }
  tr0:     metafield(namespace: "custom", key: "bosta_tracking_number") { value }
`;

const QUEUE_QUERY = `
query InReturnQueue($q: String!, $after: String, $n: Int!) {
  orders(first: $n, query: $q, sortKey: CREATED_AT, reverse: true, after: $after) {
    nodes { ${ORDER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

// ─── §QUEUE::shapeOrder ───
// ⚠️ الشكل ده **عقد مع الواجهة**: `ecoShapeRow` و`ecoFlags` و`ecoCod` في
//    `shared/dco-rules.js` بيقروا المفاتيح دي **بالاسم**. تغيير اسم مفتاح هنا
//    = عمود بيرجع `—` على كل صف **بلا أي خطأ في الكونسول**.
//    (نفس الشكل بالحرف بتاع `shipped-orders-worker` 1.2.0.)
// 🔴 **`orderId` رقمي إلزامي** (worker-builder Step 5 § Numeric Order ID) —
//    الواجهة بتبني بيه رابط الأدمن، والـ `gid` مايبنيش رابط.
function shapeOrder(o) {
  return {
    orderId:   o.legacyResourceId || (o.id ? String(o.id).split('/').pop() : null),
    orderGid:  o.id,
    orderName: o.name,
    createdAt: o.createdAt,
    cancelledAt: o.cancelledAt || null,
    fulfillment: o.displayFulfillmentStatus || null,
    financial:   o.displayFinancialStatus   || null,
    customer:  o.shippingAddress?.name || null,
    address1:  o.shippingAddress?.address1 || null,
    address2:  o.shippingAddress?.address2 || null,
    city:      o.shippingAddress?.city || null,
    province:  o.shippingAddress?.province || null,
    itemsQty:  o.currentSubtotalLineItemsQuantity ?? null,
    // 🔴 `currentTotalPriceSet` مش `totalPriceSet` — التاني بيمسك القيمة
    //    **الأصلية** وبيفضل زي ما هو بعد أي تعديل أو مرتجع
    //    (`order-lifecycle` قاعدة ٣). وأهم هنا من أي طابور تاني: الأوردر
    //    راجع، والقيمة الحالية هي اللي تفرق.
    total:     o.currentTotalPriceSet?.shopMoney?.amount ?? null,
    currency:  o.currentTotalPriceSet?.shopMoney?.currencyCode ?? null,
    zone:      o.zone?.value    || null,
    courier:   o.courier?.value || null,
    s1:        o.s1?.value      || null,
    s2:        o.s2?.value      || null,
    packedAtS1: o.p1?.value     || null,
    packedAtS2: o.p2?.value     || null,
    packedByS1: o.pb1?.value    || null,
    packedByS2: o.pb2?.value    || null,
    // 🔴 **رقم التتبع: الجديد أولاً، والقديم fallback مُعلَن.**
    //    `custom.bosta_tracking_number` **بيتوقف** ومحلّه `…_s1`/`…_s2`.
    // ⚠️ والاختيار **بماكينة الصف** (في الواجهة): صف S2 بياخد `…_s2`. أخد
    //    رقم S1 لصف S2 معناه رقم تتبع **شحنة تانية** على نفس الأوردر.
    trackingS1: o.tr1?.value || null,
    trackingS2: o.tr2?.value || null,
    trackingLegacy: o.tr0?.value || null,
  };
}

// ─── §QUEUE::queueQ — شرط الحالة + أرضية التاريخ ─────────────
// 🔴 **مكان واحد بيركّب الاستعلام للماكينتين** — سطران منفصلين كانوا
//    هيخلّوا أرضية تتحط على S1 وتتنسى على S2، والنتيجة طابور **نصه
//    مفلتر ونصه لأ** بلا أي خطأ.
// ⚠️ **والتاريخ بين علامتي تنصيص** — القيمة فيها `:` و`-` وليهم معنى في
//    صيغة البحث.
function queueQ(since, statusClause) {
  return `created_at:>='${since}' AND ${statusClause}`;
}

// ⑮ كل صفحة بتسجّل تكلفتها في `costLog`، والتجميع **لكل استعلام لوحده**
//    (مش رقم مجمّع) — عشان لو `truncated` ظهرت نعرف أنهي استعلام السبب.
async function fetchStatusPage(env, token, q, opName) {
  const out = [];
  const costLog = [];
  let after = null, pages = 0, truncated = false;
  while (pages < QUEUE_MAX_PAGES) {
    const data = await shopifyGQL(env, token, QUEUE_QUERY,
      { q, after, n: QUEUE_PAGE_SIZE }, opName, costLog);
    const conn = data.data?.orders;
    // ⚠️ الرد الناجح بلا `orders` = عقد اتكسر، **مش** طابور فاضي.
    if (!conn) throw new Error(`${opName}: رد شوبيفاي بلا \`orders\``);
    out.push(...(conn.nodes || []));
    pages++;
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    if (pages >= QUEUE_MAX_PAGES) truncated = true;
  }
  const actuals = costLog.map(c => c.actual).filter(n => typeof n === 'number');
  const cost = {
    op: opName, pages, truncated,
    requested: costLog[0]?.requested ?? null,                       // تكلفة الصفحة الأولى المطلوبة
    actualMax: actuals.length ? Math.max(...actuals) : null,        // أغلى صفحة فعليًا
  };
  return { nodes: out, truncated, cost };
}

// ─── §QUEUE::handleQueue ───
// بيجيب **الماكينتين** بالتوازي: `manual_status = In-Return` (الشحنة الأصلية —
// بيتكتب من حدث RTO) و`status_2_r_e = In-Return` (دورة الاستبدال/الاسترجاع).
//
// 🔴 **الطابور ده مابيلمسش «المشحون»** — `Shipped` و`In-Return` قيمتين
//    منفصلتين، وطابور «المشحون» لسه على `Shipped` بالحرف. الأوردر بينتقل من
//    طابور لطابور لما حالته تتغيّر (RTO → `In-Return`)، ومابيتعدّش في الاتنين.
// ⚠️ **أوردر ممكن يرجع في الماكينتين** (S1 و S2 الاتنين `In-Return`) —
//    بيتدمج بالـ id (مش بيتكرر)، والواجهة هي اللي بتقرر الماكينة وبتعلّم على
//    الحالة الشاذة دي بعلامة مراجعة.
async function handleQueue(env, request) {
  assertEnv(env, 'shopify');
  const token = await getAccessToken(env);

  const since = cairoDayStartUtcISO(QUEUE_MIN_CREATED_DAY);

  const [a, b] = await Promise.all([
    fetchStatusPage(env, token, queueQ(since, `metafields.custom.manual_status:'${S1_STATUS.IN_RETURN}'`), 'inReturnS1'),
    fetchStatusPage(env, token, queueQ(since, `metafields.custom.status_2_r_e:'${S2_STATUS.IN_RETURN}'`),  'inReturnS2'),
  ]);

  const byId = new Map();
  for (const n of [...a.nodes, ...b.nodes]) {
    const s = shapeOrder(n);
    if (s.orderId) byId.set(s.orderId, s);
  }

  return json({
    ok: true,
    queue: 'in_return',
    orders: [...byId.values()],
    truncated: a.truncated || b.truncated,
    // 🔴 **الأرضية بترجع مع الطابور** — والواجهة بتكتبها فوق الرقم.
    //    استبعاد بيتقال في الرد نفسه أصعب بكتير إنه يُنسى من استبعاد
    //    مكتوب في `CLAUDE.md` بس.
    minCreatedDay: QUEUE_MIN_CREATED_DAY,
    minCreatedAt:  since,
    // ⑮ للقياس بس — **صفر اعتماد من الواجهة عليه**. مصفوفة تفصيل لكل استعلام
    //    (مش رقم مجمّع).
    queryCost: [a.cost, b.cost],
    fetchedAt: new Date().toISOString(),
    cairoDate: cairoDate(),
  }, 200, request);
}

// ══════════════════════════════════════════════════════════════
// §DIAG — فحص ذاتي بلا أي كتابة
// ══════════════════════════════════════════════════════════════
// الشكل المعتمد للجديد: **مصفوفة** `[{ ok, label, detail, hint }]` — `ok`
// صريحة. ⛔ ممنوع يرجّع قيمة أي سر — الأسماء والأطوال والبصمة بس.
const DIAG_QUERY = `
query Diag {
  currentAppInstallation { accessScopes { handle } }
  shop { name }
}`;

async function handleDiag(env, request) {
  const checks = [];
  const push = (ok, label, detail, hint) => checks.push({ ok, label, detail, hint });

  // ① المتغيرات — أسماء وأطوال بس
  const names = ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET', 'WORKER_SECRET'];
  const envDetail = names.map(k => {
    const v = env[k];
    return `${k}=${v === undefined || v === null || String(v).trim() === '' ? '❌ ناقص' : String(v).length + ' حرف'}`;
  }).join(' · ');
  const envOk = names.every(k => env[k] !== undefined && String(env[k] ?? '').trim() !== '');
  push(envOk, 'متغيرات وأسرار الـ Worker', envDetail,
       'Dashboard → Settings → Variables، وبعدها **Promote** للنسخة — من غير Promote القيمة بتفضل undefined');

  // ② بصمة سر المجموعة — الطول مش كافي لإثبات التوحيد
  const fp = await secretFingerprint(env.WORKER_SECRET);
  push(!!fp, 'بصمة WORKER_SECRET', fp
    ? `بصمة ${fp} · مجموعة delivery_cod_ops — لازم تطابق باقي أعضاء المجموعة`
    : 'مفيش سر — البصمة مستحيلة',
    'لو البصمة مختلفة عن باقي الأعضاء، المجموعة مكسورة والهب هيرجّع 401 من الأداة دي بس');

  // ③ D1 — **مقصود إنها مش متصلة**
  // ⚠️ السطر ده معلومة مش فحص: أداة قراءة بحتة مالها binding، وغيابه
  //    **مش عطل**. عرضه ✅ كان هيدّي طمأنينة كاذبة إن فيه تسجيل شغّال.
  push(true, 'D1 (تسجيل العمليات)',
    env.DB ? '⚠️ فيه binding اسمه DB — الأداة دي مش بتستخدمه (قراءة بحتة)'
           : 'مفيش binding — مقصود: الأداة قراءة بحتة وصفر كتابة في السجل');

  // ④ شوبيفاي + الصلاحيات
  try {
    assertEnv(env, 'shopify');
    const token = await getAccessToken(env);
    const data  = await shopifyGQL(env, token, DIAG_QUERY, {}, 'diag');
    push(true, 'OAuth شوبيفاي', `التوكن اتجاب بنجاح · المتجر: ${data.data?.shop?.name || '—'}`);

    const scopes = (data.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
    const canRead = scopes.includes('read_orders') || scopes.includes('write_orders');
    push(canRead, 'صلاحية قراءة الأوردرات',
         canRead ? `موجودة (${scopes.filter(s => /orders/.test(s)).join(', ')})` : 'ناقصة — الطابور هيرجع فاضي',
         'Custom App → Configuration → Admin API access scopes');

    // 🔴 **`read_all_orders` — وأثره هنا زي «المشحون»:** شوبيفاي بتخفي أي أوردر
    //    أقدم من **٦٠ يوم** عن تطبيق مالوش الصلاحية، **بلا أي خطأ**. ومرتجع
    //    قاعد في الطريق من شهرين هو بالظبط اللي الطابور موجود عشانه.
    const readAll = scopes.includes('read_all_orders');
    push(readAll, 'صلاحية read_all_orders',
         readAll ? 'موجودة — الأوردرات الأقدم من ٦٠ يوم بتظهر'
                 : '🔴 ناقصة — أي مرتجع أقدم من ٦٠ يوم **مش بيظهر في الطابور** وبلا أي خطأ، '
                 + 'وهو بالظبط المرتجع اللي الطابور موجود عشانه',
         'Custom App → Configuration → read_all_orders. البند موروث في الستاك كله والقرار لأحمد');
  } catch (e) {
    push(false, 'شوبيفاي', `FAILED: ${e.message}`);
  }

  // ⑤ تكلفة الاستعلام — ⑮ رقمين **منفصلين**: الرصيد المتبقي وتكلفة آخر نداء
  push(true, 'رصيد استعلامات شوبيفاي (throttleStatus)', _lastThrottle
    ? `currentlyAvailable=${_lastThrottle.currentlyAvailable} / ${_lastThrottle.maximumAvailable} · restoreRate=${_lastThrottle.restoreRate}/s`
    : 'لسه مفيش استعلام في الاستدعاء ده');
  push(true, 'تكلفة آخر استعلام (actualQueryCost)', _lastQueryCost
    ? `${_lastQueryCost.op}: requested=${_lastQueryCost.requested} · actual=${_lastQueryCost.actual} · حجم الصفحة=${QUEUE_PAGE_SIZE}`
    : `لسه مفيش استعلام طابور في الاستدعاء ده · حجم الصفحة=${QUEUE_PAGE_SIZE} (القياس الحقيقي في رد get_in_return_queue → queryCost)`);

  // ⑥ أرضية تاريخ الطابور — 🔴 **بند معلومة، وسببه إنها استبعاد**
  push(true, 'أرضية تاريخ الطابور',
    `من ${QUEUE_MIN_CREATED_DAY} بتوقيت القاهرة = ${cairoDayStartUtcISO(QUEUE_MIN_CREATED_DAY)} · ` +
    'الأقدم من كده **مابيتجابش** من شوبيفاي',
    'القيمة قرار أحمد (17-09-2026) ولازم تكون **نفسها** في ready-orders-worker و shipped-orders-worker');

  // ⑦ الأصل
  const origin = request.headers.get('Origin') || '(بلا Origin)';
  push(ALLOWED_ORIGINS.includes(origin), 'الـ Origin', `${origin} · المسموح: ${ALLOWED_ORIGINS.join(', ')}`,
       'الواجهة لازم تتفتح من https://ecommoda-dev.github.io — الفتح من ملف محلي بيترفض');

  return json({ ok: checks.every(c => c.ok), version: WORKER_VERSION,
                tool: TOOL_LABEL, checks }, 200, request);
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    // 🔴 حارس السر الغايب **قبل** فحص الـ auth — من غيره القالب بينتج السلسلة
    //    الحرفية "Bearer undefined"، يعني أي طلب معاه الهيدر ده **بيعدّي**،
    //    والحالة اللي المفروض تبقى «كل حاجة 401» بتتحوّل لـ«الحماية اتشالت».
    if (typeof env.WORKER_SECRET !== 'string' || !env.WORKER_SECRET.trim())
      return json({ ok: false, error: 'WORKER_SECRET غير مضبوط على الـ Worker', step: 'env' }, 500, request);

    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return json({ error: 'Unauthorized' }, 401, request);

    const url    = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    try {
      if (action === 'get_config')
        return json({ ok: true, version: WORKER_VERSION, WORKER_VERSION, tool: TOOL_LABEL }, 200, request);

      if (action === 'diag') return await handleDiag(env, request);

      if (action === 'get_in_return_queue') return await handleQueue(env, request);

      // 🔴 **انحراف مقصود ومكتوب:** مفيش `check_employee`/`register_pin`/
      //    `verify_employee`/`log_logout`/`get_employees`/`get_logs*` هنا.
      //    الدخول بيحصل **مرة واحدة** في `index.html` بتاع الهب عبر Worker
      //    الهب نفسه، والهوية بتوصل من `sessionStorage`. والأداة مابتكتبش في
      //    D1 أصلاً، فمفيش سجل يتفلتر. نقطة دخول تانية هنا = سطح هجوم بلا
      //    مستهلك (نفس قرار `ready-orders-worker` و`shipped-orders-worker`).
      return json({ error: `Unknown action: ${action}` }, 404, request);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, request);
    }
  },
};
