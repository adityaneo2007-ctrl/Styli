# Styli — pre-publish checklist

Work through this every time you're about to publish. It takes about 2 minutes and catches 90% of problems before they go live.

## The workflow

```
   preview.command     →   test    →   publish.command
   (double-click)        (this list)   (double-click)
```

---

## Step 1 — Start the local preview

1. Open Finder → Styli folder.
2. Double-click **`preview.command`**.
3. A Terminal window opens, and your browser auto-opens to **http://localhost:8000**.
4. Leave the Terminal window running. Don't close it until you're done testing.

If the browser doesn't auto-open, manually visit `http://localhost:8000` in Chrome.

---

## Step 2 — Run through the checklist

Open the site in a **fresh incognito window** (`⌘ + Shift + N` in Chrome) to make sure you're seeing it like a new visitor, not with old cached data from your previous sessions.

### Landing page
- [ ] Page loads without errors (no blank screen, no red text)
- [ ] "I'm a buyer" / "I'm a vendor" / "Admin" options visible

### Buyer flow
- [ ] Click **I'm a buyer** → **Sign up** → create account with any email
- [ ] Complete the onboarding (gender, measurements, face scan, style quiz)
- [ ] Shop page loads with products
- [ ] **Sidebar on the left is visible** with: Shop, Cart, Wishlist, Orders, Profile, Logout
- [ ] Click a heart icon on a product card → sidebar's Wishlist count increases
- [ ] Click **Wishlist** in the sidebar → you see the saved product
- [ ] Click a product → detail page loads → click **Add to cart**
- [ ] Click **Cart** in the sidebar → item is there
- [ ] Click **Place order** → order appears in **Orders**
- [ ] Click **Profile** → name, preferences, measurements all show correctly
- [ ] Click **Logout** → back to landing page

### Vendor flow (optional — only test if you changed vendor code)
- [ ] Click **I'm a seller** → sign in as `kavya@boutique.in` / `demo123`
- [ ] Dashboard loads, sidebar works, all tabs render

### Admin flow (optional — only test if you changed admin code)
- [ ] Click **Admin** → sign in as `admin@styli.in` / `admin123`
- [ ] Applications / Vendors / Products / Orders tabs all load

### Mobile view (important)
- [ ] In Chrome, press `⌘ + Option + I` to open DevTools
- [ ] Click the phone/tablet icon (top-left of DevTools) to toggle device view
- [ ] Pick "iPhone 14" from the device dropdown
- [ ] Refresh the page — check that the buyer side doesn't look broken on a small screen

### Browser console (catches hidden bugs)
- [ ] In DevTools, click the **Console** tab
- [ ] Look for red error messages — if there's anything in red, tell Claude what it says
- [ ] Yellow warnings are fine to ignore

---

## Step 3 — Publish

When the checklist is clean:

1. Double-click **`publish.command`**.
2. It runs structural checks on your HTML, shows you what's changed.
3. It asks: **"Did you test it locally and everything worked?"** → type `y` and press Enter.
4. If there are unsaved commits, it asks for a commit message. Type something brief like:
   - `"fix sidebar on mobile"`
   - `"add new product carousel"`
   - `"update hero text"`
5. It pushes to GitHub. Vercel auto-deploys within ~60 seconds.
6. Visit **https://styli-three.vercel.app** (hard-refresh with `⌘ + Shift + R` to skip cache).

---

## If something goes wrong

### Preview shows blank screen or errors
- Open DevTools (`⌘ + Option + I`) → Console tab → read the red error
- Open the relevant file in your editor, check the line number from the error
- Ask Claude to help debug, paste the error message

### publish.command reports mismatched tags / braces / parens
- Your HTML or JSX has a syntax error
- The error tells you the count difference
- Most common culprit: a missing `</div>`, `}`, or `)` somewhere in your recent edit
- Open `preview.command` and look at the console — it'll often point to the exact line

### git push fails
- Most common cause: you're not signed in to GitHub on your Mac
- Open Terminal, paste: `cd ~/Documents/Claude/Projects/Styli && git push`
- Follow any sign-in prompt that appears

### Vercel shows an old version
- Vercel caches aggressively. Hard-refresh with `⌘ + Shift + R`.
- If still stuck after 2 minutes, check https://vercel.com/dashboard → your project → Deployments — make sure the latest build says "Ready"

---

## Quick command reference

| What you want to do | How |
|---|---|
| Start local preview | Double-click `preview.command` |
| Stop the preview | Click the Terminal window, press `Ctrl + C` |
| See the live site | https://styli-three.vercel.app |
| Publish changes | Double-click `publish.command` |
| See your repo on GitHub | https://github.com/adityaneo2007-ctrl/Styli |
| See deployment history | https://vercel.com/dashboard |

---

## The golden rule

**Always preview before you publish. No exceptions.**

A 2-minute check here saves you from a broken live site that real users (or investors, or your team) might see.
