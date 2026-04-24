# Styli — Platform Prototype

Styli is an AI-powered fashion discovery marketplace for India. This is a working interactive prototype of the full three-sided platform: buyers discover personalized fashion, vendors manage their catalog and orders, admins oversee the marketplace.

**Live**: [deployment URL appears here after Vercel deploy]

## Routes

The app uses URL-based routing — every page has its own shareable URL.

**Buyer side**
- `/` — landing page
- `/signup` — buyer signup
- `/login` — buyer login
- `/onboarding` — onboarding flow (face scan, measurements, style quiz)
- `/shop` — personalized product feed
- `/product/:id` — product detail
- `/cart` — shopping cart
- `/orders` — buyer's order history

**Vendor side**
- `/vendor/login` — vendor login
- `/vendor/apply` — application form for new vendors
- `/vendor/dashboard` — seller console (catalog, inventory, orders, returns, settlements)

**Admin side**
- `/admin/login` — admin login
- `/admin` — platform overview, vendor approvals, all products, all orders

## Demo credentials

- **Admin**: `admin@styli.in` / `admin123`
- **Vendor (small boutique)**: `kavya@boutique.in` / `demo123`
- **Vendor (established brand)**: `brand@hm.com` / `demo123`
- **Buyer**: sign up with any email on `/signup`

## How data works

All state persists to browser localStorage. This means:

- Your data stays between sessions on the same browser
- Different browsers or devices each have their own independent data
- The "Reset demo" button in the top banner wipes everything

For actual multi-user operation, this prototype's logic needs to be connected to a real backend (Supabase, Firebase, or a custom Node/Postgres stack).

## Tech

- Single HTML file with embedded React (loaded via CDN)
- Client-side routing via History API
- No build step
- Deployed as a static site to Vercel (with rewrites for SPA routing)

## What this is not

This is not the production Styli product. There is no real authentication, no real payment processing, no real shipping integration, no real AI face-scanning. The face scan is a 3-second loading animation. Product recommendations use simple rule-based matching, not a real ML model. All buyer orders and vendor sales are simulated.
