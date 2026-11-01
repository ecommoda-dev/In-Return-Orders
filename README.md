<div dir="rtl" style="text-align: right;">

# في طريق الرجوع — In-Return Orders

![worker](https://img.shields.io/badge/worker-v1.0.0-blue)

**Worker بس — مفيش واجهة في الريبو ده.**

بترجّع الأوردرات اللي حالتها **`In-Return`** — يعني مرتجعة وفي طريقها للمخزن
و**محدش سجّل لها `Returned`** لسه، في الشحنة الأصلية (`custom.manual_status`) أو
دورة الاستبدال/الاسترجاع (`custom.status_2_r_e`).

> 🔴 **والطابور بيبدأ من أوردرات `01/04/2026`** (قرار أحمد · 17-09-2026) —
> نفس أرضية «الجاهز» و«المشحون» بالحرف، واللي أقدم من كده **مابيتجابش**.

🔗 **الواجهة:** https://ecommoda-dev.github.io/Delivery-COD-Operations-Center/In-Return-Orders.html
(صفحة `In-Return-Orders.html` جوّه ريبو `Delivery-COD-Operations-Center`)

> ⛔ **ممنوع يتضاف `index.html` هنا.** الأداة **مالهاش نسخة مستقلة بقرار** —
> الدخول بيحصل مرة واحدة في الهب، والسر سر مجموعة `delivery_cod_ops`.

> 🔴 **قراءة بحتة** — صفر كتابة على شوبيفاي، وصفر صف في D1، ومفيش
> `[[d1_databases]]` أصلاً.

## Endpoints

```
GET  ?action=get_config            نسخة الـ Worker
GET  ?action=diag                  فحص ذاتي بلا كتابة
GET  ?action=get_in_return_queue   أوردرات In-Return (الماكينتين) بحقولها الخام
```

## النشر

منشور من git عبر **Workers Builds** على `main`، و`Build watch paths` = chip
لـ`index.js` وchip **منفصل** لـ`wrangler.toml`.
الأسرار من الداشبورد ثم **Promote**: `WORKER_SECRET` (= سر مجموعة
`delivery_cod_ops`) · `CLIENT_ID` · `CLIENT_SECRET`.

التفاصيل والقرارات والفخاخ → **`CLAUDE.md`**

آخر تحديث: 01-11-2026 — 12:00

</div>
