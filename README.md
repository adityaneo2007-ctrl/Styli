# Styli — Platform Prototype

Styli is an AI-powered fashion discovery marketplace for India. This is a working interactive prototype of the full three-sided platform: buyers discover personalized fashion, vendors manage their catalog and orders, admins oversee the marketplace.

**Live**: [deployment URL appears here after Vercel deploy]

## What's in the prototype

A single-page React application covering three distinct user experiences:

**Buyer side** — Account signup, onboarding flow (gender selection, measurements, face scan simulation, style quiz), personalized shop with match percentages, product detail with "why this suits you" reasoning, cart, simulated checkout, order history.

**Vendor side** — Application form with admin approval gate, post-approval seller console with dashboard, catalog management, inventory adjustment, order processing (ship, mark delivered, cancel), returns handling, and settlements view.

**Admin side** — Platform overview with real-time KPIs, vendor application queue with approve/reject, all vendors directory, all products moderation view, all orders across the marketplace.

All three user types share a single data store, so actions in one propagate correctly — a vendor ships an order, the buyer sees it move to "in transit"; an admin approves a vendor, that vendor's products appear in the buyer's shop.

## Demo credentials

- **Admin**: `admin@styli.in` / `admin123`
- **Vendor (small boutique)**: `kavya@boutique.in` / `demo123`
- **Vendor (established brand)**: `brand@hm.com` / `demo123`
- **Buyer**: sign up with any email on the buyer signup page

## Important: how data works

All state persists to browser localStorage. This means:

- Your data stays between sessions on the same browser
- Different browsers or devices each have their own independent data
- Clearing browser data wipes the demo (the "Reset demo" button does this intentionally)
- No data syncs between users — this is a demo, not a multi-user system

For actual multi-user operation, this prototype's logic needs to be connected to a real backend (Supabase, Firebase, or a custom Node/Postgres stack). That's the next engineering phase.

## Tech stack

- Single HTML file with embedded React (loaded via CDN)
- No build step, no dependencies to install
- Deployed as a static site to Vercel

## Development

No build process. Edit `index.html` directly. Vercel auto-deploys on every push to `main`.

## What this is not

This is not the production Styli product. There is no real authentication, no real payment processing, no real shipping integration, no real AI face-scanning. The face scan is a 3-second loading animation. Product recommendations use simple rule-based matching, not a real ML model. All buyer orders and vendor sales are simulated.

The production app requires a real backend, real integrations, and a native mobile build for the buyer side — all of which are separate engineering projects.
