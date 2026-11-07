# DEV MENU

**منصة سعودية للمحلات: منيو رقمي، بيجر على الجوال، بطاقة ولاء، وقائمة انتظار.**

DEV MENU is a Saudi SaaS platform that gives cafés, restaurants and other walk-in shops (flower shops, car washes, salons) a set of in-store digital tools. Each tool can be subscribed to on its own. The platform runs in production at **[devmenu.digital](https://devmenu.digital)**.

## What it does

| Tool | What the shop gets |
|---|---|
| **Digital menu** | A menu (or a product list for non-food shops) with photos and prices on its own subdomain, table QR codes, themes, a photo or video background, and visit stats. Customers can send dine-in, takeaway or WhatsApp orders straight to the cashier screen. Items can be imported from a photo of a paper menu. |
| **AI menu assistant** | A chat assistant inside the menu that answers questions about items, prices and calories and suggests items based on taste and budget. |
| **Pager** | Notifies the customer on their phone when the order is ready, with no hardware. Includes a call card saved to the phone's wallet, push notifications that work outside the page, and a public screen showing ready order numbers. |
| **Customer messages** | Sends offers or new-item announcements to customers who saved the call card. |
| **Loyalty card** | A stamp card in Apple/Google Wallet with rewards, win-back messages and an AI assistant for customer messaging. |
| **Waitlist** | Customers join the queue from their phone and are notified automatically when their turn comes. |

There is also a free pager tier, multi-branch accounts with per-branch features, bundle discounts, a 14-day trial, and Arabic/English interfaces.

## Architecture

```
Browser (static HTML + JS + Tailwind)
   │
   ├── menu.html, pager.html, loyalty.html, waitlist.html   ← customer-facing
   ├── admin.html                                          ← shop owner dashboard
   ├── pager-desk.html, kiosk.html                         ← cashier & in-store screens
   └── super-admin.html                                    ← platform admin
   │
   ▼
Vercel Serverless Functions (Node.js, /api)
   │   owner · admin · public · pager · loyalty · waitlist
   │   + scheduled jobs: subscriptions, loyalty, notifications
   ▼
Supabase (PostgreSQL, Auth, Storage, Realtime)
```

- **Frontend:** plain HTML and JavaScript with Tailwind CSS. No framework. Each page is served statically, and `middleware.js` maps shop subdomains to their menu.
- **Backend:** Node.js serverless functions on Vercel (`api/`). Shared logic (plans, pricing, orders, wallet passes, push, mail, AI, i18n) lives in `api/_lib/`.
- **Database:** Supabase Postgres with row-level security, RPC functions and views. The schema is built up through numbered SQL migrations in `supabase/`.
- **Auth:** Supabase Auth with Google sign-in or a 6-digit email code.
- **Notifications:** Web Push (VAPID), Apple Wallet / Google Wallet passes, and email via Nodemailer.
- **AI:** the Anthropic Claude API powers the menu assistant, menu import from photos and loyalty messaging.
- **Plans and pricing:** one shared module (`js/plans.js`) is used by both the browser and the server, so prices and feature gating always match.

## Repository layout

```
api/            Serverless endpoints and scheduled jobs
api/_lib/       Shared server logic (plans, orders, wallet, push, AI, mail, i18n)
js/             Browser scripts shared across pages
css/            Built Tailwind output
supabase/       Numbered SQL migrations
tools/          Build scripts (CSS, icon subset)
*.html          Pages (landing, menu, dashboard, pager, loyalty, waitlist, kiosk)
middleware.js   Subdomain routing
vercel.json     Security headers (CSP, HSTS), caching
```

## Running locally

```bash
npm install
npm run build:css
npx vercel dev
```

The API needs a Supabase project and the environment variables configured in Vercel (Supabase URL and keys, VAPID keys, mail credentials, wallet certificates, Anthropic API key). Secrets are never committed to the repository.

## Workflow

Changes land on the `staging` branch first. That branch deploys to a separate Vercel project backed by its own staging database. After testing, `staging` is fast-forwarded into `main`, which deploys to production.

## Security

- Strict Content Security Policy, HSTS and frame protection set in `vercel.json`.
- Row-level security on Supabase tables. Privileged operations run only in server functions.
- Cashier screens use a per-branch secret link that can be rotated, so staff never need the owner's account.

## Author

Built and maintained by Ammar Alhozimi.
